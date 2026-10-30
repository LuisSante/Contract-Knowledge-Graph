'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchLlmTotalCost } from '@/services/llm';
import type { LlmUsageTotalResponse } from '@/types/llm';

export const LLM_TOTAL_COST_QUERY_KEY = ['llm', 'total-cost'] as const;

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Dollars to the cent; a cost too small to show in cents still says it is not zero. */
export function formatUsd(amount: number): string {
	if (amount > 0 && amount < 0.01) return '<$0.01';
	return USD.format(amount);
}

const withLabel = (data: LlmUsageTotalResponse) => ({
	...data,
	/** «$11.39»: what to show; `totalCostUsdFormatted` keeps the backend's full precision. */
	totalCostLabel: formatUsd(data.totalCostUsd),
});

export function useLlmTotalCost() {
	return useQuery({
		queryKey: LLM_TOTAL_COST_QUERY_KEY,
		queryFn: fetchLlmTotalCost,
		select: withLabel,
	});
}
