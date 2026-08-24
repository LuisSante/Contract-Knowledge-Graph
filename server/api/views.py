import json
import logging

from django.http import FileResponse
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.serializers import (
    DatasetDocumentSerializer,
    ProcessDocumentRequestSerializer,
    ProcessDocumentResponseSerializer,
)
from core.config import settings
from services.documents.processing import _safe_filename, build_paragraphs, save_paragraphs_dump
from services.documents.store import DocumentStore
from services.graph.knowledge.party_hints import suggest_party_merges
from services.graph.knowledge.store import load_knowledge_graph

logger = logging.getLogger(__name__)

# DocumentStore is a singleton (see its __new__); this just grabs the instance.
document_store = DocumentStore()

DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


class ListDocumentsView(APIView):
    def get(self, request):
        document_store.ensure_initialized()
        data = DatasetDocumentSerializer(document_store.get_documents(), many=True).data
        return Response(data)


class DocumentFileView(APIView):
    def get(self, request, doc_id: str):
        document_store.ensure_initialized()

        path = document_store.get_path(doc_id)
        if path is None or not path.exists():
            raise NotFound("Document not found")
        if path.suffix.lower() != ".docx":
            raise ValidationError("Only DOCX documents are supported")

        return FileResponse(
            open(path, "rb"),
            content_type=DOCX_MEDIA_TYPE,
            as_attachment=False,
            filename=path.name,
        )


class ProcessDocumentView(APIView):
    def post(self, request):
        serializer = ProcessDocumentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        raw_doc_id = payload["documentId"]
        doc_id = document_store.get_canonical_id(raw_doc_id) or raw_doc_id
        paragraphs = build_paragraphs(payload["pages"], doc_id)

        if settings.EXTRACT_PARAGRAPHS:
            try:
                save_paragraphs_dump(doc_id, paragraphs, settings.PARAGRAPHS_OUTPUT_DIR)
            except Exception:
                logger.exception("Failed to dump paragraphs for %s", doc_id)

        from services.graph.relations import generate_graph_data

        graph = generate_graph_data(paragraphs)

        response = ProcessDocumentResponseSerializer(
            {
                "status": "success",
                "documentId": doc_id,
                "graph": graph,
                "cache": {"enabled": False, "hit": False, "key": None},
            }
        )
        return Response(response.data)


class KnowledgeGraphView(APIView):
    """Serve the pre-generated deontic knowledge graph for a document.

    The KG is built offline (notebooks/KG) and saved under KNOWLEDGE_GRAPH_DIR;
    this endpoint only reads it. Returns 404 if it has not been generated yet.
    """

    def get(self, request, doc_id: str):
        document_store.ensure_initialized()
        canonical_id = document_store.get_canonical_id(doc_id) or doc_id

        payload = load_knowledge_graph(canonical_id, settings.KNOWLEDGE_GRAPH_DIR)
        if payload is None:
            raise NotFound("Knowledge graph not generated for this document")

        return Response(
            {
                "status": "success",
                "documentId": canonical_id,
                "knowledgeGraph": payload,
            }
        )


class KnowledgePartyHintsView(APIView):
    """Suggest which party nodes MAY be merged (resolver-as-hint). Never mutates the
    KG; the user decides in the UI. Cached per document to avoid repeat LLM calls."""

    _cache: dict[str, dict] = {}

    def get(self, request, doc_id: str):
        document_store.ensure_initialized()
        canonical_id = document_store.get_canonical_id(doc_id) or doc_id
        if canonical_id in self._cache:
            return Response(self._cache[canonical_id])

        kg = load_knowledge_graph(canonical_id, settings.KNOWLEDGE_GRAPH_DIR)
        if kg is None:
            raise NotFound("Knowledge graph not generated for this document")

        para_text, para_enum = _load_paragraph_index(canonical_id)
        try:
            result = suggest_party_merges(kg, para_text, para_enum)
        except Exception:
            logger.exception("party merge hints failed for %s", canonical_id)
            result = {"candidates": {}}
        self._cache[canonical_id] = result
        return Response(result)


def _load_paragraph_index(canonical_id: str) -> tuple[dict[str, str], dict[str, int]]:
    path = settings.PARAGRAPHS_OUTPUT_DIR / f"{_safe_filename(canonical_id)}.json"
    if not path.exists():
        return {}, {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}, {}
    paragraphs = data.get("paragraphs", [])
    text = {p["id"]: p.get("text", "") for p in paragraphs}
    enum = {p["id"]: p.get("paragraph_enum", 10**9) for p in paragraphs}
    return text, enum
