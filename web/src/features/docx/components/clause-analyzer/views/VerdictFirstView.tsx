'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import { ChevronDownIcon } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem } from '@/components/ui/accordion';
import { KIND_COLORS } from '@/features/docx/components/clause-analyzer/constants';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import {
	GraphLink,
	KIND_PLURAL,
	tint,
	verdictColor,
} from '@/features/docx/components/clause-analyzer/views/favour-bits';
import {
	answerOf,
	choiceOf,
	hasKinds,
	scoredSentence,
	useClauseNotes,
	useReviews,
	useTallies,
	verdictCounts,
} from '@/features/docx/components/clause-analyzer/views/favour-shared';
import {
	DEONTIC_KINDS,
	typeVerdict,
	type ClauseTally,
	type TypeVerdict,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind } from '@/types/knowledge';
import type { ViewProps } from '@/features/docx/components/clause-analyzer/views/types';

/** Rows a group shows before it is unfolded. */
const GROUP_PAGE = 3;
/** Past this many statements of a type, a side's dots stop growing and its number says the rest. */
const MAX_DOTS = 10;
const SHOWN_FRAGMENTS = 3;
const KINDS = DEONTIC_KINDS;
const GROUPS: TypeVerdict[] = ['a', 'mixed', 'b', 'tie'];

/** Clauses grouped by their weight-free verdict, the answer read before the evidence; where
 *  the verdict depends on the type, the reader says who it favours. */
