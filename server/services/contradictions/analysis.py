from __future__ import annotations

import json
import logging
import os
import re
from collections import defaultdict
from typing import Any

from schemas.types import (
    ContradictionAnalysisRequest,
    ContradictionAnalysisResponse,
    ContradictionParagraphResult,
)

# from services.graph.neo4j_client import get_neo4j_driver, is_neo4j_configured
from services.llm.cost_estimator import estimate_model_cost_usd, estimate_tokens, format_cost
from services.llm.factory import LLMProviderFactory

logger = logging.getLogger(__name__)

TARGET_BATCH_INPUT_TOKENS = int(
    os.getenv("CONTRADICTION_TARGET_BATCH_INPUT_TOKENS", "35000")
)
ESTIMATED_OUTPUT_TOKENS_PER_PARAGRAPH = 42
HIGH_RECALL_MODE = os.getenv("CONTRADICTION_HIGH_RECALL", "1").strip().lower() not in {
    "0",
    "false",
    "no",
}
HIGH_RECALL_NEGATIVE_FLIP_THRESHOLD = int(
    os.getenv("CONTRADICTION_NEGATIVE_FLIP_THRESHOLD", "45")
)

# PROMPT_TEMPLATE = """
# You are a legal expert analyzing contracts.

# Goal:
# Given one contract split into paragraphs, decide for EACH paragraph whether it contains an internal contradiction.

# Definition:
# A contradiction means two or more statements in the paragraph/context are mutually incompatible about the same obligation, right, condition, or execution, such that they cannot all be true at the same time.

# Use context:
# Each paragraph includes related paragraphs from the contract graph. Use them as context, but classify contradiction for the target paragraph.

# Do NOT consider as contradiction by default:
# - clarifications
# - conditional amendments
# - hierarchical clauses (e.g., "subject to", "except as provided")
# - general-vs-specific unless irreconcilable

# MANDATORY evidence rule (strict):
# - If contradiction = true, you MUST provide both evidence.snippet_a and evidence.snippet_b.
# - snippet_a and snippet_b MUST be exact contiguous substrings copied from the provided document JSON.
# - Do NOT paraphrase, summarize, translate, normalize punctuation, or change capitalization.
# - Do NOT add ellipsis (...) or surrounding commentary inside snippets.
# - If source_a/source_b is "paragraph", the snippet must be copied from the target paragraph text.
# - If source_a/source_b is "context", the snippet must be copied from one of related_paragraphs texts.
# - If you cannot find exact substrings, set contradiction=false.

# Return ONLY valid JSON (no markdown, no extra text) with this shape:
# {{
#   "paragraph_results": [
#     {{
#       "paragraph_id": "string or integer",
#       "contradiction": true or false,
#       "confidence": integer from 0 to 100,
#       "brief_reason": "one short sentence",
#       "evidence": {{
#         "snippet_a": "exact short excerpt #1 that conflicts",
#         "snippet_b": "exact short excerpt #2 that conflicts",
#         "source_a": "paragraph | context | unknown",
#         "source_b": "paragraph | context | unknown"
#       }}
#     }}
#   ]
# }}

