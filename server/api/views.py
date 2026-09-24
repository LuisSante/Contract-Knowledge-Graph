import logging
from typing import ClassVar

from django.http import FileResponse
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.serializers import (
    ClauseImportanceRequestSerializer,
    ClauseImportanceResponseSerializer,
    DatasetDocumentSerializer,
    ExtractParagraphsResponseSerializer,
    ProcessDocumentRequestSerializer,
)
from core.config import settings
from services.documents.processing import build_paragraphs, load_paragraphs_dump, save_paragraphs_dump
from services.documents.store import DocumentStore
from services.graph.knowledge import benchmark, personalized_pagerank
from services.graph.knowledge.party_hints import suggest_party_merges
from services.graph.knowledge.store import load_knowledge_graph

logger = logging.getLogger(__name__)

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
    def post(self, request):
        serializer = ProcessDocumentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        raw_doc_id = payload["documentId"]
        doc_id = document_store.get_canonical_id(raw_doc_id) or raw_doc_id

        if not settings.EXTRACT_PARAGRAPHS:
            response = ExtractParagraphsResponseSerializer(
                {
                    "status": "skipped",
                    "documentId": doc_id,
                    "enabled": False,
                    "saved": 0,
                    "path": None,
                    "tree": [],
                }
            )
            return Response(response.data)

        paragraphs = build_paragraphs(payload["pages"], doc_id)
        path, tree = save_paragraphs_dump(doc_id, paragraphs, settings.PARAGRAPHS_OUTPUT_DIR)

        response = ExtractParagraphsResponseSerializer(
            {
                "status": "success",
                "documentId": doc_id,
                "enabled": True,
                "saved": len(paragraphs),
                "path": str(path),
                "tree": tree,
            }
        )
        return Response(response.data)


class KnowledgeGraphView(APIView):
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


class ClauseImportanceView(APIView):
    def post(self, request, doc_id: str):
        serializer = ClauseImportanceRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        document_store.ensure_initialized()
        canonical_id = document_store.get_canonical_id(doc_id) or doc_id

        kg = load_knowledge_graph(canonical_id, settings.KNOWLEDGE_GRAPH_DIR)
        if kg is None:
            raise NotFound("Knowledge graph not generated for this document")

        result = personalized_pagerank.compute(kg, serializer.validated_data["countedStatementIds"])
        response = ClauseImportanceResponseSerializer(
            {
                "status": "success",
                "documentId": canonical_id,
                "byClause": result.by_clause,
                "byStatement": result.by_statement,
                "byNode": result.by_node,
                "priorByNode": result.prior_by_node,
                "peak": result.peak,
                "iterations": result.iterations,
            }
        )
        return Response(response.data)


class KnowledgePartyHintsView(APIView):
    # DRF builds a view per request, so the cache has to outlive the instance.
    _cache: ClassVar[dict[str, dict]] = {}

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


class BenchmarkView(APIView):
    _cache: ClassVar[dict[str, dict]] = {}

    def get(self, request, doc_id: str):
        document_store.ensure_initialized()
        canonical_id = document_store.get_canonical_id(doc_id) or doc_id
        cached = self._cache.get(canonical_id)
        if cached is not None:
            return Response(cached)

        if not settings.CUAD_PATH.exists():
            raise NotFound("CUAD labels not found")
        paragraphs = load_paragraphs_dump(canonical_id, settings.PARAGRAPHS_OUTPUT_DIR)
        result = benchmark.compare(canonical_id, paragraphs, settings.CUAD_PATH)
        if result is None:
            raise NotFound("Document is not part of CUAD")

        payload = {"status": "success", "documentId": canonical_id, **result}
        self._cache[canonical_id] = payload
        return Response(payload)
