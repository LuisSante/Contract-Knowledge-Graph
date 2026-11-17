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

/** How a clause needs another to be read: it is modified by it, depends on it, or refers to it. */
export type NeedRelation = 'modified_by' | 'depends_on' | 'refers_to';

export interface ClauseImportance {
	/** Each row's relevance: how much the other clauses need it to be read. A walk between
	 *  clauses only, along `modifies`, `depends_on` and `references`. */
	byClause: Record<string, number>;
	/** Why a row stands above the base value every row starts with: the clauses that need it,
	 *  in the contract's order. A row left out is at the base: no clause needs it. */
	neededBy: Record<string, Array<{ clauseId: string; relation: NeedRelation }>>;
	/** The walk over the whole graph, every node kind included. Sums to 1. */
	byNode: Record<string, number>;
	/** The restart vector it converged from — statements only, also summing to 1. */
	priorByNode: Record<string, number>;
	/** What that walk leaves on each row's statements. */
	graphByClause: Record<string, number>;
	iterations: number;
}

/** `startIds` are one party's statements among the counted ones: with them the relevance is
 *  read from that party, the walk starting only on the clauses that hold one. */
export async function fetchClauseImportance(
	docId: string,
	countedIds: string[] | null,
	startIds: string[] | null,
	signal?: AbortSignal
): Promise<ClauseImportance | null> {
	try {
		const response = await api.post<Partial<ClauseImportance>>(
			`/knowledge_graph/${encodeURIComponent(docId)}/clause_importance`,
			{ countedStatementIds: countedIds, startStatementIds: startIds },
			{ signal }
		);
		return {
			byClause: response.data.byClause ?? {},
			neededBy: response.data.neededBy ?? {},
			byNode: response.data.byNode ?? {},
			priorByNode: response.data.priorByNode ?? {},
			graphByClause: response.data.graphByClause ?? {},
			iterations: response.data.iterations ?? 0,
		};
	} catch {
		return null;
	}
}