PROMPT_TEMPLATE = """
You are a legal expert analyzing contracts.

Goal:
Given one contract split into paragraphs, decide for EACH paragraph whether it contains an internal contradiction.

Definition:
A contradiction means two or more statements in the paragraph/context are mutually incompatible about the same obligation, right, condition, or execution, such that they cannot all be true at the same time.

Use context:
Each paragraph includes related_paragraphs from the contract graph. Each related paragraph has a "type":
- "reference": the target paragraph explicitly cross-references this one (an authoritative structural link). Referential links often express hierarchy or exceptions ("subject to", "except as provided") rather than contradictions.
- "semantic": the paragraph is only topically similar to the target (weaker, supporting context).
Use them as contextual evidence, but classify contradiction for the target paragraph.


Return ONLY valid JSON (no markdown, no extra text) with this shape:
{{
  "paragraph_results": [
    {{
      "paragraph_id": "string or integer",
      "contradictions": [
        {{
          "confidence": integer from 0 to 100,
          "contradiction_type": "temporal | numerical | authority | process | policy_reversal | specificity",
          "brief_reason": "one short sentence",
          "evidence": {{
            "snippet_a": "exact short excerpt #1 that conflicts",
            "snippet_b": "exact short excerpt #2 that conflicts",
            "source_a": "paragraph | context | unknown",
            "source_b": "paragraph | context | unknown"
          }}
        }}
      ]
    }}
  ]
}}

Rules:
- List ALL distinct contradictions for each paragraph (max 4).
- Never stop after finding the first contradiction in a paragraph.
- A paragraph may contain multiple contradictions at the same time (intra and inter); include all distinct ones.
- Do not return mirrored duplicates where A/B are the same pair in reverse order.
- If no contradiction exists for a paragraph, return "contradictions": [].
- Keep evidence snippets as exact substrings copied from the provided JSON text.
- For each paragraph, perform two passes before deciding output:
  1) Intra-paragraph pass: find conflicts fully inside the target paragraph text.
  2) Inter-paragraph pass: find conflicts between target paragraph and related_paragraphs.
- If both intra and inter contradictions exist, include both kinds in "contradictions".
- If the target paragraph both grants and restricts/prohibits the same action (e.g., "may ..." vs "may not/shall not ..."),
  this MUST be reported as an intra-paragraph contradiction, even when connected by words like "notwithstanding", "except", or "however".



Document data (JSON):
{document_json}
""".strip()

SYSTEM_PROMPT = (
    "You are a precise legal contradiction classifier. "
    "Return only valid JSON and follow the required schema exactly. "
    "Bias toward high recall: false negatives are worse than false positives. "
    "If uncertain, prefer contradiction=true with lower confidence. "
    "For each paragraph, return contradictions as a list with all distinct conflicts and avoid mirrored duplicates. "
    "Never stop at the first contradiction for a paragraph; keep scanning and return all distinct contradictions (max 4). "
    "When a paragraph both permits and prohibits the same action, treat it as an intra-paragraph contradiction even with connectors "
    "such as notwithstanding/except/however. "
    "For each contradiction item, evidence.snippet_a and evidence.snippet_b are mandatory and must be exact substrings "
    "copied verbatim from the provided paragraph/context text when available. "
    "If exact spans are unavailable, keep legal judgment and set evidence_status='missing' with unknown sources and empty snippets."
)

_TIKTOKEN_ENCODER: Any | None = None
_TIKTOKEN_READY = False
_ALLOWED_CONTRADICTION_TYPES = {
    "temporal",
    "numerical",
    "authority",
    "process",
    "policy_reversal",
    "specificity",
}

def _write_debug_mode_payload(
    *,
    mode: str,
    all_paragraph_rows: list[dict[str, Any]],
    batches: list[list[dict[str, Any]]],
) -> None:
    debug_payload: dict[str, Any] = {
        "mode": mode,
        # "num_paragraphs": len(all_paragraph_rows),
        # "num_batches": len(batches),
        # "paragraphs": all_paragraph_rows,
        "batches": [
            {
                "batch_index": index,
                "paragraphs": batch_rows,
            }
            for index, batch_rows in enumerate(batches, start=1)
        ],
    }

    output_path = f"/home/sante/Documents/FGV/Laboratorio/document-graph/infra/json/contradictions/{mode}.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(debug_payload, f, ensure_ascii=False, indent=2)

