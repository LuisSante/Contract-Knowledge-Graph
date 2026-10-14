'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Accordion as AccordionPrimitive, Popover as PopoverPrimitive } from 'radix-ui';
import { ChevronDownIcon, InfoIcon, XIcon } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import {
	KIND_GLOSS,
	KIND_LABEL,
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
	CountTally,
	Scoreboard,
	VerdictBadge,
	VerdictFilter,
	WhatEachGets,
	type VerdictFilterValue,
} from '@/features/docx/components/clause-analyzer/views/verdict-bits';
import type { DeonticKind } from '@/types/knowledge';
import type { ViewProps } from '@/features/docx/components/clause-analyzer/views/types';

const PAGE = 10;

function ClassificationInfo({ names }: { names: ViewProps['names'] }) {
	return (
		<PopoverPrimitive.Root>
			<PopoverPrimitive.Trigger asChild>
				<button
					type="button"
					aria-label="Explain count-based classifications"
					className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
				>
					<InfoIcon className="size-4" aria-hidden="true" />
				</button>
			</PopoverPrimitive.Trigger>
			<PopoverPrimitive.Portal>
				<PopoverPrimitive.Content
					aria-label="Count-based classifications"
					side="bottom"
					align="end"
					sideOffset={8}
					collisionPadding={12}
					className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-4 text-sm text-card-foreground shadow-sm"
				>
					<div className="flex items-start justify-between gap-3">
						<p className="font-semibold">Count-based classifications</p>
						<PopoverPrimitive.Close
							aria-label="Close classification explanation"
							className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
						>
							<XIcon className="size-4" aria-hidden="true" />
						</PopoverPrimitive.Close>
					</div>
					<dl className="mt-3 space-y-3 text-xs leading-relaxed">
						<div>
							<dt className="font-semibold">
								{short(names.a)} / {short(names.b)}
							</dt>
							<dd className="mt-1">
								More rights in at least one selected category; equal or more in the others.
							</dd>
						</div>
						<div>
							<dt className="font-semibold">Equal counts</dt>
							<dd className="mt-1">Same number of rights in each selected category.</dd>
						</div>
						<div>
							<dt className="font-semibold">Depends on the type</dt>
							<dd className="mt-1">Different parties lead in different selected categories.</dd>
						</div>
					</dl>
				</PopoverPrimitive.Content>
			</PopoverPrimitive.Portal>
		</PopoverPrimitive.Root>
	);
}

function VerdictInfo({ reason, clause }: { reason: string; clause: string }) {
	const [open, setOpen] = useState(false);
	return (
		<Tooltip open={open} onOpenChange={setOpen}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={`Explain the result for ${clause}`}
					className="relative z-10 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						setOpen(true);
					}}
				>
					<InfoIcon className="size-4" aria-hidden="true" />
				</button>
			</TooltipTrigger>
			<TooltipContent
				side="top"
				sideOffset={6}
				className="max-w-64 border border-border bg-card text-card-foreground shadow-sm [&_svg]:bg-card [&_svg]:fill-card"
			>
				{reason}
			</TooltipContent>
		</Tooltip>
	);
}

