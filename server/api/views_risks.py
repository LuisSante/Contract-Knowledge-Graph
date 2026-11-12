import logging

from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from api.serializers import ContractRisksRequestSerializer, ContractRisksSerializer
from core.config import settings
from services.documents.store import DocumentStore
from services.graph.knowledge.store import load_knowledge_graph
from services.risks.detector import detect_contract_risks
from services.risks.store import load_one, upsert

logger = logging.getLogger(__name__)

document_store = DocumentStore()


class ContractRisksView(APIView):
    """The two ways the reader asks for a contract's risks.

    GET is the free one: the answer saved from the first time the model reviewed the contract.
    POST is the paid one: it asks the model. The file keeps the FIRST answer for each contract
    and never replaces it, so the free answer stays the same one however often the model is
    asked again; a later answer is returned to whoever asked and is not written anywhere.
    """

    def get(self, request, doc_id: str):
        document_store.ensure_initialized()
        canonical_id = document_store.get_canonical_id(doc_id) or doc_id

        # A contract the model has never reviewed is the normal first state, not a failure:
        # 200 with a null body keeps it off the client's error path.
        return Response(
            {
                "status": "success",
                "documentId": canonical_id,
                "risks": load_one(canonical_id, settings.RISKS_PATH),
            }
        )

    def post(self, request, doc_id: str):
        serializer = ContractRisksRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        document_store.ensure_initialized()
        canonical_id = document_store.get_canonical_id(doc_id) or doc_id

        existing = load_one(canonical_id, settings.RISKS_PATH)
        if existing is not None and not payload["force"]:
            return Response({"status": "success", "documentId": canonical_id, "risks": existing, "saved": True})

        kg = load_knowledge_graph(canonical_id, settings.KNOWLEDGE_GRAPH_DIR)
        if kg is None:
            raise NotFound("Knowledge graph not generated for this document")

        risks = detect_contract_risks(
            doc_id=canonical_id,
            kg=kg,
            provider_name=payload["provider"],
            model=payload.get("model"),
        )
        # Only the first answer is kept: it is what the free request serves from then on.
        is_first = existing is None
        if is_first:
            upsert(risks, settings.RISKS_PATH)

        return Response(
            {
                "status": "success",
                "documentId": canonical_id,
                "risks": ContractRisksSerializer(risks).data,
                "saved": is_first,
            }
        )
