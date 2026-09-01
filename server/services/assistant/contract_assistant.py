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
    system_prompt = _build_system_prompt(payload.mode, payload.scope)
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


def _default_model_for_provider(provider: str) -> str:
    return "gpt-4.1"


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
    system_prompt = _build_system_prompt(payload.mode, payload.scope)
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

    if payload.scope == "kg_node":
        focus_ids = [pid for pid in dict.fromkeys(payload.focusParagraphIds) if pid in node_map]
        if focus_ids:
            focus_entries = [
                ContextEntry(node=node_map[pid], tag="kg_focus", relation_summary="")
                for pid in focus_ids
            ]
            focus_entries.sort(key=lambda entry: (entry.node.page, entry.node.paragraph_enum))
            return _apply_context_budget(focus_entries)
        # No focus paragraphs from the client: fall back to the full contract.

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


def _build_system_prompt(mode: str, scope: str = "selected") -> str:
    if scope == "kg_node":
        prompt = (
            "You are a Contract Impact Assistant for a deontic knowledge graph. "
            "One party (a graph node) is in focus, and you are GIVEN precomputed burden/benefit facts for it. "
            "Treat every number, weight, and clause ranking as ground truth: never recompute, reweight, or contradict them. "
            "Your job is to EXPLAIN, in plain language, why the contract burdens or benefits this party and which clauses drive it, "
            "grounding every claim in the provided paragraph text. "
            "Never invent paragraph IDs or facts. "
            "Always return valid JSON with this shape: "
            '{"answer": string, "citations": [string], "suggested_questions": [string]}. '
            "Citations must be exact paragraph IDs from ALLOWED_PARAGRAPH_IDS. "
            "If the facts are insufficient, say so plainly and cite the closest supporting paragraphs."
        )
    else:
        mode_instruction = {
            "explain": "Explain in plain language and avoid legal jargon when possible.",
            "suggest_questions": "Focus on generating concise follow-up questions grounded in the contract.",
        }.get(mode, "Explain in plain language.")
        prompt = (
            "You are a What-if Contract Assistant. "
            "Use only the provided contract paragraph context. "
            "Never invent paragraph IDs or facts. "
            "Always return valid JSON with this shape: "
            '{"answer": string, "citations": [string], "suggested_questions": [string]}. '
            "Citations must include one or more exact paragraph IDs from ALLOWED_PARAGRAPH_IDS. "
            "If information is incomplete, state that clearly but still cite the best supporting paragraphs. "
            f"{mode_instruction}"
        )

    logger.info("\t\t SYSTEM PROMPT")
    logger.info("\n\n\n%s\n\n\n", prompt)
    logger.info("======================")
    return prompt


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

    kg_block = ""
    if payload.scope == "kg_node":
        kg_block = (
            "Knowledge Graph Facts (ground truth — explain, do not recompute):\n"
            f"{_format_kg_facts(payload)}\n\n"
        )

    prompt = (
        f"Document ID: {payload.documentId}\n"
        f"Mode: {payload.mode}\n"
        f"Scope: {payload.scope}\n"
        f"Question: {payload.question.strip()}\n\n"
        f"{kg_block}"
        f"ALLOWED_PARAGRAPH_IDS: [{allowed_block}]\n\n"
        f"Conversation History:\n{history_block}\n\n"
        f"Contract Context:\n{context_block}\n\n"
        "Output JSON only. "
        "For citations, include only IDs from ALLOWED_PARAGRAPH_IDS."
    )

    logger.info("\t\t USER PROMPT")
    logger.info("\n\n\n%s\n\n\n", prompt)
    logger.info("======================")
    return prompt


def _format_kg_facts(payload: AssistantChatRequest) -> str:
    ledger = payload.kgLedger
    party = payload.focusNodeLabel or payload.focusNodeId or "(unknown)"
    if ledger is None:
        return f"Focused party: {party}\n(no impact facts were provided)"

    weighting = "Personalized PageRank × severity" if ledger.usePageRank else "severity only"
    lines = [
        f"Focused party: {party}",
        f"Impact weighting: {weighting}",
        f"Burden total weight: {ledger.burdenWeight:.3f} across {ledger.burdenCount} statement(s)",
        f"Benefit total weight: {ledger.benefitWeight:.3f} across {ledger.benefitCount} statement(s)",
        f"Deontic mix: {ledger.obligations} obligation(s), {ledger.rights} right(s), {ledger.prohibitions} prohibition(s)",
    ]
    if ledger.topClauses:
        lines.append("Heaviest clauses (already ranked):")
        lines.extend(
            f"  - {clause.label} [{clause.id}]: burden={clause.burden:.3f}, benefit={clause.benefit:.3f}"
            for clause in ledger.topClauses
        )
    return "\n".join(lines)


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
