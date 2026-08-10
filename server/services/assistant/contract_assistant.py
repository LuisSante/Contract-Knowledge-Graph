from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from schemas.types import (
    AssistantChatRequest,
    AssistantChatResponse,
    AssistantCitation,
    AssistantParagraphNode,
    SimplifyAudit,
    SimplifyEvidence,
    SimplifyRelatedParagraph,
    SimplifySelectionRequest,
    SimplifySelectionResponse,
)
from services.llm.cost_estimator import estimate_model_cost_usd, estimate_tokens, format_cost
from services.llm.factory import LLMProviderFactory

logger = logging.getLogger(__name__)

MAX_CONTEXT_CHAR_BUDGET = 32000
MAX_HISTORY_MESSAGES = 8
MAX_HISTORY_CHAR = 600
MAX_SUGGESTED_QUESTIONS = 5
MAX_CITATION_EXCERPT = 220
MAX_SIMPLIFY_AUDIT_ENTRIES = 600
MAX_FIX_RELATED_PARAGRAPHS = 3
MAX_FIX_RELATED_TEXT_CHARS = 1800
SIMPLIFY_AUDIT_LOG: list[dict[str, Any]] = []
ASSISTANT_ESTIMATED_OUTPUT_TOKENS = 900
SIMPLIFY_ESTIMATED_OUTPUT_TOKENS = 450


@dataclass
class ContextEntry:
    node: AssistantParagraphNode
    tag: str
    relation_summary: str


def estimate_assistant_chat_request(payload: AssistantChatRequest) -> dict[str, Any]:
    node_map = {node.id: node for node in payload.paragraphNodes}
    context_entries = _build_context_entries(payload, node_map)
    allowed_ids = [entry.node.id for entry in context_entries]
    system_prompt = _build_system_prompt(payload.mode)
    user_prompt = _build_user_prompt(payload, context_entries, allowed_ids)
    resolved_model = (payload.model or "").strip() or _default_model_for_provider(payload.provider)
    input_tokens = estimate_tokens(system_prompt, resolved_model) + estimate_tokens(user_prompt, resolved_model)
    output_tokens = ASSISTANT_ESTIMATED_OUTPUT_TOKENS
    cost = estimate_model_cost_usd(
        model_name=resolved_model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )
    return {
        "provider": payload.provider,
        "model": resolved_model,
        "estimated_input_tokens": input_tokens,
        "estimated_output_tokens": output_tokens,
        "estimated_total_tokens": input_tokens + output_tokens,
        "estimated_cost_usd": cost,
        "estimated_cost_usd_formatted": format_cost(cost),
    }


def estimate_simplify_request(
    payload: SimplifySelectionRequest,
    *,
    fix_contradiction: bool,
) -> dict[str, Any]:
    paragraph_text = payload.paragraphText or ""
    start, end = _normalize_selection_bounds(
        payload.selectionStart,
        payload.selectionEnd,
        total_length=len(paragraph_text),
    )
    if start == end:
        start = 0
        end = len(paragraph_text)
    original_snippet = paragraph_text[start:end]

    if fix_contradiction:
        system_prompt = _build_fix_contradiction_system_prompt()
        user_prompt = _build_fix_contradiction_user_prompt(
            document_id=payload.documentId,
            paragraph_id=payload.paragraphId,
            paragraph_text=paragraph_text,
            selected_snippet=original_snippet,
            selection_start=start,
            selection_end=end,
            contradiction_reason=(payload.contradictionReason or "").strip(),
            related_paragraphs=payload.relatedParagraphs[:MAX_FIX_RELATED_PARAGRAPHS],
        )
    else:
        system_prompt = _build_simplify_system_prompt()
        user_prompt = _build_simplify_user_prompt(
            document_id=payload.documentId,
            paragraph_id=payload.paragraphId,
            paragraph_text=paragraph_text,
            selected_snippet=original_snippet,
            selection_start=start,
            selection_end=end,
        )

    resolved_model = _default_model_for_provider(payload.provider)
    input_tokens = estimate_tokens(system_prompt, resolved_model) + estimate_tokens(user_prompt, resolved_model)
    output_tokens = SIMPLIFY_ESTIMATED_OUTPUT_TOKENS
    cost = estimate_model_cost_usd(
        model_name=resolved_model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )
    return {
        "provider": payload.provider,
        "model": resolved_model,
        "estimated_input_tokens": input_tokens,
        "estimated_output_tokens": output_tokens,
        "estimated_total_tokens": input_tokens + output_tokens,
        "estimated_cost_usd": cost,
        "estimated_cost_usd_formatted": format_cost(cost),
    }


