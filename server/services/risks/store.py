"""Read/write access to the risks the detector found.

One file per contract under RISKS_DIR, named `<safe_document_id>.json` like its knowledge
graph: a contract's risks can be read, replaced or deleted without touching another's. Each
file holds the latest answer the model gave for that contract: asking again replaces it. They
live apart from the knowledge graphs, which this never touches. Writes land through a temp
file and os.replace, so two requests at once cannot leave a half-written file behind.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

from schemas.risks import ContractRisks
from services.documents.processing import _safe_filename

logger = logging.getLogger(__name__)


def risks_path(doc_id: str, risks_dir: Path) -> Path:
    return risks_dir / f"{_safe_filename(doc_id)}.json"


def load_one(doc_id: str, risks_dir: Path) -> dict[str, Any] | None:
    path = risks_path(doc_id, risks_dir)
    if not path.exists():
        return None
    try:
        with path.open(encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        logger.exception("Could not read contract risks at %s", path)
        return None
    return payload if isinstance(payload, dict) else None


def upsert(risks: ContractRisks, risks_dir: Path) -> Path:
    path = risks_path(risks.documentId, risks_dir)
    path.parent.mkdir(parents=True, exist_ok=True)

    temp = path.with_suffix(f"{path.suffix}.tmp")
    with temp.open("w", encoding="utf-8") as handle:
        json.dump(risks.model_dump(), handle, ensure_ascii=False, indent=2)
    os.replace(temp, path)

    logger.info("Saved risks for %s to %s", risks.documentId, path)
    return path
