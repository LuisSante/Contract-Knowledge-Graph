'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import { KIND_COLORS } from '@/features/docx/components/clause-analyzer/constants';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import {
	FavourPill,
	KIND_PLURAL,
	KindSquare,
	ReciprocalToggle,
	ViewHeader,
	favourWords,
	relationOf,
} from '@/features/docx/components/clause-analyzer/views/favour-bits';
import {
	DEONTIC_KINDS,
	byImportance,
	countOf,
	favourOf,
	tallyClauses,
	type ClauseTally,
	type Favour,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { DocNote } from '@/features/docx/hooks/useDocNotes';
import type { ViewProps } from '@/features/docx/components/clause-analyzer/views/types';

const SHOWN_FRAGMENTS = 3;

/** The reader's answers, per document — the start of a ground truth nobody has yet. */
const reviewKey = (docId: string) => `clause-verdict-review:${docId}`;

function loadReviews(docId: string): Record<string, string> {
	try {
		return JSON.parse(window.localStorage.getItem(reviewKey(docId)) ?? '{}');
	} catch {
		return {};
	}
}

const quote = (text: string) => `“${text.length > 60 ? `${text.slice(0, 60).trim()}…` : text}”`;

/** One sentence from the counts alone; no model writes it. */
function sentenceOf(t: ClauseTally, names: Record<Side, string>): string {
	const count = countOf(t.count);
	const favour = favourOf(count);
	const total = t.served.length;
	if (favour === 'tie')
		return `Even: ${count.a} of the ${total} statements serve ${short(names.a)} and ${count.b} serve ${short(names.b)}.`;
	const other: Side = favour === 'a' ? 'b' : 'a';
	const led = t.served
		.filter((s) => s.to === favour)
		.slice(0, 2)
		.map((s) => quote(s.mark.label));
	return `${count[favour]} of the ${total} statements serve ${short(names[favour])}${
		led.length ? `, among them ${led.join(' and ')}` : ''
	}. ${count[other]} serve ${short(names[other])}.`;
}

/** Propuesta 4: the verdict in a sentence, the fragments that hold it up, and a question. */
export function VerdictView({
	docId,
	kg,
	grid,
	names,
	importance,
	lanes,
	showShared,
	onShowShared,
	onOpen,
}: ViewProps) {
	const setNotes = useClauseAnalyzerStore((s) => s.setNotes);
	const [filter, setFilter] = useState<Favour | null>(null);
	const [openId, setOpenId] = useState<string | null>(null);
	const [allFragments, setAllFragments] = useState(false);
	// The view mounts once the graph has loaded, in the browser, so storage is there to read.
	const [reviews, setReviews] = useState<Record<string, string>>(() => loadReviews(docId));

	const tallies = useMemo(
		() => byImportance(tallyClauses(grid, kg, lanes), importance),
		[grid, kg, lanes, importance]
	);
	const rank = new Map(tallies.map((t, i) => [t.clauseId, i + 1]));
	const counts = { a: 0, b: 0, tie: 0 };
	for (const t of tallies) counts[favourOf(countOf(t.count))] += 1;
	const shown = filter ? tallies.filter((t) => favourOf(countOf(t.count)) === filter) : tallies;
	const opened = shown.find((t) => t.clauseId === openId) ?? shown[0] ?? null;

	const paragraphsOf = useMemo(
		() =>
			new Map(
				[...kg.obligations, ...kg.rights, ...kg.prohibitions].map(
					(s) => [s.id, s.paragraphIds] as const
				)
			),
		[kg]
	);

	// The fragments of the open card are marked in the contract on the left too.
	useEffect(() => {
		if (!opened) return;
		// One note per paragraph: a paragraph often holds several statements.
		const byParagraph = new Map<string, Map<string, number>>();
		for (const s of opened.served) {
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
	}, [opened, paragraphsOf, names, setNotes]);

	const review = (clauseId: string, answer: string) => {
		setReviews((prev) => {
			const next = { ...prev, [clauseId]: answer };
			try {
				window.localStorage.setItem(reviewKey(docId), JSON.stringify(next));
			} catch {
				// Storage can be blocked; the answer still holds for this visit.
			}
			return next;
		});
	};

	const chip = (value: Favour) => (
		<button
			type="button"
			key={value}
			onClick={() => setFilter((prev) => (prev === value ? null : value))}
			className={cn(
				'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
				filter === value ? 'ring-2 ring-primary/40' : ''
			)}
			style={
				value === 'tie'
					? undefined
					: {
							borderColor: SIDE_COLOR[value],
							color: SIDE_COLOR[value],
							backgroundColor: `${SIDE_COLOR[value]}14`,
						}
			}
		>
			{favourWords(value, names)}
			<span className="tabular-nums">{counts[value]}</span>
		</button>
	);

	const card = (t: ClauseTally) => {
		const count = countOf(t.count);
		const favour = favourOf(count);
		const border = favour === 'tie' ? 'var(--muted-foreground)' : SIDE_COLOR[favour];
		const title = `${t.section ? `${t.section} ` : ''}${t.heading}`;
		if (t !== opened)
			return (
				<button
					type="button"
					key={t.clauseId}
					onClick={() => {
						setOpenId(t.clauseId);
						setAllFragments(false);
					}}
					className="flex w-full items-center gap-3 rounded-lg border border-border border-l-[3px] bg-card px-3 py-2.5 text-left hover:bg-muted/40"
					style={{ borderLeftColor: border }}
				>
					<span className="w-48 shrink-0 truncate text-xs font-semibold">{title}</span>
					<FavourPill favour={favour} count={count} names={names} />
					<span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
						{sentenceOf(t, names)}
					</span>
					<span className="text-2xs text-muted-foreground">▾</span>
				</button>
			);

		const ordered = [...t.served].sort((x, y) => Number(y.to === favour) - Number(x.to === favour));
		const fragments = allFragments ? ordered : ordered.slice(0, SHOWN_FRAGMENTS);
		const answer = reviews[t.clauseId];
		const options: Array<{ id: string; label: string }> = [
			{ id: 'agree', label: '✓ Yes' },
			...(['a', 'b', 'tie'] as const)
				.filter((f) => f !== favour)
				.map((f) => ({
					id: f,
					label: f === 'tie' ? 'No: it is a tie' : `No: it favours ${short(names[f])}`,
				})),
		];
		return (
			<div
				key={t.clauseId}
				className="space-y-3 rounded-xl border border-border border-l-[3px] bg-card p-4"
				style={{ borderLeftColor: border }}
			>
				<div className="flex items-center gap-2">
					<h4 className="text-sm font-bold">{title}</h4>
					<FavourPill favour={favour} count={count} names={names} />
					{importance && (
						<span className="ml-auto text-2xs text-muted-foreground">
							No. {rank.get(t.clauseId)} in importance
						</span>
					)}
				</div>
				<p className="text-xs leading-relaxed">{sentenceOf(t, names)}</p>
				<div className="flex flex-wrap gap-1.5">
					{DEONTIC_KINDS.map((kind) => (
						<span
							key={kind}
							className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5 text-2xs"
						>
							<span
								className="size-2.5 rounded-[2px]"
								style={{ backgroundColor: KIND_COLORS[kind] }}
							/>
							{KIND_PLURAL[kind]}
							<span className="font-semibold tabular-nums" style={{ color: SIDE_COLOR.a }}>
								{t.count[kind].a}
							</span>
							<span className="opacity-40">·</span>
							<span className="font-semibold tabular-nums" style={{ color: SIDE_COLOR.b }}>
								{t.count[kind].b}
							</span>
						</span>
					))}
				</div>
				<div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
					{fragments.map((s) => (
						<div
							key={s.mark.id}
							className={cn('flex items-start gap-2.5 px-3 py-2', s.to === favour && 'bg-muted/30')}
						>
							<span className="mt-0.5">
								<KindSquare kind={s.kind} size={10} onClick={() => onOpen(s.mark.id)} />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block text-2xs font-semibold">{relationOf(s, names)}</span>
								<span className="block text-2xs leading-relaxed text-muted-foreground italic">
									«{s.text}»
								</span>
							</span>
							<button
								type="button"
								onClick={() => onOpen(s.mark.id)}
								className="shrink-0 text-2xs font-medium text-primary hover:underline"
							>
								{t.section ? `${t.section} · ` : ''}View ↗
							</button>
						</div>
					))}
				</div>
				{ordered.length > SHOWN_FRAGMENTS && (
					<button
						type="button"
						onClick={() => setAllFragments((on) => !on)}
						className="text-2xs font-medium text-primary hover:underline"
					>
						{allFragments
							? '− fewer fragments'
							: `+ ${ordered.length - SHOWN_FRAGMENTS} more fragments`}
					</button>
				)}
				<div className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs">
					Do you agree with this verdict?
					{options.map((o) => (
						<button
							type="button"
							key={o.id}
							onClick={() => review(t.clauseId, o.id)}
							className={cn(
								'rounded-md border px-2.5 py-1 text-xs',
								answer === o.id
									? 'border-primary bg-primary font-semibold text-primary-foreground'
									: 'border-border bg-card hover:bg-muted/40'
							)}
						>
							{o.label}
						</button>
					))}
				</div>
			</div>
		);
	};

	return (
		<div className="min-h-0 flex-1 overflow-auto">
			<div className="space-y-3 p-4">
				<ViewHeader
					title="What the analysis says about each clause, and what it rests on"
					lead="One sentence per clause, built from the graph's counts; under it, the literal fragments that hold it up, linked to the contract. You say whether you agree."
				>
					<div className="flex flex-wrap items-center gap-2">
						{chip('a')}
						{chip('tie')}
						{chip('b')}
						<span className="text-2xs text-muted-foreground">
							of {tallies.length} clauses ·{' '}
							{importance ? 'ordered by importance' : 'document order'}
						</span>
						<span className="ml-auto">
							<ReciprocalToggle on={showShared} onChange={onShowShared} />
						</span>
					</div>
				</ViewHeader>
				<div className="space-y-2">{shown.map(card)}</div>
				<p className="text-2xs text-muted-foreground">
					Your answers stay in this browser. {Object.keys(reviews).length} of {tallies.length}{' '}
					clauses reviewed.
				</p>
			</div>
		</div>
	);
}
