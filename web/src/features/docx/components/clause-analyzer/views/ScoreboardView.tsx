'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem } from '@/components/ui/accordion';
import { KIND_COLORS } from '@/features/docx/components/clause-analyzer/constants';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import {
	Fragment,
	GraphLink,
	KIND_PLURAL,
	KindFilter,
	tint,
	verdictColor,
	verdictLabel,
} from '@/features/docx/components/clause-analyzer/views/favour-bits';
import {
	hasKinds,
	listOf,
	otherVerdicts,
	scoredSentence,
	servedTo,
	useClauseNotes,
	useKinds,
	useReviews,
	useTallies,
	verdictCounts,
	verdictNote,
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

const PAGE = 10;
const BAR = 56;
const SHOWN_FRAGMENTS = 3;
const SIDES: Side[] = ['a', 'b'];

type Filter = TypeVerdict | 'all';

/** Table v2 under a scoreboard: the whole contract first, each clause in larger type below,
 *  and an open clause splits what each party gets into two columns. */
export function ScoreboardView({
	docId,
	kg,
	grid,
	names,
	importance,
	onOpen,
	onOpenGraph,
}: ViewProps) {
	const [limit, setLimit] = useState(PAGE);
	const [kinds, toggleKind] = useKinds();
	const [filter, setFilter] = useState<Filter>('all');
	// undefined until the reader picks: the most important clause opens on its own.
	const [openId, setOpenId] = useState<string | null | undefined>(undefined);
	const [allFragments, setAllFragments] = useState<Set<Side>>(new Set());
	const { reviews, review } = useReviews(docId);
	const { tallies, total, rank } = useTallies(grid, kg, importance);

	const shown = tallies.filter((t) => hasKinds(t, kinds));
	const counts = verdictCounts(shown, kinds);
	const rows =
		filter === 'all' ? shown : shown.filter((t) => typeVerdict(t.count, kinds).verdict === filter);
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

	useClauseNotes(kg, opened, kinds, names);

	const open = (clauseId: string | null) => {
		setOpenId(clauseId);
		setAllFragments(new Set());
	};

	const contract = typeVerdict(total, kinds);
	const lead = contract.verdict === 'a' || contract.verdict === 'b' ? contract.verdict : null;

	const contractLine = () => {
		if (contract.verdict === 'tie') return 'Even in every type shown.';
		if (contract.verdict === 'mixed')
			return scoredSentence(total, contract.verdict, contract.byKind, kinds, names);
		const won = kinds.filter((kind) => contract.byKind[kind] === contract.verdict);
		const where =
			won.length < kinds.length
				? listOf(won.map((k) => KIND_PLURAL[k].toLowerCase()))
				: kinds.length === 3
					? 'all three types'
					: kinds.length === 2
						? 'both types shown'
						: KIND_PLURAL[kinds[0]].toLowerCase();
		return `Ahead in ${where}, losing in none.`;
	};

	const clauseLine = () => {
		const [first, second]: Side[] = lead === 'b' ? ['b', 'a'] : ['a', 'b'];
		const parts = lead
			? [
					`${counts[first]} in favour`,
					`${counts.tie} ${counts.tie === 1 ? 'tie' : 'ties'}`,
					`${counts[second]} for ${short(names[second])}`,
				]
			: [
					`${counts.a} for ${short(names.a)}`,
					`${counts.b} for ${short(names.b)}`,
					`${counts.tie} ${counts.tie === 1 ? 'tie' : 'ties'}`,
				];
		return [
			...parts,
			`${counts.mixed} ${counts.mixed === 1 ? 'depends' : 'depend'} on the type`,
		].join(' · ');
	};

	const scoreCard = (kind: DeonticKind) => {
		const { a, b } = total[kind];
		const on = kinds.includes(kind);
		const big = (side: Side) => {
			const n = side === 'a' ? a : b;
			const wins = side === 'a' ? a > b : b > a;
			return (
				<span style={{ color: SIDE_COLOR[side], opacity: wins || a === b ? 1 : 0.55 }}>{n}</span>
			);
		};
		return (
			<div
				key={kind}
				className={cn('rounded-xl border border-border bg-card p-3', !on && 'opacity-40')}
			>
				<div className="flex items-center justify-between gap-2">
					<span className="flex items-center gap-1.5 text-xs font-semibold">
						<span
							className="size-2.5 rounded-[2px]"
							style={{ backgroundColor: KIND_COLORS[kind] }}
						/>
						{KIND_PLURAL[kind]}
					</span>
					<span className="text-2xs text-muted-foreground">{a + b} statements</span>
				</div>
				<div className="mt-1 flex items-baseline gap-1.5 text-3xl leading-tight font-bold tabular-nums">
					{big('a')}
					<span className="text-xl text-foreground">:</span>
					{big('b')}
				</div>
				<div className="flex justify-between text-2xs">
					<span style={{ color: SIDE_COLOR.a }}>{short(names.a)}</span>
					<span style={{ color: SIDE_COLOR.b }}>{short(names.b)}</span>
				</div>
				<div className="mt-1.5 flex h-1.5 gap-0.5">
					{a + b === 0 ? (
						<span className="flex-1 rounded-full bg-secondary" />
					) : (
						SIDES.map((side) => (
							<span
								key={side}
								className="rounded-full"
								style={{ flexGrow: total[kind][side], backgroundColor: SIDE_COLOR[side] }}
							/>
						))
					)}
				</div>
			</div>
		);
	};

	const filters: Array<{ id: Filter; label: string; color?: string }> = [
		{ id: 'all', label: 'All' },
		{ id: 'a', label: short(names.a), color: SIDE_COLOR.a },
		{ id: 'tie', label: 'Tie' },
		{ id: 'mixed', label: 'Depends', color: 'var(--warning-foreground)' },
		{ id: 'b', label: short(names.b), color: SIDE_COLOR.b },
	];

	const cell = (t: ClauseTally, kind: DeonticKind) => {
		const { a, b } = t.count[kind];
		if (a + b === 0)
			return (
				<span className="pointer-events-none flex w-[150px] shrink-0 justify-center text-sm text-muted-foreground/60">
					—
				</span>
			);
		const number = (side: Side) => {
			const wins = side === 'a' ? a > b : b > a;
			return (
				<span
					className={cn('w-6 text-base tabular-nums', side === 'a' ? 'text-right' : 'text-left')}
					style={wins ? { color: SIDE_COLOR[side], fontWeight: 700 } : undefined}
				>
					{side === 'a' ? a : b}
				</span>
			);
		};
		return (
			<span
				className="pointer-events-none flex w-[150px] shrink-0 items-center justify-center gap-2"
				title={`${KIND_PLURAL[kind]}: ${a} serve ${short(names.a)}, ${b} serve ${short(names.b)}`}
			>
				{number('a')}
				<span className="relative h-2" style={{ width: BAR }}>
					<span className="absolute inset-y-0 left-1/2 w-px bg-border" />
					<span
						className="absolute inset-y-0 right-1/2 mr-px rounded-l-full"
						style={{ width: (a / peak[kind]) * (BAR / 2), backgroundColor: SIDE_COLOR.a }}
					/>
					<span
						className="absolute inset-y-0 left-1/2 ml-px rounded-r-full"
						style={{ width: (b / peak[kind]) * (BAR / 2), backgroundColor: SIDE_COLOR.b }}
					/>
				</span>
				{number('b')}
			</span>
		);
	};

	const sideColumn = (t: ClauseTally, side: Side) => {
		const gets = servedTo(t, side, kinds);
		const all = allFragments.has(side);
		const fragments = all ? gets : gets.slice(0, SHOWN_FRAGMENTS);
		return (
			<div
				key={side}
				className="overflow-hidden rounded-lg border"
				style={{ borderColor: tint(SIDE_COLOR[side], 35) }}
			>
				<div
					className="flex items-center gap-2 px-3 py-2 text-xs font-semibold"
					style={{ backgroundColor: tint(SIDE_COLOR[side], 10), color: SIDE_COLOR[side] }}
				>
					<span className="size-2 rounded-full" style={{ backgroundColor: SIDE_COLOR[side] }} />
					What {short(names[side])} gets
					<span
						className="rounded-full px-1.5 text-[10px] text-white tabular-nums"
						style={{ backgroundColor: SIDE_COLOR[side] }}
					>
						{gets.length}
					</span>
				</div>
				{gets.length === 0 ? (
					<p className="px-3 py-3 text-2xs text-muted-foreground">
						Nothing of the types shown serves {short(names[side])} here.
					</p>
				) : (
					<div className="divide-y divide-border/60 bg-card">
						{fragments.map((s) => (
							<Fragment
								key={`${s.mark.id}-${s.to}`}
								served={s}
								section={t.section}
								onOpen={onOpen}
							/>
						))}
					</div>
				)}
				{gets.length > SHOWN_FRAGMENTS && (
					<button
						type="button"
						onClick={() =>
							setAllFragments((prev) => {
								const next = new Set(prev);
								if (all) next.delete(side);
								else next.add(side);
								return next;
							})
						}
						className="block w-full border-t border-border/60 bg-card px-3 py-1.5 text-left text-2xs font-medium text-primary hover:underline"
					>
						{all ? '− fewer fragments' : `+ ${gets.length - SHOWN_FRAGMENTS} more fragments`}
					</button>
				)}
			</div>
		);
	};

	const detail = (t: ClauseTally, verdict: TypeVerdict) => {
		const { byKind } = typeVerdict(t.count, kinds);
		const answer = reviews[t.clauseId];
		const options = [
			{ id: 'agree', label: 'Yes' },
			...otherVerdicts(verdict).map((f) => ({
				id: f,
				label: f === 'tie' ? 'No, it is a tie' : `No, it favours ${short(names[f])}`,
			})),
		];
		return (
			<div className="space-y-3">
				<p className="text-sm font-medium text-foreground">
					{scoredSentence(t.count, verdict, byKind, kinds, names)}
				</p>
				<div className="grid grid-cols-2 gap-3">{SIDES.map((side) => sideColumn(t, side))}</div>
				<div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium">
					Do you agree with «
					{verdict === 'mixed' ? 'Depends on the type' : `Favours ${verdictLabel(verdict, names)}`}
					»?
					{options.map((o) => (
						<button
							type="button"
							key={o.id}
							onClick={() => review(t.clauseId, o.id)}
							className={cn(
								'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-normal',
								answer === o.id
									? 'border-primary bg-primary font-semibold text-primary-foreground'
									: 'border-border bg-card hover:bg-muted/40'
							)}
						>
							{o.id === 'agree' && <CheckIcon className="size-3" />}
							{o.label}
						</button>
					))}
				</div>
			</div>
		);
	};

	return (
		<div className="min-h-0 flex-1 overflow-auto">
			<div className="min-w-[760px] space-y-4 p-4">
				<div className="space-y-1">
					<h3 className="text-lg font-bold text-foreground">Who does each clause favour?</h3>
					<p className="text-xs leading-relaxed text-foreground">
						Each type is compared separately. A party wins a clause only if it loses in no type; if
						it wins in one and loses in another, it depends on the type.
					</p>
				</div>

				<div className="grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.25fr)] gap-3">
					{DEONTIC_KINDS.map(scoreCard)}
					<div className="rounded-xl bg-foreground p-3 text-background">
						<p className="text-[10px] font-semibold tracking-wider uppercase opacity-70">
							Contract verdict
						</p>
						<p className="mt-0.5 flex items-center gap-2 text-2xl leading-tight font-bold">
							<span
								className="size-2.5 shrink-0 rounded-full"
								style={{
									backgroundColor: lead ? SIDE_COLOR[lead] : verdictColor(contract.verdict),
								}}
							/>
							{verdictLabel(contract.verdict, names)}
						</p>
						<p className="mt-1 text-xs leading-snug opacity-90">{contractLine()}</p>
						<p className="mt-1.5 text-2xs leading-snug opacity-70">{clauseLine()}</p>
					</div>
				</div>

				<div className="flex flex-wrap items-center justify-between gap-2">
					<KindFilter kinds={kinds} onToggle={toggleKind} />
					<div
						role="tablist"
						aria-label="Clauses by verdict"
						className="inline-flex rounded-lg border border-border bg-secondary p-[3px]"
					>
						{filters.map((f) => {
							const n = f.id === 'all' ? shown.length : counts[f.id];
							const on = filter === f.id;
							return (
								<button
									type="button"
									role="tab"
									key={f.id}
									aria-selected={on}
									disabled={n === 0 && !on}
									onClick={() => {
										setFilter(f.id);
										setOpenId(undefined);
										setLimit(PAGE);
									}}
									className={cn(
										'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-40',
										on ? 'bg-foreground text-background' : 'hover:bg-card'
									)}
									style={on ? undefined : { color: f.color }}
								>
									{f.label}
									<span className="font-normal tabular-nums opacity-80">{n}</span>
								</button>
							);
						})}
					</div>
				</div>

				<div className="overflow-hidden rounded-xl border border-border bg-card">
					<div className="flex items-center gap-2 bg-secondary px-3 py-2 text-[10px] font-bold tracking-wider uppercase">
						<span className="flex-1 pl-11">
							Clause{' '}
							<span className="font-normal text-muted-foreground normal-case">
								· by importance ↓
							</span>
						</span>
						{kinds.map((kind) => (
							<span key={kind} className="flex w-[150px] shrink-0 flex-col items-center">
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
						<span className="w-40 shrink-0">Verdict</span>
						<span className="w-4 shrink-0" />
					</div>
					{rows.length === 0 && (
						<p className="px-4 py-6 text-center text-xs text-muted-foreground">
							No clause has this verdict in the types shown.
						</p>
					)}
					<Accordion
						type="single"
						collapsible
						value={opened?.clauseId ?? ''}
						onValueChange={(value) => open(value || null)}
					>
						{rows.slice(0, limit).map((t) => {
							const { verdict, byKind } = typeVerdict(t.count, kinds);
							const color = verdictColor(verdict);
							return (
								<AccordionItem
									key={t.clauseId}
									value={t.clauseId}
									className="border-border/60 data-[state=open]:bg-muted/30"
								>
									{/* The trigger fills the row from underneath; the graph link sits on top
									    of it, so a click on it does not toggle the row. */}
									<AccordionPrimitive.Header className="group relative flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30">
										<AccordionPrimitive.Trigger
											className="absolute inset-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
											aria-label={`${t.heading}: show what each party gets`}
										/>
										<span
											className="pointer-events-none h-8 w-[3px] shrink-0 rounded-full"
											style={{ backgroundColor: verdict === 'tie' ? 'var(--border)' : color }}
										/>
										<span className="pointer-events-none flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-2xs font-semibold tabular-nums">
											{rank.get(t.clauseId)}
										</span>
										<span className="min-w-0 flex-1">
											<span className="pointer-events-none block truncate text-sm font-semibold text-foreground">
												{t.heading}
											</span>
											<span className="flex items-center gap-2">
												{t.section && (
													<span className="pointer-events-none rounded bg-secondary px-1 text-[10px] font-medium">
														{t.section}
													</span>
												)}
												{onOpenGraph && <GraphLink onClick={() => onOpenGraph(t.clauseId)} />}
											</span>
										</span>
										{kinds.map((kind) => (
											<span key={kind} className="contents">
												{cell(t, kind)}
											</span>
										))}
										<span className="pointer-events-none w-40 shrink-0 space-y-0.5">
											<span
												className={cn(
													'inline-flex rounded-md px-2 py-0.5 text-2xs font-semibold whitespace-nowrap',
													verdict === 'a' || verdict === 'b'
														? 'text-white'
														: verdict === 'mixed'
															? 'text-warning-foreground'
															: 'bg-secondary text-foreground'
												)}
												style={verdict === 'tie' ? undefined : { backgroundColor: color }}
											>
												{verdictLabel(verdict, names)}
											</span>
											<span className="block text-[10px] leading-snug text-muted-foreground">
												{verdictNote(verdict, byKind, kinds, names)}
											</span>
										</span>
										<ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
									</AccordionPrimitive.Header>
									<AccordionContent className="pr-4 pl-[60px]">
										{detail(t, verdict)}
									</AccordionContent>
								</AccordionItem>
							);
						})}
					</Accordion>
					{rows.length > limit && (
						<button
							type="button"
							onClick={() => setLimit((n) => n + PAGE)}
							className="block w-full border-t border-border/60 px-4 py-2 text-left text-xs font-medium text-primary hover:underline"
						>
							↓ {rows.length - limit} more clauses
						</button>
					)}
				</div>

				<p className="text-2xs text-muted-foreground">
					Your answers stay in this browser: {Object.keys(reviews).length} of {tallies.length}{' '}
					clauses reviewed.
				</p>
			</div>
		</div>
	);
}