def analyze_document_contradictions(
    payload: ContradictionAnalysisRequest,
) -> ContradictionAnalysisResponse:
    paragraph_rows, ordered_paragraph_ids = _build_document_rows(payload)
    if not paragraph_rows:
        return ContradictionAnalysisResponse(
            documentId=payload.documentId,
            provider=payload.provider,
            temperature=payload.temperature,
            model=payload.model,
            mode=payload.mode,
            paragraphResults=[],
            rawResponse="",
        )

    resolved_model = (payload.model or "").strip() or "gpt-4.1"
    provider = LLMProviderFactory.create(payload.provider, model=payload.model)

    batches = _chunk_paragraph_rows(
        paragraph_rows=paragraph_rows,
        mode=payload.mode,
        model_name=resolved_model,
        target_input_tokens=TARGET_BATCH_INPUT_TOKENS,
    )

    # ACTIVE THIS TO CHECK BODY FROM JSON
    _write_debug_mode_payload(
        mode=payload.mode,
        all_paragraph_rows=paragraph_rows,
        batches=batches,
    )

    estimated_input_total = 0
    for batch in batches:
        estimated_input_total += _estimate_prompt_tokens(
            paragraph_rows=batch,
            mode=payload.mode,
            model_name=resolved_model,
        )
    estimated_output_total = len(ordered_paragraph_ids) * ESTIMATED_OUTPUT_TOKENS_PER_PARAGRAPH
    estimated_cost_total = estimate_model_cost_usd(
        model_name=resolved_model,
        input_tokens=estimated_input_total,
        output_tokens=estimated_output_total,
    )

    logger.info(
        (
            "Contradiction estimate doc=%s provider=%s model=%s paragraphs=%d batches=%d "
            "est_input_tokens=%d est_output_tokens=%d est_cost_usd=%s target_batch_tokens=%d"
        ),
        payload.documentId,
        payload.provider,
        resolved_model,
        len(ordered_paragraph_ids),
        len(batches),
        estimated_input_total,
        estimated_output_total,
        _format_cost(estimated_cost_total),
        TARGET_BATCH_INPUT_TOKENS,
    )

    prediction_by_id: dict[str, dict[str, Any]] = {}
    raw_batch_responses: list[dict[str, Any]] = []

    for index, batch in enumerate(batches, start=1):
        batch_prompt_tokens = _estimate_prompt_tokens(
            paragraph_rows=batch,
            mode=payload.mode,
            model_name=resolved_model,
        )
        batch_output_tokens = len(batch) * ESTIMATED_OUTPUT_TOKENS_PER_PARAGRAPH
        batch_cost = estimate_model_cost_usd(
            model_name=resolved_model,
            input_tokens=batch_prompt_tokens,
            output_tokens=batch_output_tokens,
        )

        logger.info(
            (
                "Contradiction batch %d/%d doc=%s model=%s rows=%d "
                "est_input_tokens=%d est_output_tokens=%d est_cost_usd=%s"
            ),
            index,
            len(batches),
            payload.documentId,
            resolved_model,
            len(batch),
            batch_prompt_tokens,
            batch_output_tokens,
            _format_cost(batch_cost),
        )

        batch_prediction, batch_raw = _run_batch_with_fallback(
            provider=provider,
            payload=payload,
            model_name=resolved_model,
            batch_rows=batch,
            batch_label=f"{index}/{len(batches)}",
        )
        prediction_by_id.update(batch_prediction)
        raw_batch_responses.append(
            {
                "batch": index,
                "rows": len(batch),
                "estimated_input_tokens": batch_prompt_tokens,
                "estimated_output_tokens": batch_output_tokens,
                "estimated_cost_usd": _format_cost(batch_cost),
                "response_chars": len(batch_raw),
                "response_preview": batch_raw[:500],
            }
        )

    paragraph_results: list[ContradictionParagraphResult] = []
    prediction_by_id = _select_primary_unique_contradictions(
        prediction_by_id=prediction_by_id,
        ordered_paragraph_ids=ordered_paragraph_ids,
    )
    for paragraph_id in ordered_paragraph_ids:
        item = prediction_by_id.get(paragraph_id)
        if item is None:
            paragraph_results.append(
                ContradictionParagraphResult(
                    paragraph_id=paragraph_id,
                    contradiction=False,
                    confidence=0,
                    brief_reason="",
                    contradiction_type=None,
                    evidence=None,
                    contradictions=[],
                )
            )
            continue

        paragraph_results.append(
            ContradictionParagraphResult(
                paragraph_id=paragraph_id,
                contradiction=item["contradiction"],
                confidence=item["confidence"],
                brief_reason=item["brief_reason"],
                contradiction_type=item["contradiction_type"],
                evidence=item["evidence"],
                contradictions=item.get("contradictions", []),
            )
        )

    raw_response_payload = {
        "mode": "batched",
        "target_batch_input_tokens": TARGET_BATCH_INPUT_TOKENS,
        "estimated_input_tokens_total": estimated_input_total,
        "estimated_output_tokens_total": estimated_output_total,
        "estimated_cost_usd": _format_cost(estimated_cost_total),
        "batches": raw_batch_responses,
    }

    return ContradictionAnalysisResponse(
        documentId=payload.documentId,
        provider=payload.provider,
        temperature=payload.temperature,
        model=payload.model,
        mode=payload.mode,
        paragraphResults=paragraph_results,
        rawResponse=json.dumps(raw_response_payload, ensure_ascii=False),
    )


