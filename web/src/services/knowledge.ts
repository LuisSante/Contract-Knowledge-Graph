import { api } from '@/lib/api';
import type { KnowledgeGraph, KnowledgeGraphResponse } from '@/types/knowledge';

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

export interface PartyMergeHints {
	candidates: Record<string, string[]>;
	entities: string[];
}

export async function fetchPartyMergeHints(docId: string): Promise<PartyMergeHints> {
	try {
		const response = await api.get<Partial<PartyMergeHints>>(
			`/knowledge_graph/${encodeURIComponent(docId)}/party_hints`
		);
		return { candidates: response.data.candidates ?? {}, entities: response.data.entities ?? [] };
	} catch {
		return { candidates: {}, entities: [] };
	}
}
