'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchLlmTotalCost } from '@/services/llm';

export const LLM_TOTAL_COST_QUERY_KEY = ['llm', 'total-cost'] as const;

/** Accumulated LLM cost (cached; shown in the viewer header). */
export function useLlmTotalCost() {
	return useQuery({
		queryKey: LLM_TOTAL_COST_QUERY_KEY,
		queryFn: fetchLlmTotalCost,
	});
}
