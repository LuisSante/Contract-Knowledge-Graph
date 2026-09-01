import type { KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';

/**
 * Radial clause map. The contract's own structure is the substrate: clauses become
 * sectors around a ring in document order, and everything else is placed inside the
 * sector it belongs to. Adapted from the Knowledge Map of GraphQAG (arXiv:2607.27182),
 * with two departures — the radius encodes attention *for the focused party* rather
 * than global importance, and the arc glyph carries burden/benefit rather than coverage.
 *
 * Layout rules:
 *   angle  — clause order in the document; sector width ∝ the clause's weight
 *   band   — nodes touching 2+ clauses sit inside the ring (they couple clauses),
 *            nodes living in a single clause sit outside it, within their sector
 *   radius — attention, inverted: the heavier a node, the closer to the centre
 *
 * Pure and deterministic: the same graph and scores always produce the same picture.
 */

/**
 * `node` is anything that inhabits the ring's interior; `clause` is the sector anchor
 * itself, on its own band against the ring.
 */
export type RadialBand = 'center' | 'node' | 'clause';

export interface RadialPosition {
	x: number;
	y: number;
	/** Radians, 0 = 3 o'clock, growing clockwise (SVG convention). */
	angle: number;
	/** Distance from the centre, in px. */
	distance: number;
	band: RadialBand;
	/** Clauses this node belongs to — empty for the centre and for orphans. */
	clauseIds: string[];
}

export interface RadialSector {
	clauseId: string;
	label: string;
	/** Rank in document order, 0-based. */
	order: number;
	/** Attention weight that earned it its angular width. */
	weight: number;
	startAngle: number;
	endAngle: number;
}

export interface RadialLayout {
	positions: Map<string, RadialPosition>;
	sectors: RadialSector[];
	center: { x: number; y: number };
	/** Radius of the outer ring, where the sector ticks are drawn. */
	ringRadius: number;
}

export interface RadialLayoutOptions {
	width: number;
	height: number;
	/** Attention per node id, 0..1. Missing means 0. */
	scores: Record<string, number>;
	/** Document position per paragraph id, used to order the clauses. */
	paragraphOrder: Map<string, number>;
	/** Node pinned at the centre — the focused party, when there is one. */
	centerNodeId?: string | null;
	/** Minimum radial separation between two nodes of the same sector, in px. */
	minRadialGap?: number;
}

/** Every clause keeps a sliver even at zero weight: absence is informative. */
const MIN_SECTOR_RAD = (1.4 * Math.PI) / 180;
const TAU = Math.PI * 2;

// Band extents as a fraction of the usable radius. One band for every interior node:
// how many clauses a node touches no longer moves it. The band is split in two — nodes
// that carry attention are placed by value in the inner part, and nodes with none are
// fanned out across the outer part. Mapping score 0 to a single radius is what turns
// the unscored majority — defined terms, conditions, values — into one dense necklace.
const NODE_INNER = 0.22;
const NODE_SCORED_OUTER = 0.74;
const NODE_UNSCORED_INNER = 0.77;
const NODE_OUTER = 0.85;
// Clauses anchor their sector rather than inhabit it, so they ring the outside on a
// band of their own. Each one owns a unique angle, which is why an unscored clause can
// share a radius with another without ever colliding.
const CLAUSE_INNER = 0.89;
const CLAUSE_OUTER = 0.94;

/** Ids of every node kind the graph draws, so orphans are not silently dropped. */
function allNodeIds(kg: KnowledgeGraph): string[] {
	return [
		...kg.parties.map((n) => n.id),
		...kg.clauses.map((n) => n.id),
		...kg.definedTerms.map((n) => n.id),
		...deonticNodes(kg).map((n) => n.id),
		...kg.conditions.map((n) => n.id),
		...kg.references.map((n) => n.id),
		...kg.values.map((n) => n.id),
	];
}

/**
 * Which clauses each node belongs to. A node reaches a clause directly, or through a
 * statement that lives in one — that second hop is what anchors conditions, values and
 * references, which only ever attach to the statement they qualify.
 */
function clauseMembership(kg: KnowledgeGraph): Map<string, Set<string>> {
	const isClause = new Set(kg.clauses.map((c) => c.id));
	const clauseOfStatement = new Map<string, string>();
	for (const statement of deonticNodes(kg)) {
		if (statement.clauseId) clauseOfStatement.set(statement.id, statement.clauseId);
	}

	const adjacency = new Map<string, Set<string>>();
	const link = (a: string, b: string) => {
		let set = adjacency.get(a);
		if (!set) adjacency.set(a, (set = new Set()));
		set.add(b);
	};
	for (const edge of kg.edges) {
		link(edge.source, edge.target);
		link(edge.target, edge.source);
	}

	const membership = new Map<string, Set<string>>();
	for (const id of allNodeIds(kg)) {
		if (isClause.has(id)) {
			membership.set(id, new Set([id]));
			continue;
		}
		const clauses = new Set<string>();
		const own = clauseOfStatement.get(id);
		if (own) clauses.add(own);
		for (const neighbour of adjacency.get(id) ?? []) {
			if (isClause.has(neighbour)) clauses.add(neighbour);
			const viaStatement = clauseOfStatement.get(neighbour);
			if (viaStatement) clauses.add(viaStatement);
		}
		membership.set(id, clauses);
	}
	return membership;
}

/**
 * Mean of angles on the circle. Averaging 350° and 10° has to land on 0°, not 180°,
 * so the angles are summed as unit vectors rather than as numbers.
 */
function circularMean(angles: number[]): number {
	let x = 0;
	let y = 0;
	for (const angle of angles) {
		x += Math.cos(angle);
		y += Math.sin(angle);
	}
	if (x === 0 && y === 0) return 0;
	const mean = Math.atan2(y, x);
	return mean < 0 ? mean + TAU : mean;
}

/** Attention 0..1 mapped into a band, inverted: heavier means closer to the centre. */
function bandDistance(score: number, inner: number, outer: number, usable: number): number {
	const clamped = Math.min(1, Math.max(0, score));
	return usable * (outer - clamped * (outer - inner));
}

/**
 * Radius for one node of a band. Scored nodes are placed by value; the rest are fanned
 * evenly across the band's outer strip by their rank among their unscored siblings, so
 * that "no attention" reads as a spread rather than as a single stacked circle.
 */
function radiusFor(
	score: number,
	rankAmongUnscored: number,
	unscoredCount: number,
	band: { inner: number; scoredOuter: number; unscoredInner: number; outer: number },
	usable: number
): number {
	if (score > 0) return bandDistance(score, band.inner, band.scoredOuter, usable);
	const step = (rankAmongUnscored + 0.5) / Math.max(1, unscoredCount);
	return usable * (band.unscoredInner + (band.outer - band.unscoredInner) * step);
}

const NODE_BAND = {
	inner: NODE_INNER,
	scoredOuter: NODE_SCORED_OUTER,
	unscoredInner: NODE_UNSCORED_INNER,
	outer: NODE_OUTER,
};

export function computeRadialLayout(
	kg: KnowledgeGraph,
	options: RadialLayoutOptions
): RadialLayout {
	const {
		width,
		height,
		scores,
		paragraphOrder,
		centerNodeId = null,
		// Two statement nodes are 5.5px each, so 13 leaves a visible gap between them.
		minRadialGap = 13,
	} = options;
	const center = { x: width / 2, y: height / 2 };
	const usable = Math.max(1, Math.min(width, height) / 2 - 28);

	// 1. Clauses in document order.
	//
	// The median paragraph, not the first: extraction anchors a clause to every
	// paragraph that mentions it, including forward references from the definitions
	// article ("'Firm Zone' shall have the meaning provided in Section 5.1(a)"). Taking
	// the minimum lets one such stray drag a late clause to the front of the ring —
	// Section 15.1 lands on paragraph 42 by first-mention but on 191 by median.
	const orderOf = (paragraphIds: string[]): number => {
		const positions = paragraphIds
			.map((pid) => paragraphOrder.get(pid))
			.filter((position): position is number => position != null)
			.sort((a, b) => a - b);
		// Clauses with no resolvable paragraph sink to the end, ordered by id for stability.
		if (positions.length === 0) return Number.MAX_SAFE_INTEGER;
		const mid = Math.floor(positions.length / 2);
		return positions.length % 2 === 0
			? (positions[mid - 1] + positions[mid]) / 2
			: positions[mid];
	};
	const ordered = kg.clauses
		.map((clause) => ({
			clause,
			position: orderOf(clause.paragraphIds),
			weight: Math.max(0, scores[clause.id] ?? 0),
		}))
		.sort((a, b) =>
			a.position !== b.position
				? a.position - b.position
				: a.clause.id.localeCompare(b.clause.id)
		);

	// 2. Angular budget: a floor for everyone, the rest shared out by weight.
	const totalWeight = ordered.reduce((sum, item) => sum + item.weight, 0);
	const floorTotal = MIN_SECTOR_RAD * ordered.length;
	const spare = Math.max(0, TAU - floorTotal);
	const equalShare = ordered.length > 0 ? TAU / ordered.length : TAU;

	const sectors: RadialSector[] = [];
	const sectorById = new Map<string, RadialSector>();
	let cursor = -Math.PI / 2; // start at 12 o'clock, like a document read top-down
	for (const [index, item] of ordered.entries()) {
		// No weight anywhere (or no room for floors) => fall back to equal sectors.
		const span =
			floorTotal >= TAU || totalWeight <= 0
				? equalShare
				: MIN_SECTOR_RAD + (item.weight / totalWeight) * spare;
		const sector: RadialSector = {
			clauseId: item.clause.id,
			label: item.clause.ref || item.clause.heading || item.clause.id,
			order: index,
			weight: item.weight,
			startAngle: cursor,
			endAngle: cursor + span,
		};
		sectors.push(sector);
		sectorById.set(sector.clauseId, sector);
		cursor += span;
	}

	const midAngle = (sector: RadialSector) => (sector.startAngle + sector.endAngle) / 2;

	// 3. Split the nodes: clause anchors, then the rest by how many clauses they touch.
	const membership = clauseMembership(kg);
	const isClause = new Set(kg.clauses.map((c) => c.id));
	const bySector = new Map<string, string[]>();
	const multiClause: string[] = [];
	const orphans: string[] = [];

	for (const id of allNodeIds(kg)) {
		if (id === centerNodeId || isClause.has(id)) continue;
		const clauses = [...(membership.get(id) ?? [])].filter((c) => sectorById.has(c));
		if (clauses.length === 0) orphans.push(id);
		else if (clauses.length === 1) {
			const list = bySector.get(clauses[0]);
			if (list) list.push(id);
			else bySector.set(clauses[0], [id]);
		} else multiClause.push(id);
	}

	const positions = new Map<string, RadialPosition>();
	const place = (
		id: string,
		angle: number,
		distance: number,
		band: RadialBand,
		clauseIds: string[]
	) => {
		positions.set(id, {
			x: center.x + Math.cos(angle) * distance,
			y: center.y + Math.sin(angle) * distance,
			angle,
			distance,
			band,
			clauseIds,
		});
	};

	if (centerNodeId) place(centerNodeId, 0, 0, 'center', []);

	// Clause anchors: dead centre of their own sector, on the band against the ring.
	for (const sector of sectors) {
		if (sector.clauseId === centerNodeId) continue;
		const distance = bandDistance(
			scores[sector.clauseId] ?? 0,
			CLAUSE_INNER,
			CLAUSE_OUTER,
			usable
		);
		place(sector.clauseId, midAngle(sector), distance, 'clause', [sector.clauseId]);
	}

	/**
	 * Rank of each unscored id, for the fan-out. Ranked across the whole band rather
	 * than per sector: most sectors hold one or two nodes, and ranking inside them puts
	 * every singleton at the same mid-band fraction — the stacking this exists to avoid.
	 * For a node with no attention the radius carries no meaning anyway, so the only
	 * job left is separation.
	 */
	const unscoredRanks = (ids: string[]) => {
		const unscored = ids.filter((id) => !((scores[id] ?? 0) > 0)).sort((a, b) => a.localeCompare(b));
		return { index: new Map(unscored.map((id, i) => [id, i] as const)), count: unscored.length };
	};

	// One ranking across every interior node, scored or not — there is only one band now.
	const nodeRanks = unscoredRanks([...multiClause, ...[...bySector.values()].flat()]);

	// A node in several clauses has no sector of its own, so it is angled at the circular
	// mean of the ones it bridges. That is an angle rule, not a radius one: it sits in the
	// same band as everything else.
	for (const id of multiClause) {
		const clauses = [...(membership.get(id) ?? [])].filter((c) => sectorById.has(c));
		const angle = circularMean(clauses.map((c) => midAngle(sectorById.get(c)!)));
		const distance = radiusFor(
			scores[id] ?? 0,
			nodeRanks.index.get(id) ?? 0,
			nodeRanks.count,
			NODE_BAND,
			usable
		);
		place(id, angle, distance, 'node', clauses);
	}

	// Single-clause nodes: angle from their own sector.
	const bandSpan = usable * (NODE_OUTER - NODE_INNER);
	for (const [clauseId, members] of bySector) {
		const sector = sectorById.get(clauseId)!;
		const span = sector.endAngle - sector.startAngle;
		const sorted = [...members].sort((a, b) => a.localeCompare(b));

		const angleOf = new Map<string, number>();
		const placements = sorted.map((id, index) => {
			angleOf.set(id, sector.startAngle + span * ((index + 1) / (sorted.length + 1)));
			return {
				id,
				distance: radiusFor(
					scores[id] ?? 0,
					nodeRanks.index.get(id) ?? 0,
					nodeRanks.count,
					NODE_BAND,
					usable
				),
			};
		});

		// Siblings that share a score land on the same radius, and a 1.4° sector leaves
		// only a few px of arc between them — three prohibitions of Section 2.2 came out
		// 3.4px apart with radii of 5.5. Push them outward in score order so the heavier
		// of a tie still reads as the inner one, compressing if the band runs out.
		placements.sort((a, b) => a.distance - b.distance);
		const gap =
			placements.length > 1
				? Math.min(minRadialGap, bandSpan / (placements.length - 1))
				: minRadialGap;
		for (let i = 1; i < placements.length; i += 1) {
			const floor = placements[i - 1].distance + gap;
			if (placements[i].distance < floor) placements[i].distance = floor;
		}
		// Pushing outward can run the tail past the band and into the clause ring, so
		// slide the whole group back in — the gaps are what matter, not the offset.
		const overflow = placements[placements.length - 1].distance - usable * NODE_OUTER;
		if (overflow > 0) {
			const shift = Math.min(overflow, placements[0].distance - usable * NODE_INNER);
			if (shift > 0) for (const item of placements) item.distance -= shift;
		}

		for (const { id, distance } of placements) {
			place(id, angleOf.get(id)!, distance, 'node', [clauseId]);
		}
	}

	// Orphans have no clause to sit in; ring them just outside so they stay visible.
	for (const [index, id] of orphans.sort((a, b) => a.localeCompare(b)).entries()) {
		const angle = -Math.PI / 2 + (TAU * index) / Math.max(1, orphans.length);
		place(id, angle, usable * NODE_OUTER, 'node', []);
	}

	return {
		positions,
		sectors,
		center,
		ringRadius: usable * 0.96,
	};
}
