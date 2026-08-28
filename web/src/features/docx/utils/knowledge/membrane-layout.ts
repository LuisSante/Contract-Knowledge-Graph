import type { KnowledgeGraph } from '@/types/knowledge';

import { clauseDocumentPosition } from './radial-layout';
import type { DyadAnalysis, DyadSide } from './dyadic';

/**
 * Bilateral membrane ring. The circle at `membraneRadius` is the neutral seam: a
 * provision is drawn *outward* from it if it favours party A and *inward* if it
 * favours B, so which side of the seam a node sits on already says who it serves.
 *
 * Layout rules:
 *   angle   — clause order in the document; sector width ∝ stakes
 *   side    — outward = A, inward = B
 *   offset  — distance from the membrane = w(v), so displacement is impact
 *   core    — what neither party owns: conditions, shared defined terms, untoned
 *             statements. Radius there is reach (how many clauses a node couples),
 *             inverted, so the most shared machinery sits dead centre.
 *
 * No party occupies the centre — in a bilateral reading a party is not a point, it is
 * a direction. Pure and deterministic: same graph and analysis, same picture.
 */

export type MembraneBand = 'core' | 'territoryA' | 'territoryB';

export interface MembraneSector {
	clauseId: string;
	label: string;
	order: number;
	stakes: number;
	shareA: number;
	shareB: number;
	shareNeutral: number;
	lambda: number;
	startAngle: number;
	endAngle: number;
	midAngle: number;
	/** Bar length outward (A) and inward (B) from the membrane, in px. */
	lengthA: number;
	lengthB: number;
	/** Tangential thickness of the pair of bars, in px. */
	thickness: number;
}

export interface MembranePosition {
	x: number;
	y: number;
	angle: number;
	distance: number;
	band: MembraneBand;
	side: DyadSide;
	clauseId: string | null;
}

/** A condition gating a statement that lives in a *different* clause. */
export interface MembraneChord {
	conditionId: string;
	gatedId: string;
}

export interface MembraneLayout {
	center: { x: number; y: number };
	usable: number;
	coreRadius: number;
	membraneRadius: number;
	lambdaRadius: number;
	lambdaThickness: number;
	outerRadius: number;
	sectors: MembraneSector[];
	sectorById: Map<string, MembraneSector>;
	positions: Map<string, MembranePosition>;
	chords: MembraneChord[];
}

export interface MembraneLayoutOptions {
	width: number;
	height: number;
	analysis: DyadAnalysis;
	paragraphOrder: Map<string, number>;
	/** Minimum radial separation between two nodes sharing a sector, in px. */
	minRadialGap?: number;
}

const TAU = Math.PI * 2;
/** Every clause keeps a sliver even at zero stakes: absence is informative. */
const MIN_SECTOR_RAD = (1.15 * Math.PI) / 180;

// Band extents as a fraction of the usable radius.
const CORE_OUTER = 0.3;
const TERRITORY_B_INNER = 0.34;
const MEMBRANE = 0.62;
const TERRITORY_A_OUTER = 0.88;
const LAMBDA = 0.94;
const OUTER = 0.98;
/** Clear of the seam so a near-zero provision still reads as being on a side. */
const SEAM_CLEARANCE = 10;

/**
 * Bar length compresses the stakes range: with a linear map the top clause is ~50×
 * the median and everything but a handful collapses onto the membrane.
 */
const BAR_EXPONENT = 0.62;
/** Same problem, gentler, for where a single statement sits inside its territory. */
const OFFSET_EXPONENT = 0.55;

