import type { DeonticKind, KgDeonticNode, KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';

/**
 * One mark per entity, placed by clause (the row) and party (the lane). No edges are
 * drawn: the position already says what they would. See docs/ontologia/esquema.md.
 */

/** Left lane, right lane, or the middle: entities that belong to neither side alone. */
export type GridLane = 'a' | 'b' | 'shared';

export const GRID_LANES: GridLane[] = ['a', 'b', 'shared'];

/** Party and clause are absent on purpose: they are the lane and the row. */
export type MarkKind = DeonticKind | 'condition' | 'value' | 'definedTerm' | 'reference';

export const DEONTIC_MARK_KINDS: MarkKind[] = ['obligation', 'right', 'prohibition'];
const QUALIFIER_KINDS: MarkKind[] = ['condition', 'value', 'definedTerm', 'reference'];
export const MARK_KINDS: MarkKind[] = [...DEONTIC_MARK_KINDS, ...QUALIFIER_KINDS];

/**
 * A bilateral provision leaves `burdenPartyId` null, which reads like a failed
 * extraction. Recovering it from the wording is a display-time repair: the extraction
 * should be pointing these at the "each Party" node.
 */
const RECIPROCAL = /\b(?:each|either|both)\s+part(?:y|ies)\b|\bthe other(?:'s)?\b/i;

export interface GridMark {
	id: string;
	kind: MarkKind;
	lane: GridLane;
	/** Whoever the statement is really about: the obligor of a duty, the holder of a right. */
	ownerName: string | null;
	/** The other end of the provision; null when the contract names only one side. */
	counterpartLane: GridLane | null;
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
	countByKind: Record<MarkKind, number>;
	/** Entities with no clause of their own — an extraction gap, shown rather than dropped. */
	unfiled: number;
}

/** Reading both off `burdenPartyId` would file every right under the party it constrains. */
function ownerIdOf(statement: KgDeonticNode): string | null {
	return statement.kind === 'right' ? statement.benefitPartyId : statement.burdenPartyId;
}

/** The party at the other end: the beneficiary of a duty, the one bound by a right. */
function counterpartIdOf(statement: KgDeonticNode): string | null {
	return statement.kind === 'right' ? statement.burdenPartyId : statement.benefitPartyId;
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

	const place = (mark: GridMark, clauseId: string | null) => {
		const row = (clauseId && byClause.get(clauseId)) || unfiled;
		row.marks[mark.lane].push(mark);
		row.total += 1;
		countByKind[mark.kind] += 1;
	};

	// Pass 1 — the statements. Everything else hangs off one of these.
	const anchorOf = new Map<string, Anchor>();
	for (const statement of deonticNodes(kg)) {
		const ownerId = ownerIdOf(statement);
		const lane: GridLane = ownerId === partyAId ? 'a' : ownerId === partyBId ? 'b' : 'shared';
		const ownerName = ownerId ? (partyName.get(ownerId) ?? null) : null;
		const wording = `${ownerName ?? ''} ${statement.text ?? ''} ${statement.summary ?? ''}`;
		// The contract attributes it to nobody: a mark for it would be one nobody can act on.
		if (lane === 'shared' && !RECIPROCAL.test(wording)) continue;
		const clauseId =
			statement.clauseId && byClause.has(statement.clauseId) ? statement.clauseId : null;
		anchorOf.set(statement.id, { clauseId, lane });
		const counterpartId = counterpartIdOf(statement);
		const counterpart: GridLane | null =
			counterpartId === partyAId ? 'a' : counterpartId === partyBId ? 'b' : null;
		place(
			{
				id: statement.id,
				kind: statement.kind,
				lane,
				ownerName,
				counterpartLane: counterpart === lane ? null : counterpart,
				label: statement.action || statement.kind,
				detail: statement.summary || statement.action || statement.text,
			},
			clauseId
		);
	}

	// Pass 2 — the qualifiers, each inheriting the position of whatever it qualifies. The
	// paragraph fallback rescues the defined terms, whose `definedInClauseId` is never set.
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
			{ id, kind, lane: anchor.lane, ownerName: null, counterpartLane: null, label, detail },
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
		countByKind,
		unfiled: unfiled.total,
	};
}
