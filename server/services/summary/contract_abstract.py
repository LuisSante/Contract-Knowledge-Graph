from __future__ import annotations

import json
import logging
import re
from typing import Any

from schemas.summary import ContractSummary, ContractSummaryParty
from services.llm.factory import LLMProviderFactory

logger = logging.getLogger(__name__)

# The opening pages carry the recitals and the definitions the abstract needs;
# the clause headings that follow give the shape of everything this cuts off.
MAX_CONTEXT_CHAR_BUDGET = 18000
MAX_CLAUSE_HEADINGS = 40
MAX_SUMMARY_WORDS = 60
MAX_DOES_WORDS = 25

PROMPT_VERSION = "abstract/v1"

_MENTION = re.compile(r"\{\{([^|}]+)\|([^}]+)\}\}")


def generate_contract_summary(
    *,
    doc_id: str,
    document_name: str,
    kg: dict[str, Any],
    paragraphs: list[dict[str, Any]],
    provider_name: str = "openai",
    model: str | None = None,
) -> ContractSummary:
    kg_parties = [p for p in kg.get("parties", []) if isinstance(p, dict) and p.get("id")]
    if not kg_parties:
        raise RuntimeError("The knowledge graph has no parties to align the abstract with")
    if not paragraphs:
        raise RuntimeError("No paragraphs were found for this document")

    party_by_id = {str(p["id"]): p for p in kg_parties}

    provider = LLMProviderFactory.create(provider_name, model=model)
    raw = provider.generate(
        system_prompt=_system_prompt(),
        user_prompt=_user_prompt(document_name, kg, kg_parties, paragraphs),
        temperature=0.2,
    )
    parsed = _parse_json(raw)

    return ContractSummary(
        documentId=doc_id,
        documentName=document_name,
        title=_clean(parsed.get("title"))[:120],
        contractType=_clean(parsed.get("contractType"))[:60],
        summary=_sanitize_summary(_clean(parsed.get("summary")), party_by_id),
        parties=_sanitize_parties(parsed.get("parties"), party_by_id),
    )


def _system_prompt() -> str:
    return (
        "You write the opening abstract of a contract for a reader who has not opened it yet. "
        "The parties are GIVEN to you as graph nodes: never invent, rename, split or merge them, "
        "and never restate their names differently from the list you are given. "
        "Two pieces of writing, with different jobs and no overlap between them:\n"
        "  - `summary`: what the deal IS — what is exchanged, on what terms, for how long. "
        "It names the parties but does NOT list their duties.\n"
        "  - `does`: one line per party — what THAT party is on the hook for.\n"
        "Every mention of a party inside `summary` must be written as {{partyId|short text}}, "
        "where partyId comes from ALLOWED_PARTY_IDS and the short text is how the name should "
        "read in the sentence (an alias is fine). Write nothing else in double braces.\n"
        "Drop any given party that is not actually a contracting entity (boilerplate like "
        '"each Party" or "the Parties"). Add a party only if the contract clearly has one the '
        "list is missing, and then set its partyId to null.\n"
        "Return valid JSON only, with this shape: "
        '{"title": string, "contractType": string, "summary": string, '
        '"parties": [{"partyId": string|null, "name": string, "role": string, "does": string}]}. '
        f"`summary` is {MAX_SUMMARY_WORDS} words at most; each `does` is {MAX_DOES_WORDS} at most, "
        "active voice, starting with a verb. For a party taken from ALLOWED_PARTY_IDS leave `name` "
        "and `role` empty — they are filled from the graph."
    )


def _user_prompt(
    document_name: str,
    kg: dict[str, Any],
    kg_parties: list[dict[str, Any]],
    paragraphs: list[dict[str, Any]],
) -> str:
    party_lines = []
    for party in kg_parties:
        aliases = ", ".join(a for a in party.get("aliases", []) if a)
        alias_part = f" | aliases: {aliases}" if aliases else ""
        role = party.get("role") or "(no role recorded)"
        party_lines.append(f"  {party['id']}: {party.get('name', '')} — {role}{alias_part}")

    headings = [
        str(clause.get("heading", "")).strip()
        for clause in kg.get("clauses", [])
        if isinstance(clause, dict) and str(clause.get("heading", "")).strip()
    ][:MAX_CLAUSE_HEADINGS]

    body: list[str] = []
    used = 0
    for row in paragraphs:
        text = str(row.get("text", "")).strip()
        if not text:
            continue
        if body and used + len(text) > MAX_CONTEXT_CHAR_BUDGET:
            break
        body.append(text)
        used += len(text)

    truncated = len(body) < len([r for r in paragraphs if str(r.get("text", "")).strip()])
    tail = "\n\n(The text above is the opening of the contract; the clause headings cover the rest.)" if truncated else ""

    return (
        f"Document: {document_name}\n\n"
        f"ALLOWED_PARTY_IDS:\n" + "\n".join(party_lines) + "\n\n"
        "Clause headings:\n" + ("\n".join(f"  - {h}" for h in headings) or "  (none)") + "\n\n"
        "Contract text:\n" + "\n\n".join(body) + tail + "\n\n"
        "Output JSON only."
    )


def _parse_json(text: str) -> dict[str, Any]:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned).strip()

    candidates = [cleaned]
    block = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if block:
        candidates.append(block.group(0))

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed

    logger.warning("Contract abstract: could not parse the model's JSON")
    return {}


def _clean(value: Any) -> str:
    return re.sub(r"\s+", " ", value).strip() if isinstance(value, str) else ""


def _cap_words(text: str, limit: int) -> str:
    words = text.split()
    return text if len(words) <= limit else " ".join(words[:limit]).rstrip(",;:") + "…"


def _sanitize_summary(text: str, party_by_id: dict[str, dict[str, Any]]) -> str:
    """Drop mentions of ids the graph does not have, keeping their text in place.

    A bad id costs the phrase its colour, never its sentence. Capping runs over
    whole segments so it can never cut a mention in half.
    """
    segments: list[tuple[str | None, str]] = []
    last = 0
    for match in _MENTION.finditer(text):
        if match.start() > last:
            segments.append((None, text[last : match.start()]))
        party_id = match.group(1).strip()
        segments.append((party_id if party_id in party_by_id else None, match.group(2).strip()))
        last = match.end()
    if last < len(text):
        segments.append((None, text[last:]))

    out: list[str] = []
    words = 0
    for party_id, chunk in segments:
        words += len(chunk.split())
        out.append(f"{{{{{party_id}|{chunk}}}}}" if party_id else chunk)
        if words >= MAX_SUMMARY_WORDS:
            break
    return "".join(out).strip()


def _sanitize_parties(raw: Any, party_by_id: dict[str, dict[str, Any]]) -> list[ContractSummaryParty]:
    if not isinstance(raw, list):
        return []

    parties: list[ContractSummaryParty] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        does = _cap_words(_clean(item.get("does")), MAX_DOES_WORDS)

        party_id = _clean(item.get("partyId")) or None
        node = party_by_id.get(party_id) if party_id else None
        if node is None:
            # Unknown id and unknown name is nothing we can render or trace.
            party_id = None
            name = _clean(item.get("name"))
            if not name:
                continue
            role = _clean(item.get("role"))
        else:
            name = str(node.get("name", "")).strip()
            role = str(node.get("role", "")).strip()

        key = party_id or name.lower()
        if key in seen:
            continue
        seen.add(key)
        parties.append(ContractSummaryParty(partyId=party_id, name=name, role=role, does=does))

    # Parties the graph does not know sit last: they are the flagged ones.
    parties.sort(key=lambda p: p.partyId is None)
    return parties
