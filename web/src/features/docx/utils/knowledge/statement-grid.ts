import type { DeonticKind, KgDeonticNode, KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';

/**
 * The entity grid — one mark per entity, and nothing else.
 *
 * Position carries what the graph used to draw as edges: the row is the clause
 * (`is_part_of`, 92 edges on the reference contract) and the lane is the party
 * (`assigns_obligation_to` + `grants_right_to`, 63 more). 155 of 158 edges say
 * something the position already says, so none is drawn.
 *
 * A clause is a band and a party is a lane, so neither is ever a mark. Drawing the
 * clause as both is what made a real user read the clause node and the clause arc as
 * two different things.
 */

/** Left lane, right lane, or the middle: entities that belong to neither side alone. */
export type GridLane = 'a' | 'b' | 'shared';

export const GRID_LANES: GridLane[] = ['a', 'b', 'shared'];

/**
 * What can be a mark. Party and clause are deliberately absent — they are the lane and
 * the row. The four qualifiers are off by default: they describe a statement rather
 * than assert one, so they read as a layer on top of the deontic one, not beside it.
 */
export type MarkKind = DeonticKind | 'condition' | 'value' | 'definedTerm' | 'reference';

export const DEONTIC_MARK_KINDS: MarkKind[] = ['obligation', 'right', 'prohibition'];
export const QUALIFIER_MARK_KINDS: MarkKind[] = ['condition', 'value', 'definedTerm', 'reference'];
export const MARK_KINDS: MarkKind[] = [...DEONTIC_MARK_KINDS, ...QUALIFIER_MARK_KINDS];

/**
 * A bilateral provision names no party because it binds both, and `burdenPartyId` — a
 * pointer to one party node — has no way to say so. Six statements do point at the
 * party literally called "each Party"; the rest leave the field null, which reads
 * exactly like a failed extraction. This recovers them from the wording the contract
 * itself uses, so a reciprocal duty is not filed as a defect.
 *
 * It is a display-time repair, not a fix: the extraction should be pointing all of
 * them at the "each Party" node.
 */
const RECIPROCAL = /\b(?:each|either|both)\s+part(?:y|ies)\b|\bthe other(?:'s)?\b/i;

export interface GridMark {
	id: string;
	kind: MarkKind;
	lane: GridLane;
	/** Whoever the statement is really about: the obligor of a duty, the holder of a right. */
	ownerName: string | null;
	label: string;
	detail: string;
}

export interface GridRow {
	/** Null for the residue row that collects entities the extraction left unfiled. */
	clauseId: string | null;
	heading: string;
	marks: Record<GridLane, GridMark[]>;
	total: number;
}

export interface StatementGrid {
	rows: GridRow[];
	totals: Record<GridLane, number>;
	countByKind: Record<MarkKind, number>;
	/** Entities with no clause of their own — an extraction gap, shown rather than dropped. */
	unfiled: number;
	/**
	 * Statements the contract attributes to nobody at all — a passive "must be signed",
	 * or a duty whose obligor depends on a future fact ("the breaching party"). They are
	 * counted but never placed: a mark for them would be a mark nobody can act on.
	 * Reciprocal provisions are not these — they name both sides on purpose.
	 */
	unattributed: number;
	/**
	 * Clauses that hold nothing at all. Dropped from `rows` — an empty band is a row of
	 * nothing — but counted, because the reason varies: Governing Law carries no duty by
	 * nature, while an empty operative clause is an extraction miss.
	 */
	emptyClauses: number;
}

/**
 * A duty binds whoever must perform it; a right belongs to whoever may exercise it.
 * Reading both off `burdenPartyId` would file every right under the party it constrains.
 */
function ownerIdOf(statement: KgDeonticNode): string | null {
	return statement.kind === 'right' ? statement.benefitPartyId : statement.burdenPartyId;
}

/** Where a mark sits, so a qualifier can inherit it from whatever it qualifies. */
interface Anchor {
	clauseId: string | null;
	lane: GridLane;
}

export function buildStatementGrid(
	kg: KnowledgeGraph,
	partyAId: string,
	partyBId: string | null
): StatementGrid {
	const partyName = new Map(kg.parties.map((p) => [p.id, p.name] as const));
	const emptyLanes = (): Record<GridLane, GridMark[]> => ({ a: [], b: [], shared: [] });

	const byClause = new Map<string, GridRow>();
	const clauseOfParagraph = new Map<string, string>();
	for (const clause of kg.clauses) {
		byClause.set(clause.id, {
			clauseId: clause.id,
			heading: clause.heading || clause.ref || clause.id,
			marks: emptyLanes(),
			total: 0,
		});
		for (const pid of clause.paragraphIds) {
			if (!clauseOfParagraph.has(pid)) clauseOfParagraph.set(pid, clause.id);
		}
	}
	const unfiled: GridRow = {
		clauseId: null,
		heading: 'No clause assigned',
		marks: emptyLanes(),
		total: 0,
	};

	const countByKind = Object.fromEntries(MARK_KINDS.map((kind) => [kind, 0])) as Record<
		MarkKind,
		number
	>;
	const totals: Record<GridLane, number> = { a: 0, b: 0, shared: 0 };
	let unattributed = 0;

	const place = (mark: GridMark, clauseId: string | null) => {
		const row = (clauseId && byClause.get(clauseId)) || unfiled;
		row.marks[mark.lane].push(mark);
		row.total += 1;
		totals[mark.lane] += 1;
		countByKind[mark.kind] += 1;
	};

	// Pass 1 — the statements. Everything else hangs off one of these.
	const anchorOf = new Map<string, Anchor>();
	for (const statement of deonticNodes(kg)) {
		const ownerId = ownerIdOf(statement);
		const lane: GridLane = ownerId === partyAId ? 'a' : ownerId === partyBId ? 'b' : 'shared';
		const ownerName = ownerId ? (partyName.get(ownerId) ?? null) : null;
		const wording = `${ownerName ?? ''} ${statement.text ?? ''} ${statement.summary ?? ''}`;
		if (lane === 'shared' && !RECIPROCAL.test(wording)) {
			unattributed += 1;
			continue;
		}
		const clauseId =
			statement.clauseId && byClause.has(statement.clauseId) ? statement.clauseId : null;
		anchorOf.set(statement.id, { clauseId, lane });
		place(
			{
				id: statement.id,
				kind: statement.kind,
				lane,
				ownerName,
				label: statement.action || statement.kind,
				detail: statement.summary || statement.action || statement.text,
			},
			clauseId
		);
	}

	// Pass 2 — the qualifiers. Each inherits the position of whatever it qualifies, so a
	// condition sits with the right it gates instead of floating in a lane of its own.
	// The paragraph fallback is what rescues the 22 defined terms, every one of which
	// has a null `definedInClauseId`.
	const anchorFor = (targetId: string | null, paragraphIds: string[]): Anchor => {
		const viaTarget = targetId ? anchorOf.get(targetId) : undefined;
		if (viaTarget) return viaTarget;
		if (targetId && byClause.has(targetId)) return { clauseId: targetId, lane: 'shared' };
		for (const pid of paragraphIds) {
			const clauseId = clauseOfParagraph.get(pid);
			if (clauseId) return { clauseId, lane: 'shared' };
		}
		return { clauseId: null, lane: 'shared' };
	};

	const addQualifier = (
		id: string,
		kind: MarkKind,
		targetId: string | null,
		paragraphIds: string[],
		label: string,
		detail: string
	) => {
		const anchor = anchorFor(targetId, paragraphIds);
		place(
			{ id, kind, lane: anchor.lane, ownerName: null, label, detail },
			anchor.clauseId
		);
	};

	for (const condition of kg.conditions) {
		const operator = condition.operator || 'IF';
		addQualifier(
			condition.id,
			'condition',
			condition.gatesId,
			condition.paragraphIds,
			operator,
			`${operator} ${condition.trigger}`
		);
	}
	for (const value of kg.values) {
		const label = [value.amount, value.unit].filter(Boolean).join(' ');
		addQualifier(
			value.id,
			'value',
			value.quantifiesId,
			value.paragraphIds,
			label,
			`${label}${value.valueType ? ` — ${value.valueType}` : ''}`
		);
	}
	for (const term of kg.definedTerms) {
		addQualifier(
			term.id,
			'definedTerm',
			term.definedInClauseId,
			term.paragraphIds,
			term.term,
			`${term.term}${term.definition ? ` — ${term.definition}` : ''}`
		);
	}
	for (const reference of kg.references) {
		addQualifier(
			reference.id,
			'reference',
			reference.citedById,
			reference.paragraphIds,
			reference.name,
			[reference.name, reference.citation].filter(Boolean).join(' ')
		);
	}

	const filled = [...byClause.values()].filter((row) => row.total > 0);
	return {
		rows: unfiled.total > 0 ? [...filled, unfiled] : filled,
		totals,
		countByKind,
		unfiled: unfiled.total,
		unattributed,
		emptyClauses: byClause.size - filled.length,
	};
}
