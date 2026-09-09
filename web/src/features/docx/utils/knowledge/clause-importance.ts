import type { KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';

/**
 * How important each clause is *within its contract*, by PageRank with a paragraph-style
 * prior. Adapted from GraphQAG (Li et al., IEEE TVCG 2026), §IV-A.
 *
 * The paper spreads the restart mass evenly over the document's paragraphs and, inside
 * each one, evenly over its entities:
 *
 *     π(v) = Σ  1 / (|P| · |V_p|)        over the paragraphs p that contain v
 *
 * Here the unit is the clause and `V_c` its statements, so a clause holding fifteen
 * provisions does not start out five times heavier than one holding three. That
 * debiasing is the whole point: our previous ranking, seeded on a party node and left
 * unbiased, ranked clauses by how many statements they held — Spearman 0.88 against
 * simply counting them.
 *
 * Two consequences worth knowing. It is a *document-level* measure: there is no party
 * seed, so it answers "which clause matters in this contract", never "for whom" — the
 * signed net answers that. And because every clause receives prior mass whether or not
 * the graph reaches it, no clause can score zero; the disconnected "each Party"
 * component that used to sink four clauses to the bottom stops mattering.
 */

const DAMPING = 0.85;
/** The paper iterates until two consecutive rounds differ by less than a threshold. */
const TOLERANCE = 1e-9;
const MAX_ITERATIONS = 200;

export interface ClauseImportance {
	/** Clause id → PageRank mass held by its statements. Absent when it has none. */
	byClause: Map<string, number>;
	/** The heaviest clause, for turning the scores into a share. */
	peak: number;
}

const EMPTY: ClauseImportance = { byClause: new Map(), peak: 0 };

export function computeClauseImportance(
	kg: KnowledgeGraph,
	/**
	 * Which statements count towards the prior. The grid hides some — provisions the
	 * contract attributes to nobody, kinds the reader filtered out, the bilateral column
	 * when it is closed — and an order built on marks nobody can see is an order nobody
	 * can check. The walk still runs over the whole graph: what a clause is connected to
	 * does not stop existing because a column is closed.
	 */
	counted?: ReadonlySet<string>
): ClauseImportance {
	const statements = deonticNodes(kg);

	// `V_c`: the statements of each clause. A statement belongs to exactly one clause,
	// so the sum in π collapses to a single term.
	const byClause = new Map<string, string[]>();
	for (const statement of statements) {
		if (!statement.clauseId) continue;
		if (counted && !counted.has(statement.id)) continue;
		const bucket = byClause.get(statement.clauseId);
		if (bucket) bucket.push(statement.id);
		else byClause.set(statement.clauseId, [statement.id]);
	}
	if (byClause.size === 0) return EMPTY;

	const ids = [
		...kg.parties.map((p) => p.id),
		...kg.clauses.map((c) => c.id),
		...kg.definedTerms.map((t) => t.id),
		...statements.map((v) => v.id),
		...kg.conditions.map((c) => c.id),
		...kg.references.map((r) => r.id),
		...kg.values.map((v) => v.id),
	];
	const index = new Map(ids.map((id, i) => [id, i] as const));

	const adjacency: number[][] = Array.from({ length: ids.length }, () => []);
	for (const edge of kg.edges) {
		const source = index.get(edge.source);
		const target = index.get(edge.target);
		if (source == null || target == null) continue;
		adjacency[source].push(target);
		adjacency[target].push(source);
	}

	// π — every clause gets 1/|C|, split evenly among its own statements.
	const prior = new Array<number>(ids.length).fill(0);
	for (const [, members] of byClause) {
		const share = 1 / (byClause.size * members.length);
		for (const id of members) {
			const i = index.get(id);
			if (i != null) prior[i] += share;
		}
	}

	let rank = prior.slice();
	for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
		const next = new Array<number>(ids.length).fill(0);
		let dangling = 0;
		for (let j = 0; j < ids.length; j += 1) {
			const degree = adjacency[j].length;
			if (degree === 0) {
				dangling += rank[j];
				continue;
			}
			const share = (DAMPING * rank[j]) / degree;
			for (const neighbour of adjacency[j]) next[neighbour] += share;
		}
		// The mass that leaks out of dangling nodes goes back through the prior, not
		// onto a single seed — which is what keeps unreachable clauses off zero.
		const reinjected = 1 - DAMPING + DAMPING * dangling;
		let delta = 0;
		for (let i = 0; i < ids.length; i += 1) {
			next[i] += reinjected * prior[i];
			delta += Math.abs(next[i] - rank[i]);
		}
		rank = next;
		if (delta < TOLERANCE) break;
	}

	const scores = new Map<string, number>();
	let peak = 0;
	for (const [clauseId, members] of byClause) {
		const score = members.reduce((total, id) => {
			const i = index.get(id);
			return total + (i == null ? 0 : rank[i]);
		}, 0);
		scores.set(clauseId, score);
		peak = Math.max(peak, score);
	}
	return { byClause: scores, peak };
}
