import { api } from '@/lib/api';
import type { RedFlag } from '@/types/red-flags';

interface RedFlagsResponse {
	redFlags: RedFlag[];
}

/** An empty list for a contract the dataset does not cover. */
export async function fetchRedFlags(docId: string): Promise<RedFlag[]> {
	const response = await api.get<RedFlagsResponse>(`/red_flags/${encodeURIComponent(docId)}`);
	return response.data.redFlags ?? [];
}
