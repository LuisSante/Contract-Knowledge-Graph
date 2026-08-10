from typing import Literal

from pydantic import BaseModel

from schemas.assistant import AssistantChatRequest, SimplifySelectionRequest
from schemas.common import AssistantProvider
from schemas.contradictions import ContradictionAnalysisRequest

LlmEstimateCallType = Literal[
    "assistant_chat",
    "assistant_simplify",
    "assistant_fix_contradiction",
    "contradictions_analyze",
]


class LlmEstimateRequest(BaseModel):
    callType: LlmEstimateCallType
    assistantChat: AssistantChatRequest | None = None
    simplifySelection: SimplifySelectionRequest | None = None
    contradictionAnalysis: ContradictionAnalysisRequest | None = None


class LlmEstimateResponse(BaseModel):
    callType: LlmEstimateCallType
    provider: AssistantProvider
    model: str
    estimatedInputTokens: int
    estimatedOutputTokens: int
    estimatedTotalTokens: int
    estimatedCostUsd: float | None = None
    estimatedCostUsdFormatted: str


class LlmUsageTotalResponse(BaseModel):
    totalCostUsd: float
    totalCostUsdFormatted: str
