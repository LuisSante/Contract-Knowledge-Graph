'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import { ChevronDownIcon } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem } from '@/components/ui/accordion';
import { KIND_COLORS } from '@/features/docx/components/clause-analyzer/constants';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import {
	KIND_PLURAL,
	KindFilter,
} from '@/features/docx/components/clause-analyzer/views/favour-bits';
import {
	typeVerdict,
	type ClauseTally,
	type Favour,
	type TypeVerdict,
} from '@/features/docx/utils/knowledge/clause-favour';
import {
	hasKinds,
	useClauseNotes,
	useKinds,
	useReviews,
	useTallies,
	verdictCounts,
	verdictNote,
	scoredSentence,
} from '@/features/docx/components/clause-analyzer/views/favour-shared';
import {
	AgreeBox,
	ClauseLead,
	DotTally,
	Scoreboard,
	VerdictBadge,
	VerdictFilter,
	WhatEachGets,
	type VerdictFilterValue,
} from '@/features/docx/components/clause-analyzer/views/verdict-bits';
import type { DeonticKind } from '@/types/knowledge';
import type { ViewProps } from '@/features/docx/components/clause-analyzer/views/types';

const PAGE = 10;
/** Past six a side's dots stop growing, so the clause name keeps its room beside the verdict. */
const MAX_DOTS = 6;

/** Obligations, rights and prohibitions never added together, each clause opening onto
 *  the fragments that hold its verdict up. */
