import type { KgDeontic, KnowledgeGraph } from '@/types/knowledge';
import { finePrint, overlap, termOf, tokens } from '@/features/docx/utils/knowledge/fine-print';
import type { Side } from '@/features/docx/utils/knowledge/statement-grid';

// Only what either party could plausibly hold. Making, delivering and paying are the
// roles themselves: pairing them would flag half the contract as a gap.
const FAMILIES = [
	{ id: 'renewal', rx: /renew|extend (?:the )?term/i },
	{ id: 'exit', rx: /terminat|cancel the agreement/i },
	{ id: 'assign', rx: /assign|transfer|pledge|security interest/i },
	{ id: 'audit', rx: /audit|inspect/i },
	{ id: 'liability', rx: /liab|indemn|damages|injunct|equitable relief/i },
] as const;

// Fine print that decides who is favoured; the rest is shown but does not split a pair.
const DECISIVE = new Set(['sole discretion', 'without cause', 'needs consent', 'capped']);

/** Dice overlap of the action words, party names left out. */
const MATCH = 0.5;

export interface Hold {
	s: KgDeontic;
	/** Fine print found in the text, plus the notice period or deadline. */
	marks: string[];
	term: string | null;
}

/** same: folded like a diff's unchanged lines · fine: same power, different fine print. */
export type DiffStatus = 'same' | 'fine' | 'onlyA' | 'onlyB';

export interface DiffRow {
	id: string;
	a: Hold | null;
	b: Hold | null;
	status: DiffStatus;
	/** The clauses either side of the pair sits in. */
	clauseIds: string[];
}

export interface PartyDiff {
	rows: DiffRow[];
	counts: Record<DiffStatus, number>;
	byClause: Map<string, DiffRow[]>;
}

const familyOf = (s: KgDeontic) =>
	FAMILIES.find((f) => f.rx.test(`${s.action} ${s.summary}`))?.id ?? null;

const hold = (s: KgDeontic): Hold => {
	const term = termOf(s);
	return { s, marks: finePrint(s.text ?? ''), term };
};

/** The rights both parties could hold, paired across the two sides. */
export function buildPartyDiff(kg: KnowledgeGraph, aId: string, bId: string): PartyDiff {
	const names = kg.parties
		.filter((p) => p.id === aId || p.id === bId)
		.flatMap((p) => [p.name, ...p.aliases]);
	const bag = new Map<string, Set<string>>();
	const bagOf = (s: KgDeontic) => {
		let words = bag.get(s.id);
		if (!words) bag.set(s.id, (words = tokens(`${s.action} ${s.summary}`, names)));
		return words;
	};
	const clausesOf = (...holds: Array<Hold | null>) =>
		[...new Set(holds.map((h) => h?.s.clauseId).filter(Boolean))] as string[];

	const rows: DiffRow[] = [];
	for (const family of FAMILIES) {
		const own = (partyId: string) =>
			kg.rights.filter((r) => r.benefitPartyId === partyId && familyOf(r) === family.id);
		const as = own(aId);
		const bs = own(bId);

		const pairs = as
			.flatMap((x) => bs.map((y) => ({ x, y, score: overlap(bagOf(x), bagOf(y)) })))
			.sort((p, q) => q.score - p.score);
		const usedA = new Set<string>();
		const usedB = new Set<string>();
		for (const { x, y, score } of pairs) {
			if (score < MATCH || usedA.has(x.id) || usedB.has(y.id)) continue;
			usedA.add(x.id);
			usedB.add(y.id);
			const a = hold(x);
			const b = hold(y);
			const split =
				a.term !== b.term ||
				[...a.marks, ...b.marks].some(
					(m) => DECISIVE.has(m) && !(a.marks.includes(m) && b.marks.includes(m))
				);
			rows.push({
				id: `${x.id}~${y.id}`,
				a,
				b,
				status: split ? 'fine' : 'same',
				clauseIds: clausesOf(a, b),
			});
		}
		for (const s of as)
			if (!usedA.has(s.id))
				rows.push({
					id: s.id,
					a: hold(s),
					b: null,
					status: 'onlyA',
					clauseIds: clausesOf(hold(s)),
				});
		for (const s of bs)
			if (!usedB.has(s.id))
				rows.push({
					id: s.id,
					a: null,
					b: hold(s),
					status: 'onlyB',
					clauseIds: clausesOf(hold(s)),
				});
	}

	const counts: Record<DiffStatus, number> = { same: 0, fine: 0, onlyA: 0, onlyB: 0 };
	const byClause = new Map<string, DiffRow[]>();
	for (const row of rows) {
		counts[row.status] += 1;
		for (const clauseId of row.clauseIds) {
			const list = byClause.get(clauseId) ?? [];
			list.push(row);
			byClause.set(clauseId, list);
		}
	}
	return { rows, counts, byClause };
}

/** The side that holds nothing in a gap row: where the hatched slot is drawn. */
export const missingSide = (row: DiffRow): Side | null =>
	row.status === 'onlyA' ? 'b' : row.status === 'onlyB' ? 'a' : null;
