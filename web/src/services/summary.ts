import { api } from '@/lib/api';
import type { ContractSummary } from '@/types/summary';

interface ContractSummaryResponse {
	summary: ContractSummary | null;
}

export async function fetchContractSummary(docId: string): Promise<ContractSummary | null> {
	const response = await api.get<ContractSummaryResponse>(
		`/contract_summary/${encodeURIComponent(docId)}`
	);
	return response.data.summary ?? null;
}

export async function generateContractSummary(
	docId: string,
	force = false
): Promise<ContractSummary | null> {
	const response = await api.post<ContractSummaryResponse>(
		`/contract_summary/${encodeURIComponent(docId)}`,
		{ force }
	);
	return response.data.summary ?? null;
}