export function ByTypeView({ docId, kg, grid, names, importance, onOpen, onOpenGraph }: ViewProps) {
	const [limit, setLimit] = useState(PAGE);
	const [kinds, toggleKind] = useKinds();
	const [filter, setFilter] = useState<VerdictFilterValue>('all');
	const [sortByImportance, setSortByImportance] = useState(true);
	// Every row starts closed; the reader opens the one they want.
	const [openId, setOpenId] = useState<string | null>(null);
	const [fragmentKind, setFragmentKind] = useState<DeonticKind | null>(null);
	const { reviews, review } = useReviews(docId);
	const { tallies, total, rank } = useTallies(grid, kg, importance, sortByImportance);
	const shown = tallies.filter((t) => hasKinds(t, kinds));
	const counts = verdictCounts(shown, kinds);
	const rows =
		filter === 'all' ? shown : shown.filter((t) => typeVerdict(t.count, kinds).verdict === filter);
	const opened = rows.find((t) => t.clauseId === openId) ?? null;

	useClauseNotes(kg, opened, kinds, names);

	const note = (verdict: TypeVerdict, byKind: Partial<Record<DeonticKind, Favour>>) =>
		verdictNote(verdict, byKind, kinds, names);

	/** Opens the clause on that type's fragments; on the type already shown, on all of them. */
	const filterBy = (clauseId: string, kind: DeonticKind) => {
		const same = opened?.clauseId === clauseId && fragmentKind === kind;
		setOpenId(clauseId);
		setFragmentKind(same ? null : kind);
	};

	const cell = (t: ClauseTally, kind: DeonticKind) => {
		const { a, b } = t.count[kind];
		if (a + b === 0)
			return (
				<span className="pointer-events-none flex w-[140px] shrink-0 justify-center text-xs text-muted-foreground/60">
					—
				</span>
			);
		const active = opened?.clauseId === t.clauseId && fragmentKind === kind;
		return (
			<button
				type="button"
				onClick={() => filterBy(t.clauseId, kind)}
				className={cn(
					'relative z-10 flex w-[140px] shrink-0 items-center rounded-md px-1 py-1 hover:bg-muted',
					active && 'bg-accent ring-1 ring-primary/40'
				)}
				title={
					active
						? 'Show the fragments of every type'
						: `${KIND_PLURAL[kind]}: ${a} serve ${short(names.a)}, ${b} serve ${short(names.b)} — click to see only these fragments`
				}
			>
				<DotTally a={a} b={b} max={MAX_DOTS} />
			</button>
		);
	};

	const detail = (
		t: ClauseTally,
		verdict: TypeVerdict,
		byKind: Partial<Record<DeonticKind, Favour>>
	) => (
		<div className="space-y-3">
			<p className="text-sm font-medium text-foreground">
				{scoredSentence(t.count, verdict, byKind, kinds, names)}
			</p>
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
			<WhatEachGets
				key={fragmentKind ?? 'every'}
				tally={t}
				kinds={fragmentKind ? [fragmentKind] : kinds}
				names={names}
				onOpen={onOpen}
			/>
			<AgreeBox
				verdict={verdict}
				names={names}
				answer={reviews[t.clauseId]}
				onAnswer={(answer) => review(t.clauseId, answer)}
			/>
		</div>
	);

	const showKind = (kind: DeonticKind) => {
		setFragmentKind(null);
		toggleKind(kind);
	};

	return (
		<div className="min-h-0 flex-1 overflow-auto">
			<div className="min-w-[820px] space-y-3 p-4">
				<Scoreboard total={total} kinds={kinds} counts={counts} names={names} />

				<div className="flex flex-wrap items-center justify-between gap-2">
					<KindFilter kinds={kinds} onToggle={showKind} />
					<VerdictFilter
						value={filter}
						counts={counts}
						names={names}
						onChange={(value) => {
							setFilter(value);
							setOpenId(null);
							setFragmentKind(null);
							setLimit(PAGE);
						}}
					/>
				</div>

				<div className="overflow-hidden rounded-xl border border-border bg-card">
					<div className="flex items-center gap-2 bg-secondary px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase">
						{/* The importance is fetched, so the ordering cannot be offered before it lands. */}
						<button
							type="button"
							onClick={() => setSortByImportance((on) => !on)}
							disabled={!importance}
							className="flex-1 pl-11 text-left text-muted-foreground uppercase enabled:hover:text-foreground disabled:cursor-default"
							title="Order the rows by how much each clause weighs inside the contract (PageRank with a per-clause prior), or by its position in the document"
						>
							Clause
							{importance && (
								<span className="font-normal normal-case">
									{sortByImportance ? ' · by importance ↓' : ' · by order'}
								</span>
							)}
						</button>
						{kinds.map((kind) => (
							<span key={kind} className="flex w-[140px] shrink-0 flex-col items-center">
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
						<span className="w-36 shrink-0 text-muted-foreground">Weight-free verdict</span>
						{/* Room for the accordion's chevron, so the columns line up. */}
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
						onValueChange={(value) => {
							setOpenId(value || null);
							setFragmentKind(null);
						}}
					>
						{rows.slice(0, limit).map((t) => {
							const { verdict, byKind } = typeVerdict(t.count, kinds);
							return (
								<AccordionItem
									key={t.clauseId}
									value={t.clauseId}
									className={cn('border-border/60', verdict === 'mixed' && 'bg-warning/10')}
								>
									{/* The trigger fills the row from underneath; the cells are buttons
									    on top of it, so a click on a count filters instead of toggling. */}
									<AccordionPrimitive.Header className="group relative flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 data-[state=open]:bg-muted/30">
										<AccordionPrimitive.Trigger
											className="absolute inset-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
											aria-label={`${t.heading}: show the fragments behind its verdict`}
										/>
										<ClauseLead
											tally={t}
											verdict={verdict}
											rank={rank.get(t.clauseId)}
											onOpenGraph={onOpenGraph}
										/>
										{kinds.map((kind) => (
											<span key={kind} className="contents">
												{cell(t, kind)}
											</span>
										))}
										<span className="pointer-events-none w-36 shrink-0 space-y-0.5 font-normal">
											<VerdictBadge verdict={verdict} names={names} />
											<span className="block text-[10px] leading-snug text-muted-foreground">
												{note(verdict, byKind)}
											</span>
										</span>
										<ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
									</AccordionPrimitive.Header>
									<AccordionContent className="pt-1 pr-4 pl-[60px]">
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
					Your answers stay in this browser: {Object.keys(reviews).length} of {tallies.length}{' '}
					clauses reviewed.
				</p>
			</div>
		</div>
	);
}
