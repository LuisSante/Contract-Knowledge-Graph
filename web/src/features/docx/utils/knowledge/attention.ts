import type { KnowledgeGraph, ProvisionType } from '@/types/knowledge';

/**
 * Party-centric attention over the deontic KG.
 *
 *   magnitude(v|P) = PPR_P(v) · severity(type)     unsigned, every provision — visual weight
 *   impact(v|P)    = magnitude · sign(tone(v,P))   signed, P's provisions only — the ledger
 */

export type DeonticTone = 'burden' | 'benefit';

export interface KgLedgerClause {
	id: string;
	label: string;
	/** Unsigned 0..1, for the bar width. */
	score: number;
	/** Signed -1..1: negative costs the party. */
	impact: number;
	tone: DeonticTone;
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
	/** Ranked by |impact|. */
	topClauses: KgLedgerClause[];
}

export interface PartyAttention {
	/** Normalized 0..1 magnitude per provision. */
	provisionScore: Map<string, number>;
	/** Normalized 0..1 magnitude per clause. */
	clauseScore: Map<string, number>;
	/** Normalized 0..1 per node (provisions + clauses; party = 1), for node sizing. */
	nodeScore: Map<string, number>;
	/** Whether each provision burdens or benefits the focused party. */
	toneByProvision: Map<string, DeonticTone>;
	ledger: KgLedger;
}

/** Deontic weight of a provision type. */
const SEVERITY: Record<ProvisionType, number> = {
	prohibition: 1.0,
	obligation: 0.7,
	right: 0.3,
};

const SIGN: Record<DeonticTone, number> = { burden: -1, benefit: 1 };

const RESTART = 0.15;
const ITERATIONS = 80;
const TOP_CLAUSES = 5;

/** Every node id in the graph, in a stable order. */
function graphNodeIds(kg: KnowledgeGraph): string[] {
	return [
		...kg.parties.map((p) => p.id),
		...kg.clauses.map((c) => c.id),
		...kg.definedTerms.map((t) => t.id),
		...kg.provisions.map((v) => v.id),
		...kg.conditions.map((c) => c.id),
		...kg.references.map((r) => r.id),
		...kg.values.map((v) => v.id),
	];
}

/** Undirected adjacency list over every edge whose endpoints are known. */
function buildAdjacency(kg: KnowledgeGraph, index: Map<string, number>): number[][] {
	const adjacency: number[][] = Array.from({ length: index.size }, () => []);
	for (const edge of kg.edges) {
		const source = index.get(edge.source);
		const target = index.get(edge.target);
		if (source == null || target == null) continue;
		adjacency[source].push(target);
		adjacency[target].push(source);
	}
	return adjacency;
}

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
		// Restart + dangling mass fall back onto the seed.
		const reinjected = RESTART + (1 - RESTART) * dangling;
		for (let i = 0; i < n; i += 1) next[i] += reinjected * restart[i];
		rank = next;
	}
	return rank;
}

/** Tone relative to the focused party, from the obligor/beneficiary fields. Others are omitted. */
function classifyTone(kg: KnowledgeGraph, partyId: string): Map<string, DeonticTone> {
	const tone = new Map<string, DeonticTone>();
	for (const v of kg.provisions) {
		const isRight = v.type === 'right';
		if (!isRight && v.obligorPartyId === partyId) {
			tone.set(v.id, 'burden');
		} else if (v.beneficiaryPartyId === partyId) {
			tone.set(v.id, 'benefit'); // a right it holds, or a duty owed to it
		}
	}
	return tone;
}

/** Scale a map so its largest absolute value becomes 1, preserving sign. */
function normalize(values: Map<string, number>): Map<string, number> {
	let peak = 0;
	for (const value of values.values()) peak = Math.max(peak, Math.abs(value));
	if (peak <= 0) return new Map(values);
	return new Map([...values].map(([id, value]) => [id, value / peak] as const));
}

export function computePartyAttention(kg: KnowledgeGraph, partyId: string): PartyAttention {
	// 1. Walk the graph from the focused party.
	const ids = graphNodeIds(kg);
	const index = new Map(ids.map((id, i) => [id, i]));
	const rank = personalizedPageRank(buildAdjacency(kg, index), index.get(partyId) ?? -1);

	// 2. Which provisions concern this party.
	const toneByProvision = classifyTone(kg, partyId);

	// 3. Magnitude for all; impact only where there is a tone.
	const provisionMagnitude = new Map<string, number>();
	const provisionImpact = new Map<string, number>();
	for (const v of kg.provisions) {
		const i = index.get(v.id);
		if (i == null) continue;
		const magnitude = rank[i] * SEVERITY[v.type];
		provisionMagnitude.set(v.id, magnitude);
		const tone = toneByProvision.get(v.id);
		if (tone) provisionImpact.set(v.id, magnitude * SIGN[tone]);
	}

	// 4. Roll up to the clause.
	const clauseMagnitude = new Map<string, number>();
	const clauseImpact = new Map<string, number>();
	for (const v of kg.provisions) {
		if (!v.clauseId) continue;
		clauseMagnitude.set(v.clauseId, (clauseMagnitude.get(v.clauseId) ?? 0) + (provisionMagnitude.get(v.id) ?? 0));
		const impact = provisionImpact.get(v.id);
		if (impact != null) clauseImpact.set(v.clauseId, (clauseImpact.get(v.clauseId) ?? 0) + impact);
	}

	// 5. Each quantity against its own peak.
	const provisionScore = normalize(provisionMagnitude);
	const clauseScore = normalize(clauseMagnitude);
	const clauseImpactScore = normalize(clauseImpact);

	const nodeScore = new Map<string, number>();
	for (const [id, s] of provisionScore) nodeScore.set(id, s);
	for (const [id, s] of clauseScore) nodeScore.set(id, s);
	nodeScore.set(partyId, 1);

	// 6. Deontic tallies.
	const provisionById = new Map(kg.provisions.map((v) => [v.id, v]));
	let obligations = 0;
	let rights = 0;
	let prohibitions = 0;
	let burdenWeight = 0;
	let benefitWeight = 0;
	for (const [provisionId, tone] of toneByProvision) {
		const v = provisionById.get(provisionId);
		if (!v) continue;
		if (v.type === 'obligation') obligations += 1;
		else if (v.type === 'right') rights += 1;
		else prohibitions += 1;
		if (tone === 'burden') burdenWeight += SEVERITY[v.type];
		else benefitWeight += SEVERITY[v.type];
	}

	// 7. Heaviest clauses.
	const clauseLabel = (id: string): string => {
		const clause = kg.clauses.find((c) => c.id === id);
		return clause?.ref || clause?.heading || id;
	};
	const topClauses: KgLedgerClause[] = [...clauseImpactScore]
		.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
		.slice(0, TOP_CLAUSES)
		.map(([id, impact]) => ({
			id,
			label: clauseLabel(id),
			score: Math.abs(impact),
			impact,
			tone: impact < 0 ? ('burden' as const) : ('benefit' as const),
		}));

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