def estimate_contradiction_analysis_request(payload: ContradictionAnalysisRequest) -> dict[str, Any]:
    paragraph_rows, ordered_paragraph_ids = _build_document_rows(payload)
    resolved_model = (payload.model or "").strip() or "gpt-4.1"
    batches = _chunk_paragraph_rows(
        paragraph_rows=paragraph_rows,
        mode=payload.mode,
        model_name=resolved_model,
        target_input_tokens=TARGET_BATCH_INPUT_TOKENS,
    )
    estimated_input_total = 0
    for batch in batches:
        estimated_input_total += _estimate_prompt_tokens(
            paragraph_rows=batch,
            mode=payload.mode,
            model_name=resolved_model,
        )
    estimated_output_total = len(ordered_paragraph_ids) * ESTIMATED_OUTPUT_TOKENS_PER_PARAGRAPH
    estimated_cost_total = estimate_model_cost_usd(
        model_name=resolved_model,
        input_tokens=estimated_input_total,
        output_tokens=estimated_output_total,
    )
    return {
        "provider": payload.provider,
        "model": resolved_model,
        "estimated_input_tokens": estimated_input_total,
        "estimated_output_tokens": estimated_output_total,
        "estimated_total_tokens": estimated_input_total + estimated_output_total,
        "estimated_cost_usd": estimated_cost_total,
        "estimated_cost_usd_formatted": format_cost(estimated_cost_total),
    }


def _relation_type_label(raw_type: Any) -> str:
    """Map a graph edge type to the compact label sent to the LLM."""
    normalized = str(raw_type or "").strip().lower()
    if "reference" in normalized or normalized == "ref":
        return "reference"
    return "semantic"