def _default_model_for_provider(provider: str) -> str:
    return "gpt-4.1" if provider == "openai" else "gemini-2.5-flash"


def generate_assistant_response(payload: AssistantChatRequest) -> AssistantChatResponse:
    node_map = {node.id: node for node in payload.paragraphNodes}

    if not node_map:
        raise RuntimeError("No paragraph nodes were provided")

    context_entries = _build_context_entries(payload, node_map)
    if not context_entries:
        raise RuntimeError("No usable paragraph context was found")

    allowed_ids = [entry.node.id for entry in context_entries]

    provider = LLMProviderFactory.create(payload.provider, model=payload.model)
    resolved_model = (payload.model or "").strip() or _default_model_for_provider(payload.provider)
    logger.info(
        "[COST_DEBUG] assistant_chat request: provider=%s requested_model=%s resolved_model=%s scope=%s mode=%s",
        payload.provider,
        payload.model,
        resolved_model,
        payload.scope,
        payload.mode,
    )
    system_prompt = _build_system_prompt(payload.mode)
    user_prompt = _build_user_prompt(payload, context_entries, allowed_ids)

    raw_text = provider.generate(system_prompt=system_prompt, user_prompt=user_prompt, temperature=0.2)
    parsed = _parse_json_from_model(raw_text)

    answer = _sanitize_answer(parsed.get("answer"), fallback=raw_text)
    citation_ids = _normalize_citation_ids(
        parsed.get("citations"),
        allowed_ids=allowed_ids,
        selected_id=payload.selectedParagraphId,
    )
    suggested_questions = _normalize_suggested_questions(parsed.get("suggested_questions"))

    citations = [_build_citation(citation_id, node_map) for citation_id in citation_ids]

    return AssistantChatResponse(
        answer=answer,
        citations=citations,
        suggestedQuestions=suggested_questions,
        mode=payload.mode,
        scope=payload.scope,
        provider=payload.provider,
    )


def simplify_paragraph_selection(payload: SimplifySelectionRequest) -> SimplifySelectionResponse:
    paragraph_text = payload.paragraphText or ""
    if not paragraph_text:
        raise RuntimeError("Paragraph text is empty")

    start, end = _normalize_selection_bounds(
        payload.selectionStart,
        payload.selectionEnd,
        total_length=len(paragraph_text),
    )

    if start == end:
        start = 0
        end = len(paragraph_text)

    original_snippet = paragraph_text[start:end]
    if not original_snippet:
        raise RuntimeError("No text is available to simplify")

    provider = LLMProviderFactory.create(payload.provider)
    system_prompt = _build_simplify_system_prompt()
    user_prompt = _build_simplify_user_prompt(
        document_id=payload.documentId,
        paragraph_id=payload.paragraphId,
        paragraph_text=paragraph_text,
        selected_snippet=original_snippet,
        selection_start=start,
        selection_end=end,
    )

    raw_text = provider.generate(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.0,
    )
    parsed = _parse_json_from_model(raw_text)
    simplified_value = (
        parsed.get("simplified_snippet")
        or parsed.get("simplifiedSnippet")
        or parsed.get("rewrite")
        or parsed.get("answer")
    )
    simplified_snippet = _sanitize_simplified_snippet(
        simplified_value,
        fallback=raw_text,
        original=original_snippet,
    )
    simplified_snippet = _enforce_literal_token_preservation(
        original=original_snippet,
        candidate=simplified_snippet,
    )

    evidence = SimplifyEvidence(
        paragraph_id=payload.paragraphId,
        selection_start=start,
        selection_end=end,
    )
    audit = SimplifyAudit(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        model_response=raw_text,
    )

    _append_simplify_audit_log(
        payload=payload,
        evidence=evidence,
        original_snippet=original_snippet,
        simplified_snippet=simplified_snippet,
        audit=audit,
    )

    logger.info("======================")
    logger.info("\t\t SIMPLIFY AUDIT LOG ENTRY")
    logger.info(SimplifySelectionResponse(
        paragraphId=payload.paragraphId,
        provider=payload.provider,
        originalSnippet=original_snippet,
        simplifiedSnippet=simplified_snippet,
        evidence=evidence,
        audit=audit,
    ))
    logger.info("======================")

    return SimplifySelectionResponse(
        paragraphId=payload.paragraphId,
        provider=payload.provider,
        originalSnippet=original_snippet,
        simplifiedSnippet=simplified_snippet,
        evidence=evidence,
        audit=audit,
    )


