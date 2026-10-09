'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import { short } from '@/features/docx/components/clause-analyzer/views/bits';
import { KIND_PLURAL } from '@/features/docx/components/clause-analyzer/views/favour-bits';
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
import type { DocNote } from '@/features/docx/hooks/useDocNotes';

type ByKind = Partial<Record<DeonticKind, Favour>>;

export const listOf = (items: string[]) =>
	items.length <= 1
		? (items[0] ?? '')
		: `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const wonBy = (byKind: ByKind, kinds: DeonticKind[], side: Side) =>
	kinds.filter((kind) => byKind[kind] === side);

/** Every clause with its counts, most important first, and the whole contract's. */
export function useTallies(
	grid: StatementGrid,
	kg: KnowledgeGraph,
	importance: Record<string, number> | null
) {
	const tallies = useMemo(
		() => byImportance(tallyClauses(grid, kg), importance),
		[grid, kg, importance]
	);
	const total = useMemo(() => totalOf(tallies), [tallies]);
	const rank = useMemo(() => new Map(tallies.map((t, i) => [t.clauseId, i + 1])), [tallies]);
	return { tallies, total, rank };
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

/**
 * The open clause's fragments are marked in the contract on the left too, one note per
 * paragraph: a paragraph often holds several statements.
 */
export function useClauseNotes(
	kg: KnowledgeGraph,
	opened: ClauseTally | null,
	kinds: DeonticKind[],
	names: Record<Side, string>
) {
	const setNotes = useClauseAnalyzerStore((s) => s.setNotes);
	const paragraphsOf = useMemo(
		() =>
			new Map(
				[...kg.obligations, ...kg.rights, ...kg.prohibitions].map(
					(s) => [s.id, s.paragraphIds] as const
				)
			),
		[kg]
	);

	useEffect(() => {
		if (!opened) return;
		const byParagraph = new Map<string, Map<string, number>>();
		for (const s of opened.served) {
			if (!kinds.includes(s.kind)) continue;
			const pid = paragraphsOf.get(s.mark.id)?.[0];
			if (!pid) continue;
			const to = s.to === 'both' ? 'both' : short(names[s.to]);
			const tally = byParagraph.get(pid) ?? new Map<string, number>();
			tally.set(to, (tally.get(to) ?? 0) + 1);
			byParagraph.set(pid, tally);
		}
		const notes: DocNote[] = [...byParagraph].map(([pid, tally]) => ({
			pid,
			text: `Serves ${[...tally].map(([to, n]) => (n > 1 ? `${to} ×${n}` : to)).join(' · ')}`,
			tone: 'step',
			at: 'before',
		}));
		setNotes(notes);
		return () => setNotes([]);
	}, [opened, kinds, paragraphsOf, names, setNotes]);
}

/** The verdict's reason in a few words, for under a pill. */
export function verdictNote(
	verdict: TypeVerdict,
	byKind: ByKind,
	kinds: DeonticKind[],
	names: Record<Side, string>
) {
	if (verdict === 'tie') return 'equal in every type';
	if (verdict !== 'mixed') return 'loses in no type';
	return kinds
		.filter((kind) => byKind[kind] && byKind[kind] !== 'tie')
		.map((kind) => `${KIND_PLURAL[kind].toLowerCase()} → ${short(names[byKind[kind] as Side])}`)
		.join(' · ');
}

/** The same reading with each type's score: "Equidata wins in obligations (11–4) and rights
 *  (2–0), and loses in no type." */
export function scoredSentence(
	count: ClauseTally['count'],
	verdict: TypeVerdict,
	byKind: ByKind,
	kinds: DeonticKind[],
	names: Record<Side, string>
) {
	const scored = (side: Side) =>
		listOf(
			wonBy(byKind, kinds, side).map(
				(k) => `${KIND_PLURAL[k].toLowerCase()} (${count[k].a}–${count[k].b})`
			)
		);
	if (verdict === 'tie') return 'The two parties are even in every type shown.';
	if (verdict === 'mixed')
		return `${short(names.a)} wins in ${scored('a')} and ${short(names.b)} in ${scored('b')}.`;
	return `${short(names[verdict])} wins in ${scored(verdict)}, and loses in no type.`;
}
