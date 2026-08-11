import { api } from '@/lib/api';
import type { KnowledgeGraph, KnowledgeGraphResponse } from '@/types/knowledge';

/**
 * Fetches the pre-generated deontic knowledge graph for a document.
 * Returns null when the KG has not been generated yet (backend 404).
 */
export async function fetchKnowledgeGraph(docId: string): Promise<KnowledgeGraph | null> {
	try {
		const response = await api.get<KnowledgeGraphResponse>(
			`/knowledge_graph/${encodeURIComponent(docId)}`
		);
		return response.data.knowledgeGraph ?? null;
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'response' in error &&
			(error as { response?: { status?: number } }).response?.status === 404
		) {
			return null;
		}
		throw error;
	}
}
