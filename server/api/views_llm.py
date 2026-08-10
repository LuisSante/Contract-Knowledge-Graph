"""DRF views mirroring the FastAPI LLM endpoints (Phase 2).

Faithful 1:1 port of server_old/api/routes/llm.py.
"""

import logging

from rest_framework.response import Response
from rest_framework.views import APIView

from api.serializers import (
    LlmEstimateRequestSerializer,
    LlmEstimateResponseSerializer,
    LlmUsageTotalResponseSerializer,
)
from schemas.types import LlmEstimateRequest, LlmEstimateResponse, LlmUsageTotalResponse
from services.assistant.contract_assistant import (
    estimate_assistant_chat_request,
    estimate_simplify_request,
)
from services.contradictions.analysis import estimate_contradiction_analysis_request
from services.llm.cost_estimator import format_cost
from services.llm.usage_tracker import get_total_usage_cost_usd

logger = logging.getLogger(__name__)


class LlmEstimateView(APIView):
    def post(self, request):
        serializer = LlmEstimateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = LlmEstimateRequest(**serializer.validated_data)

        if payload.callType == "assistant_chat":
            if payload.assistantChat is None:
                raise RuntimeError("assistantChat payload is required")
            estimate = estimate_assistant_chat_request(payload.assistantChat)
        elif payload.callType == "assistant_simplify":
            if payload.simplifySelection is None:
                raise RuntimeError("simplifySelection payload is required")
            estimate = estimate_simplify_request(payload.simplifySelection, fix_contradiction=False)
        elif payload.callType == "assistant_fix_contradiction":
            if payload.simplifySelection is None:
                raise RuntimeError("simplifySelection payload is required")
            estimate = estimate_simplify_request(payload.simplifySelection, fix_contradiction=True)
        elif payload.callType == "contradictions_analyze":
            if payload.contradictionAnalysis is None:
                raise RuntimeError("contradictionAnalysis payload is required")
            estimate = estimate_contradiction_analysis_request(payload.contradictionAnalysis)
        else:
            raise RuntimeError("Unsupported callType")

        response = LlmEstimateResponse(
            callType=payload.callType,
            provider=estimate["provider"],
            model=estimate["model"],
            estimatedInputTokens=estimate["estimated_input_tokens"],
            estimatedOutputTokens=estimate["estimated_output_tokens"],
            estimatedTotalTokens=estimate["estimated_total_tokens"],
            estimatedCostUsd=estimate["estimated_cost_usd"],
            estimatedCostUsdFormatted=estimate["estimated_cost_usd_formatted"],
        )
        return Response(LlmEstimateResponseSerializer(response).data)


class LlmTotalCostView(APIView):
    def get(self, request):
        total_cost_usd = get_total_usage_cost_usd()
        logger.info(
            "[COST_DEBUG] /llm/cost/total response: total=%0.9f formatted=%s",
            total_cost_usd,
            format_cost(total_cost_usd),
        )
        response = LlmUsageTotalResponse(
            totalCostUsd=total_cost_usd,
            totalCostUsdFormatted=format_cost(total_cost_usd),
        )
        return Response(LlmUsageTotalResponseSerializer(response).data)
