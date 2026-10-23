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

const emptyCount = (): ClauseTally['count'] => ({
	obligation: { a: 0, b: 0 },
	right: { a: 0, b: 0 },
	prohibition: { a: 0, b: 0 },
});

/** A condition's operator as a reader would say it: «Only if», «Unless»… */
export function conditionLead(operator: string | null | undefined): string {
	const op = (operator || 'IF').toUpperCase();
	const lead: Record<string, string> = {
		IF: 'Only if',
		UPON: 'Only upon',
		UNLESS: 'Unless',
		UNTIL: 'Until',
	};
	return lead[op] ?? op;
}

export const sectionOf = (ref: string | null | undefined): string | null => {
	const number = ref?.replace(/^(?:section|article)\s+/i, '').trim();
	return number ? `§${number}` : null;
};

/** A paragraph's place in the document, from the number its id ends in. */
const paragraphNumber = (pid: string) => Number(pid.match(/-p-(\d+)$/)?.[1] ?? 0);

/** A numbered subclause without a title inherits the nearest named section heading. */
export function clauseTitle(
	clause: KgClause | undefined,
	fallback: string,
	clauses: KgClause[] = []
): { heading: string; section: string | null } {
	const section = sectionOf(clause?.ref);
	const namedHeading = (item: KgClause | undefined) => {
		const heading = item?.heading?.trim();
		return heading && !/^(?:§\s*|(?:section|article)\s+)?\d+(?:\.\d+)*[.)]?$/i.test(heading)
			? heading
			: null;
	};
	const heading = namedHeading(clause);
	if (heading) return { heading, section };
	const parts = section?.slice(1).split('.') ?? [];
	while (parts.length > 1) {
		parts.pop();
		const parent = clauses.find((c) => sectionOf(c.ref) === `§${parts.join('.')}`);
		const parentHeading = namedHeading(parent);
		if (parentHeading) return { heading: parentHeading, section };
	}
	return { heading: section ?? fallback, section: null };
}

/**
 * Who a statement in `lane` of the owner grid serves, and who has to honour it: a right
 * serves its holder, an obligation or prohibition the party on its other end, a reciprocal
 * statement both. Null when it serves neither of the two (owed to a third party, or to
 * nobody the contract names).
 */
export function creditOf(mark: GridMark, lane: GridLane): Pick<Served, 'to' | 'by'> | null {
	const other =
		mark.counterpartLane === 'a' || mark.counterpartLane === 'b' ? mark.counterpartLane : null;
	if (lane === 'shared') return { to: 'both', by: 'both' };
	if (mark.kind === 'right') return { to: lane, by: other };
	return other ? { to: other, by: lane } : null;
}

/**
 * Every deontic statement in the given lanes, credited to the party it favours:
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
			...clauseTitle(clauseOf.get(row.clauseId), row.heading, kg.clauses),
			served: [],
			count: emptyCount(),
		};
		for (const lane of lanes) {
			for (const mark of row.marks[lane]) {
				if (!DEONTIC_MARK_KINDS.includes(mark.kind)) continue;
				const kind = mark.kind as DeonticKind;
				const credit = creditOf(mark, lane);
				if (!credit) continue;
				const { to, by } = credit;
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

/** A clause's tally without some statements, recounted: the table's detail under «Only
 *  firm» leaves out the conditional ones, as its squares do. */
export function withoutServed(tally: ClauseTally, ids: ReadonlySet<string>): ClauseTally {
	const served = tally.served.filter((s) => !ids.has(s.mark.id));
	const count = emptyCount();
	for (const s of served) {
		if (s.to === 'both' || s.to === 'a') count[s.kind].a += 1;
		if (s.to === 'both' || s.to === 'b') count[s.kind].b += 1;
	}
	return { ...tally, served, count };
}

export const favourOf = ({ a, b }: Record<Side, number>): Favour =>
	a > b ? 'a' : b > a ? 'b' : 'tie';

/** Most important first when the importance has landed; document order until then. */
export function byImportance<T extends { clauseId: string }>(
	rows: T[],
	importance: Record<string, number> | null
): T[] {
	if (!importance) return rows;
	return rows.slice().sort((x, y) => (importance[y.clauseId] ?? 0) - (importance[x.clauseId] ?? 0));
}
