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

/**
 * Resolver hint: which party nodes may be merged (same real party, or a role one
 * plays). Maps party id -> compatible party ids. Empty on any failure — the merge
 * UI works without hints, it just loses the green/amber tint.
 */
export async function fetchPartyMergeHints(docId: string): Promise<Record<string, string[]>> {
	try {
		const response = await api.get<{ candidates?: Record<string, string[]> }>(
			`/knowledge_graph/${encodeURIComponent(docId)}/party_hints`
		);
		return response.data.candidates ?? {};
	} catch {
		return {};
	}
}
