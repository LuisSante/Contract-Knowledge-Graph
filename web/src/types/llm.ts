import type { AssistantChatRequest, AssistantProvider } from './assistant';
import type { ContradictionAnalysisRequest } from './contradiction';
import type { SimplifySelectionRequest } from './simplify';

export type LlmEstimateCallType =
	| 'assistant_chat'
	| 'assistant_simplify'
	| 'assistant_fix_contradiction'
	| 'contradictions_analyze';

export type LlmEstimateRequest = {
	callType: LlmEstimateCallType;
	assistantChat?: AssistantChatRequest;
	simplifySelection?: SimplifySelectionRequest;
	contradictionAnalysis?: ContradictionAnalysisRequest;
};

export type LlmEstimateResponse = {
	callType: LlmEstimateCallType;
	provider: AssistantProvider;
	model: string;
	estimatedInputTokens: number;
	estimatedOutputTokens: number;
	estimatedTotalTokens: number;
	estimatedCostUsd?: number | null;
	estimatedCostUsdFormatted: string;
};

export type LlmUsageTotalResponse = {
	totalCostUsd: number;
	totalCostUsdFormatted: string;
};
