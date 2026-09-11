'use client';

import { useCallback, useRef, useState } from 'react';
import { fetchLlmEstimate } from '@/services/llm';
import type {
	AssistantChatRequest,
	LlmEstimateCallType,
	LlmEstimateRequest,
	LlmEstimateResponse,
} from '@/types/document';

type ConfirmPayload = AssistantChatRequest;

function buildEstimateRequest(
	callType: LlmEstimateCallType,
	payload: ConfirmPayload
): LlmEstimateRequest {
	return { callType, assistantChat: payload };
}

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