def _build_document_rows(
    payload: ContradictionAnalysisRequest,
) -> tuple[list[dict[str, Any]], list[str]]:
    nodes = sorted(
        payload.graph.nodes,
        key=lambda node: (node.page, node.paragraph_enum),
    )

    node_by_id = {str(node.id): node for node in nodes}
    related_by_id: dict[str, set[str]] = defaultdict(set)
    relation_type_by_pair: dict[tuple[str, str], str] = {}

    for edge in payload.graph.edges:
        source_id = str(edge.source)
        target_id = str(edge.target)
        if source_id not in node_by_id or target_id not in node_by_id:
            continue

        rel_type = _relation_type_label(getattr(edge, "type", ""))

        # Include both directions to maximize contextual evidence per paragraph.
        related_by_id[source_id].add(target_id)
        related_by_id[target_id].add(source_id)

        for pair in ((source_id, target_id), (target_id, source_id)):
            if relation_type_by_pair.get(pair) != "reference":
                relation_type_by_pair[pair] = rel_type

    paragraph_rows: list[dict[str, Any]] = []
    ordered_ids: list[str] = []

    for node in nodes:
        paragraph_id = str(node.id)
        ordered_ids.append(paragraph_id)

        related_ids = sorted(
            related_by_id.get(paragraph_id, set()),
            key=lambda rid: (node_by_id[rid].page, node_by_id[rid].paragraph_enum),
        )

        related_paragraphs = []
        for rid in related_ids:
            related_paragraphs.append(
                {
                    "paragraph_id": rid,
                    "text": (node_by_id[rid].text or "").strip(),
                    "type": relation_type_by_pair.get((paragraph_id, rid), "semantic"),
                }
            )

        if len(related_paragraphs) != 0:
            paragraph_rows.append(
                {
                    "paragraph_id": paragraph_id,
                    "text": (node.text or "").strip(),
                    "related_paragraphs": related_paragraphs,
                }
            )

    return paragraph_rows, ordered_ids


def _build_user_prompt(
    *,
    paragraph_rows: list[dict[str, Any]],
    mode: str,
) -> str:
    document_payload: dict[str, Any] = {
        "mode": mode,
        "paragraphs": paragraph_rows,
    }

    return PROMPT_TEMPLATE.format(
        document_json=json.dumps(document_payload, ensure_ascii=False, indent=2)
    )

def _chunk_paragraph_rows(
    *,
    paragraph_rows: list[dict[str, Any]],
    mode: str,
    model_name: str,
    target_input_tokens: int,
) -> list[list[dict[str, Any]]]:
    if not paragraph_rows:
        return []

    chunks: list[list[dict[str, Any]]] = []
    current_chunk: list[dict[str, Any]] = []

    for row in paragraph_rows:
        trial_chunk = current_chunk + [row]
        trial_tokens = _estimate_prompt_tokens(
            paragraph_rows=trial_chunk,
            mode=mode,
            model_name=model_name,
        )

        if current_chunk and trial_tokens > target_input_tokens:
            chunks.append(current_chunk)
            current_chunk = [row]
            continue

        current_chunk = trial_chunk

    if current_chunk:
        chunks.append(current_chunk)

    return chunks


