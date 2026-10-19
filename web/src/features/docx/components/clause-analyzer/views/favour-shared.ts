'use client';

import { useCallback, useMemo, useState } from 'react';
import { short } from '@/features/docx/components/clause-analyzer/views/bits';
import { KIND_LABEL } from '@/features/docx/components/clause-analyzer/views/favour-bits';
import {
	DEONTIC_KINDS,
	byImportance,
	tallyClauses,
	totalOf,
	typeVerdict,
	type ClauseTally,
	type Favour,
	type Served,
	type TypeVerdict,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { Side, StatementGrid } from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind, KnowledgeGraph } from '@/types/knowledge';

type ByKind = Partial<Record<DeonticKind, Favour>>;

export const listOf = (items: string[]) =>
	items.length <= 1
		? (items[0] ?? '')
		: `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const wonBy = (byKind: ByKind, kinds: DeonticKind[], side: Side) =>
	kinds.filter((kind) => byKind[kind] === side);

/**
 * Every clause with its counts, most important first or in document order, and the whole
 * contract's. The rank is always the clause's place in importance, whichever order is shown.
 */
export function useTallies(
	grid: StatementGrid,
	kg: KnowledgeGraph,
	importance: Record<string, number> | null,
	sortByImportance = true
) {
	const inDocument = useMemo(() => tallyClauses(grid, kg), [grid, kg]);
	const ranked = useMemo(() => byImportance(inDocument, importance), [inDocument, importance]);
	const total = useMemo(() => totalOf(inDocument), [inDocument]);
	const rank = useMemo(() => new Map(ranked.map((t, i) => [t.clauseId, i + 1])), [ranked]);
	return { tallies: sortByImportance ? ranked : inDocument, total, rank };
}

/** The types on screen, always in the same order; the last one on stays on. */
export function useKinds() {
	const [kinds, setKinds] = useState<DeonticKind[]>(DEONTIC_KINDS);
	const toggle = useCallback(
		(kind: DeonticKind) =>
			setKinds((prev) =>
				prev.includes(kind)
					? prev.length > 1
						? prev.filter((k) => k !== kind)
						: prev
					: DEONTIC_KINDS.filter((k) => k === kind || prev.includes(k))
			),
		[]
	);
	return [kinds, toggle] as const;
}

/** A clause with nothing of the kinds on screen has no row to show. */
export const hasKinds = (t: ClauseTally, kinds: DeonticKind[]) =>
	kinds.some((kind) => t.count[kind].a + t.count[kind].b > 0);

/** What a clause gives one party in the types shown, a type at a time. */
export const servedTo = (t: ClauseTally, side: Side, kinds: DeonticKind[]): Served[] =>
	t.served
		.filter((s) => kinds.includes(s.kind) && (s.to === side || s.to === 'both'))
		.sort((x, y) => DEONTIC_KINDS.indexOf(x.kind) - DEONTIC_KINDS.indexOf(y.kind));

/**
 * Whose statement a party gets: its own right, or the other party's obligation or prohibition,
 * which that party has to honour. The titles are worded from whoever acts ("Bear audit
 * expense"), so without this "What National gets: Bear audit expense" reads as National paying.
 */
export function originOf(
	s: Served,
	names: Record<Side, string>
): { text: string; side: Side | null } {
	const side = s.kind === 'right' ? s.to : s.by;
	const shared = side !== 'a' && side !== 'b';
	// The column it sits in already says in whose favour it is; the tag says whose it is.
	if (shared) return { text: `Both parties’ ${s.kind}`, side: null };
	return { text: `${short(names[side])}'s ${s.kind}`, side };
}

/** How many clauses land on each verdict. */
export function verdictCounts(
	rows: ClauseTally[],
	kinds: DeonticKind[]
): Record<TypeVerdict, number> {
	const counts: Record<TypeVerdict, number> = { a: 0, b: 0, mixed: 0, tie: 0 };
	for (const t of rows) counts[typeVerdict(t.count, kinds).verdict] += 1;
	return counts;
}

/** The reader's answers, per document — the start of a ground truth nobody has yet. */
const reviewKey = (docId: string) => `clause-verdict-review:${docId}`;

function loadReviews(docId: string): Record<string, string> {
	try {
		return JSON.parse(window.localStorage.getItem(reviewKey(docId)) ?? '{}');
	} catch {
		return {};
	}
}

/** Every view reads and writes the same answers: agreeing is stored as "agree", disagreeing
 *  as the verdict the reader would give instead. */
export function useReviews(docId: string) {
	// The views mount once the graph has loaded, in the browser, so storage is there to read.
	const [reviews, setReviews] = useState<Record<string, string>>(() => loadReviews(docId));
	const review = useCallback(
		(clauseId: string, answer: string) =>
			setReviews((prev) => {
				const next = { ...prev, [clauseId]: answer };
				try {
					window.localStorage.setItem(reviewKey(docId), JSON.stringify(next));
				} catch {
					// Storage can be blocked; the answer still holds for this visit.
				}
				return next;
			}),
		[docId]
	);
	return { reviews, review };
}

/** The verdicts a reader can give instead of the one shown. */
export const otherVerdicts = (verdict: TypeVerdict) =>
	(['a', 'b', 'tie'] as const).filter((f) => f !== verdict);

/** The verdict's reason in a few words, for under a pill. */
export function verdictNote(
	verdict: TypeVerdict,
	byKind: ByKind,
	kinds: DeonticKind[],
	names: Record<Side, string>
) {
	if (verdict === 'tie') return 'Same count in each selected type';
	if (verdict !== 'mixed' && kinds.length === 1) return 'More in its favour in this type';
	if (verdict !== 'mixed') return 'More in at least one type; no fewer in the others';
	return kinds
		.filter((kind) => byKind[kind] && byKind[kind] !== 'tie')
		.map((kind) => `${KIND_LABEL[kind].toLowerCase()} favour ${short(names[byKind[kind] as Side])}`)
		.join('; ');
}

/** Explains the count-based result using the same selected types and tallies. */
export function scoredSentence(
	count: ClauseTally['count'],
	verdict: TypeVerdict,
	byKind: ByKind,
	kinds: DeonticKind[],
	names: Record<Side, string>
) {
	// The winner's count first, as a score is read: Equidata wins 11–4, whichever side it is on.
	const other = (side: Side): Side => (side === 'a' ? 'b' : 'a');
	const scored = (side: Side) =>
		listOf(
			wonBy(byKind, kinds, side).map(
				(k) => `${KIND_LABEL[k].toLowerCase()} (${count[k][side]} vs ${count[k][other(side)]})`
			)
		);
	if (verdict === 'tie') return 'Same count in each selected type: neither party is ahead.';
	if (verdict === 'mixed')
		return `More ${scored('a')} in favour of ${short(names.a)}; more ${scored('b')} in favour of ${short(names.b)}. Each party leads in a different type.`;
	return `More ${scored(verdict)} in favour of ${short(names[verdict])}, and no fewer in any selected type.`;
}
