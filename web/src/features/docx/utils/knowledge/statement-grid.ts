import type { DeonticKind, KgDeonticNode, KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';

/**
 * The statement grid — one mark per statement, and nothing else.
 *
 * Position carries what the graph used to draw as edges: the row is the clause
 * (`is_part_of`, 92 edges on the reference contract) and the lane is the party
 * (`assigns_obligation_to` + `grants_right_to`, 63 more). 155 of 158 edges say
 * something the position already says, so none is drawn.
 *
 * A clause is a band, never a mark. Drawing it as both is what made a real user read
 * the clause node and the clause arc as two different things.
 */

/** Left lane, right lane, or the middle: statements that belong to neither side alone. */
export type GridLane = 'a' | 'b' | 'shared';

export const GRID_LANES: GridLane[] = ['a', 'b', 'shared'];

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
	kind: DeonticKind;
	lane: GridLane;
	/** Whoever the statement is really about: the obligor of a duty, the holder of a right. */
	ownerName: string | null;
	/**
	 * False only in the middle lane, and only when the contract names nobody at all —
	 * a passive "must be signed", or a duty whose obligor depends on a future fact
	 * ("the breaching party"). Those stay marked as unattributed; reciprocal ones do not.
	 */
	attributed: boolean;
	label: string;
	detail: string;
}

export interface GridRow {
	/** Null for the residue row that collects statements the extraction left unfiled. */
	clauseId: string | null;
	heading: string;
	marks: Record<GridLane, GridMark[]>;
	total: number;
}

export interface StatementGrid {
	rows: GridRow[];
	totals: Record<GridLane, number>;
	/** Statements with no clause of their own — an extraction gap, shown rather than dropped. */
	unfiled: number;
	/** Of the shared lane, how many name nobody — the only ones that are really a gap. */
	unattributed: number;
	/**
	 * Clauses that hold no statement at all. Dropped from `rows` — an empty band is a
	 * row of nothing — but counted, because the reason varies: Governing Law carries no
	 * duty by nature, while an empty operative clause is an extraction miss.
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

export function buildStatementGrid(
	kg: KnowledgeGraph,
	partyAId: string,
	partyBId: string | null
): StatementGrid {
	const partyName = new Map(kg.parties.map((p) => [p.id, p.name] as const));
	const emptyLanes = (): Record<GridLane, GridMark[]> => ({ a: [], b: [], shared: [] });

	const byClause = new Map<string, GridRow>();
	for (const clause of kg.clauses) {
		byClause.set(clause.id, {
			clauseId: clause.id,
			heading: clause.heading || clause.ref || clause.id,
			marks: emptyLanes(),
			total: 0,
		});
	}
	const unfiled: GridRow = {
		clauseId: null,
		heading: 'No clause assigned',
		marks: emptyLanes(),
		total: 0,
	};

	const totals: Record<GridLane, number> = { a: 0, b: 0, shared: 0 };
	let unattributed = 0;
	for (const statement of deonticNodes(kg)) {
		const ownerId = ownerIdOf(statement);
		const lane: GridLane = ownerId === partyAId ? 'a' : ownerId === partyBId ? 'b' : 'shared';
		const ownerName = ownerId ? (partyName.get(ownerId) ?? null) : null;
		const wording = `${ownerName ?? ''} ${statement.text ?? ''} ${statement.summary ?? ''}`;
		const attributed = lane !== 'shared' || RECIPROCAL.test(wording);
		if (!attributed) unattributed += 1;
		const row = (statement.clauseId && byClause.get(statement.clauseId)) || unfiled;
		row.marks[lane].push({
			id: statement.id,
			kind: statement.kind,
			lane,
			ownerName,
			attributed,
			label: statement.action || statement.kind,
			detail: statement.summary || statement.action || statement.text,
		});
		row.total += 1;
		totals[lane] += 1;
	}

	const filled = [...byClause.values()].filter((row) => row.total > 0);
	return {
		rows: unfiled.total > 0 ? [...filled, unfiled] : filled,
		totals,
		unfiled: unfiled.total,
		unattributed,
		emptyClauses: byClause.size - filled.length,
	};
}
