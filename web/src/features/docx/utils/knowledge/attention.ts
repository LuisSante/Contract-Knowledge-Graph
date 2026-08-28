import type { DeonticKind, KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';

/**
 * Party-centric attention over the deontic KG.
 *
 *   magnitude(v|P) = PPR_P(v) · severity(kind)     unsigned, every statement — visual weight
 *   impact(v|P)    = magnitude · sign(tone(v,P))   signed, P's statements only — the ledger
 */

export type DeonticTone = 'burden' | 'benefit';

export interface KgLedgerClause {
	id: string;
	label: string;
	/** Summed magnitude of this clause's provisions that burden the party. */
	burden: number;
	/** ...and of the ones that benefit it. */
	benefit: number;
}

export interface KgLedger {
	partyId: string;
	partyName: string;
	obligations: number;
	rights: number;
	prohibitions: number;
	/** Summed magnitude per side — the volume bar. */
	burdenWeight: number;
	benefitWeight: number;
	/** Count of statements per side — divides the sums into the intensity bar. */
	burdenCount: number;
	benefitCount: number;
	/** Ranked by total involvement (burden + benefit). */
	topClauses: KgLedgerClause[];
}

export interface PartyAttention {
	/** Normalized 0..1 magnitude per deontic statement. */
	deonticScore: Map<string, number>;
	/** Normalized 0..1 magnitude per clause. */
	clauseScore: Map<string, number>;
	/** Normalized 0..1 per node (statements + clauses; party = 1), for node sizing. */
	nodeScore: Map<string, number>;
	/** Whether each statement burdens or benefits the focused party. */
	toneByDeontic: Map<string, DeonticTone>;
	/** Per clause, the magnitude summed on each side — the split the arc glyph draws. */
	clauseBurden: Map<string, number>;
	clauseBenefit: Map<string, number>;
	ledger: KgLedger;
}

/** User-tunable importance weight per deontic kind (the severity sliders). */
export type DeonticSeverity = Record<DeonticKind, number>;

export const DEFAULT_SEVERITY: DeonticSeverity = {
	prohibition: 1.0,
	obligation: 0.7,
	right: 0.3,
};

const RESTART = 0.15;
const ITERATIONS = 80;
const TOP_CLAUSES = 5;

/** Every node id in the graph, in a stable order. */
export function graphNodeIds(kg: KnowledgeGraph): string[] {
	return [
		...kg.parties.map((p) => p.id),
		...kg.clauses.map((c) => c.id),
		...kg.definedTerms.map((t) => t.id),
		...deonticNodes(kg).map((v) => v.id),
		...kg.conditions.map((c) => c.id),
		...kg.references.map((r) => r.id),
		...kg.values.map((v) => v.id),
	];
}

/**
 * Undirected adjacency list over every edge whose endpoints are known. `extraPairs`
 * adds links that are not in `kg.edges` — the gating relation lives on
 * `Condition.gatesId`, a field, so it has to be injected to be walkable.
 */
export function buildAdjacency(
	kg: KnowledgeGraph,
	index: Map<string, number>,
	extraPairs: ReadonlyArray<readonly [string, string]> = []
): number[][] {
	const adjacency: number[][] = Array.from({ length: index.size }, () => []);
	const link = (a: string, b: string) => {
		const source = index.get(a);
		const target = index.get(b);
		if (source == null || target == null) return;
		adjacency[source].push(target);
		adjacency[target].push(source);
	};
	for (const edge of kg.edges) link(edge.source, edge.target);
	for (const [a, b] of extraPairs) link(a, b);
	return adjacency;
}

/**
 * Personalized PageRank over an undirected graph. `restart` is the teleport
 * distribution (it must sum to 1): one-hot for a single ego, split for a dyad.
 */
export function personalizedPageRank(adjacency: number[][], restart: number[]): number[] {
	const n = adjacency.length;
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

/** Scale a map so its largest absolute value becomes 1, preserving sign. */
function normalize(values: Map<string, number>): Map<string, number> {
	let peak = 0;
	for (const value of values.values()) peak = Math.max(peak, Math.abs(value));
	if (peak <= 0) return new Map(values);
	return new Map([...values].map(([id, value]) => [id, value / peak] as const));
}

export function computePartyAttention(
	kg: KnowledgeGraph,
	partyId: string,
	severity: DeonticSeverity = DEFAULT_SEVERITY,
	usePageRank = true
): PartyAttention {
	const deontic = deonticNodes(kg);

	// With PPR off, every node weighs 1, so magnitude = severity — the raw baseline.
	const ids = graphNodeIds(kg);
	const index = new Map(ids.map((id, i) => [id, i]));
	const seed = new Array<number>(ids.length).fill(0);
	const seedIndex = index.get(partyId);
	if (seedIndex != null) seed[seedIndex] = 1;
	const rank = usePageRank ? personalizedPageRank(buildAdjacency(kg, index), seed) : null;

	// 2. Which statements concern this party (tone from obligor/beneficiary).
	const toneByDeontic = new Map<string, DeonticTone>();
	for (const v of deontic) {
		if (v.kind !== 'right' && v.burdenPartyId === partyId) {
			toneByDeontic.set(v.id, 'burden');
		} else if (v.benefitPartyId === partyId) {
			toneByDeontic.set(v.id, 'benefit'); // a right it holds, or a duty owed to it
		}
	}

	// 3. Magnitude = weight × severity for every statement.
	const deonticMagnitude = new Map<string, number>();
	for (const v of deontic) {
		const i = index.get(v.id);
		if (i == null) continue;
		deonticMagnitude.set(v.id, (rank ? rank[i] : 1) * severity[v.kind]);
	}

	// 4. Roll up to the clause: total magnitude, plus the burden/benefit split.
	const clauseMagnitude = new Map<string, number>();
	const clauseBurden = new Map<string, number>();
	const clauseBenefit = new Map<string, number>();
	for (const v of deontic) {
		if (!v.clauseId) continue;
		const magnitude = deonticMagnitude.get(v.id) ?? 0;
		clauseMagnitude.set(v.clauseId, (clauseMagnitude.get(v.clauseId) ?? 0) + magnitude);
		const tone = toneByDeontic.get(v.id);
		if (tone === 'burden') clauseBurden.set(v.clauseId, (clauseBurden.get(v.clauseId) ?? 0) + magnitude);
		else if (tone === 'benefit')
			clauseBenefit.set(v.clauseId, (clauseBenefit.get(v.clauseId) ?? 0) + magnitude);
	}

	// 5. Each quantity against its own peak.
	const deonticScore = normalize(deonticMagnitude);
	const clauseScore = normalize(clauseMagnitude);

	const nodeScore = new Map<string, number>();
	for (const [id, s] of deonticScore) nodeScore.set(id, s);
	for (const [id, s] of clauseScore) nodeScore.set(id, s);
	nodeScore.set(partyId, 1);

	// 6. Party-level tallies (counts + the burden/benefit bar).
	const kindById = new Map(deontic.map((v) => [v.id, v.kind]));
	let obligations = 0;
	let rights = 0;
	let prohibitions = 0;
	let burdenWeight = 0;
	let benefitWeight = 0;
	let burdenCount = 0;
	let benefitCount = 0;
	for (const [statementId, tone] of toneByDeontic) {
		const kind = kindById.get(statementId);
		if (!kind) continue;
		if (kind === 'obligation') obligations += 1;
		else if (kind === 'right') rights += 1;
		else prohibitions += 1;
		const magnitude = deonticMagnitude.get(statementId) ?? 0;
		if (tone === 'burden') {
			burdenWeight += magnitude;
			burdenCount += 1;
		} else {
			benefitWeight += magnitude;
			benefitCount += 1;
		}
	}

	// 7. Heaviest clauses, ranked by total involvement (burden + benefit).
	const clauseLabel = (id: string): string => {
		const clause = kg.clauses.find((c) => c.id === id);
		return clause?.ref || clause?.heading || id;
	};
	const topClauses: KgLedgerClause[] = [...new Set([...clauseBurden.keys(), ...clauseBenefit.keys()])]
		.map((id) => ({
			id,
			label: clauseLabel(id),
			burden: clauseBurden.get(id) ?? 0,
			benefit: clauseBenefit.get(id) ?? 0,
		}))
		.sort((a, b) => b.burden + b.benefit - (a.burden + a.benefit))
		.slice(0, TOP_CLAUSES);

	const party = kg.parties.find((p) => p.id === partyId);
	const ledger: KgLedger = {
		partyId,
		partyName: party?.name ?? partyId,
		obligations,
		rights,
		prohibitions,
		burdenWeight,
		benefitWeight,
		burdenCount,
		benefitCount,
		topClauses,
	};

	return {
		deonticScore,
		clauseScore,
		nodeScore,
		toneByDeontic,
		clauseBurden,
		clauseBenefit,
		ledger,
	};
}
