import type { DeonticKind, KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';
import {
	DEFAULT_SEVERITY,
	buildAdjacency,
	graphNodeIds,
	personalizedPageRank,
	type DeonticSeverity,
} from './attention';

/**
 * Dyadic impact over the deontic KG — the contract as a *split* between two parties
 * rather than as one party's ego view.
 *
 *   w(v)      = PPR_{A,B}(v) · severity(kind)      one walk, seeded ½ on each party
 *   share_X(c)= Σ_{v ∈ c, side(v)=X} w(v) / stakes(c)
 *   λ(c)      = share_A(c) − share_B(c) ∈ [−1, 1]
 *
 * The single doubly-seeded walk is the point: two ego walks each sum to 1 over the
 * whole graph, so their per-clause numbers have no common denominator and cannot be
 * subtracted. One walk gives both sides the same scale.
 */

export type DyadSide = 'A' | 'B' | 'neutral';

export interface DyadParty {
	id: string;
	name: string;
	role: string;
}

export interface DyadClause {
	id: string;
	label: string;
	heading: string;
	/** Σ w(v) over the clause — how much is at play, independent of who wins it. */
	stakes: number;
	shareA: number;
	shareB: number;
	/** Statements that touch neither party, or that cut both ways. */
	shareNeutral: number;
	lambda: number;
	statementIds: string[];
}

/**
 * A condition gating a provision. `Condition.gatesId` is a *field*, not an edge, so
 * this relation is invisible to anything that walks `kg.edges` alone.
 *
 * Only the bearer is known: which party controls the trigger is not extracted yet, so
 * this is the reach of the control layer, not its direction.
 */
export interface ControlChain {
	conditionId: string;
	trigger: string;
	operator: string;
	gatedId: string;
	gatedKind: DeonticKind;
	bearerPartyId: string | null;
	weight: number;
	conditionClauseId: string | null;
	gatedClauseId: string | null;
	crossesClause: boolean;
}

export interface DyadControl {
	/** Conditions whose `gatesId` resolves to a statement we know. */
	resolved: number;
	/** ...out of this many conditions in the graph. */
	total: number;
	bearerA: number;
	bearerB: number;
	bearerOther: number;
	sameClause: number;
	crossClause: number;
	unlocated: number;
	/** Share of total deontic weight sitting behind a condition. */
	gatedWeightShare: number;
}

export interface DyadAnalysis {
	partyA: DyadParty;
	partyB: DyadParty;
	/** w(v) per deontic statement. */
	weight: Map<string, number>;
	side: Map<string, DyadSide>;
	clauses: DyadClause[];
	clauseById: Map<string, DyadClause>;
	/** Statements we could not attach to any clause — they have no sector to sit in. */
	unplacedStatementIds: string[];
	massA: number;
	massB: number;
	massNeutral: number;
	totalWeight: number;
	chains: ControlChain[];
	gatedIds: Set<string>;
	control: DyadControl;
	/** Defined terms by how many distinct clauses use them — the core's radius. */
	reach: Map<string, number>;
	peakStatementWeight: number;
	peakStakes: number;
}

/** `Condition.gatesId` as walkable pairs, for the PPR adjacency and the control layer. */
export function gatingPairs(kg: KnowledgeGraph): Array<readonly [string, string]> {
	const statements = new Set(deonticNodes(kg).map((v) => v.id));
	return kg.conditions
		.filter((c) => c.gatesId && statements.has(c.gatesId))
		.map((c) => [c.id, c.gatesId as string] as const);
}

/**
 * The two parties the contract is actually between: the ones named most often as
 * obligor or beneficiary. Placeholder parties ("Receiving Party") and third parties
 * carry far fewer provisions, so they lose without needing a heuristic on the name.
 */
export function defaultDyad(kg: KnowledgeGraph): [string, string] | null {
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

/** Which clause a node belongs to: its own, else the one owning a paragraph it appears in. */
function clauseResolver(kg: KnowledgeGraph): (own: string | null, paragraphIds: string[]) => string | null {
	const known = new Set(kg.clauses.map((c) => c.id));
	const byParagraph = new Map<string, string>();
	for (const clause of kg.clauses) {
		for (const pid of clause.paragraphIds) {
			if (!byParagraph.has(pid)) byParagraph.set(pid, clause.id);
		}
	}
	return (own, paragraphIds) => {
		if (own && known.has(own)) return own;
		for (const pid of paragraphIds) {
			const viaParagraph = byParagraph.get(pid);
			if (viaParagraph) return viaParagraph;
		}
		return null;
	};
}

export function computeDyadAnalysis(
	kg: KnowledgeGraph,
	partyAId: string,
	partyBId: string,
	severity: DeonticSeverity = DEFAULT_SEVERITY,
	usePageRank = true
): DyadAnalysis {
	const statements = deonticNodes(kg);
	const ids = graphNodeIds(kg);
	const index = new Map(ids.map((id, i) => [id, i]));

	const seed = new Array<number>(ids.length).fill(0);
	const seedA = index.get(partyAId);
	const seedB = index.get(partyBId);
	if (seedA != null) seed[seedA] = 0.5;
	if (seedB != null) seed[seedB] = 0.5;
	const rank = usePageRank
		? personalizedPageRank(buildAdjacency(kg, index, gatingPairs(kg)), seed)
		: null;

	// A provision favours whoever holds it or is owed it, and equally whoever the
	// counterparty is bound to. Rights are excluded from the burden arm: a right held
	// by A is not modelled as a duty on B (see kg-metrics.md, "known simplifications").
	const side = new Map<string, DyadSide>();
	const weight = new Map<string, number>();
	for (const v of statements) {
		const favoursA = v.benefitPartyId === partyAId || (v.kind !== 'right' && v.burdenPartyId === partyBId);
		const favoursB = v.benefitPartyId === partyBId || (v.kind !== 'right' && v.burdenPartyId === partyAId);
		side.set(v.id, favoursA && favoursB ? 'neutral' : favoursA ? 'A' : favoursB ? 'B' : 'neutral');
		const i = index.get(v.id);
		weight.set(v.id, (rank && i != null ? rank[i] : 1) * severity[v.kind]);
	}

	const resolveClause = clauseResolver(kg);
	const clauseOfStatement = new Map<string, string>();
	const unplacedStatementIds: string[] = [];
	for (const v of statements) {
		const clauseId = resolveClause(v.clauseId, v.paragraphIds);
		if (clauseId) clauseOfStatement.set(v.id, clauseId);
		else unplacedStatementIds.push(v.id);
	}

	const buckets = new Map<string, { total: number; a: number; b: number; ids: string[] }>();
	for (const clause of kg.clauses) buckets.set(clause.id, { total: 0, a: 0, b: 0, ids: [] });
	let massA = 0;
	let massB = 0;
	let massNeutral = 0;
	for (const v of statements) {
		const w = weight.get(v.id) ?? 0;
		const s = side.get(v.id) ?? 'neutral';
		if (s === 'A') massA += w;
		else if (s === 'B') massB += w;
		else massNeutral += w;

		const clauseId = clauseOfStatement.get(v.id);
		if (!clauseId) continue;
		const bucket = buckets.get(clauseId);
		if (!bucket) continue;
		bucket.total += w;
		bucket.ids.push(v.id);
		if (s === 'A') bucket.a += w;
		else if (s === 'B') bucket.b += w;
	}

	const clauses: DyadClause[] = kg.clauses.map((clause) => {
		const bucket = buckets.get(clause.id)!;
		const shareA = bucket.total > 0 ? bucket.a / bucket.total : 0;
		const shareB = bucket.total > 0 ? bucket.b / bucket.total : 0;
		return {
			id: clause.id,
			label: clause.ref || clause.heading || clause.id,
			heading: clause.heading,
			stakes: bucket.total,
			shareA,
			shareB,
			shareNeutral: Math.max(0, 1 - shareA - shareB),
			lambda: shareA - shareB,
			statementIds: bucket.ids,
		};
	});

	// --- control layer ---
	const kindById = new Map(statements.map((v) => [v.id, v.kind] as const));
	const bearerById = new Map(
		statements.map((v) => [v.id, v.burdenPartyId ?? v.benefitPartyId] as const)
	);
	const chains: ControlChain[] = [];
	for (const condition of kg.conditions) {
		const gatedId = condition.gatesId;
		if (!gatedId || !kindById.has(gatedId)) continue;
		const conditionClauseId = resolveClause(null, condition.paragraphIds);
		const gatedClauseId = clauseOfStatement.get(gatedId) ?? null;
		chains.push({
			conditionId: condition.id,
			trigger: condition.trigger,
			operator: condition.operator,
			gatedId,
			gatedKind: kindById.get(gatedId)!,
			bearerPartyId: bearerById.get(gatedId) ?? null,
			weight: weight.get(gatedId) ?? 0,
			conditionClauseId,
			gatedClauseId,
			crossesClause: Boolean(
				conditionClauseId && gatedClauseId && conditionClauseId !== gatedClauseId
			),
		});
	}
	const gatedIds = new Set(chains.map((c) => c.gatedId));
	const totalWeight = massA + massB + massNeutral;
	let gatedWeight = 0;
	for (const id of gatedIds) gatedWeight += weight.get(id) ?? 0;

	const located = chains.filter((c) => c.conditionClauseId && c.gatedClauseId);
	const control: DyadControl = {
		resolved: chains.length,
		total: kg.conditions.length,
		bearerA: chains.filter((c) => c.bearerPartyId === partyAId).length,
		bearerB: chains.filter((c) => c.bearerPartyId === partyBId).length,
		bearerOther: chains.filter(
			(c) => c.bearerPartyId !== partyAId && c.bearerPartyId !== partyBId
		).length,
		crossClause: located.filter((c) => c.crossesClause).length,
		sameClause: located.filter((c) => !c.crossesClause).length,
		unlocated: chains.length - located.length,
		gatedWeightShare: totalWeight > 0 ? gatedWeight / totalWeight : 0,
	};

	const usedBy = new Map<string, Set<string>>();
	for (const edge of kg.edges) {
		if (edge.type !== 'uses') continue;
		let set = usedBy.get(edge.target);
		if (!set) usedBy.set(edge.target, (set = new Set()));
		set.add(edge.source);
	}
	const reach = new Map([...usedBy].map(([id, clauseSet]) => [id, clauseSet.size] as const));

	const party = (id: string): DyadParty => {
		const found = kg.parties.find((p) => p.id === id);
		return { id, name: found?.name ?? id, role: found?.role ?? '' };
	};

	return {
		partyA: party(partyAId),
		partyB: party(partyBId),
		weight,
		side,
		clauses,
		clauseById: new Map(clauses.map((c) => [c.id, c] as const)),
		unplacedStatementIds,
		massA,
		massB,
		massNeutral,
		totalWeight,
		chains,
		gatedIds,
		control,
		reach,
		peakStatementWeight: Math.max(1e-12, ...weight.values()),
		peakStakes: Math.max(1e-12, ...clauses.map((c) => c.stakes)),
	};
}
