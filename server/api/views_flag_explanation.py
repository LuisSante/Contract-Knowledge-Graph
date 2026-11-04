"""La explicación se devuelve a la sesión; no se escribe en el dataset ni en el grafo."""

from rest_framework import serializers
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.views import load_red_flags
from core.config import settings
from services.documents.store import DocumentStore
from services.graph.knowledge.flag_explanation import build_context, estimate_explanation, generate_explanation
from services.graph.knowledge.store import load_knowledge_graph


class ExplanationRequestSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["estimate", "generate"])
    rootId = serializers.CharField(max_length=150)
    nodeIds = serializers.ListField(child=serializers.CharField(max_length=150), min_length=1, max_length=350)
    flags = serializers.ListField(child=serializers.DictField(), min_length=1, max_length=30)
    costApproved = serializers.BooleanField(default=False)


class FlagExplanationView(APIView):
    def post(self, request, doc_id: str):
        serializer = ExplanationRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        store = DocumentStore()
        store.ensure_initialized()
        canonical_id = store.get_canonical_id(doc_id) or doc_id
        kg = load_knowledge_graph(canonical_id, settings.KNOWLEDGE_GRAPH_DIR)
        if kg is None:
            raise NotFound("The graph for this contract was not found.")
        flags = load_red_flags(canonical_id, settings.RED_FLAGS_PATH)
        selected = [flag for flag in flags if flag in payload["flags"]]
        if len(selected) != len(payload["flags"]):
            raise ValidationError("The annotations do not match the saved dataset.")
        try:
            context = build_context(kg, payload["rootId"], list(dict.fromkeys(payload["nodeIds"])), selected)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc
        if payload["action"] == "estimate":
            return Response(estimate_explanation(context))
        if not payload["costApproved"]:
            raise ValidationError("Review the estimate and confirm the paid request.")
        try:
            return Response(generate_explanation(context))
        except ValueError:
            return Response({"detail": "The response could not be linked to the path evidence. An explanation with invalid references will not be shown."}, status=502)
        except RuntimeError:
            return Response({"detail": "Could not get the model explanation. You can try again; this request will not be retried automatically."}, status=502)
