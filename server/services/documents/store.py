from __future__ import annotations

import logging
import re
from collections import defaultdict
from pathlib import Path

from core.constants import CUAD_DOC_DIR
from schemas.types import DatasetDocument

logger = logging.getLogger(__name__)


class DocumentStore:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._documents = []
            cls._instance._path_map = {}
            cls._instance._canonical_id_by_alias = {}
            cls._instance._aliases_by_doc_id = {}
            cls._instance._initialized = False
        return cls._instance

    def iter_docxs(self, base_dir: Path):
        return (
            p for p in base_dir.rglob("*") if p.is_file() and p.suffix.lower() == ".docx"
        )

    def ensure_initialized(self):
        """Initialize the store if it isn't already (idempotent)."""
        if not self._initialized:
            self.initialize()

    def initialize(self):
        if self._initialized:
            return

        logger.info("Initializing DocumentStore...")
        if not CUAD_DOC_DIR.exists():
            logger.error("Dataset directory not found: %s", CUAD_DOC_DIR)
            return

        documents: list[DatasetDocument] = []
        path_map: dict[str, Path] = {}
        aliases_by_doc_id: dict[str, list[str]] = {}
        alias_candidates: dict[str, set[str]] = defaultdict(set)

        for docx_path in sorted(self.iter_docxs(CUAD_DOC_DIR)):
            relative_path = docx_path.relative_to(CUAD_DOC_DIR).as_posix()
            group_label = self._resolve_group_label(relative_path)
            document_id = self._build_document_id(
                stem=docx_path.stem,
                group_label=group_label,
                relative_path=relative_path,
                existing_ids=set(path_map.keys()),
            )

            doc = DatasetDocument(
                id=document_id,
                name=docx_path.name,
                full_path=str(docx_path.resolve()),
                relative_path=relative_path,
                group_label=group_label,
                display_name=f"{docx_path.name} [{group_label}]",
                origin="dataset",
                processed=False,
            )
            documents.append(doc)
            path_map[document_id] = docx_path

            aliases = self._build_aliases(doc)
            aliases_by_doc_id[document_id] = aliases
            for alias in aliases:
                alias_candidates[alias].add(document_id)

        canonical_id_by_alias = {
            alias: next(iter(doc_ids))
            for alias, doc_ids in alias_candidates.items()
            if len(doc_ids) == 1
        }

        self._documents = sorted(documents, key=self._document_sort_key)
        self._path_map = path_map
        self._canonical_id_by_alias = canonical_id_by_alias
        self._aliases_by_doc_id = aliases_by_doc_id
        self._initialized = True
        logger.info("DocumentStore initialized with %d documents.", len(documents))

    def get_documents(self) -> list[DatasetDocument]:
        return sorted(self._documents, key=self._document_sort_key)

    def get_path(self, doc_id: str) -> Path | None:
        canonical = self.get_canonical_id(doc_id)
        if canonical is None:
            return None
        return self._path_map.get(canonical)

    def get_canonical_id(self, doc_id: str | None) -> str | None:
        candidate = str(doc_id or "").strip()
        if not candidate:
            return None
        if candidate in self._path_map:
            return candidate
        return self._canonical_id_by_alias.get(candidate)

    def get_document(self, doc_id: str | None) -> DatasetDocument | None:
        canonical = self.get_canonical_id(doc_id)
        if canonical is None:
            return None
        for doc in self._documents:
            if doc.id == canonical:
                return doc
        return None

    def get_document_aliases(self, doc_id: str | None) -> list[str]:
        canonical = self.get_canonical_id(doc_id)
        if canonical is None:
            return []
        aliases = self._aliases_by_doc_id.get(canonical, [])
        return [canonical, *aliases]

    @staticmethod
    def _resolve_group_label(relative_path: str) -> str:
        parent = Path(relative_path).parent.as_posix()
        return "root" if parent in {"", "."} else parent

    @staticmethod
    def _slug_token(value: str) -> str:
        token = re.sub(r"[^a-zA-Z0-9._-]+", "_", value.strip())
        token = re.sub(r"_+", "_", token).strip("._-")
        return token or "root"

    def _build_document_id(
        self,
        *,
        stem: str,
        group_label: str,
        relative_path: str,
        existing_ids: set[str],
    ) -> str:
        group_token = self._slug_token(group_label)
        candidate = f"{group_token}::{stem}"
        if candidate not in existing_ids:
            return candidate

        rel_token = self._slug_token(relative_path.replace("/", "__"))
        fallback = f"{candidate}::{rel_token}"
        if fallback not in existing_ids:
            return fallback

        suffix = 2
        while f"{fallback}::{suffix}" in existing_ids:
            suffix += 1
        return f"{fallback}::{suffix}"

    @staticmethod
    def _build_aliases(doc: DatasetDocument) -> list[str]:
        aliases = {
            doc.name,
            Path(doc.name).stem,
            doc.relative_path,
            doc.relative_path.replace("/", "\\"),
            Path(doc.relative_path).stem,
            Path(doc.full_path).stem,
        }
        return sorted(alias for alias in aliases if alias)

    @staticmethod
    def _document_sort_key(doc: DatasetDocument) -> tuple[int, str, str]:
        group_rank = {
            "root": 0,
            "related": 1,
            "target": 2,
        }.get((doc.group_label or "").strip().lower(), 3)
        group_value = (doc.group_label or "").strip().lower()
        name_value = (doc.name or "").strip().lower()
        return (group_rank, group_value, name_value)
