"""DRF views mirroring the FastAPI document + graph endpoints (Phase 1)."""

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
from services.documents.processing import build_paragraphs
from services.documents.store import DocumentStore

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

        # Lazy import: pulls sentence-transformers/torch only when /process runs,
        # so the app boots (and the other endpoints work) without the ML deps.
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
