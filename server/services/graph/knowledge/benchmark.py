"""How a contract compares with the CUAD contracts of its own type.

CUAD annotates all 41 categories on every contract, so an empty answer is a real
absence. That is what lets the view draw what is missing, not only what is there.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

# Metadata, not terms a reader negotiates.
SKIPPED = {
    "Document Name",
    "Parties",
    "Agreement Date",
    "Effective Date",
    "Expiration Date",
    "Governing Law",
}

# First match wins, so the specific names go before the generic ones.
TYPES = (
    "co-branding",
    "supply",
    "development",
    "affiliate",
    "distributor",
    "franchise",
    "reseller",
    "hosting",
    "joint venture",
    "outsourcing",
    "manufacturing",
    "endorsement",
    "sponsorship",
    "strategic alliance",
    "maintenance",
    "agency",
    "consulting",
    "collaboration",
    "marketing",
    "promotion",
    "license",
    "service",
    "transportation",
)

SPAN_KEY = 60


def contract_type(title: str) -> str:
    lowered = title.lower()
    return next((kind for kind in TYPES if kind in lowered), "other")


@lru_cache(maxsize=1)
def _corpus(path: str) -> list[dict[str, Any]]:
    with Path(path).open(encoding="utf-8") as handle:
        data = json.load(handle)["data"]
    rows = []
    for entry in data:
        spans: dict[str, list[str]] = {}
        for qa in entry["paragraphs"][0]["qas"]:
            category = qa["id"].split("__")[-1]
            if not qa["is_impossible"]:
                spans[category] = [answer["text"] for answer in qa["answers"]]
        rows.append({"title": entry["title"], "type": contract_type(entry["title"]), "spans": spans})
    return rows


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def _locate(spans: list[str], paragraphs: list[dict]) -> list[str]:
    texts = [(p["id"], _norm(p.get("text") or "")) for p in paragraphs]
    found: list[str] = []
    for span in spans:
        key = _norm(span)[:SPAN_KEY]
        if not key:
            continue
        for pid, text in texts:
            if key in text and pid not in found:
                found.append(pid)
    return found


def compare(doc_id: str, paragraphs: list[dict], cuad_path: Path) -> dict[str, Any] | None:
    """`doc_id` is the canonical id, `root::<stem>`; CUAD titles are the bare stem."""
    title = doc_id.split("::")[-1]
    corpus = _corpus(str(cuad_path))
    own = next((row for row in corpus if row["title"] == title), None)
    if own is None:
        return None

    peers = [row for row in corpus if row["type"] == own["type"]]
    categories = sorted({c for row in corpus for c in row["spans"]} - SKIPPED)
    rows = []
    for category in categories:
        spans = own["spans"].get(category, [])
        rows.append(
            {
                "key": category,
                "present": bool(spans),
                "hits": sum(category in row["spans"] for row in peers),
                "spans": spans[:3],
                "paragraphIds": _locate(spans, paragraphs) if spans else [],
            }
        )
    return {"contractType": own["type"], "peers": len(peers), "categories": rows}
