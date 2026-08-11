"""Read access to pre-generated knowledge graphs.

The KGs are built offline (notebooks/KG/build_kg.ipynb) and saved as
`<safe_document_id>.json` under KNOWLEDGE_GRAPH_DIR. The API only serves them;
it never rebuilds on request (that would cost LLM calls).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from services.documents.processing import _safe_filename


def knowledge_graph_path(doc_id: str, kg_dir: Path) -> Path:
    return kg_dir / f"{_safe_filename(doc_id)}.json"


def load_knowledge_graph(doc_id: str, kg_dir: Path) -> dict[str, Any] | None:
    path = knowledge_graph_path(doc_id, kg_dir)
    if not path.exists():
        return None
    try:
        with path.open(encoding="utf-8") as handle:
            payload = json.load(handle)
        return payload if isinstance(payload, dict) else None
    except (OSError, json.JSONDecodeError):
        return None