def fix_contradiction_selection(payload: SimplifySelectionRequest) -> SimplifySelectionResponse:
    paragraph_text = payload.paragraphText or ""
    if not paragraph_text:
        raise RuntimeError("Paragraph text is empty")

    start, end = _normalize_selection_bounds(
        payload.selectionStart,
        payload.selectionEnd,
        total_length=len(paragraph_text),
    )

    if start == end:
        start = 0
        end = len(paragraph_text)

    original_snippet = paragraph_text[start:end]
    if not original_snippet:
        raise RuntimeError("No text is available to fix")

    provider = LLMProviderFactory.create(payload.provider)
    system_prompt = _build_fix_contradiction_system_prompt()
    user_prompt = _build_fix_contradiction_user_prompt(
        document_id=payload.documentId,
        paragraph_id=payload.paragraphId,
        paragraph_text=paragraph_text,
        selected_snippet=original_snippet,
        selection_start=start,
        selection_end=end,
        contradiction_reason=(payload.contradictionReason or "").strip(),
        related_paragraphs=payload.relatedParagraphs[:MAX_FIX_RELATED_PARAGRAPHS],
    )

    raw_text = provider.generate(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.0,
    )
    parsed = _parse_json_from_model(raw_text)
    fixed_value = (
        parsed.get("fixed_snippet")
        or parsed.get("fixedSnippet")
        or parsed.get("rewrite")
        or parsed.get("answer")
        or parsed.get("simplified_snippet")
    )
    fixed_snippet = _sanitize_simplified_snippet(
        fixed_value,
        fallback=raw_text,
        original=original_snippet,
    )
    fixed_snippet = _enforce_literal_token_preservation(
        original=original_snippet,
        candidate=fixed_snippet,
    )

    evidence = SimplifyEvidence(
        paragraph_id=payload.paragraphId,
        selection_start=start,
        selection_end=end,
    )
    audit = SimplifyAudit(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        model_response=raw_text,
    )

    _append_simplify_audit_log(
        payload=payload,
        evidence=evidence,
        original_snippet=original_snippet,
        simplified_snippet=fixed_snippet,
        audit=audit,
    )

    return SimplifySelectionResponse(
        paragraphId=payload.paragraphId,
        provider=payload.provider,
        originalSnippet=original_snippet,
        simplifiedSnippet=fixed_snippet,
        evidence=evidence,
        audit=audit,
    )


def _build_context_entries(
    payload: AssistantChatRequest,
    node_map: dict[str, AssistantParagraphNode],
) -> list[ContextEntry]:
    if payload.scope == "selected":
        if not payload.selectedParagraphId:
            raise RuntimeError("Select a paragraph before using selected-paragraph mode")

        selected_node = node_map.get(payload.selectedParagraphId)
        if not selected_node:
            raise RuntimeError("Selected paragraph is not available in the current context")

        entries: list[ContextEntry] = [
            ContextEntry(
                node=selected_node,
                tag="selected",
                relation_summary="",
            )
        ]
        seen_ids = {selected_node.id}

        for related in payload.relatedParagraphs:
            if related.id in seen_ids:
                continue
            node = node_map.get(related.id)
            if node is None:
                continue

            relation_bits: list[str] = []
            if related.relationTypes:
                relation_bits.append("types=" + ",".join(sorted(set(related.relationTypes))))
            if related.semanticScore is not None:
                relation_bits.append(f"semantic={related.semanticScore:.3f}")
            if related.references:
                relation_bits.append("refs=" + "; ".join(related.references[:3]))

            entries.append(
                ContextEntry(
                    node=node,
                    tag="related",
                    relation_summary=" | ".join(relation_bits),
                )
            )
            seen_ids.add(node.id)

        selected = entries[:1]
        related_sorted = sorted(
            entries[1:],
            key=lambda entry: (entry.node.page, entry.node.paragraph_enum),
        )
        return _apply_context_budget(selected + related_sorted)

    full_entries = [
        ContextEntry(node=node, tag="contract", relation_summary="")
        for node in sorted(payload.paragraphNodes, key=lambda item: (item.page, item.paragraph_enum))
    ]

    return _apply_context_budget(full_entries)


