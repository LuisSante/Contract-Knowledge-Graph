'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import { ChevronDownIcon } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem } from '@/components/ui/accordion';
import { KIND_COLORS } from '@/features/docx/components/clause-analyzer/constants';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import {
	FavourPill,
	KIND_PLURAL,
	KindSquare,
	ViewHeader,
	relationOf,
} from '@/features/docx/components/clause-analyzer/views/favour-bits';
import {
	DEONTIC_KINDS,
	byImportance,
	tallyClauses,
	totalOf,
	typeVerdict,
	type ClauseTally,
	type Favour,
	type TypeVerdict,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind } from '@/types/knowledge';
import type { DocNote } from '@/features/docx/hooks/useDocNotes';
import type { ViewProps } from '@/features/docx/components/clause-analyzer/views/types';

const PAGE = 10;
const BAR = 64;
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

const listOf = (items: string[]) =>
	items.length <= 1
		? (items[0] ?? '')
		: `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** Obligations, rights and prohibitions never added together, each clause opening onto
 *  the fragments that hold its verdict up. */
export function ByTypeView({ docId, kg, grid, names, importance, onOpen }: ViewProps) {
	const setNotes = useClauseAnalyzerStore((s) => s.setNotes);
	const [limit, setLimit] = useState(PAGE);
	const [kinds, setKinds] = useState<DeonticKind[]>(DEONTIC_KINDS);
	// undefined until the reader picks: the most important clause opens on its own.
	const [openId, setOpenId] = useState<string | null | undefined>(undefined);
	const [fragmentKind, setFragmentKind] = useState<DeonticKind | null>(null);
	const [allFragments, setAllFragments] = useState(false);
	// The view mounts once the graph has loaded, in the browser, so storage is there to read.
	const [reviews, setReviews] = useState<Record<string, string>>(() => loadReviews(docId));

	const tallies = useMemo(
		() => byImportance(tallyClauses(grid, kg), importance),
		[grid, kg, importance]
	);
	const total = useMemo(() => totalOf(tallies), [tallies]);
	// A clause with nothing of the kinds on screen has no row to show.
	const rows = tallies.filter((t) => kinds.some((kind) => t.count[kind].a + t.count[kind].b > 0));
	const opened =
		openId === undefined ? (rows[0] ?? null) : (rows.find((t) => t.clauseId === openId) ?? null);
	const peak = useMemo(
		() =>
			Object.fromEntries(
				DEONTIC_KINDS.map((kind) => [
					kind,
					Math.max(1, ...tallies.map((t) => Math.max(t.count[kind].a, t.count[kind].b))),
				])
			) as Record<DeonticKind, number>,
		[tallies]
	);

	const paragraphsOf = useMemo(
		() =>
			new Map(
				[...kg.obligations, ...kg.rights, ...kg.prohibitions].map(
					(s) => [s.id, s.paragraphIds] as const
				)
			),
		[kg]
	);

	// The open clause's fragments are marked in the contract on the left too, one note
	// per paragraph: a paragraph often holds several statements.
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

	const note = (verdict: TypeVerdict, byKind: Partial<Record<DeonticKind, Favour>>) => {
		if (verdict === 'tie') return 'equal in every type';
		if (verdict !== 'mixed') return 'loses in no type';
		return kinds
			.filter((kind) => byKind[kind] && byKind[kind] !== 'tie')
			.map((kind) => `${KIND_PLURAL[kind].toLowerCase()} → ${short(names[byKind[kind] as Side])}`)
			.join(' · ');
	};

	/** One sentence from the counts alone, with the same weight-free reading; no model writes it. */
	const sentenceOf = (
		t: ClauseTally,
		verdict: TypeVerdict,
		byKind: Partial<Record<DeonticKind, Favour>>
	) => {
		const won = (side: Side) =>
			kinds.filter((kind) => byKind[kind] === side).map((k) => KIND_PLURAL[k].toLowerCase());
		if (verdict === 'tie') return 'The two parties are even in every type shown.';
		if (verdict === 'mixed')
			return `It depends on the type: ${short(names.a)} gets more ${listOf(won('a'))}, ${short(names.b)} gets more ${listOf(won('b'))}. Choosing between them would mean weighting them.`;
		const led = t.served
			.filter((s) => s.to === verdict && kinds.includes(s.kind))
			.slice(0, 2)
			.map((s) => quote(s.mark.label));
		return `${short(names[verdict])} wins in ${listOf(won(verdict))} and loses in none${
			led.length ? `; among what it gets, ${led.join(' and ')}` : ''
		}.`;
	};

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

	/** Opens the clause on that type's fragments; on the type already shown, on all of them. */
	const filterBy = (clauseId: string, kind: DeonticKind) => {
		const same = opened?.clauseId === clauseId && fragmentKind === kind;
		setOpenId(clauseId);
		setFragmentKind(same ? null : kind);
		setAllFragments(false);
	};

	const cell = (t: ClauseTally, kind: DeonticKind) => {
		const { a, b } = t.count[kind];
		if (a + b === 0)
			return (
				<span className="pointer-events-none flex w-[132px] shrink-0 justify-center text-2xs text-muted-foreground/60">
					—
				</span>
			);
		const tone = (side: Side) =>
			(side === 'a' ? a > b : b > a) ? { color: SIDE_COLOR[side], fontWeight: 700 } : undefined;
		const active = opened?.clauseId === t.clauseId && fragmentKind === kind;
		return (
			<button
				type="button"
				onClick={() => filterBy(t.clauseId, kind)}
				className={cn(
					'relative z-10 flex w-[132px] shrink-0 items-center justify-center gap-1.5 rounded-md py-1 text-2xs tabular-nums hover:bg-muted',
					active && 'bg-accent ring-1 ring-primary/40'
				)}
				title={
					active
						? 'Show the fragments of every type'
						: `${KIND_PLURAL[kind]}: ${a} serve ${short(names.a)}, ${b} serve ${short(names.b)} — click to see only these fragments`
				}
			>
				<span className="w-5 text-right text-muted-foreground" style={tone('a')}>
					{a}
				</span>
				<span className="relative h-1.5" style={{ width: BAR }}>
					<span className="absolute inset-y-0 left-1/2 w-px bg-border" />
					<span
						className="absolute inset-y-0 right-1/2 rounded-l-full"
						style={{ width: (a / peak[kind]) * (BAR / 2), backgroundColor: SIDE_COLOR.a }}
					/>
					<span
						className="absolute inset-y-0 left-1/2 rounded-r-full"
						style={{ width: (b / peak[kind]) * (BAR / 2), backgroundColor: SIDE_COLOR.b }}
					/>
				</span>
				<span className="w-5 text-left text-muted-foreground" style={tone('b')}>
					{b}
				</span>
			</button>
		);
	};

	const detail = (
		t: ClauseTally,
		verdict: TypeVerdict,
		byKind: Partial<Record<DeonticKind, Favour>>
	) => {
		const winner = verdict === 'a' || verdict === 'b' ? verdict : null;
		const ordered = t.served
			.filter((s) => kinds.includes(s.kind) && (!fragmentKind || s.kind === fragmentKind))
			.sort((x, y) => Number(y.to === winner) - Number(x.to === winner));
		const fragments = allFragments ? ordered : ordered.slice(0, SHOWN_FRAGMENTS);
		const answer = reviews[t.clauseId];
		const options: Array<{ id: string; label: string }> = [
			{ id: 'agree', label: '✓ Yes' },
			...(['a', 'b', 'tie'] as const)
				.filter((f) => f !== verdict)
				.map((f) => ({
					id: f,
					label: f === 'tie' ? 'No: it is a tie' : `No: it favours ${short(names[f])}`,
				})),
		];
		return (
			<div className="space-y-3">
				<div className="flex items-start gap-3">
					<p className="flex-1 text-xs leading-relaxed">{sentenceOf(t, verdict, byKind)}</p>
				</div>
				{fragmentKind && (
					<p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
						<span
							className="size-2.5 rounded-[2px]"
							style={{ backgroundColor: KIND_COLORS[fragmentKind] }}
						/>
						Only {KIND_PLURAL[fragmentKind].toLowerCase()}
						<button
							type="button"
							onClick={() => setFragmentKind(null)}
							className="font-medium text-primary hover:underline"
						>
							show every type
						</button>
					</p>
				)}
				{fragments.length > 0 && (
					<div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-card">
						{fragments.map((s) => (
							<div
								key={`${s.mark.id}-${s.to}`}
								className={cn(
									'flex items-start gap-2.5 px-3 py-2',
									s.to === winner && 'bg-muted/30'
								)}
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
				)}
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

	const contract = typeVerdict(total, kinds);
	const wins = kinds.filter((kind) => contract.byKind[kind] === contract.verdict).length;
	const winsIn =
		wins < kinds.length
			? `${wins} ${wins === 1 ? 'type' : 'types'} and loses in none`
			: kinds.length === 1
				? KIND_PLURAL[kinds[0]].toLowerCase()
				: kinds.length === 3
					? 'all three types'
					: 'both types shown';
	const contractLine =
		contract.verdict === 'tie'
			? 'the two parties are even in every type.'
			: contract.verdict === 'mixed'
				? `it depends on the type (${note(contract.verdict, contract.byKind)}).`
				: `${short(names[contract.verdict])} wins in ${winsIn}.`;

	const toggleKind = (kind: DeonticKind) => {
		setFragmentKind(null);
		setKinds((prev) =>
			prev.includes(kind)
				? prev.filter((k) => k !== kind)
				: DEONTIC_KINDS.filter((k) => k === kind || prev.includes(k))
		);
	};

	return (
		<div className="min-h-0 flex-1 overflow-auto">
			<div className="min-w-[760px] space-y-3 p-4">
				<ViewHeader>
					<div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
						Show
						{DEONTIC_KINDS.map((kind) => {
							const on = kinds.includes(kind);
							// The last type on stays on: with none, there is nothing to compare.
							const last = on && kinds.length === 1;
							return (
								<button
									type="button"
									key={kind}
									onClick={() => toggleKind(kind)}
									disabled={last}
									title={last ? 'At least one type stays on' : undefined}
									className={cn(
										'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs disabled:cursor-default',
										on ? 'border-foreground/30 text-foreground' : 'border-border opacity-50'
									)}
								>
									<span
										className="size-2.5 rounded-[2px]"
										style={{ backgroundColor: KIND_COLORS[kind] }}
									/>
									{KIND_PLURAL[kind]}
									{on && <span className="text-2xs">✓</span>}
								</button>
							);
						})}
					</div>
				</ViewHeader>

				<div className="overflow-hidden rounded-xl border border-border bg-card">
					<div className="flex items-center gap-2 bg-secondary px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase">
						<span className="flex-1 text-muted-foreground">
							Clause <span className="font-normal normal-case">· most important first ↓</span>
						</span>
						{kinds.map((kind) => (
							<span key={kind} className="flex w-[132px] shrink-0 flex-col items-center">
								<span className="flex items-center gap-1">
									<span
										className="size-2 rounded-[2px]"
										style={{ backgroundColor: KIND_COLORS[kind] }}
									/>
									{KIND_PLURAL[kind]}
								</span>
								<span className="text-[9px] font-medium normal-case">
									<span style={{ color: SIDE_COLOR.a }}>{short(names.a)}</span>
									<span className="text-muted-foreground"> · </span>
									<span style={{ color: SIDE_COLOR.b }}>{short(names.b)}</span>
								</span>
							</span>
						))}
						<span className="w-40 shrink-0 text-muted-foreground">Weight-free verdict</span>
						{/* Room for the accordion's chevron, so the columns line up. */}
						<span className="w-4 shrink-0" />
					</div>
					<Accordion
						type="single"
						collapsible
						value={opened?.clauseId ?? ''}
						onValueChange={(value) => {
							setOpenId(value || null);
							setFragmentKind(null);
							setAllFragments(false);
						}}
					>
						{rows.slice(0, limit).map((t) => {
							const { verdict, byKind } = typeVerdict(t.count, kinds);
							const side = verdict === 'a' || verdict === 'b' ? verdict : null;
							return (
								<AccordionItem
									key={t.clauseId}
									value={t.clauseId}
									className={cn(
										'border-border/60 border-l-[3px]',
										verdict === 'mixed' && 'bg-warning/10'
									)}
									style={{
										borderLeftColor: side
											? SIDE_COLOR[side]
											: verdict === 'mixed'
												? 'var(--warning)'
												: 'transparent',
									}}
								>
									{/* The trigger fills the row from underneath; the cells are buttons
									    on top of it, so a click on a count filters instead of toggling. */}
									<AccordionPrimitive.Header className="group relative flex items-center gap-2 px-3 py-2 hover:bg-muted/30 data-[state=open]:bg-muted/30">
										<AccordionPrimitive.Trigger
											className="absolute inset-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
											aria-label={`${t.heading}: show the fragments behind its verdict`}
										/>
										<span className="pointer-events-none min-w-0 flex-1">
											<span className="block truncate text-xs font-medium">{t.heading}</span>
											{t.section && (
												<span className="text-2xs font-normal text-muted-foreground">
													{t.section}
												</span>
											)}
										</span>
										{kinds.map((kind) => (
											<span key={kind} className="contents">
												{cell(t, kind)}
											</span>
										))}
										<span className="pointer-events-none w-40 shrink-0 space-y-0.5 font-normal">
											<FavourPill favour={verdict} names={names} />
											<span className="block text-[10px] leading-snug text-muted-foreground">
												{note(verdict, byKind)}
											</span>
										</span>
										<ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
									</AccordionPrimitive.Header>
									<AccordionContent className="px-4 pt-1">
										{detail(t, verdict, byKind)}
									</AccordionContent>
								</AccordionItem>
							);
						})}
					</Accordion>
				</div>

				<p className="text-2xs text-muted-foreground">
					{rows.length > limit && (
						<button
							type="button"
							onClick={() => setLimit((n) => n + PAGE)}
							className="mr-3 font-medium text-primary hover:underline"
						>
							↓ {rows.length - limit} more clauses
						</button>
					)}
					Across the contract:{' '}
					{kinds
						.map((kind) => `${KIND_PLURAL[kind].toLowerCase()} ${total[kind].a}·${total[kind].b}`)
						.join(', ')}{' '}
					— {contractLine} Your answers stay in this browser: {Object.keys(reviews).length} of{' '}
					{tallies.length} clauses reviewed.
				</p>
			</div>
		</div>
	);
}
