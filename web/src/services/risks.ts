import { api } from '@/lib/api';
import type { ContractRisks } from '@/types/risks';

interface ContractRisksResponse {
	risks: ContractRisks | null;
}

/** The free one: the answer saved from the last time the model reviewed the contract; null
 *  when it never has. */
export async function fetchSavedRisks(docId: string): Promise<ContractRisks | null> {
	const response = await api.get<ContractRisksResponse>(`/risks/${encodeURIComponent(docId)}`);
	return response.data.risks ?? null;
}

/** The paid one: asks the model now. The server saves the answer in place of the earlier one,
 *  so the free request returns it from then on. */
export async function detectRisksWithAI(docId: string): Promise<ContractRisks | null> {
	const response = await api.post<ContractRisksResponse>(`/risks/${encodeURIComponent(docId)}`, {
		force: true,
	});
	return response.data.risks ?? null;
}
