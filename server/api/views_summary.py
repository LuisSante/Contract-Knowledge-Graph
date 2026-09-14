import logging

from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from api.serializers import ContractSummaryRequestSerializer, ContractSummarySerializer
from core.config import settings
from services.documents.processing import load_paragraphs_dump
from services.documents.store import DocumentStore
from services.graph.knowledge.store import load_knowledge_graph
from services.summary.contract_abstract import generate_contract_summary
from services.summary.store import load_one, upsert

logger = logging.getLogger(__name__)

document_store = DocumentStore()


class ContractSummaryView(APIView):
    def get(self, request, doc_id: str):
        document_store.ensure_initialized()
        canonical_id = document_store.get_canonical_id(doc_id) or doc_id

        # A missing abstract is the normal first state, not a failure: 200 with a
        # null body keeps it off the client's error path.
        return Response(
            {
                "status": "success",
                "documentId": canonical_id,
                "summary": load_one(canonical_id, settings.CONTRACT_SUMMARY_PATH),
            }
        )

    def post(self, request, doc_id: str):
        serializer = ContractSummaryRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        document_store.ensure_initialized()
        canonical_id = document_store.get_canonical_id(doc_id) or doc_id

        if not payload["force"]:
            existing = load_one(canonical_id, settings.CONTRACT_SUMMARY_PATH)
            if existing is not None:
                return Response({"status": "success", "documentId": canonical_id, "summary": existing})

        kg = load_knowledge_graph(canonical_id, settings.KNOWLEDGE_GRAPH_DIR)
        if kg is None:
            raise NotFound("Knowledge graph not generated for this document")

        paragraphs = load_paragraphs_dump(canonical_id, settings.PARAGRAPHS_OUTPUT_DIR)
        if not paragraphs:
            raise NotFound("Paragraphs not extracted for this document")

        document = document_store.get_document(canonical_id)
        summary = generate_contract_summary(
            doc_id=canonical_id,
            document_name=document.name if document else canonical_id,
            kg=kg,
            paragraphs=paragraphs,
            provider_name=payload["provider"],
            model=payload.get("model"),
        )
        upsert(summary, settings.CONTRACT_SUMMARY_PATH)

        return Response(
            {
                "status": "success",
                "documentId": canonical_id,
                "summary": ContractSummarySerializer(summary).data,
            }
        )
