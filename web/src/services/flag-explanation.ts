import { api } from '@/lib/api';
import type {
	FlagExplanationEstimate,
	FlagExplanationInput,
	FlagExplanationResponse,
} from '@/types/flag-explanation';

export async function estimateFlagExplanation(docId: string, input: FlagExplanationInput) {
	const { data } = await api.post<FlagExplanationEstimate>(
		`/red_flag_explanation/${encodeURIComponent(docId)}`,
		{ ...input, action: 'estimate' }
	);
	return data;
}

export async function explainFlag(docId: string, input: FlagExplanationInput) {
	const { data } = await api.post<FlagExplanationResponse>(
		`/red_flag_explanation/${encodeURIComponent(docId)}`,
		{ ...input, action: 'generate', costApproved: true }
	);
	return data;
}