export function VerdictFirstView({
	docId,
	kg,
	grid,
	names,
	importance,
	onOpen,
	onOpenGraph,
}: ViewProps) {
	const { reviews, review } = useReviews(docId);
	const { tallies, rank } = useTallies(grid, kg, importance);
	const rows = tallies.filter((t) => hasKinds(t, KINDS));
	const counts = verdictCounts(rows, KINDS);
	const verdictOf = (t: ClauseTally) => typeVerdict(t.count, KINDS);
	const byGroup = Object.fromEntries(
		GROUPS.map((g) => [g, rows.filter((t) => verdictOf(t).verdict === g)])
	) as Record<TypeVerdict, ClauseTally[]>;

	const [unfolded, setUnfolded] = useState<Set<TypeVerdict>>(new Set());
	const [active, setActive] = useState<TypeVerdict | null>(null);
	// Every row starts closed; the reader opens the one they want.
	const [openId, setOpenId] = useState<string | null>(null);
	const [allFragments, setAllFragments] = useState(false);
	const groupRefs = useRef<Partial<Record<TypeVerdict, HTMLDivElement | null>>>({});

	const opened = rows.find((t) => t.clauseId === openId) ?? null;
	useClauseNotes(kg, opened, KINDS, names);

	const title = (g: TypeVerdict) =>
		g === 'a' || g === 'b'
			? `Favours ${short(names[g])}`
			: g === 'mixed'
				? 'Depends on the type'
				: 'Tie';
	const subtitle: Record<TypeVerdict, string> = {
		a: 'loses in no type',
		b: 'loses in no type',
		mixed: 'each party wins one type',
		tie: 'equal in every type',
	};
	const explain: Record<TypeVerdict, string> = {
		a: 'Loses in no type and wins in at least one.',
		b: 'Loses in no type and wins in at least one.',
		mixed: 'Each party wins a different type: picking a winner would take weights.',
		tie: 'Equal in every type.',
	};

	const jump = (g: TypeVerdict) => {
		setActive(g);
		groupRefs.current[g]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	/** One side's dots, growing out from the axis, with the count at the far end. */
	const dots = (n: number, side: Side, wins: boolean) => (
		<span
			className={cn(
				'flex flex-1 items-center gap-[2px]',
				side === 'a' ? 'flex-row-reverse justify-start' : 'justify-start'
			)}
		>
			{Array.from({ length: Math.min(n, MAX_DOTS) }, (_, i) => (
				<span
					key={i}
					className="size-[5px] shrink-0 rounded-full"
					style={{ backgroundColor: SIDE_COLOR[side] }}
				/>
			))}
			<span
				className={cn('text-xs tabular-nums', side === 'a' ? 'mr-0.5' : 'ml-0.5')}
				style={wins ? { color: SIDE_COLOR[side], fontWeight: 700 } : undefined}
			>
				{n}
			</span>
		</span>
	);

	const cell = (t: ClauseTally, kind: DeonticKind) => {
		const { a, b } = t.count[kind];
		return (
			<span
				className="pointer-events-none flex w-[184px] shrink-0 flex-col items-center gap-0.5"
				title={`${KIND_PLURAL[kind]}: ${a} serve ${short(names.a)}, ${b} serve ${short(names.b)}`}
			>
				<span className="flex items-center gap-1 text-[9px] font-bold tracking-wider text-muted-foreground uppercase">
					<span className="size-1.5 rounded-[1px]" style={{ backgroundColor: KIND_COLORS[kind] }} />
					{KIND_PLURAL[kind]}
				</span>
				{a + b === 0 ? (
					<span className="text-xs text-muted-foreground/60">—</span>
				) : (
					<span className="flex w-full items-center gap-1">
						{dots(a, 'a', a > b)}
						<span className="h-3 w-px shrink-0 bg-border" />
						{dots(b, 'b', b > a)}
					</span>
				)}
			</span>
		);
	};

	const detail = (t: ClauseTally, verdict: TypeVerdict) => {
		const { byKind } = verdictOf(t);
		const won = KINDS.filter((kind) => byKind[kind] === 'a' || byKind[kind] === 'b');
		const choice = choiceOf(reviews[t.clauseId], verdict);
		// The first party's types on the left, as its dots are.
		const cards = won
			.map((kind) => {
				const side = byKind[kind] as Side;
				const gets = t.served.filter((s) => s.kind === kind && (s.to === side || s.to === 'both'));
				return { kind, side, gets };
			})
			.sort((x, y) => Number(x.side === 'b') - Number(y.side === 'b'));
		return (
			<div className="space-y-3">
				<p
					className={cn(
						'rounded-md px-3 py-2 text-xs font-medium',
						verdict === 'mixed' ? 'bg-warning/25 text-warning-foreground' : 'bg-secondary'
					)}
				>
					{scoredSentence(t.count, verdict, byKind, KINDS, names)}
					{verdict === 'mixed' && ' The view does not choose: you decide whom it favours.'}
				</p>
				{cards.length > 0 && (
					<div className="grid grid-cols-2 gap-3">
						{cards.map(({ kind, side, gets }) => (
							<div key={kind} className="rounded-lg border border-border bg-card px-3 py-2">
								<p
									className="mb-1 flex items-center gap-1.5 text-xs font-semibold"
									style={{ color: SIDE_COLOR[side] }}
								>
									<span
										className="size-2 rounded-[2px]"
										style={{ backgroundColor: KIND_COLORS[kind] }}
									/>
									{KIND_PLURAL[kind]} → {short(names[side])}
								</p>
								<div className="space-y-1.5">
									{(allFragments ? gets : gets.slice(0, SHOWN_FRAGMENTS)).map((s) => (
										<button
											type="button"
											key={`${s.mark.id}-${s.to}`}
											onClick={() => onOpen(s.mark.id)}
											title="Show it in the contract"
											className="block w-full rounded text-left hover:bg-muted/40"
										>
											<span className="block text-xs font-semibold text-foreground">
												{s.mark.label}
											</span>
											<span className="block truncate text-2xs text-muted-foreground italic">
												«{s.text}»
											</span>
										</button>
									))}
								</div>
								{gets.length > SHOWN_FRAGMENTS && (
									<button
										type="button"
										onClick={() => setAllFragments((on) => !on)}
										className="mt-1 text-2xs font-medium text-primary hover:underline"
									>
										{allFragments ? '− fewer' : `+ ${gets.length - SHOWN_FRAGMENTS} more`}
									</button>
								)}
							</div>
						))}
					</div>
				)}
				<div className="flex flex-wrap items-center gap-2 text-xs">
					<span className="font-medium">Whom does it favour, in your view?</span>
					{(['a', 'b', 'tie'] as const).map((f) => {
						const color = f === 'tie' ? 'var(--foreground)' : SIDE_COLOR[f];
						const on = choice === f;
						return (
							<button
								type="button"
								key={f}
								onClick={() => review(t.clauseId, answerOf(f, verdict))}
								className={cn(
									'inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-0.5 font-medium',
									on ? 'font-semibold' : 'hover:bg-muted/40'
								)}
								style={{
									borderColor: color,
									color: on && f !== 'tie' ? 'white' : f === 'tie' ? undefined : color,
									backgroundColor: on ? (f === 'tie' ? tint(color, 12) : color) : undefined,
								}}
							>
								<span
									className="size-1.5 rounded-full"
									style={{ backgroundColor: on && f !== 'tie' ? 'white' : color }}
								/>
								{f === 'tie' ? 'Tie' : short(names[f])}
							</button>
						);
					})}
					<span className="text-2xs text-muted-foreground">
						{!choice
							? 'Your answer is noted to validate the analysis.'
							: verdict === 'mixed'
								? 'Noted, to validate the analysis.'
								: choice === verdict
									? 'Noted: you agree with the view.'
									: 'Noted: your answer differs from the view.'}
					</span>
				</div>
			</div>
		);
	};

	const groupRows = (g: TypeVerdict, list: ClauseTally[]) => {
		const all = unfolded.has(g);
		const visible = all ? list : list.slice(0, GROUP_PAGE);
		return (
			<>
				{visible.map((t) => {
					const { verdict } = verdictOf(t);
					return (
						<AccordionItem
							key={t.clauseId}
							value={t.clauseId}
							className="border-border/60"
							style={{
								backgroundColor: verdict === 'mixed' ? tint('var(--warning)', 7) : undefined,
							}}
						>
							<AccordionPrimitive.Header className="group relative flex items-center gap-2 px-3 py-2 hover:bg-muted/30">
								<AccordionPrimitive.Trigger
									className="absolute inset-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
									aria-label={`${t.heading}: show the fragments behind its verdict`}
								/>
								<span className="pointer-events-none w-9 shrink-0">
									<span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
										#{rank.get(t.clauseId)}
									</span>
								</span>
								<span className="min-w-0 flex-1">
									<span className="pointer-events-none block truncate text-sm font-semibold text-foreground">
										{t.heading}
									</span>
									<span className="flex items-center gap-2 text-2xs">
										{t.section && <span className="pointer-events-none">{t.section}</span>}
										{onOpenGraph && <GraphLink onClick={() => onOpenGraph(t.clauseId)} />}
									</span>
								</span>
								{KINDS.map((kind) => (
									<span key={kind} className="contents">
										{cell(t, kind)}
									</span>
								))}
								<ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
							</AccordionPrimitive.Header>
							<AccordionContent className="pr-4 pl-14">{detail(t, verdict)}</AccordionContent>
						</AccordionItem>
					);
				})}
				{list.length > GROUP_PAGE && (
					<button
						type="button"
						onClick={() =>
							setUnfolded((prev) => {
								const next = new Set(prev);
								if (all) next.delete(g);
								else next.add(g);
								return next;
							})
						}
						className="block w-full border-b border-border/60 py-1.5 pl-14 text-left text-2xs font-medium text-primary hover:underline"
					>
						{all
							? '− show fewer'
							: `+ ${list.length - GROUP_PAGE} more ${list.length - GROUP_PAGE === 1 ? 'clause' : 'clauses'} in this group`}
					</button>
				)}
			</>
		);
	};

	/** Ties have nothing to explain: they fold into labels that open the clause in the contract. */
	const tieChips = (list: ClauseTally[]) => (
		<div className="flex flex-wrap gap-2 px-3 py-3 pl-14">
			{list.map((t) => (
				<button
					type="button"
					key={t.clauseId}
					onClick={() => onOpen(t.clauseId)}
					title={KINDS.filter((k) => t.count[k].a + t.count[k].b > 0)
						.map((k) => `${KIND_PLURAL[k]} ${t.count[k].a}–${t.count[k].b}`)
						.join(' · ')}
					className="rounded-md bg-secondary px-2.5 py-1 text-xs font-medium hover:bg-accent"
				>
					{t.heading === t.section || !t.section ? t.heading : `${t.heading} ${t.section}`}
				</button>
			))}
		</div>
	);

	return (
		<div className="min-h-0 flex-1 overflow-auto">
			<div className="min-w-[840px] space-y-4 p-4">
				<div className="space-y-1">
					<h3 className="text-lg font-bold text-foreground">First, who wins</h3>
					<p className="text-xs leading-relaxed text-foreground">
						Clauses grouped by verdict and, within each group, from most to least important. Each
						dot is a statement: on the left what serves {short(names.a)}, on the right what serves{' '}
						{short(names.b)}.
					</p>
				</div>

				<div className="grid grid-cols-4 gap-3">
					{GROUPS.map((g) => {
						const color = verdictColor(g);
						return (
							<button
								type="button"
								key={g}
								onClick={() => jump(g)}
								disabled={counts[g] === 0}
								className="flex items-center gap-3 rounded-xl border-[1.5px] bg-card px-3 py-2.5 text-left disabled:opacity-40"
								style={{
									borderColor: active === g ? color : 'var(--border)',
									backgroundColor: active === g ? tint(color, 6) : undefined,
								}}
							>
								<span
									className={cn(
										'text-3xl font-bold tabular-nums',
										g === 'mixed' && 'text-warning-foreground'
									)}
									style={g === 'mixed' ? undefined : { color }}
								>
									{counts[g]}
								</span>
								<span className="min-w-0">
									<span className="block truncate text-xs font-semibold">{title(g)}</span>
									<span className="block truncate text-2xs text-muted-foreground">
										{subtitle[g]}
									</span>
								</span>
							</button>
						);
					})}
				</div>

				<div className="overflow-hidden rounded-xl border border-border bg-card">
					<Accordion
						type="single"
						collapsible
						value={opened?.clauseId ?? ''}
						onValueChange={(value) => {
							setOpenId(value || null);
							setAllFragments(false);
						}}
					>
						{GROUPS.filter((g) => byGroup[g].length > 0).map((g) => {
							const list = byGroup[g];
							const color = verdictColor(g);
							return (
								<div
									key={g}
									ref={(el) => {
										groupRefs.current[g] = el;
									}}
									className="scroll-mt-2"
								>
									<div
										className="flex items-center gap-2 border-y border-border/60 px-3 py-2 first:border-t-0"
										style={{ backgroundColor: tint(color, g === 'tie' ? 5 : 8) }}
									>
										<span className="h-4 w-[3px] rounded-full" style={{ backgroundColor: color }} />
										<span
											className={cn(
												'text-sm font-semibold',
												g === 'mixed' && 'text-warning-foreground'
											)}
											style={g === 'mixed' || g === 'tie' ? undefined : { color }}
										>
											{title(g)}
										</span>
										<span
											className={cn(
												'rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
												g === 'mixed' ? 'text-warning-foreground' : 'text-background'
											)}
											style={{ backgroundColor: color }}
										>
											{list.length}
										</span>
										<span className="flex-1 text-2xs text-muted-foreground">{explain[g]}</span>
										{g !== 'tie' && list.length > GROUP_PAGE && !unfolded.has(g) && (
											<button
												type="button"
												onClick={() => setUnfolded((prev) => new Set(prev).add(g))}
												className="text-2xs font-medium text-primary hover:underline"
											>
												View all {list.length}
											</button>
										)}
									</div>
									{g === 'tie' ? tieChips(list) : groupRows(g, list)}
								</div>
							);
						})}
					</Accordion>
				</div>

				<p className="text-2xs text-muted-foreground">
					Your answers stay in this browser: {Object.keys(reviews).length} of {tallies.length}{' '}
					clauses reviewed.
				</p>
			</div>
		</div>
	);
}