def _apply_context_budget(entries: list[ContextEntry]) -> list[ContextEntry]:
    total_chars = 0
    selected_entries: list[ContextEntry] = []

    for entry in entries:
        cost = len(entry.node.text or "")
        if selected_entries and total_chars + cost > MAX_CONTEXT_CHAR_BUDGET:
            break

        selected_entries.append(entry)
        total_chars += cost

    return selected_entries


def _build_system_prompt(mode: str) -> str:
    mode_instruction = {
        "explain": "Explain in plain language and avoid legal jargon when possible.",
        "suggest_questions": "Focus on generating concise follow-up questions grounded in the contract.",
    }.get(mode, "Explain in plain language.")

    logger.info("\t\t SYSTEM PROMPT")
    logger.info (
        f"\n\n\n"
        "You are a What-if Contract Assistant. "
        "Use only the provided contract paragraph context. "
        "Never invent paragraph IDs or facts. "
        "Always return valid JSON with this shape: "
        '{"answer": string, "citations": [string], "suggested_questions": [string]}. '
        "Citations must include one or more exact paragraph IDs from ALLOWED_PARAGRAPH_IDS. "
        "If information is incomplete, state that clearly but still cite the best supporting paragraphs. "
        f"{mode_instruction}"
        f"\n\n\n"
    )
    logger.info("======================")

    return (
        "You are a What-if Contract Assistant. "
        "Use only the provided contract paragraph context. "
        "Never invent paragraph IDs or facts. "
        "Always return valid JSON with this shape: "
        '{"answer": string, "citations": [string], "suggested_questions": [string]}. '
        "Citations must include one or more exact paragraph IDs from ALLOWED_PARAGRAPH_IDS. "
        "If information is incomplete, state that clearly but still cite the best supporting paragraphs. "
        f"{mode_instruction}"
    )


def _build_user_prompt(
    payload: AssistantChatRequest,
    context_entries: list[ContextEntry],
    allowed_ids: list[str],
) -> str:
    history_lines: list[str] = []
    for message in payload.history[-MAX_HISTORY_MESSAGES:]:
        content = (message.content or "").strip()
        if not content:
            continue
        clipped = content[:MAX_HISTORY_CHAR]
        history_lines.append(f"{message.role.upper()}: {clipped}")

    context_lines: list[str] = []
    for entry in context_entries:
        relation = f" | {entry.relation_summary}" if entry.relation_summary else ""
        context_lines.append(
            f"[{entry.node.id}] tag={entry.tag} page={entry.node.page} "
            f"paragraph={entry.node.paragraph_enum}{relation}\n{entry.node.text.strip()}"
        )

    history_block = "\n".join(history_lines) if history_lines else "(none)"
    context_block = "\n\n".join(context_lines)
    allowed_block = ", ".join(allowed_ids)

    logger.info("\t\t USER PROMPT")
    logger.info(
        f"\n\n\n"
        f"Document ID: {payload.documentId}\n"
        f"Mode: {payload.mode}\n"
        f"Scope: {payload.scope}\n"
        f"Question: {payload.question.strip()}\n\n"
        f"ALLOWED_PARAGRAPH_IDS: [{allowed_block}]\n\n"
        f"Conversation History:\n{history_block}\n\n"
        f"Contract Context:\n{context_block}\n\n"
        "Output JSON only. "
        "For citations, include only IDs from ALLOWED_PARAGRAPH_IDS."
        f"\n\n\n"
    )
    logger.info("======================")

    return (
        f"Document ID: {payload.documentId}\n"
        f"Mode: {payload.mode}\n"
        f"Scope: {payload.scope}\n"
        f"Question: {payload.question.strip()}\n\n"
        f"ALLOWED_PARAGRAPH_IDS: [{allowed_block}]\n\n"
        f"Conversation History:\n{history_block}\n\n"
        f"Contract Context:\n{context_block}\n\n"
        "Output JSON only. "
        "For citations, include only IDs from ALLOWED_PARAGRAPH_IDS."
    )


def _parse_json_from_model(text: str) -> dict[str, Any]:
    cleaned = (text or "").strip()
    if not cleaned:
        return {}

    fenced = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE | re.DOTALL)

    for candidate in (cleaned, fenced):
        parsed = _try_parse_json(candidate)
        if parsed is not None:
            return parsed

    match = re.search(r"\{[\s\S]*\}", fenced)
    if match:
        parsed = _try_parse_json(match.group(0))
        if parsed is not None:
            return parsed

    return {"answer": cleaned}


