from __future__ import annotations

import json
import logging
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from core.config import settings
from core.errors import NotFoundError
from schemas.types import ContradictionAnalysisResponse, ContradictionParagraphResult

_ALLOWED_CONTRADICTION_TYPES = {
    "temporal",
    "numerical",
    "authority",
    "process",
    "policy_reversal",
    "specificity",
}

logger = logging.getLogger(__name__)


def load_saved_contradictions_for_document(
    document_id: str,
    mode: str | None = None,
    aliases: list[str] | None = None,
) -> tuple[list[ContradictionParagraphResult], str]:
    base_dir = settings.SAVED_CONTRADICTIONS_DIR
    if not base_dir.exists() or not base_dir.is_dir():
        raise NotFoundError(
            f"Pasta de resultados salvos nao encontrada: {base_dir}"
        )

    json_files = _list_readable_json_files(base_dir)

    candidate_ids = _build_candidate_ids(document_id, aliases)

    for json_path in json_files:
        try:
            with json_path.open("r", encoding="utf-8") as f:
                payload = json.load(f)
        except (OSError, json.JSONDecodeError):
            logger.warning("Skipping unreadable saved contradiction file: %s", json_path)
            continue

        if not _payload_matches_mode(payload, json_path, mode):
            continue

        raw_rows = _extract_rows_for_document(payload, candidate_ids)
        if not raw_rows:
            continue

        normalized = _normalize_rows(raw_rows)
        if normalized:
            return normalized, str(json_path)

    raise NotFoundError(
        f"Ainda nao ha contradicoes salvas para este documento: {document_id}"
    )


def _list_readable_json_files(base_dir: Path) -> list[Path]:
    timestamped_paths: list[tuple[float, Path]] = []
    for path in base_dir.glob("*.json"):
        try:
            timestamped_paths.append((path.stat().st_mtime, path))
        except OSError:
            logger.warning("Skipping unavailable saved contradiction file: %s", path)

    timestamped_paths.sort(key=lambda item: item[0], reverse=True)
    return [path for _, path in timestamped_paths]


def save_analyzed_contradictions(
    response: ContradictionAnalysisResponse,
    *,
    document_relative_path: str | None = None,
    document_group: str | None = None,
) -> str:
    base_dir = settings.SAVED_CONTRADICTIONS_DIR
    base_dir.mkdir(parents=True, exist_ok=True)

    safe_document_id = _sanitize_filename(response.documentId)
    safe_provider = _sanitize_filename(response.provider)
    safe_mode = _sanitize_filename(_normalize_mode(response.mode))
    output_path = base_dir / f"{safe_document_id}__{safe_provider}__{safe_mode}_latest.json"

    payload = {
        "documentId": response.documentId,
        "documentRelativePath": document_relative_path or "",
        "documentGroup": document_group or "",
        "provider": response.provider,
        "temperature": response.temperature,
        "mode": _normalize_mode(response.mode),
        "savedAt": datetime.now(UTC).isoformat(),
        "paragraphResults": [
            item.model_dump()
            for item in response.paragraphResults
        ],
        "rawResponse": response.rawResponse,
    }

    with output_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    return str(output_path)


def _extract_rows_for_document(payload: Any, candidate_ids: set[str]) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        if not _payload_matches_document(payload, candidate_ids):
            return []

        if isinstance(payload.get("paragraph_results"), list):
            return payload["paragraph_results"]

        if isinstance(payload.get("paragraphResults"), list):
            return payload["paragraphResults"]

        for candidate_id in candidate_ids:
            if candidate_id in payload and isinstance(payload[candidate_id], list):
                return payload[candidate_id]

        if isinstance(payload.get("results"), list):
            return _filter_rows_by_document_id(payload["results"], candidate_ids)

        if isinstance(payload.get("data"), list):
            return _filter_rows_by_document_id(payload["data"], candidate_ids)

    if isinstance(payload, list):
        return _filter_rows_by_document_id(payload, candidate_ids)

    return []


