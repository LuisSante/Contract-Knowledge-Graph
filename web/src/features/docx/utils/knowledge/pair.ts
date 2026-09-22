import type { KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';
import { DEFAULT_SEVERITY, computePartyScores, type DeonticSeverity } from './party-ledger';

export interface PairScores {
	partyAId: string;
	partyBId: string;
	nodeScores: Record<string, number>;
	focusNodeIds: string[];
	topA: string[];
	topB: string[];
}

export function defaultPair(kg: KnowledgeGraph): [string, string] | null {
	const involvement = new Map<string, number>();
	const bump = (id: string | null) => {
		if (id) involvement.set(id, (involvement.get(id) ?? 0) + 1);
	};
	for (const v of deonticNodes(kg)) {
		bump(v.burdenPartyId);
		bump(v.benefitPartyId);
	}
	const ranked = kg.parties
		.map((p) => ({ id: p.id, score: involvement.get(p.id) ?? 0 }))
		.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
	if (ranked.length < 2 || ranked[1].score === 0) return null;
	return [ranked[0].id, ranked[1].id];
}

export function computePairScores(
	kg: KnowledgeGraph,
	partyAId: string,
	partyBId: string,
	topK: number,
	severity: DeonticSeverity = DEFAULT_SEVERITY,
	importanceByClause: Record<string, number> | null = null
): PairScores {
	const scoresA = computePartyScores(kg, partyAId, severity);
	const scoresB = computePartyScores(kg, partyBId, severity);
	const clauseOfStatement = new Map(deonticNodes(kg).map((v) => [v.id, v.clauseId] as const));

	// The top is a set of CLAUSES, ranked by the server's clause importance — the same
	// value that orders the rows. Until it arrives, severity alone stands in for it.
	const rankOf = (clauseId: string | null) =>
		clauseId ? (importanceByClause?.[clauseId] ?? scoresA.clauseScore.get(clauseId) ?? 0) : 0;
	const topClauseIds = new Set(
		kg.clauses
			.map((c) => c.id)
			.sort((x, y) => rankOf(y) - rankOf(x))
			.slice(0, topK)
	);

	const inTopClause = (id: string) => {
		const clauseId = clauseOfStatement.get(id);
		return Boolean(clauseId && topClauseIds.has(clauseId));
	};
	const topOf = (scores: typeof scoresA) =>
		[...scores.toneByDeontic.keys()]
			.filter(inTopClause)
			.sort((x, y) => (scores.deonticScore.get(y) ?? 0) - (scores.deonticScore.get(x) ?? 0));
	const topA = topOf(scoresA);
	const topB = topOf(scoresB);

	const nodeScores: Record<string, number> = {};
	for (const id of clauseOfStatement.keys()) {
		const score = Math.max(scoresA.deonticScore.get(id) ?? 0, scoresB.deonticScore.get(id) ?? 0);
		if (score > 0) nodeScores[id] = score;
	}

	// A clause node weighs what both parties hold in it, against the heaviest clause.
	const clauseWeight = kg.clauses.map(
		(c) =>
			[c.id, (scoresA.clauseScore.get(c.id) ?? 0) + (scoresB.clauseScore.get(c.id) ?? 0)] as const
	);
	const peak = Math.max(0, ...clauseWeight.map(([, weight]) => weight));
	if (peak > 0) {
		for (const [id, weight] of clauseWeight) if (weight > 0) nodeScores[id] = weight / peak;
	}
	nodeScores[partyAId] = 1;
	nodeScores[partyBId] = 1;

	return {
		partyAId,
		partyBId,
		nodeScores,
		focusNodeIds: [...new Set([partyAId, partyBId, ...topA, ...topB, ...topClauseIds])],
		topA,
		topB,
	};
}
