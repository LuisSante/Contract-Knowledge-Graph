from __future__ import annotations

import json
import re
from hashlib import sha256
from pathlib import Path
from typing import Any


def _safe_token(value: str) -> str:
    token = re.sub(r"[^a-zA-Z0-9_-]+", "_", value.strip())
    token = re.sub(r"_+", "_", token).strip("_")
    return token or "unknown"


def build_graph_cache_key(
    *,
    document_id: str,
    paragraphs_data: list[dict[str, Any]],
    schema_version: str,
) -> str:
    canonical_rows: list[dict[str, Any]] = []
    for row in sorted(
        paragraphs_data,
        key=lambda item: (int(item.get("page", 0) or 0), int(item.get("paragraph_enum", 0) or 0)),
    ):
        canonical_rows.append(
            {
                "id": str(row.get("id", "")),
                "page": int(row.get("page", 0) or 0),
                "paragraph_enum": int(row.get("paragraph_enum", 0) or 0),
                "text": str(row.get("text", "")).strip(),
            }
        )

    fingerprint_payload = {
        "rows": canonical_rows,
        # Keep internal invalidation when extraction logic/schema changes,
        # but avoid exposing version tags in the filename.
        "schema": str(schema_version or ""),
    }
    payload_text = json.dumps(
        fingerprint_payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    digest = sha256(payload_text.encode("utf-8")).hexdigest()[:16]
    safe_doc_id = _safe_token(document_id)
    return f"{safe_doc_id}.{digest}.json"


def load_graph_cache(*, cache_dir: Path, cache_key: str) -> dict[str, Any] | None:
    path = cache_dir / cache_key
    if not path.exists():
        return None

    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
            return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def save_graph_cache(*, cache_dir: Path, cache_key: str, payload: dict[str, Any]) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / cache_key
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    return path
