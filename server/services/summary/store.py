"""Read/write access to the contract abstracts.

One file for the whole corpus (infra/json/abstract.json) keyed by document id,
unlike the KGs, which get a file each: an abstract is small, and at this corpus
size a single map stays diffable and readable on its own. Writes land through a
temp file and os.replace, so two tabs summarising at once can never leave a
half-written file behind — that would take every other abstract with it.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

from schemas.summary import ContractSummary

logger = logging.getLogger(__name__)


def load_all(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        with path.open(encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        logger.exception("Could not read contract abstracts at %s", path)
        return {}
    contracts = payload.get("contracts") if isinstance(payload, dict) else None
    return contracts if isinstance(contracts, dict) else {}


def load_one(doc_id: str, path: Path) -> dict[str, Any] | None:
    entry = load_all(path).get(doc_id)
    return entry if isinstance(entry, dict) else None


def upsert(summary: ContractSummary, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    contracts = load_all(path)
    contracts[summary.documentId] = summary.model_dump()

    temp = path.with_suffix(f"{path.suffix}.tmp")
    with temp.open("w", encoding="utf-8") as handle:
        json.dump({"contracts": contracts}, handle, ensure_ascii=False, indent=2)
    os.replace(temp, path)

    logger.info("Saved contract abstract for %s to %s", summary.documentId, path)
    return path