def _run_batch_with_fallback(
    *,
    provider: Any,
    payload: ContradictionAnalysisRequest,
    model_name: str,
    batch_rows: list[dict[str, Any]],
    batch_label: str,
) -> tuple[dict[str, dict[str, Any]], str]:
    user_prompt = _build_user_prompt(
        paragraph_rows=batch_rows,
        mode=payload.mode,
    )

    try:
        raw_response = provider.generate(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=payload.temperature,
        )
    except RuntimeError as exc:
        if _is_batch_too_large_error(exc):
            if len(batch_rows) > 1:
                midpoint = max(1, len(batch_rows) // 2)
                logger.warning(
                    "Batch %s exceeded context. Splitting %d rows into %d + %d.",
                    batch_label,
                    len(batch_rows),
                    midpoint,
                    len(batch_rows) - midpoint,
                )
                left_prediction, left_raw = _run_batch_with_fallback(
                    provider=provider,
                    payload=payload,
                    model_name=model_name,
                    batch_rows=batch_rows[:midpoint],
                    batch_label=f"{batch_label}.L",
                )
                right_prediction, right_raw = _run_batch_with_fallback(
                    provider=provider,
                    payload=payload,
                    model_name=model_name,
                    batch_rows=batch_rows[midpoint:],
                    batch_label=f"{batch_label}.R",
                )
                merged = dict(left_prediction)
                merged.update(right_prediction)
                return merged, f"{left_raw}\n\n{right_raw}"

            shrunk_row = _shrink_single_row_context(
                row=batch_rows[0],
                mode=payload.mode,
                model_name=model_name,
                target_input_tokens=max(8_000, TARGET_BATCH_INPUT_TOKENS // 2),
            )
            if shrunk_row is not batch_rows[0]:
                logger.warning(
                    "Batch %s single-row context was reduced to fit token limits (paragraph_id=%s).",
                    batch_label,
                    str(batch_rows[0].get("paragraph_id", "")),
                )
                return _run_batch_with_fallback(
                    provider=provider,
                    payload=payload,
                    model_name=model_name,
                    batch_rows=[shrunk_row],
                    batch_label=f"{batch_label}.S",
                )
        raise

    parsed = _safe_json_loads(raw_response)
    return _parse_paragraph_results(parsed), raw_response


def _shrink_single_row_context(
    *,
    row: dict[str, Any],
    mode: str,
    model_name: str,
    target_input_tokens: int,
) -> dict[str, Any]:
    related = row.get("related_paragraphs", [])
    if not isinstance(related, list) or not related:
        return row

    shrunk_row = {
        "paragraph_id": str(row.get("paragraph_id", "")),
        "text": str(row.get("text", "")),
        "related_paragraphs": list(related),
    }
    changed = False

    while shrunk_row["related_paragraphs"]:
        tokens = _estimate_prompt_tokens(
            paragraph_rows=[shrunk_row],
            mode=mode,
            model_name=model_name,
        )
        if tokens <= target_input_tokens:
            break

        next_size = len(shrunk_row["related_paragraphs"]) // 2
        shrunk_row["related_paragraphs"] = shrunk_row["related_paragraphs"][:next_size]
        changed = True

    return shrunk_row if changed else row


def _is_batch_too_large_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        "context_length_exceeded" in message
        or "maximum context length" in message
        or "request too large" in message
        or "tokens per min" in message
    )


def _estimate_prompt_tokens(
    *,
    paragraph_rows: list[dict[str, Any]],
    mode: str,
    model_name: str,
) -> int:
    prompt = _build_user_prompt(
        paragraph_rows=paragraph_rows,
        mode=mode,
    )
    return _estimate_tokens(prompt, model_name)


def _estimate_tokens(text: str, model_name: str) -> int:
    return estimate_tokens(text, model_name)


def _get_tiktoken_encoder(model_name: str) -> Any | None:
    global _TIKTOKEN_ENCODER
    global _TIKTOKEN_READY

    if _TIKTOKEN_READY:
        return _TIKTOKEN_ENCODER

    _TIKTOKEN_READY = True

    try:
        import tiktoken  # type: ignore
    except Exception:
        _TIKTOKEN_ENCODER = None
        return None

    try:
        _TIKTOKEN_ENCODER = tiktoken.encoding_for_model(model_name)
    except Exception:
        _TIKTOKEN_ENCODER = tiktoken.get_encoding("cl100k_base")

    return _TIKTOKEN_ENCODER


def _format_cost(cost: float | None) -> str:
    return format_cost(cost)


def _safe_json_loads(text: str) -> dict[str, Any] | list[Any]:
    cleaned = (text or "").strip()
    if not cleaned:
        return {}

    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    json_match = re.search(r"\{[\s\S]*\}", cleaned)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                "LLM did not return valid JSON "
                f"(line {exc.lineno}, column {exc.colno}): {exc.msg}"
            ) from exc

    raise RuntimeError("LLM did not return a valid JSON payload")


