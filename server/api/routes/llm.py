import logging

from fastapi import APIRouter

from schemas.types import (
    LlmEstimateRequest,
    LlmEstimateResponse,
    LlmUsageTotalResponse,
)
from services.assistant.contract_assistant import (
    estimate_assistant_chat_request,
    estimate_simplify_request,
)
from services.contradictions.analysis import estimate_contradiction_analysis_request
from services.llm.cost_estimator import format_cost
from services.llm.usage_tracker import get_total_usage_cost_usd

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/llm/estimate", response_model=LlmEstimateResponse)
def estimate_llm_request(payload: LlmEstimateRequest):
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

    return LlmEstimateResponse(
        callType=payload.callType,
        provider=estimate["provider"],
        model=estimate["model"],
        estimatedInputTokens=estimate["estimated_input_tokens"],
        estimatedOutputTokens=estimate["estimated_output_tokens"],
        estimatedTotalTokens=estimate["estimated_total_tokens"],
        estimatedCostUsd=estimate["estimated_cost_usd"],
        estimatedCostUsdFormatted=estimate["estimated_cost_usd_formatted"],
    )


@router.get("/llm/cost/total", response_model=LlmUsageTotalResponse)
def get_llm_total_cost():
    total_cost_usd = get_total_usage_cost_usd()
    logger.info(
        "[COST_DEBUG] /llm/cost/total response: total=%0.9f formatted=%s",
        total_cost_usd,
        format_cost(total_cost_usd),
    )
    return LlmUsageTotalResponse(
        totalCostUsd=total_cost_usd,
        totalCostUsdFormatted=format_cost(total_cost_usd),
    )
