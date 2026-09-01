import type { AssistantChatRequest, AssistantProvider } from './assistant';

export type LlmEstimateCallType = 'assistant_chat';

export type LlmEstimateRequest = {
	callType: LlmEstimateCallType;
	assistantChat?: AssistantChatRequest;
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
