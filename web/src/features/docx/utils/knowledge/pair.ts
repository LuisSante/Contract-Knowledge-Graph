import type { KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';
import { DEFAULT_SEVERITY, computePartyScores, type DeonticSeverity } from './party-pagerank';

export type PairOwner = 'a' | 'b' | 'both';

export interface PairClauseSplit {
	a: number;
	b: number;
}

export interface PairScores {
	partyAId: string;
	partyBId: string;
	nodeScores: Record<string, number>;
	focusNodeIds: string[];
	clauseSplit: Record<string, PairClauseSplit>;
	ownerByNode: Record<string, PairOwner>;
	topA: string[];
	topB: string[];
	sharedStatementIds: string[];
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
	usePageRank = true
): PairScores {
	const scoresA = computePartyScores(kg, partyAId, severity, usePageRank);
	const scoresB = computePartyScores(kg, partyBId, severity, usePageRank);
	const clauseOfStatement = new Map(deonticNodes(kg).map((v) => [v.id, v.clauseId] as const));

	const topOf = (scores: typeof scoresA) =>
		[...scores.toneByDeontic.keys()]
			.sort((x, y) => (scores.deonticScore.get(y) ?? 0) - (scores.deonticScore.get(x) ?? 0))
			.slice(0, topK);
	const topA = topOf(scoresA);
	const topB = topOf(scoresB);
	const setA = new Set(topA);
	const setB = new Set(topB);

	const ownerByNode: Record<string, PairOwner> = {};
	for (const id of setA) ownerByNode[id] = setB.has(id) ? 'both' : 'a';
	for (const id of setB) if (!ownerByNode[id]) ownerByNode[id] = 'b';

	const clauseSplit: Record<string, PairClauseSplit> = {};
	for (const clause of kg.clauses) {
		const a = scoresA.clauseScore.get(clause.id) ?? 0;
		const b = scoresB.clauseScore.get(clause.id) ?? 0;
		if (a > 0 || b > 0) clauseSplit[clause.id] = { a, b };
	}

	const nodeScores: Record<string, number> = {};
	for (const id of clauseOfStatement.keys()) {
		const score = Math.max(scoresA.deonticScore.get(id) ?? 0, scoresB.deonticScore.get(id) ?? 0);
		if (score > 0) nodeScores[id] = score;
	}

	const peak = Math.max(0, ...Object.values(clauseSplit).map(({ a, b }) => a + b));
	if (peak > 0) {
		for (const [id, { a, b }] of Object.entries(clauseSplit)) nodeScores[id] = (a + b) / peak;
	}
	nodeScores[partyAId] = 1;
	nodeScores[partyBId] = 1;

	const clausesOf = (ids: string[]) =>
		ids.map((id) => clauseOfStatement.get(id)).filter((id): id is string => Boolean(id));

	return {
		partyAId,
		partyBId,
		nodeScores,
		focusNodeIds: [
			...new Set([partyAId, partyBId, ...topA, ...topB, ...clausesOf(topA), ...clausesOf(topB)]),
		],
		clauseSplit,
		ownerByNode,
		topA,
		topB,
		sharedStatementIds: topA.filter((id) => setB.has(id)),
	};
}
