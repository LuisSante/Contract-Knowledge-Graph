import type { KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';
import { DEFAULT_SEVERITY, computePartyAttention, type DeonticSeverity } from './attention';

/**
 * Attention over a *pair* of parties, as the union of two ego views.
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

export interface PairAttention {
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

export function computePairAttention(
	kg: KnowledgeGraph,
	partyAId: string,
	partyBId: string,
	topK: number,
	severity: DeonticSeverity = DEFAULT_SEVERITY,
	usePageRank = true
): PairAttention {
	const attentionA = computePartyAttention(kg, partyAId, severity, usePageRank);
	const attentionB = computePartyAttention(kg, partyBId, severity, usePageRank);
	const clauseOfStatement = new Map(deonticNodes(kg).map((v) => [v.id, v.clauseId] as const));

	const topOf = (attention: typeof attentionA) =>
		[...attention.toneByDeontic.keys()]
			.sort((x, y) => (attention.deonticScore.get(y) ?? 0) - (attention.deonticScore.get(x) ?? 0))
			.slice(0, topK);
	const topA = topOf(attentionA);
	const topB = topOf(attentionB);
	const setA = new Set(topA);
	const setB = new Set(topB);

	const ownerByNode: Record<string, PairOwner> = {};
	for (const id of setA) ownerByNode[id] = setB.has(id) ? 'both' : 'a';
	for (const id of setB) if (!ownerByNode[id]) ownerByNode[id] = 'b';

	// Every clause, not just the union: a sector still needs a width to exist at all.
	const clauseSplit: Record<string, PairClauseSplit> = {};
	for (const clause of kg.clauses) {
		const a = attentionA.clauseScore.get(clause.id) ?? 0;
		const b = attentionB.clauseScore.get(clause.id) ?? 0;
		if (a > 0 || b > 0) clauseSplit[clause.id] = { a, b };
	}

	const nodeScores: Record<string, number> = {};
	for (const id of clauseOfStatement.keys()) {
		const score = Math.max(attentionA.deonticScore.get(id) ?? 0, attentionB.deonticScore.get(id) ?? 0);
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
