'use client';

import { useCallback, useRef, useState } from 'react';
import { fetchLlmEstimate } from '@/services/llm';
import type {
	AssistantChatRequest,
	ContradictionAnalysisRequest,
	LlmEstimateCallType,
	LlmEstimateRequest,
	LlmEstimateResponse,
	SimplifySelectionRequest,
} from '@/types/document';

type ConfirmPayload =
	| AssistantChatRequest
	| SimplifySelectionRequest
	| ContradictionAnalysisRequest;

function buildEstimateRequest(
	callType: LlmEstimateCallType,
	payload: ConfirmPayload
): LlmEstimateRequest {
	if (callType === 'assistant_chat') {
		return { callType, assistantChat: payload as AssistantChatRequest };
	}
	if (callType === 'contradictions_analyze') {
		return { callType, contradictionAnalysis: payload as ContradictionAnalysisRequest };
	}
	return { callType, simplifySelection: payload as SimplifySelectionRequest };
}

/**
 * LLM cost confirmation: on each call an estimate is requested from the backend
 * (`/llm/estimate`), a toast is shown and the user's decision is awaited.
 * `confirm` returns a promise that resolves to `true`/`false`. Port of the
 * `confirmLlmEstimate` + toast from the Svelte `+page.svelte`.
 */
export function useLlmEstimate() {
	const [estimate, setEstimate] = useState<LlmEstimateResponse | null>(null);
	const [isOpen, setIsOpen] = useState(false);
	const resolverRef = useRef<((approved: boolean) => void) | null>(null);

	const resolve = useCallback((approved: boolean) => {
		if (!resolverRef.current) return;
		resolverRef.current(approved);
		resolverRef.current = null;
		setEstimate(null);
		setIsOpen(false);
	}, []);

	const confirm = useCallback(
		async (callType: LlmEstimateCallType, payload: ConfirmPayload): Promise<boolean> => {
			const next = await fetchLlmEstimate(buildEstimateRequest(callType, payload));
			// If a confirmation was pending, cancel it before opening the new one.
			if (resolverRef.current) {
				resolverRef.current(false);
				resolverRef.current = null;
			}
			setEstimate(next);
			setIsOpen(true);
			return new Promise<boolean>((res) => {
				resolverRef.current = res;
			});
		},
		[]
	);

	return { estimate, isOpen, confirm, resolve };
}
