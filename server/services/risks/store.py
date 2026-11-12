"""Read/write access to the risks the detector found.

One file for the whole corpus (infra/json/risks.json) keyed by document id, as the contract
abstracts are kept: a contract's risks are a short list, and one map stays readable on its
own. It holds the first answer the model gave for each contract; the view decides that a
later answer does not replace it. They live apart from the knowledge graphs, which this never
touches. Writes land through a temp file and os.replace, so two requests at once cannot leave
a half-written file behind.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

from schemas.risks import ContractRisks

logger = logging.getLogger(__name__)


def load_all(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        with path.open(encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        logger.exception("Could not read contract risks at %s", path)
        return {}
    contracts = payload.get("contracts") if isinstance(payload, dict) else None
    return contracts if isinstance(contracts, dict) else {}


def load_one(doc_id: str, path: Path) -> dict[str, Any] | None:
    entry = load_all(path).get(doc_id)
    return entry if isinstance(entry, dict) else None


def upsert(risks: ContractRisks, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    contracts = load_all(path)
    contracts[risks.documentId] = risks.model_dump()

    temp = path.with_suffix(f"{path.suffix}.tmp")
    with temp.open("w", encoding="utf-8") as handle:
        json.dump({"contracts": contracts}, handle, ensure_ascii=False, indent=2)
    os.replace(temp, path)

    logger.info("Saved risks for %s to %s", risks.documentId, path)
    return path