def _parse_paragraph_results(raw_json: dict[str, Any] | list[Any]) -> dict[str, dict[str, Any]]:
    if isinstance(raw_json, dict):
        rows = raw_json.get("paragraph_results", [])
    elif isinstance(raw_json, list):
        rows = raw_json
    else:
        rows = []

    parsed: dict[str, dict[str, Any]] = {}

    for row in rows:
        if not isinstance(row, dict):
            continue

        paragraph_id = str(row.get("paragraph_id", "")).strip()
        if not paragraph_id:
            continue

        candidates: list[dict[str, Any]] = []
        contradictions_raw = row.get("contradictions")
        if isinstance(contradictions_raw, list):
            for contradiction_item in contradictions_raw:
                candidate = _parse_single_contradiction_candidate(
                    contradiction_item,
                    fallback_row=row,
                )
                if candidate is not None:
                    candidates.append(candidate)

        # Backward compatibility: legacy single-contradiction shape.
        if not candidates:
            legacy_candidate = _parse_single_contradiction_candidate(
                row,
                fallback_row=row,
            )
            if legacy_candidate is not None:
                candidates.append(legacy_candidate)

        deduped_candidates = _dedupe_contradiction_candidates(candidates)
        has_contradiction = len(deduped_candidates) > 0

        if not has_contradiction:
            # Never surface contradictions without usable evidence snippets.
            deduped_candidates = []

        primary = deduped_candidates[0] if deduped_candidates else None
        parsed[paragraph_id] = {
            "contradiction": bool(primary),
            "confidence": int(primary["confidence"]) if primary else 0,
            "brief_reason": str(primary["brief_reason"]) if primary else "",
            "contradiction_type": str(primary["contradiction_type"]) if primary else None,
            "evidence": primary["evidence"] if primary else None,
            "contradictions": deduped_candidates,
        }

    return parsed


def _normalize_confidence(raw_value: Any) -> int:
    try:
        parsed = int(float(raw_value))
    except (TypeError, ValueError):
        parsed = 0
    return max(0, min(100, parsed))


def _normalize_evidence(
    evidence_obj: Any,
    *,
    contradiction_detected: bool,
) -> dict[str, Any] | None:
    if isinstance(evidence_obj, dict):
        snippet_a = str(evidence_obj.get("snippet_a", "")).strip()
        snippet_b = str(evidence_obj.get("snippet_b", "")).strip()
        source_a = str(evidence_obj.get("source_a", "unknown")).strip().lower()
        source_b = str(evidence_obj.get("source_b", "unknown")).strip().lower()
        evidence_status = str(evidence_obj.get("evidence_status", "")).strip().lower()
        evidence_note = str(evidence_obj.get("evidence_note", "")).strip()
        if source_a not in {"paragraph", "context", "unknown"}:
            source_a = "unknown"
        if source_b not in {"paragraph", "context", "unknown"}:
            source_b = "unknown"
        if evidence_status not in {"exact", "missing", "approximate"}:
            evidence_status = "exact" if (snippet_a and snippet_b) else "missing"

        return {
            "snippet_a": snippet_a,
            "snippet_b": snippet_b,
            "source_a": source_a,
            "source_b": source_b,
            "evidence_status": evidence_status,
            "evidence_note": evidence_note,
        }

    if contradiction_detected:
        return {
            "snippet_a": "",
            "snippet_b": "",
            "source_a": "unknown",
            "source_b": "unknown",
            "evidence_status": "missing",
            "evidence_note": "Model did not return structured evidence object.",
        }

    return None


