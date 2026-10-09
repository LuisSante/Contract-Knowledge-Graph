import type { DeonticKind, KgClause, KnowledgeGraph } from '@/types/knowledge';
import {
	DEONTIC_MARK_KINDS,
	type GridLane,
	type GridMark,
	type Side,
	type StatementGrid,
} from '@/features/docx/utils/knowledge/statement-grid';

export const DEONTIC_KINDS: DeonticKind[] = ['obligation', 'right', 'prohibition'];

/** One statement, credited to the party it serves. */
export interface Served {
	mark: GridMark;
	kind: DeonticKind;
	/** The party it serves; a reciprocal statement serves both. */
	to: Side | 'both';
	/** The party that has to honour it, when it is one of the two. */
	by: Side | 'both' | null;
	/** The contract's own words for it. */
	text: string;
	/** Which of its clause's paragraphs holds it, from 1; null when the clause is a single
	 *  paragraph or the statement sits outside it. */
	paragraph: number | null;
}

export interface ClauseTally {
	clauseId: string;
	heading: string;
	/** "§7.2", or null when the extraction found no number. */
	section: string | null;
	served: Served[];
	count: Record<DeonticKind, Record<Side, number>>;
}

/** Who a count favours: the larger side, or a tie. */
export type Favour = Side | 'tie';

/** Per type, without weights: a side wins only if it loses in no type. */
export type TypeVerdict = Favour | 'mixed';

const emptyCount = (): ClauseTally['count'] => ({
	obligation: { a: 0, b: 0 },
	right: { a: 0, b: 0 },
	prohibition: { a: 0, b: 0 },
});

export const sectionOf = (ref: string | null | undefined): string | null => {
	const number = ref?.replace(/^(?:section|article)\s+/i, '').trim();
	return number ? `§${number}` : null;
};

/** A paragraph's place in the document, from the number its id ends in. */
const paragraphNumber = (pid: string) => Number(pid.match(/-p-(\d+)$/)?.[1] ?? 0);

/** A clause's name and number; one with no heading goes by its number alone. */
export function clauseTitle(
	clause: KgClause | undefined,
	fallback: string
): { heading: string; section: string | null } {
	const section = sectionOf(clause?.ref);
	const heading = clause?.heading?.trim();
	return heading ? { heading, section } : { heading: section ?? fallback, section: null };
}

/**
 * Every deontic statement in the given lanes, credited the way the share bar credits it:
 * a right to its holder, an obligation or prohibition to the party on its other end, a
 * reciprocal statement to both. Each one counts once; nothing is weighted. By default only
 * the two parties' lanes: the extraction writes a reciprocal provision as one copy per
 * party, so the shared lane is almost always empty.
 */
export function tallyClauses(
	grid: StatementGrid,
	kg: KnowledgeGraph,
	lanes: GridLane[] = ['a', 'b']
): ClauseTally[] {
	const clauseOf = new Map(kg.clauses.map((c) => [c.id, c] as const));
	const statements = [...kg.obligations, ...kg.rights, ...kg.prohibitions];
	const textOf = new Map(statements.map((s) => [s.id, s.text] as const));
	const paragraphOf = new Map(statements.map((s) => [s.id, s.paragraphIds[0]] as const));
	const out: ClauseTally[] = [];
	for (const row of grid.rows) {
		if (!row.clauseId) continue;
		const inClause = [...(clauseOf.get(row.clauseId)?.paragraphIds ?? [])].sort(
			(x, y) => paragraphNumber(x) - paragraphNumber(y)
		);
		const paragraphIn = (statementId: string) => {
			const at = inClause.indexOf(paragraphOf.get(statementId) ?? '');
			return inClause.length > 1 && at >= 0 ? at + 1 : null;
		};
		const tally: ClauseTally = {
			clauseId: row.clauseId,
			...clauseTitle(clauseOf.get(row.clauseId), row.heading),
			served: [],
			count: emptyCount(),
		};
		for (const lane of lanes) {
			for (const mark of row.marks[lane]) {
				if (!DEONTIC_MARK_KINDS.includes(mark.kind)) continue;
				const kind = mark.kind as DeonticKind;
				let to: Served['to'];
				let by: Served['by'];
				if (lane === 'shared') {
					to = 'both';
					by = 'both';
				} else if (kind === 'right') {
					to = lane;
					by =
						mark.counterpartLane === 'a' || mark.counterpartLane === 'b'
							? mark.counterpartLane
							: null;
				} else {
					if (mark.counterpartLane !== 'a' && mark.counterpartLane !== 'b') continue;
					to = mark.counterpartLane;
					by = lane;
				}
				tally.served.push({
					mark,
					kind,
					to,
					by,
					text: textOf.get(mark.id) || mark.detail,
					paragraph: paragraphIn(mark.id),
				});
				if (to === 'both' || to === 'a') tally.count[kind].a += 1;
				if (to === 'both' || to === 'b') tally.count[kind].b += 1;
			}
		}
		if (tally.served.length > 0) out.push(tally);
	}
	return out;
}

export const favourOf = ({ a, b }: Record<Side, number>): Favour =>
	a > b ? 'a' : b > a ? 'b' : 'tie';

/** Adds every clause's counts into one, for the whole contract. */
export function totalOf(tallies: ClauseTally[]): ClauseTally['count'] {
	const total = emptyCount();
	for (const t of tallies)
		for (const kind of DEONTIC_KINDS) {
			total[kind].a += t.count[kind].a;
			total[kind].b += t.count[kind].b;
		}
	return total;
}

/**
 * The verdict that holds whatever weight each type is given: a side wins if it wins in
 * some type and loses in none. Winning one type and losing another is "mixed" — choosing
 * between them would mean weighting them.
 */
export function typeVerdict(
	count: ClauseTally['count'],
	kinds: DeonticKind[] = DEONTIC_KINDS
): {
	verdict: TypeVerdict;
	/** Only the kinds asked about: a kind left out cannot win or lose. */
	byKind: Partial<Record<DeonticKind, Favour>>;
} {
	const byKind: Partial<Record<DeonticKind, Favour>> = Object.fromEntries(
		kinds.map((kind) => [kind, favourOf(count[kind])])
	);
	const won = new Set(Object.values(byKind).filter((f) => f !== 'tie'));
	const verdict: TypeVerdict = won.size === 0 ? 'tie' : won.size === 2 ? 'mixed' : [...won][0];
	return { verdict, byKind };
}

/** Most important first when the importance has landed; document order until then. */
export function byImportance<T extends { clauseId: string }>(
	rows: T[],
	importance: Record<string, number> | null
): T[] {
	if (!importance) return rows;
	return rows.slice().sort((x, y) => (importance[y.clauseId] ?? 0) - (importance[x.clauseId] ?? 0));
}