def _normalize_mode(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized == "with_kg":
        return "with_kg"
    return "without_kg"


def _payload_matches_mode(payload: Any, path: Any, mode: str | None) -> bool:
    if mode is None:
        return True

    expected = _normalize_mode(mode)
    payload_mode = None
    if isinstance(payload, dict):
        payload_mode = payload.get("mode")

    if payload_mode is not None:
        return _normalize_mode(payload_mode) == expected

    file_name = str(getattr(path, "name", path)).lower()
    if "__without_kg_" in file_name:
        inferred = "without_kg"
    elif "__with_kg_" in file_name:
        inferred = "with_kg"
    else:
        inferred = "without_kg"

    return inferred == expected


def _payload_matches_document(payload: dict[str, Any], candidate_ids: set[str]) -> bool:
    normalized_candidates = {str(value).strip().lower() for value in candidate_ids if str(value).strip()}

    explicit_doc_id = payload.get("documentId") or payload.get("document_id") or payload.get("doc_id")
    if explicit_doc_id is not None:
        return str(explicit_doc_id).strip().lower() in normalized_candidates

    # Legacy shape: {"<documentId>": [...]}.
    for candidate in candidate_ids:
        if candidate in payload:
            return True

    # No explicit doc identifier -> require row-level filtering keys.
    has_rows = isinstance(payload.get("results"), list) or isinstance(payload.get("data"), list)
    return has_rows


def _filter_rows_by_document_id(rows: list[Any], candidate_ids: set[str]) -> list[dict[str, Any]]:
    dict_rows = [row for row in rows if isinstance(row, dict)]
    if not dict_rows:
        return []

    has_doc_field = any(
        ("doc_id" in row) or ("documentId" in row) or ("document_id" in row)
        for row in dict_rows
    )

    if not has_doc_field:
        has_paragraph = any(("paragraph_id" in row) or ("paragraphId" in row) for row in dict_rows)
        return dict_rows if has_paragraph else []

    normalized_targets = {str(value).strip().lower() for value in candidate_ids if str(value).strip()}
    filtered: list[dict[str, Any]] = []
    for row in dict_rows:
        candidate = (
            row.get("doc_id")
            or row.get("documentId")
            or row.get("document_id")
            or ""
        )
        if str(candidate).strip().lower() in normalized_targets:
            filtered.append(row)

    return filtered


def _normalize_rows(rows: list[dict[str, Any]]) -> list[ContradictionParagraphResult]:
    normalized: list[ContradictionParagraphResult] = []

    for row in rows:
        paragraph_id = str(row.get("paragraph_id") or row.get("paragraphId") or "").strip()
        if not paragraph_id:
            continue

        if "contradiction" in row:
            contradiction = bool(row.get("contradiction"))
        else:
            contradiction = int(row.get("label_pred", 0) or 0) == 1

        confidence_raw = row.get("confidence", 0)
        try:
            confidence = int(float(confidence_raw))
        except (TypeError, ValueError):
            confidence = 0
        confidence = max(0, min(100, confidence))

        brief_reason = str(row.get("brief_reason") or row.get("briefReason") or "").strip()
        contradiction_type = _normalize_contradiction_type(row, contradiction)
        evidence = _normalize_evidence_dict(row.get("evidence"), contradiction=contradiction)
        contradictions = _normalize_contradiction_candidates(row)
        if not contradictions and contradiction and _has_usable_evidence(evidence):
            contradictions = [
                {
                    "confidence": confidence,
                    "brief_reason": brief_reason,
                    "contradiction_type": contradiction_type or "specificity",
                    "evidence": evidence,
                }
            ]

        primary = contradictions[0] if contradictions else None
        contradiction = bool(primary)
        if not primary:
            confidence = 0
            brief_reason = ""
            contradiction_type = None
            evidence = None
            contradictions = []
        else:
            confidence = int(primary.get("confidence", 0))
            brief_reason = str(primary.get("brief_reason", "")).strip()
            contradiction_type = str(primary.get("contradiction_type", "specificity")).strip().lower()
            if contradiction_type not in _ALLOWED_CONTRADICTION_TYPES:
                contradiction_type = "specificity"
            evidence = primary.get("evidence")

        normalized.append(
            ContradictionParagraphResult(
                paragraph_id=paragraph_id,
                contradiction=contradiction,
                confidence=confidence,
                brief_reason=brief_reason,
                contradiction_type=contradiction_type,
                evidence=evidence,
                contradictions=contradictions,
            )
        )

    normalized.sort(
        key=lambda item: (
            int(item.paragraph_id) if item.paragraph_id.isdigit() else 10**9,
            item.paragraph_id,
        )
    )
    return normalized


def _normalize_contradiction_type(row: dict[str, Any], contradiction: bool) -> str | None:
    raw_value = (
        row.get("contradiction_type")
        or row.get("contradictionType")
        or row.get("category")
        or row.get("taxonomy_type")
        or ""
    )
    value = str(raw_value).strip().lower()
    if not contradiction:
        return None
    if value in _ALLOWED_CONTRADICTION_TYPES:
        return value
    return "specificity"


def _normalize_evidence_dict(
    evidence_obj: Any,
    *,
    contradiction: bool,
) -> dict[str, Any] | None:
    if isinstance(evidence_obj, dict):
        snippet_a = str(evidence_obj.get("snippet_a") or "").strip()
        snippet_b = str(evidence_obj.get("snippet_b") or "").strip()
        source_a = str(evidence_obj.get("source_a") or "unknown").strip().lower()
        source_b = str(evidence_obj.get("source_b") or "unknown").strip().lower()
        evidence_status = str(evidence_obj.get("evidence_status") or "").strip().lower()
        evidence_note = str(evidence_obj.get("evidence_note") or "").strip()
        if source_a not in {"paragraph", "context", "unknown"}:
            source_a = "unknown"
        if source_b not in {"paragraph", "context", "unknown"}:
            source_b = "unknown"
        if evidence_status not in {"exact", "missing", "approximate"}:
            evidence_status = "exact" if (snippet_a and snippet_b) else "missing"
        return {
            "snippet_a": snippet_a,
            "snippet_b": snippet_b,
            "source_a": source_a,
            "source_b": source_b,
            "evidence_status": evidence_status,
            "evidence_note": evidence_note,
        }

    if contradiction:
        return {
            "snippet_a": "",
            "snippet_b": "",
            "source_a": "unknown",
            "source_b": "unknown",
            "evidence_status": "missing",
            "evidence_note": "",
        }

    return None


def _normalize_contradiction_candidates(row: dict[str, Any]) -> list[dict[str, Any]]:
    raw_candidates = row.get("contradictions")
    if not isinstance(raw_candidates, list):
        return []

    by_key: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for candidate in raw_candidates:
        if not isinstance(candidate, dict):
            continue
        confidence_raw = candidate.get("confidence", 0)
        try:
            confidence = int(float(confidence_raw))
        except (TypeError, ValueError):
            confidence = 0
        confidence = max(0, min(100, confidence))

        contradiction_type_raw = str(candidate.get("contradiction_type") or "").strip().lower()
        contradiction_type = (
            contradiction_type_raw
            if contradiction_type_raw in _ALLOWED_CONTRADICTION_TYPES
            else "specificity"
        )

        evidence = _normalize_evidence_dict(
            candidate.get("evidence"),
            contradiction=True,
        )
        if not _has_usable_evidence(evidence):
            continue
        normalized_candidate = {
            "confidence": confidence,
            "brief_reason": str(candidate.get("brief_reason") or "").strip(),
            "contradiction_type": contradiction_type,
            "evidence": evidence,
        }
        key = _canonical_contradiction_key(normalized_candidate)
        existing = by_key.get(key)
        if existing is None:
            by_key[key] = normalized_candidate
            order.append(key)
            continue
        if int(normalized_candidate.get("confidence", 0)) > int(existing.get("confidence", 0)):
            by_key[key] = normalized_candidate

    normalized = [by_key[key] for key in order]
    normalized.sort(
        key=lambda candidate: int(candidate.get("confidence", 0)),
        reverse=True,
    )
    return normalized


def _has_usable_evidence(evidence_obj: Any) -> bool:
    if not isinstance(evidence_obj, dict):
        return False
    snippet_a = str(evidence_obj.get("snippet_a") or "").strip()
    snippet_b = str(evidence_obj.get("snippet_b") or "").strip()
    return bool(snippet_a and snippet_b)


def _canonical_contradiction_key(candidate: dict[str, Any]) -> str:
    contradiction_type = str(candidate.get("contradiction_type") or "specificity").strip().lower()
    if contradiction_type not in _ALLOWED_CONTRADICTION_TYPES:
        contradiction_type = "specificity"

    evidence_obj = candidate.get("evidence")
    snippet_a = ""
    snippet_b = ""
    if isinstance(evidence_obj, dict):
        snippet_a = _normalize_snippet_for_key(str(evidence_obj.get("snippet_a") or ""))
        snippet_b = _normalize_snippet_for_key(str(evidence_obj.get("snippet_b") or ""))
    left, right = sorted([snippet_a, snippet_b])
    return f"{contradiction_type}|{left}|{right}"


def _normalize_snippet_for_key(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _sanitize_filename(value: str) -> str:
    normalized = re.sub(r'[<>:"/\\|?*\x00-\x1F]+', "_", value or "").strip()
    return normalized or "document"


def _build_candidate_ids(document_id: str, aliases: list[str] | None) -> set[str]:
    candidates = {str(document_id or "").strip()}
    for alias in aliases or []:
        alias_text = str(alias or "").strip()
        if alias_text:
            candidates.add(alias_text)
    return {value for value in candidates if value}
