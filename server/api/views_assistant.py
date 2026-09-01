"""DRF views mirroring the FastAPI assistant endpoints (Phase 2).

Faithful 1:1 port of server_old/api/routes/assistant.py.
"""

from rest_framework.response import Response
from rest_framework.views import APIView

from api.serializers import (
    AssistantChatRequestSerializer,
    AssistantChatResponseSerializer,
)
from schemas.types import AssistantChatRequest
from services.assistant.contract_assistant import (
    generate_assistant_response,
)


class AssistantChatView(APIView):
    def post(self, request):
        serializer = AssistantChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = AssistantChatRequest(**serializer.validated_data)
        result = generate_assistant_response(payload)
        return Response(AssistantChatResponseSerializer(result).data)
