import { api } from '@/lib/api';
import type { ContractRisks } from '@/types/risks';

interface ContractRisksResponse {
	risks: ContractRisks | null;
	/** Whether this answer is the one the server keeps for the contract. */
	saved?: boolean;
}

/** The free one: the answer saved from the first time the model reviewed the contract; null
 *  when it never has. */
export async function fetchSavedRisks(docId: string): Promise<ContractRisks | null> {
	const response = await api.get<ContractRisksResponse>(`/risks/${encodeURIComponent(docId)}`);
	return response.data.risks ?? null;
}

/** The paid one: asks the model now. The server keeps only the first answer for a contract, so
 *  `saved` says whether this one became it or the earlier one stays. */
export async function detectRisksWithAI(
	docId: string
): Promise<{ risks: ContractRisks | null; saved: boolean }> {
	const response = await api.post<ContractRisksResponse>(`/risks/${encodeURIComponent(docId)}`, {
		force: true,
	});
	return { risks: response.data.risks ?? null, saved: response.data.saved === true };
}
