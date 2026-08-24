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

export interface PartyMergeHints {
	/** party id -> party ids it may merge with (same real party, or a role it plays). */
	candidates: Record<string, string[]>;
	/** party ids that denote a distinct real party (a merge must not combine two). */
	entities: string[];
}

/**
 * Resolver hint for the merge UI. Empty on any failure — the UI still works, it
 * just loses the green/amber tint.
 */
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
