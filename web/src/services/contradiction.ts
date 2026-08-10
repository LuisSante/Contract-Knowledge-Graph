import { api } from '@/lib/api';
import type {
	ContradictionAnalysisRequest,
	ContradictionAnalysisResponse,
	ContradictionGraphMode,
	SavedContradictionsResponse,
} from '@/types/document';

export async function fetchSavedContradictions(
	documentId: string,
	mode: ContradictionGraphMode
): Promise<SavedContradictionsResponse> {
	const response = await api.get<SavedContradictionsResponse>(
		`/contradictions/saved/${encodeURIComponent(documentId)}`,
		{ params: { mode } }
	);
	return response.data;
}

export async function fetchContradictionAnalysis(
	payload: ContradictionAnalysisRequest
): Promise<ContradictionAnalysisResponse> {
	const response = await api.post<ContradictionAnalysisResponse>(
		'/contradictions/analyze',
		payload
	);
	return response.data;
}
