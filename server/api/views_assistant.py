"""DRF views mirroring the FastAPI assistant endpoints (Phase 2).

Faithful 1:1 port of server_old/api/routes/assistant.py.
"""

from rest_framework.response import Response
from rest_framework.views import APIView

from api.serializers import (
    AssistantChatRequestSerializer,
    AssistantChatResponseSerializer,
    SimplifySelectionRequestSerializer,
    SimplifySelectionResponseSerializer,
)
from schemas.types import AssistantChatRequest, SimplifySelectionRequest
from services.assistant.contract_assistant import (
    fix_contradiction_selection,
    generate_assistant_response,
    simplify_paragraph_selection,
)


class AssistantChatView(APIView):
    def post(self, request):
        serializer = AssistantChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = AssistantChatRequest(**serializer.validated_data)
        result = generate_assistant_response(payload)
        return Response(AssistantChatResponseSerializer(result).data)


class AssistantSimplifyView(APIView):
    def post(self, request):
        serializer = SimplifySelectionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = SimplifySelectionRequest(**serializer.validated_data)
        result = simplify_paragraph_selection(payload)
        return Response(SimplifySelectionResponseSerializer(result).data)


class AssistantFixContradictionView(APIView):
    def post(self, request):
        serializer = SimplifySelectionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = SimplifySelectionRequest(**serializer.validated_data)
        result = fix_contradiction_selection(payload)
        return Response(SimplifySelectionResponseSerializer(result).data)
