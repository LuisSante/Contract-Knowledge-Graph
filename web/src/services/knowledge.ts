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

export interface ClauseImportance {
	byClause: Record<string, number>;
	/** The whole fixed point, every node kind included. Sums to 1. */
	byNode: Record<string, number>;
	/** The restart vector it converged from — statements only, also summing to 1. */
	priorByNode: Record<string, number>;
	iterations: number;
}

export async function fetchClauseImportance(
	docId: string,
	countedIds: string[] | null,
	signal?: AbortSignal
): Promise<ClauseImportance | null> {
	try {
		const response = await api.post<Partial<ClauseImportance>>(
			`/knowledge_graph/${encodeURIComponent(docId)}/clause_importance`,
			{ countedStatementIds: countedIds },
			{ signal }
		);
		return {
			byClause: response.data.byClause ?? {},
			byNode: response.data.byNode ?? {},
			priorByNode: response.data.priorByNode ?? {},
			iterations: response.data.iterations ?? 0,
		};
	} catch {
		return null;
	}
}