export function computeMembraneLayout(
	kg: KnowledgeGraph,
	options: MembraneLayoutOptions
): MembraneLayout {
	const { width, height, analysis, paragraphOrder, minRadialGap = 11 } = options;
	const center = { x: width / 2, y: height / 2 };
	const usable = Math.max(1, Math.min(width, height) / 2 - 28);

	const coreRadius = usable * CORE_OUTER;
	const membraneRadius = usable * MEMBRANE;
	const territoryAOuter = usable * TERRITORY_A_OUTER;
	const territoryBInner = usable * TERRITORY_B_INNER;
	const lambdaRadius = usable * LAMBDA;

	const pointAt = (angle: number, distance: number) => ({
		x: center.x + Math.cos(angle) * distance,
		y: center.y + Math.sin(angle) * distance,
	});

	// --- 1. Sectors: clauses in document order, width by stakes ---
	const ordered = analysis.clauses
		.map((clause) => ({
			clause,
			position: clauseDocumentPosition(
				kg.clauses.find((c) => c.id === clause.id)?.paragraphIds ?? [],
				paragraphOrder
			),
		}))
		.sort((a, b) =>
			a.position !== b.position ? a.position - b.position : a.clause.id.localeCompare(b.clause.id)
		);

	const totalStakes = ordered.reduce((sum, item) => sum + item.clause.stakes, 0);
	const floorTotal = MIN_SECTOR_RAD * ordered.length;
	const spare = Math.max(0, TAU - floorTotal);
	const equalShare = ordered.length > 0 ? TAU / ordered.length : TAU;
	const barBudgetA = territoryAOuter - membraneRadius;
	const barBudgetB = membraneRadius - territoryBInner;

	const sectors: MembraneSector[] = [];
	let cursor = -Math.PI / 2;
	for (const [order, { clause }] of ordered.entries()) {
		const span =
			floorTotal >= TAU || totalStakes <= 0
				? equalShare
				: MIN_SECTOR_RAD + (clause.stakes / totalStakes) * spare;
		const scaled = (share: number, budget: number) =>
			clause.stakes <= 0 || share <= 0
				? 0
				: Math.pow((clause.stakes * share) / analysis.peakStakes, BAR_EXPONENT) * budget;
		sectors.push({
			clauseId: clause.id,
			label: clause.label,
			order,
			stakes: clause.stakes,
			shareA: clause.shareA,
			shareB: clause.shareB,
			shareNeutral: clause.shareNeutral,
			lambda: clause.lambda,
			startAngle: cursor,
			endAngle: cursor + span,
			midAngle: cursor + span / 2,
			lengthA: scaled(clause.shareA, barBudgetA),
			lengthB: scaled(clause.shareB, barBudgetB),
			thickness: Math.max(2, Math.min(11, membraneRadius * span * 0.72)),
		});
		cursor += span;
	}
	const sectorById = new Map(sectors.map((s) => [s.clauseId, s] as const));

	const positions = new Map<string, MembranePosition>();
	const place = (
		id: string,
		angle: number,
		distance: number,
		band: MembraneBand,
		side: DyadSide,
		clauseId: string | null
	) => {
		const { x, y } = pointAt(angle, distance);
		positions.set(id, { x, y, angle, distance, band, side, clauseId });
	};

	// --- 2. Toned statements: their own territory, offset from the seam by weight ---
	const clauseOf = new Map<string, string>();
	for (const sector of sectors) {
		for (const statementId of analysis.clauseById.get(sector.clauseId)?.statementIds ?? []) {
			clauseOf.set(statementId, sector.clauseId);
		}
	}

	const perSector = new Map<string, { A: string[]; B: string[] }>();
	const coreStatements: string[] = [];
	for (const [statementId, clauseId] of clauseOf) {
		const side = analysis.side.get(statementId) ?? 'neutral';
		if (side === 'neutral') {
			coreStatements.push(statementId);
			continue;
		}
		let bucket = perSector.get(clauseId);
		if (!bucket) perSector.set(clauseId, (bucket = { A: [], B: [] }));
		bucket[side].push(statementId);
	}

	const offsetFor = (statementId: string, budget: number) => {
		const normalized = Math.pow(
			(analysis.weight.get(statementId) ?? 0) / analysis.peakStatementWeight,
			OFFSET_EXPONENT
		);
		return SEAM_CLEARANCE + normalized * Math.max(0, budget - SEAM_CLEARANCE);
	};

	/**
	 * Siblings of one sector share an angle to within a couple of degrees, so two of
	 * equal weight would overlap outright. Push them apart along the radius — a radial
	 * gap lower-bounds the distance between two points at any angle — keeping the
	 * heavier one further from the seam so the ordering still reads.
	 */
	const spreadSide = (clauseId: string, ids: string[], side: 'A' | 'B') => {
		if (ids.length === 0) return;
		const sector = sectorById.get(clauseId)!;
		const span = sector.endAngle - sector.startAngle;
		const budget = side === 'A' ? barBudgetA : barBudgetB;
		const placements = [...ids]
			.sort((a, b) => a.localeCompare(b))
			.map((id, i) => ({
				id,
				angle: sector.startAngle + span * ((i + 1) / (ids.length + 1)),
				offset: offsetFor(id, budget),
			}))
			.sort((a, b) => a.offset - b.offset);

		const gap =
			placements.length > 1
				? Math.min(minRadialGap, (budget - SEAM_CLEARANCE) / (placements.length - 1))
				: minRadialGap;
		for (let i = 1; i < placements.length; i += 1) {
			const floor = placements[i - 1].offset + gap;
			if (placements[i].offset < floor) placements[i].offset = floor;
		}
		// Pushing outward can run the tail past the territory; slide the group back in.
		const overflow = placements[placements.length - 1].offset - budget;
		if (overflow > 0) {
			const shift = Math.min(overflow, placements[0].offset - SEAM_CLEARANCE);
			if (shift > 0) for (const item of placements) item.offset -= shift;
		}

		for (const { id, angle, offset } of placements) {
			const distance = side === 'A' ? membraneRadius + offset : membraneRadius - offset;
			place(id, angle, distance, side === 'A' ? 'territoryA' : 'territoryB', side, clauseId);
		}
	};

	for (const [clauseId, bucket] of perSector) {
		spreadSide(clauseId, bucket.A, 'A');
		spreadSide(clauseId, bucket.B, 'B');
	}

	// Statements with no clause have no sector; ring them just inside the seam so they
	// stay visible without claiming a document position they do not have.
	for (const [i, id] of analysis.unplacedStatementIds.entries()) {
		const angle = -Math.PI / 2 + (TAU * i) / Math.max(1, analysis.unplacedStatementIds.length);
		place(id, angle, coreRadius + (membraneRadius - coreRadius) * 0.5, 'core', 'neutral', null);
	}

	// --- 3. The core: what neither party owns ---
	//
	// Conditions sit at the angle of the clause they belong to, fanned out among their
	// siblings — several conditions of one clause would otherwise stack on one point.
	const conditionsByClause = new Map<string, string[]>();
	const clauseOfCondition = new Map<string, string>();
	for (const chain of analysis.chains) {
		if (!chain.conditionClauseId) continue;
		clauseOfCondition.set(chain.conditionId, chain.conditionClauseId);
		const list = conditionsByClause.get(chain.conditionClauseId);
		if (list) list.push(chain.conditionId);
		else conditionsByClause.set(chain.conditionClauseId, [chain.conditionId]);
	}
	for (const [clauseId, ids] of conditionsByClause) {
		const sector = sectorById.get(clauseId);
		if (!sector) continue;
		const sorted = [...ids].sort((a, b) => a.localeCompare(b));
		for (const [i, id] of sorted.entries()) {
			const fan = ((i - (sorted.length - 1) / 2) * 2.6 * Math.PI) / 180;
			const ring = coreRadius * (0.42 + 0.52 * (((i * 0.37) % 1) + 0));
			place(id, sector.midAngle + fan, ring, 'core', 'neutral', clauseId);
		}
	}

	// Defined terms that couple two or more clauses. The rest are dropped: 94 of 111
	// single-clause terms would bury the couplers that make the core worth drawing.
	const midAnglesOf = (clauseIds: Iterable<string>) => {
		let x = 0;
		let y = 0;
		let n = 0;
		for (const clauseId of clauseIds) {
			const sector = sectorById.get(clauseId);
			if (!sector) continue;
			x += Math.cos(sector.midAngle);
			y += Math.sin(sector.midAngle);
			n += 1;
		}
		// Circular mean: averaging 350° and 10° has to land on 0°, not 180°.
		return n === 0 ? null : Math.atan2(y, x);
	};
	const usedBy = new Map<string, Set<string>>();
	for (const edge of kg.edges) {
		if (edge.type !== 'uses') continue;
		let set = usedBy.get(edge.target);
		if (!set) usedBy.set(edge.target, (set = new Set()));
		set.add(edge.source);
	}
	const peakReach = Math.max(2, ...[...usedBy.values()].map((s) => s.size));
	for (const [termId, clauseIds] of usedBy) {
		if (clauseIds.size < 2) continue;
		const angle = midAnglesOf(clauseIds);
		if (angle == null) continue;
		// Inverted: the more clauses a term couples, the closer to the centre it sits.
		const depth = (clauseIds.size - 2) / Math.max(1, peakReach - 2);
		place(termId, angle, coreRadius * (0.95 - 0.55 * depth), 'core', 'neutral', null);
	}

	// Untoned statements: outer core strip, at their own clause's angle.
	for (const [i, id] of coreStatements.entries()) {
		const clauseId = clauseOf.get(id) ?? null;
		const sector = clauseId ? sectorById.get(clauseId) : null;
		const angle = sector ? sector.midAngle : -Math.PI / 2 + (TAU * i) / coreStatements.length;
		place(id, angle, coreRadius * (0.72 + 0.24 * ((i * 0.41) % 1)), 'core', 'neutral', clauseId);
	}

	const chords: MembraneChord[] = analysis.chains
		.filter((chain) => chain.crossesClause)
		.map((chain) => ({ conditionId: chain.conditionId, gatedId: chain.gatedId }))
		.filter((chord) => positions.has(chord.conditionId) && positions.has(chord.gatedId));

	return {
		center,
		usable,
		coreRadius,
		membraneRadius,
		lambdaRadius,
		lambdaThickness: Math.max(6, usable * 0.03),
		outerRadius: usable * OUTER,
		sectors,
		sectorById,
		positions,
		chords,
	};
}
