import { api } from '@/lib/api';
import type {
	LlmEstimateRequest,
	LlmEstimateResponse,
	LlmUsageTotalResponse,
} from '@/types/document';

export async function fetchLlmEstimate(
	payload: LlmEstimateRequest
): Promise<LlmEstimateResponse> {
	const response = await api.post<LlmEstimateResponse>('/llm/estimate', payload);
	return response.data;
}

export async function fetchLlmTotalCost(): Promise<LlmUsageTotalResponse> {
	const response = await api.get<
		LlmUsageTotalResponse & {
			total_cost_usd?: number | string;
			total_cost_usd_formatted?: string;
		}
	>('/llm/cost/total');
	const raw = response.data;
	const rawAmount = raw.totalCostUsd ?? raw.total_cost_usd ?? 0;
	const normalizedAmount =
		typeof rawAmount === 'number'
			? rawAmount
			: typeof rawAmount === 'string'
				? Number.parseFloat(rawAmount)
				: 0;
	const normalizedFormatted =
		raw.totalCostUsdFormatted ??
		raw.total_cost_usd_formatted ??
		(Number.isFinite(normalizedAmount) ? normalizedAmount.toFixed(6) : '0.000000');

	return {
		totalCostUsd: Number.isFinite(normalizedAmount) ? normalizedAmount : 0,
		totalCostUsdFormatted: normalizedFormatted,
	};
}