def _parse_single_contradiction_candidate(
    row: Any,
    *,
    fallback_row: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    if not isinstance(row, dict):
        return None

    contradiction_raw = row.get("contradiction", True)
    contradiction = bool(contradiction_raw)
    if not contradiction:
        return None

    fallback_confidence_raw = 0
    if isinstance(fallback_row, dict):
        fallback_confidence_raw = fallback_row.get("confidence", 0)
    confidence = _normalize_confidence(row.get("confidence", fallback_confidence_raw))
    brief_reason = str(row.get("brief_reason", "")).strip()
    if not brief_reason and isinstance(fallback_row, dict):
        brief_reason = str(fallback_row.get("brief_reason", "")).strip()

    contradiction_type_raw = str(
        row.get(
            "contradiction_type",
            fallback_row.get("contradiction_type", "") if isinstance(fallback_row, dict) else "",
        )
    ).strip().lower()
    contradiction_type: str = (
        contradiction_type_raw
        if contradiction_type_raw in _ALLOWED_CONTRADICTION_TYPES
        else "specificity"
    )
    evidence = _normalize_evidence(
        row.get("evidence", fallback_row.get("evidence") if isinstance(fallback_row, dict) else None),
        contradiction_detected=contradiction,
    )

    return {
        "confidence": confidence,
        "brief_reason": brief_reason,
        "contradiction_type": contradiction_type,
        "evidence": evidence,
    }


def _normalize_text_for_key(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def _canonical_contradiction_key(candidate: dict[str, Any]) -> str:
    evidence = candidate.get("evidence") if isinstance(candidate, dict) else None
    contradiction_type = str(candidate.get("contradiction_type", "specificity")).strip().lower()
    if contradiction_type not in _ALLOWED_CONTRADICTION_TYPES:
        contradiction_type = "specificity"

    snippet_a = ""
    snippet_b = ""
    if isinstance(evidence, dict):
        snippet_a = _normalize_text_for_key(str(evidence.get("snippet_a", "")))
        snippet_b = _normalize_text_for_key(str(evidence.get("snippet_b", "")))

    if snippet_a or snippet_b:
        left, right = sorted([snippet_a, snippet_b])
        return f"{contradiction_type}|{left}|{right}"

    reason = _normalize_text_for_key(str(candidate.get("brief_reason", "")))
    return f"{contradiction_type}|{reason}"


def _has_usable_evidence(evidence: Any) -> bool:
    if not isinstance(evidence, dict):
        return False
    snippet_a = str(evidence.get("snippet_a", "")).strip()
    snippet_b = str(evidence.get("snippet_b", "")).strip()
    return bool(snippet_a and snippet_b)


def _dedupe_contradiction_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_key: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for candidate in candidates:
        if not _has_usable_evidence(candidate.get("evidence")):
            continue
        key = _canonical_contradiction_key(candidate)
        existing = by_key.get(key)
        if existing is None:
            by_key[key] = candidate
            order.append(key)
            continue
        if int(candidate.get("confidence", 0)) > int(existing.get("confidence", 0)):
            by_key[key] = candidate

    deduped = [by_key[key] for key in order]
    deduped.sort(
        key=lambda candidate: int(candidate.get("confidence", 0)),
        reverse=True,
    )
    return deduped


def _select_primary_unique_contradictions(
    *,
    prediction_by_id: dict[str, dict[str, Any]],
    ordered_paragraph_ids: list[str],
) -> dict[str, dict[str, Any]]:
    used_keys: dict[str, str] = {}

    for paragraph_id in ordered_paragraph_ids:
        item = prediction_by_id.get(paragraph_id)
        if not isinstance(item, dict):
            continue

        candidates_obj = item.get("contradictions")
        candidates = candidates_obj if isinstance(candidates_obj, list) else []
        if not candidates:
            continue

        unique_candidates: list[dict[str, Any]] = []
        unique_keys: list[str] = []
        for candidate in candidates:
            key = _canonical_contradiction_key(candidate)
            if key in used_keys:
                continue
            unique_candidates.append(candidate)
            unique_keys.append(key)

        if not unique_candidates:
            item["contradiction"] = False
            item["confidence"] = 0
            item["brief_reason"] = ""
            item["contradiction_type"] = None
            item["evidence"] = None
            item["contradictions"] = []
            continue

        selected = unique_candidates[0]
        for key in unique_keys:
            used_keys[key] = paragraph_id

        item["contradiction"] = True
        item["confidence"] = int(selected.get("confidence", 0))
        item["brief_reason"] = str(selected.get("brief_reason", ""))
        item["contradiction_type"] = str(selected.get("contradiction_type", "specificity"))
        item["evidence"] = selected.get("evidence")
        item["contradictions"] = unique_candidates

    return prediction_by_id
