from __future__ import annotations

import json
import re
from typing import Any

from services.llm.factory import LLMProviderFactory

SYSTEM_PROMPT = (
    "You help a user decide which contract party nodes MAY be merged — i.e. they refer to the "
    "same real-world party, or one is a role the other plays. You are given the party nodes a KG "
    "extractor produced (id, name, role, aliases). Decide from this list alone. Return two things: "
    "(1) 'pairs' — the unordered pairs of ids that plausibly can be merged; "
    "(2) 'entities' — the ids that denote a DISTINCT real party (a named company or a genuine "
    "independent third party), NOT roles ('Disclosing Party', 'Receiving Party') or generic "
    "placeholders ('Party', 'the Parties'). "
    "Rules: two DISTINCT named companies are NEVER a pair. A generic or mutual role pairs with "
    "EACH named entity that can play it — in a mutual NDA both named parties play both the "
    "disclosing and receiving roles. A genuine independent third party pairs with no one. "
    "Use ONLY the given ids; never invent. "
    'Return valid JSON only: {"pairs": [[idA, idB], ...], "entities": [id, ...]}.'
)


def _build_user_prompt(parties: list[dict[str, Any]]) -> str:
    slim = [
        {
            "id": p["id"],
            "name": p.get("name", ""),
            "role": p.get("role", ""),
            "aliases": p.get("aliases", []),
        }
        for p in parties
    ]
    return (
        "Party nodes:\n"
        + json.dumps(slim, ensure_ascii=False, indent=2)
        + '\n\nOutput JSON only: {"pairs": [[idA, idB], ...], "entities": [id, ...]}.'
    )


def _parse_json(text: str) -> dict[str, Any]:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", (text or "").strip(), flags=re.I | re.S)
    match = re.search(r"\{[\s\S]*\}", cleaned)
    try:
        return json.loads(match.group(0) if match else cleaned)
    except json.JSONDecodeError:
        return {}


def suggest_party_merges(kg: dict[str, Any], provider_name: str = "openai") -> dict[str, Any]:
    parties = kg.get("parties", [])
    valid = {p["id"] for p in parties}
    candidates: dict[str, set[str]] = {pid: set() for pid in valid}
    if len(parties) < 2:
        return {"candidates": {pid: [] for pid in valid}, "entities": sorted(valid)}

    provider = LLMProviderFactory.create(provider_name)
    raw = provider.generate(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=_build_user_prompt(parties),
        temperature=0.0,
    )
    parsed = _parse_json(raw)
    for pair in parsed.get("pairs", []):
        if isinstance(pair, list) and len(pair) == 2:
            a, b = pair
            if a in valid and b in valid and a != b:
                candidates[a].add(b)
                candidates[b].add(a)
    entities = sorted(pid for pid in parsed.get("entities", []) if pid in valid)
    return {
        "candidates": {pid: sorted(others) for pid, others in candidates.items()},
        "entities": entities,
    }
