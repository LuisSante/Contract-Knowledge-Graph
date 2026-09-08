import logging

from django.http import FileResponse
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.serializers import (
    DatasetDocumentSerializer,
    ExtractParagraphsResponseSerializer,
    ProcessDocumentRequestSerializer,
)
from core.config import settings
from services.documents.processing import build_paragraphs, save_paragraphs_dump
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


class ExtractParagraphsView(APIView):
    """Dump the document's paragraphs to PARAGRAPHS_OUTPUT_DIR — the evidence layer
    the knowledge-graph build reads."""

    def post(self, request):
        serializer = ProcessDocumentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        raw_doc_id = payload["documentId"]
        doc_id = document_store.get_canonical_id(raw_doc_id) or raw_doc_id

        if not settings.EXTRACT_PARAGRAPHS:
            response = ExtractParagraphsResponseSerializer(
                {"status": "skipped", "documentId": doc_id, "enabled": False, "saved": 0, "path": None}
            )
            return Response(response.data)

        paragraphs = build_paragraphs(payload["pages"], doc_id)
        path = save_paragraphs_dump(doc_id, paragraphs, settings.PARAGRAPHS_OUTPUT_DIR)

        response = ExtractParagraphsResponseSerializer(
            {
                "status": "success",
                "documentId": doc_id,
                "enabled": True,
                "saved": len(paragraphs),
                "path": str(path),
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
        cached = self._cache.get(canonical_id)
        if cached is not None and "entities" in cached:
            return Response(cached)

        kg = load_knowledge_graph(canonical_id, settings.KNOWLEDGE_GRAPH_DIR)
        if kg is None:
            raise NotFound("Knowledge graph not generated for this document")

        try:
            result = suggest_party_merges(kg)
        except Exception:
            logger.exception("party merge hints failed for %s", canonical_id)
            result = {"candidates": {}, "entities": []}
        self._cache[canonical_id] = result
        return Response(result)
