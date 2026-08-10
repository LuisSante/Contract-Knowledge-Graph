"""DRF views mirroring the FastAPI contradiction endpoints (Phase 2).

Faithful 1:1 port of server_old/api/routes/contradictions.py.
"""

import logging

from rest_framework.response import Response
from rest_framework.views import APIView

from api.serializers import (
    ContradictionAnalysisRequestSerializer,
    ContradictionAnalysisResponseSerializer,
    SavedContradictionsResponseSerializer,
)
from schemas.types import ContradictionAnalysisRequest, SavedContradictionsResponse
from services.contradictions.analysis import analyze_document_contradictions
from services.contradictions.saved import (
    load_saved_contradictions_for_document,
    save_analyzed_contradictions,
)
from services.documents.store import DocumentStore

logger = logging.getLogger(__name__)

# DocumentStore is a singleton (see its __new__); this just grabs the instance.
document_store = DocumentStore()


class ContradictionsAnalyzeView(APIView):
    def post(self, request):
        serializer = ContradictionAnalysisRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = ContradictionAnalysisRequest(**serializer.validated_data)

        canonical_doc_id = document_store.get_canonical_id(payload.documentId)
        if canonical_doc_id and canonical_doc_id != payload.documentId:
            payload = payload.model_copy(update={"documentId": canonical_doc_id})

        response = analyze_document_contradictions(payload)
        try:
            doc_meta = document_store.get_document(payload.documentId)
            saved_path = save_analyzed_contradictions(
                response,
                document_relative_path=doc_meta.relative_path if doc_meta else None,
                document_group=doc_meta.group_label if doc_meta else None,
            )
            logger.info("Saved contradiction analysis: %s", saved_path)
        except Exception:
            logger.exception("Failed to persist contradiction analysis result")

        return Response(ContradictionAnalysisResponseSerializer(response).data)


class SavedContradictionsView(APIView):
    def get(self, request, document_id: str):
        mode = request.query_params.get("mode", "without_kg")

        aliases = document_store.get_document_aliases(document_id)
        rows, source_file = load_saved_contradictions_for_document(
            document_id,
            mode=mode,
            aliases=aliases,
        )
        canonical_id = document_store.get_canonical_id(document_id) or document_id
        response = SavedContradictionsResponse(
            documentId=canonical_id,
            sourceFile=source_file,
            mode=mode,
            paragraphResults=rows,
        )
        return Response(SavedContradictionsResponseSerializer(response).data)
