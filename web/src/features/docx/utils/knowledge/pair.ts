import type { KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';
import { DEFAULT_SEVERITY, computePartyScores, type DeonticSeverity } from './party-pagerank';

/**
 * Scores over a *pair* of parties, as the union of two ego views.
 *
 * Each party is ranked on its own — one Personalized PageRank per party, each seeded
 * on itself — and the two results are then overlaid rather than merged into a single
 * number. That is what lets a clause say "82% of my pull is Miltenyi's" instead of
 * collapsing to "both are here".
 */

/** Which party's top-K a node earned its place in. */
export type PairOwner = 'a' | 'b' | 'both';

/** How much each party pulls on one clause — the two sub-arcs of its sector. */
export interface PairClauseSplit {
	a: number;
	b: number;
}

export interface PairScores {
	partyAId: string;
	partyBId: string;
	/**
	 * Radial input. A statement keeps the score of the party that cares about it, and
	 * the larger of the two when both do, so the radius still means "how much this
	 * matters to whoever it matters to". Clauses take the pair's combined pull.
	 */
	nodeScores: Record<string, number>;
	/** Both parties, both top-K sets, and the clauses those statements live in. */
	focusNodeIds: string[];
	clauseSplit: Record<string, PairClauseSplit>;
	ownerByNode: Record<string, PairOwner>;
	topA: string[];
	topB: string[];
	/** In both top-K sets — over half the statements name both parties, so this is common. */
	sharedStatementIds: string[];
}

/**
 * The two parties the contract is actually between: the ones named most often as obligor
 * or beneficiary. Placeholders ("Receiving Party") and third parties carry far fewer
 * provisions, so they lose without needing a heuristic on the name.
 */
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

	// Every clause, not just the union: a sector still needs a width to exist at all.
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
	// Clause sectors are re-normalized against the widest clause of the pair, so the
	// ring keeps using its whole angular budget rather than half of it.
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
