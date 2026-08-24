"""Resolver-as-hint: suggest which party nodes MAY be merged (same real party, or
a role one of them plays). This never mutates the KG — the user decides in the UI.
One LLM call over the party list + defining-paragraph evidence, so cost is bounded
regardless of contract size."""

from __future__ import annotations

import json
import re
from typing import Any

from services.llm.factory import LLMProviderFactory

DEF_CUES = ("means", "shall mean", "referred to as", "hereinafter")
MAX_SNIPPETS = 3
SNIPPET_CHARS = 320

SYSTEM_PROMPT = (
    "You help a user decide which contract party nodes MAY be merged — i.e. they refer to the "
    "same real-world party, or one is a role the other plays. You are given the party nodes a KG "
    "extractor produced, with name, role, aliases, and defining-paragraph evidence. Return the "
    "unordered PAIRS that plausibly can be merged. Rules: two DISTINCT named companies are NOT a "
    "pair. A generic or mutual role (e.g. 'Disclosing Party', 'Receiving Party', 'the Parties') "
    "pairs with EACH named entity that can play it — in a mutual clause defined as 'one Party … "
    "the other Party', it pairs with BOTH named parties. A genuine independent third party pairs "
    "with no one. Use ONLY the given ids; never invent. "
    'Return valid JSON only: {"pairs": [[idA, idB], ...]}.'
)


def _defines(text: str, name: str) -> bool:
    if not name:
        return False
    quoted = f"“{name}”" in text or f'"{name}"' in text
    named = name in text and any(cue in text for cue in DEF_CUES)
    return quoted or named


def _dossier(
    kg: dict[str, Any], para_text: dict[str, str], para_enum: dict[str, int]
) -> list[dict[str, Any]]:
    rows = []
    for party in kg.get("parties", []):
        name = party.get("name", "")
        # The extractor doesn't always link a party to the paragraph that DEFINES it
        # (e.g. §14.1 "the 'Disclosing Party'"), so scan the whole doc for defining
        # paragraphs and prefer them over the party's own — that sentence is what
        # tells a mutual role apart from a named entity.
        defining = [pid for pid, text in para_text.items() if _defines(text, name)]
        candidates = list(dict.fromkeys([*defining, *party.get("paragraphIds", [])]))
        pids = sorted(
            candidates,
            key=lambda x: (0 if _defines(para_text.get(x, ""), name) else 1, para_enum.get(x, 10**9)),
        )[:MAX_SNIPPETS]
        evidence = [para_text.get(pid, "").strip().replace("\n", " ")[:SNIPPET_CHARS] for pid in pids]
        rows.append(
            {
                "id": party["id"],
                "name": name,
                "role": party.get("role", ""),
                "aliases": party.get("aliases", []),
                "evidence": [e for e in evidence if e],
            }
        )
    return rows


def _build_user_prompt(rows: list[dict[str, Any]]) -> str:
    lines = ["Which of these party nodes may be merged? Return pairs.\n"]
    for row in rows:
        lines.append(f"[{row['id']}] name={row['name']!r} role={row['role']!r} aliases={row['aliases']}")
        for snippet in row["evidence"]:
            lines.append(f"    evidence: {snippet}")
    lines.append('\nOutput JSON only: {"pairs": [[idA, idB], ...]}.')
    return "\n".join(lines)


def _parse_json(text: str) -> dict[str, Any]:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", (text or "").strip(), flags=re.I | re.S)
    match = re.search(r"\{[\s\S]*\}", cleaned)
    try:
        return json.loads(match.group(0) if match else cleaned)
    except json.JSONDecodeError:
        return {}


def suggest_party_merges(
    kg: dict[str, Any],
    para_text: dict[str, str],
    para_enum: dict[str, int],
    provider_name: str = "openai",
) -> dict[str, dict[str, list[str]]]:
    parties = kg.get("parties", [])
    valid = {p["id"] for p in parties}
    candidates: dict[str, set[str]] = {pid: set() for pid in valid}
    if len(parties) < 2:
        return {"candidates": {pid: [] for pid in valid}}

    provider = LLMProviderFactory.create(provider_name)
    raw = provider.generate(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=_build_user_prompt(_dossier(kg, para_text, para_enum)),
        temperature=0.0,
    )
    for pair in _parse_json(raw).get("pairs", []):
        if isinstance(pair, list) and len(pair) == 2:
            a, b = pair
            if a in valid and b in valid and a != b:
                candidates[a].add(b)
                candidates[b].add(a)
    return {"candidates": {pid: sorted(others) for pid, others in candidates.items()}}