export function ByTypeView({ docId, kg, grid, names, importance, onOpen, onOpenGraph }: ViewProps) {
	const [limit, setLimit] = useState(PAGE);
	const [kinds, toggleKind] = useKinds();
	const [filter, setFilter] = useState<VerdictFilterValue>('all');
	const [sortByImportance, setSortByImportance] = useState(true);
	const [openId, setOpenId] = useState<string | null>(null);
	const { reviews, review } = useReviews(docId);
	const { tallies, total, rank } = useTallies(grid, kg, importance, sortByImportance);
	const shown = tallies.filter((t) => hasKinds(t, kinds));
	const counts = verdictCounts(shown, kinds);
	const rows =
		filter === 'all' ? shown : shown.filter((t) => typeVerdict(t.count, kinds).verdict === filter);
	const opened = rows.find((t) => t.clauseId === openId) ?? null;

	const note = (verdict: TypeVerdict, byKind: Partial<Record<DeonticKind, Favour>>) =>
		verdictNote(verdict, byKind, kinds, names);

	const cell = (t: ClauseTally, kind: DeonticKind) => {
		const { a, b } = t.count[kind];
		if (a + b === 0)
			return (
				<span className="pointer-events-none flex min-w-[140px] flex-1 justify-center text-xs text-muted-foreground">
					No statements
				</span>
			);
		return (
			<span className="pointer-events-none flex min-w-[140px] flex-1 items-center px-1 py-1">
				<CountTally a={a} b={b} />
			</span>
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
			<WhatEachGets
				tally={t}
				kinds={kinds}
				names={names}
				conditions={kg.conditions}
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

	return (
		<div className="@container min-h-0 flex-1 overflow-auto">
			{/* Only the table needs its width; the scoreboard above fits whatever the panel gives. */}
			<div className="space-y-3 p-4">
				<Scoreboard total={total} kinds={kinds} counts={counts} names={names} />

				<div className="flex flex-wrap items-center justify-between gap-2">
					<KindFilter kinds={kinds} onToggle={toggleKind} label="Compare" />
					<VerdictFilter
						value={filter}
						counts={counts}
						names={names}
						onChange={(value) => {
							setFilter(value);
							setOpenId(null);
							setLimit(PAGE);
						}}
					/>
				</div>

				<div
					className="overflow-hidden rounded-xl border border-border bg-card"
					style={{ minWidth: 450 + kinds.length * 156 }}
				>
					<div className="flex items-center gap-4 bg-secondary px-3 py-2 text-xs font-semibold">
						{/* The importance is fetched, so the ordering cannot be offered before it lands. */}
						<button
							type="button"
							onClick={() => setSortByImportance((on) => !on)}
							disabled={!importance}
							className="w-[200px] shrink-0 pl-11 text-left text-muted-foreground uppercase enabled:hover:text-foreground disabled:cursor-default"
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
							<span
								key={kind}
								className="flex min-w-[140px] flex-1 flex-col items-center text-center"
								title={`${KIND_LABEL[kind]}: ${KIND_GLOSS[kind]}`}
							>
								<span>{KIND_LABEL[kind]}</span>
								<span className="mt-1 flex w-full items-center gap-1 text-xs font-medium">
									<span className="flex-1" style={{ color: SIDE_COLOR.a }}>
										{short(names.a)}
									</span>
									<span className="text-muted-foreground"> | </span>
									<span className="flex-1" style={{ color: SIDE_COLOR.b }}>
										{short(names.b)}
									</span>
								</span>
							</span>
						))}
						<div className="flex w-44 shrink-0 items-center gap-2 text-muted-foreground">
							<span>Count-based advantage</span>
							<ClassificationInfo names={names} />
						</div>
						{/* Room for the accordion's chevron, so the columns line up. */}
						<span className="w-4 shrink-0" />
					</div>
					{rows.length === 0 && (
						<p className="px-4 py-6 text-center text-xs text-muted-foreground">
							{shown.length === 0
								? 'No statements identified in the selected categories.'
								: 'No clause has this verdict in the selected categories.'}
						</p>
					)}
					<Accordion
						type="single"
						collapsible
						value={opened?.clauseId ?? ''}
						onValueChange={(value) => {
							setOpenId(value || null);
						}}
					>
						{rows.slice(0, limit).map((t) => {
							const { verdict, byKind } = typeVerdict(t.count, kinds);
							const title = [t.section, t.heading].filter(Boolean).join(' · ');
							return (
								<AccordionItem
									key={t.clauseId}
									value={t.clauseId}
									className={cn('border-border/60', verdict === 'mixed' && 'bg-warning/10')}
								>
									{/* Counts and titles share the row trigger; graph and info stay separate. */}
									<AccordionPrimitive.Header className="group relative flex items-center gap-4 px-3 py-2.5 hover:bg-muted/30 data-[state=open]:bg-muted/30">
										<AccordionPrimitive.Trigger
											className="absolute inset-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
											aria-label={`${title}: show the fragments behind its verdict`}
										/>
										<span className="flex w-[200px] shrink-0 items-center gap-2">
											<ClauseLead
												tally={t}
												verdict={verdict}
												rank={rank.get(t.clauseId)}
												onOpenGraph={onOpenGraph}
											/>
										</span>
										{kinds.map((kind) => (
											<span key={kind} className="contents">
												{cell(t, kind)}
											</span>
										))}
										<span className="flex w-44 shrink-0 items-center gap-2 font-normal">
											<span className="pointer-events-none">
												<VerdictBadge verdict={verdict} names={names} />
											</span>
											<VerdictInfo reason={note(verdict, byKind)} clause={title} />
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
					{Object.keys(reviews).length} of {tallies.length} clauses reviewed.
				</p>
			</div>
		</div>
	);
}