def _try_parse_json(candidate: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        return None

    if isinstance(parsed, dict):
        return parsed
    return None


def _sanitize_answer(value: Any, fallback: str) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    if isinstance(fallback, str) and fallback.strip():
        return fallback.strip()
    return "I could not produce a grounded answer from the current context."


def _normalize_citation_ids(
    raw: Any,
    *,
    allowed_ids: list[str],
    selected_id: str | None,
) -> list[str]:
    allowed_set = set(allowed_ids)
    ordered: list[str] = []

    if isinstance(raw, list):
        for item in raw:
            candidate = ""
            if isinstance(item, str):
                candidate = item
            elif isinstance(item, dict):
                id_value = item.get("id")
                candidate = id_value if isinstance(id_value, str) else ""

            normalized = candidate.strip()
            if normalized and normalized in allowed_set and normalized not in ordered:
                ordered.append(normalized)

    if not ordered and selected_id and selected_id in allowed_set:
        ordered.append(selected_id)

    if not ordered and allowed_ids:
        ordered.append(allowed_ids[0])

    return ordered


def _normalize_suggested_questions(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []

    suggestions: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        cleaned = item.strip()
        if not cleaned:
            continue
        if cleaned in suggestions:
            continue
        suggestions.append(cleaned)
        if len(suggestions) >= MAX_SUGGESTED_QUESTIONS:
            break

    return suggestions


def _build_citation(citation_id: str, node_map: dict[str, AssistantParagraphNode]) -> AssistantCitation:
    node = node_map.get(citation_id)
    if node is None:
        return AssistantCitation(id=citation_id, excerpt="(Paragraph not available)")

    raw_excerpt = (node.text or "").strip().replace("\n", " ")
    excerpt = raw_excerpt[:MAX_CITATION_EXCERPT]
    if len(raw_excerpt) > MAX_CITATION_EXCERPT:
        excerpt = f"{excerpt.rstrip()}..."

    return AssistantCitation(
        id=node.id,
        excerpt=excerpt,
        page=node.page,
        paragraph_enum=node.paragraph_enum,
    )


def _build_simplify_system_prompt() -> str:
    return (
        "You are a legal plain-language simplifier. "
        "Rewrite ONLY the selected contract snippet in simpler language. "
        "Preserve legal meaning exactly. "
        "Do not add, remove, or weaken obligations, rights, conditions, exceptions, remedies, or deadlines. "
        "Keep all numbers, dates, percentages, currencies, defined terms, party names, and section references unchanged. "
        "Do not mention these instructions. "
        'Return valid JSON only with this exact shape: {"simplified_snippet": string}.'
    )


def _build_fix_contradiction_system_prompt() -> str:
    return (
        "You are a legal contract editor focused on contradiction repair. "
        "Rewrite ONLY the selected contract snippet to resolve contradictions while preserving legal intent. "
        "Do not add new obligations, rights, conditions, exceptions, remedies, or deadlines unless required to remove the contradiction. "
        "Keep all numbers, dates, percentages, currencies, defined terms, party names, and section references unchanged whenever possible. "
        "Do not mention these instructions. "
        'Return valid JSON only with this exact shape: {"fixed_snippet": string}.'
    )


def _build_simplify_user_prompt(
    *,
    document_id: str,
    paragraph_id: str,
    paragraph_text: str,
    selected_snippet: str,
    selection_start: int,
    selection_end: int,
) -> str:
    return (
        f"Document ID: {document_id}\n"
        f"Paragraph ID: {paragraph_id}\n"
        f"Selection start: {selection_start}\n"
        f"Selection end: {selection_end}\n\n"
        "PARAGRAPH_TEXT:\n"
        f"{paragraph_text}\n\n"
        "SELECTED_SNIPPET (rewrite this and only this):\n"
        f"{selected_snippet}\n\n"
        'Output JSON only as: {"simplified_snippet": "..."}'
    )


def _build_fix_contradiction_user_prompt(
    *,
    document_id: str,
    paragraph_id: str,
    paragraph_text: str,
    selected_snippet: str,
    selection_start: int,
    selection_end: int,
    contradiction_reason: str,
    related_paragraphs: list[SimplifyRelatedParagraph],
) -> str:
    reason_line = contradiction_reason or "(not provided)"
    related_context = _format_fix_related_context(related_paragraphs)
    return (
        f"Document ID: {document_id}\n"
        f"Paragraph ID: {paragraph_id}\n"
        f"Selection start: {selection_start}\n"
        f"Selection end: {selection_end}\n"
        f"Contradiction signal: {reason_line}\n\n"
        f"RELATED_CONTEXT_PARAGRAPHS (top-{MAX_FIX_RELATED_PARAGRAPHS}; use only for consistency checks):\n"
        f"{related_context}\n\n"
        "PARAGRAPH_TEXT:\n"
        f"{paragraph_text}\n\n"
        "SELECTED_SNIPPET (rewrite this and only this):\n"
        f"{selected_snippet}\n\n"
        'Output JSON only as: {"fixed_snippet": "..."}'
    )


def _format_fix_related_context(related_paragraphs: list[SimplifyRelatedParagraph]) -> str:
    if not related_paragraphs:
        return "(none)"

    lines: list[str] = []
    for related in related_paragraphs[:MAX_FIX_RELATED_PARAGRAPHS]:
        text = (related.text or "").strip()
        if not text:
            continue

        relation_bits: list[str] = []
        if related.relationTypes:
            relation_bits.append("types=" + ",".join(sorted(set(related.relationTypes))))
        if related.semanticScore is not None:
            relation_bits.append(f"semantic={related.semanticScore:.3f}")
        if related.references:
            relation_bits.append("refs=" + "; ".join(related.references[:3]))
        if related.page is not None:
            relation_bits.append(f"page={related.page}")
        if related.paragraph_enum is not None:
            relation_bits.append(f"paragraph={related.paragraph_enum}")

        relation_suffix = f" | {' | '.join(relation_bits)}" if relation_bits else ""
        clipped_text = text[:MAX_FIX_RELATED_TEXT_CHARS]
        if len(text) > MAX_FIX_RELATED_TEXT_CHARS:
            clipped_text = f"{clipped_text.rstrip()}..."

        lines.append(f"[{related.id}]{relation_suffix}\n{clipped_text}")

    if not lines:
        return "(none)"
    return "\n\n".join(lines)


def _normalize_selection_bounds(start: int, end: int, *, total_length: int) -> tuple[int, int]:
    normalized_start = max(0, min(int(start), total_length))
    normalized_end = max(0, min(int(end), total_length))
    if normalized_end < normalized_start:
        normalized_start, normalized_end = normalized_end, normalized_start
    return normalized_start, normalized_end


def _sanitize_simplified_snippet(value: Any, *, fallback: str, original: str) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()

    fallback_clean = (fallback or "").strip()
    if fallback_clean:
        reparsed = _parse_json_from_model(fallback_clean)
        reparsed_value = (
            reparsed.get("simplified_snippet")
            or reparsed.get("simplifiedSnippet")
            or reparsed.get("rewrite")
            or reparsed.get("answer")
        )
        if isinstance(reparsed_value, str) and reparsed_value.strip():
            return reparsed_value.strip()
        return fallback_clean

    return original


def _enforce_literal_token_preservation(*, original: str, candidate: str) -> str:
    if not candidate.strip():
        return original

    required_tokens: set[str] = set()
    required_tokens.update(re.findall(r"\b\d[\d,./:-]*%?\b", original))
    required_tokens.update(re.findall(r'"[^"\n]+"', original))

    for token in required_tokens:
        if token and token not in candidate:
            return original

    return candidate


def _append_simplify_audit_log(
    *,
    payload: SimplifySelectionRequest,
    evidence: SimplifyEvidence,
    original_snippet: str,
    simplified_snippet: str,
    audit: SimplifyAudit,
) -> None:
    SIMPLIFY_AUDIT_LOG.append(
        {
            "timestamp": datetime.now(UTC).isoformat(),
            "document_id": payload.documentId,
            "provider": payload.provider,
            "paragraph_id": evidence.paragraph_id,
            "selection_start": evidence.selection_start,
            "selection_end": evidence.selection_end,
            "original_snippet": original_snippet,
            "simplified_snippet": simplified_snippet,
            "system_prompt": audit.system_prompt,
            "user_prompt": audit.user_prompt,
            "model_response": audit.model_response,
        }
    )

    overflow = len(SIMPLIFY_AUDIT_LOG) - MAX_SIMPLIFY_AUDIT_ENTRIES
    if overflow > 0:
        del SIMPLIFY_AUDIT_LOG[:overflow]
