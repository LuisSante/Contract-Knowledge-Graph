import type { KnowledgeGraph, ProvisionType } from '@/types/knowledge';

/**
 * Party-centric attention score for the deontic KG.
 *
 *   attention(v | party) = PPR_party(v) × severity(type(v))
 *
 * PPR_party is Personalized PageRank restarted on the focused party (importance
 * *relative to that party*, so far-away provisions decay), and severity encodes
 * the deontic weight (a prohibition on the party weighs more than a right). The
 * clause score aggregates its provisions. Everything is normalized to 0..1 for
 * visual encoding (node size, rail opacity, the impact ledger).
 */

export type DeonticTone = 'burden' | 'benefit';

export interface KgLedgerClause {
	id: string;
	label: string;
	score: number;
}

export interface KgLedger {
	partyId: string;
	partyName: string;
	obligations: number;
	rights: number;
	prohibitions: number;
	/** Severity-weighted totals — the diverging bar. */
	burdenWeight: number;
	benefitWeight: number;
	topClauses: KgLedgerClause[];
}

export interface PartyAttention {
	/** Normalized 0..1 attention per provision. */
	provisionScore: Map<string, number>;
	/** Normalized 0..1 attention per clause. */
	clauseScore: Map<string, number>;
	/** Normalized 0..1 per node (provisions + clauses; party = 1), for node sizing. */
	nodeScore: Map<string, number>;
	/** Whether each provision burdens or benefits the focused party. */
	toneByProvision: Map<string, DeonticTone>;
	ledger: KgLedger;
}

const SEVERITY: Record<ProvisionType, number> = {
	prohibition: 1.0,
	obligation: 0.7,
	right: 0.3,
};

const RESTART = 0.15;
const ITERATIONS = 80;

/** Personalized PageRank restarted on `seedIndex` over an undirected graph. */
function personalizedPageRank(adjacency: number[][], seedIndex: number): number[] {
	const n = adjacency.length;
	const restart = new Array<number>(n).fill(0);
	if (seedIndex >= 0) restart[seedIndex] = 1;
	let rank = restart.slice();

	for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
		const next = new Array<number>(n).fill(0);
		let dangling = 0;
		for (let j = 0; j < n; j += 1) {
			const degree = adjacency[j].length;
			if (degree === 0) {
				dangling += rank[j];
				continue;
			}
			const share = ((1 - RESTART) * rank[j]) / degree;
			for (const neighbor of adjacency[j]) next[neighbor] += share;
		}
		// Restart mass + dangling mass both fall back onto the seed.
		const reinjected = RESTART + (1 - RESTART) * dangling;
		for (let i = 0; i < n; i += 1) next[i] += reinjected * restart[i];
		rank = next;
	}
	return rank;
}

export function computePartyAttention(kg: KnowledgeGraph, partyId: string): PartyAttention {
	// Every node kind takes part in the walk: defined terms, conditions, references
	// and values are what carry attention across clauses that never cite each other
	// (a term defined once and used in twelve clauses links all twelve).
	const ids: string[] = [
		...kg.parties.map((p) => p.id),
		...kg.clauses.map((c) => c.id),
		...kg.definedTerms.map((t) => t.id),
		...kg.provisions.map((v) => v.id),
		...kg.conditions.map((c) => c.id),
		...kg.references.map((r) => r.id),
		...kg.values.map((v) => v.id),
	];
	const index = new Map(ids.map((id, i) => [id, i]));
	const adjacency: number[][] = ids.map(() => []);
	for (const edge of kg.edges) {
		const source = index.get(edge.source);
		const target = index.get(edge.target);
		if (source == null || target == null) continue;
		adjacency[source].push(target);
		adjacency[target].push(source);
	}

	const rank = personalizedPageRank(adjacency, index.get(partyId) ?? -1);

	const provisionById = new Map(kg.provisions.map((v) => [v.id, v]));

	// Raw attention = PPR × severity.
	const provisionAttention = new Map<string, number>();
	for (const v of kg.provisions) {
		const i = index.get(v.id);
		if (i == null) continue;
		provisionAttention.set(v.id, rank[i] * SEVERITY[v.type]);
	}
	const clauseAttention = new Map<string, number>();
	for (const v of kg.provisions) {
		if (!v.clauseId) continue;
		clauseAttention.set(
			v.clauseId,
			(clauseAttention.get(v.clauseId) ?? 0) + (provisionAttention.get(v.id) ?? 0)
		);
	}

	const maxProvision = Math.max(1e-9, ...provisionAttention.values());
	const maxClause = Math.max(1e-9, ...clauseAttention.values());
	const provisionScore = new Map(
		[...provisionAttention].map(([id, s]) => [id, s / maxProvision] as const)
	);
	const clauseScore = new Map([...clauseAttention].map(([id, s]) => [id, s / maxClause] as const));

	const nodeScore = new Map<string, number>();
	for (const [id, s] of provisionScore) nodeScore.set(id, s);
	for (const [id, s] of clauseScore) nodeScore.set(id, s);
	nodeScore.set(partyId, 1);

	// Burden/benefit relative to the focused party, read from the provision fields
	// rather than from the edges. The ontology only attaches a provision to the
	// party that bears it (assigns_obligation_to / grants_right_to), so the edges
	// alone cannot express "the counterparty owes this to me" — a duty owed *to*
	// the party is a benefit for it, and that is where most of its upside lives.
	const toneByProvision = new Map<string, DeonticTone>();
	for (const v of kg.provisions) {
		const isRight = v.type === 'right';
		if (!isRight && v.obligorPartyId === partyId) {
			toneByProvision.set(v.id, 'burden'); // the party must comply
		} else if (v.beneficiaryPartyId === partyId) {
			// A right it holds, or a duty the counterparty owes it.
			toneByProvision.set(v.id, 'benefit');
		}
	}

	// Ledger over the provisions tied to this party.
	let obligations = 0;
	let rights = 0;
	let prohibitions = 0;
	let burdenWeight = 0;
	let benefitWeight = 0;
	const partyClauseScore = new Map<string, number>();
	for (const [provisionId, tone] of toneByProvision) {
		const v = provisionById.get(provisionId);
		if (!v) continue;
		if (v.type === 'obligation') obligations += 1;
		else if (v.type === 'right') rights += 1;
		else if (v.type === 'prohibition') prohibitions += 1;
		if (tone === 'burden') burdenWeight += SEVERITY[v.type];
		else benefitWeight += SEVERITY[v.type];
		if (v.clauseId) {
			partyClauseScore.set(
				v.clauseId,
				(partyClauseScore.get(v.clauseId) ?? 0) + (provisionAttention.get(v.id) ?? 0)
			);
		}
	}

	const clauseLabel = (id: string): string => {
		const c = kg.clauses.find((clause) => clause.id === id);
		return c?.ref || c?.heading || id;
	};
	const topClauses: KgLedgerClause[] = [...partyClauseScore]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([id, s]) => ({ id, label: clauseLabel(id), score: s / maxClause }));

	const party = kg.parties.find((p) => p.id === partyId);
	const ledger: KgLedger = {
		partyId,
		partyName: party?.name ?? partyId,
		obligations,
		rights,
		prohibitions,
		burdenWeight,
		benefitWeight,
		topClauses,
	};

	return { provisionScore, clauseScore, nodeScore, toneByProvision, ledger };
}
