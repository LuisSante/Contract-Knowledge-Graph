'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ArrowUpRightIcon, CheckIcon, SearchIcon } from 'lucide-react';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import { KIND_COLORS } from '@/features/docx/components/clause-analyzer/constants';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import {
	Fragment,
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
	servedTo,
	useClauseNotes,
	useKinds,
	useReviews,
	useTallies,
} from '@/features/docx/components/clause-analyzer/views/favour-shared';
import {
	typeVerdict,
	type ClauseTally,
	type Served,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind } from '@/types/knowledge';
import type { ViewProps } from '@/features/docx/components/clause-analyzer/views/types';

const SHOWN_FRAGMENTS = 4;
const SIDES: Side[] = ['a', 'b'];

/** The other end of a statement, from the side of the party it serves. */
const tagOf = (s: Served, names: Record<Side, string>) => {
	if (s.to === 'both') return 'reciprocal';
	if (s.kind === 'right') return `right of ${short(names[s.to])}`;
	if (s.by === 'both') return 'both comply';
	return s.by ? `${short(names[s.by])} complies` : undefined;
};

/** The clause list on the left and the selected clause's whole record on the right, with no
 *  accordion moving the page; the selection is the one the graph tab shows. */
export function EvidencePanelView({
	docId,
	kg,
	grid,
	names,
	importance,
	onOpen,
	onOpenGraph,
}: ViewProps) {
	const [kinds, toggleKind] = useKinds();
	const [search, setSearch] = useState('');
	const [tab, setTab] = useState<{ clauseId: string; side: Side } | null>(null);
	const [allFragments, setAllFragments] = useState(false);
	const { reviews, review } = useReviews(docId);
	const { tallies, rank } = useTallies(grid, kg, importance);
	const selectedClause = useClauseAnalyzerStore((s) => s.selectedClause);
	const selectClause = useClauseAnalyzerStore((s) => s.selectClause);

	const shown = tallies.filter((t) => hasKinds(t, kinds));
	const needle = search.trim().toLowerCase();
	const rows = needle
		? shown.filter((t) => `${t.heading} ${t.section ?? ''}`.toLowerCase().includes(needle))
		: shown;
	const selectedId = selectedClause?.docId === docId ? selectedClause.clauseId : null;
	// The search narrows the list, not the record: the open clause stays open while typing.
	const opened = shown.find((t) => t.clauseId === selectedId) ?? rows[0] ?? null;

	useClauseNotes(kg, opened, kinds, names);

	const select = (clauseId: string) => {
		selectClause(docId, clauseId);
		setAllFragments(false);
	};

	const miniCount = (t: ClauseTally, kind: DeonticKind) => {
		const { a, b } = t.count[kind];
		const side = (s: Side) => {
			const wins = s === 'a' ? a > b : b > a;
			return (
				<span style={wins ? { color: SIDE_COLOR[s], fontWeight: 700 } : undefined}>
					{s === 'a' ? a : b}
				</span>
			);
		};
		return (
			<span key={kind} className="inline-flex items-center gap-1 tabular-nums">
				<span className="size-1.5 rounded-[1px]" style={{ backgroundColor: KIND_COLORS[kind] }} />
				{a + b === 0 ? (
					<span className="text-muted-foreground">—</span>
				) : (
					<>
						{side('a')}
						<span className="text-muted-foreground">·</span>
						{side('b')}
					</>
				)}
			</span>
		);
	};

	const list = (
		<div className="flex min-h-0 flex-col gap-2 p-3 @3xl:overflow-y-auto">
			<label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 focus-within:ring-[3px] focus-within:ring-ring/50">
				<SearchIcon className="size-3.5 text-muted-foreground" />
				<input
					type="search"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					placeholder="Search clause…"
					className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
				/>
			</label>
			<KindFilter kinds={kinds} onToggle={toggleKind} label="" compact />
			<p className="flex items-center justify-between text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
				By importance ↓
				<span className="font-normal tracking-normal normal-case">
					{rows.length} {rows.length === 1 ? 'clause' : 'clauses'}
				</span>
			</p>
			{rows.length === 0 && (
				<p className="py-6 text-center text-xs text-muted-foreground">No clause matches.</p>
			)}
			<div role="listbox" aria-label="Clauses" className="space-y-0.5">
				{rows.map((t) => {
					const { verdict } = typeVerdict(t.count, kinds);
					const on = opened?.clauseId === t.clauseId;
					const color = verdictColor(verdict);
					return (
						<button
							type="button"
							role="option"
							aria-selected={on}
							key={t.clauseId}
							onClick={() => select(t.clauseId)}
							className={cn(
								'flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left',
								on ? 'bg-card shadow-sm' : 'border-transparent hover:bg-muted/40'
							)}
							style={
								on ? { borderColor: color === 'var(--foreground)' ? undefined : color } : undefined
							}
						>
							<span className="w-5 shrink-0 text-center text-xs text-muted-foreground tabular-nums">
								{rank.get(t.clauseId)}
							</span>
							<span className="min-w-0 flex-1">
								<span className="flex items-baseline gap-1.5">
									<span className="truncate text-xs font-semibold text-foreground">
										{t.heading}
									</span>
									{t.section && (
										<span className="shrink-0 text-2xs text-muted-foreground">{t.section}</span>
									)}
								</span>
								<span className="mt-0.5 flex gap-3 text-2xs">
									{kinds.map((kind) => miniCount(t, kind))}
								</span>
							</span>
							<span
								className={cn(
									'inline-flex shrink-0 items-center gap-1 text-2xs font-semibold',
									verdict === 'mixed' && 'text-warning-foreground'
								)}
								style={verdict === 'a' || verdict === 'b' ? { color } : undefined}
							>
								<span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
								{verdict === 'mixed' ? 'Depends' : verdictLabel(verdict, names)}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);

	const record = (t: ClauseTally) => {
		const { verdict, byKind } = typeVerdict(t.count, kinds);
		const side = verdict === 'a' || verdict === 'b' ? verdict : null;
		const color = verdictColor(verdict);
		const won = (s: Side) =>
			listOf(kinds.filter((k) => byKind[k] === s).map((k) => KIND_PLURAL[k].toLowerCase()));
		const reason =
			verdict === 'tie'
				? 'The two parties are even in every type shown.'
				: verdict === 'mixed'
					? `${short(names.a)} wins in ${won('a')}, ${short(names.b)} in ${won('b')}: choosing between them would mean weighting them.`
					: `Wins in ${won(verdict)}, and loses in no type.`;
		const peak = Math.max(1, ...kinds.map((k) => Math.max(t.count[k].a, t.count[k].b)));
		const shownSide = tab?.clauseId === t.clauseId ? tab.side : (side ?? 'a');
		const gets = servedTo(t, shownSide, kinds);
		const fragments = allFragments ? gets : gets.slice(0, SHOWN_FRAGMENTS);
		const answer = reviews[t.clauseId];
		const options = [
			{
				id: 'agree',
				label: side
					? `Yes, favours ${short(names[side])}`
					: `Yes, ${verdictLabel(verdict, names).toLowerCase()}`,
			},
			...otherVerdicts(verdict).map((f) => ({
				id: f,
				label: f === 'tie' ? 'No: tie' : `No: ${short(names[f])}`,
			})),
		];

		return (
			<div className="flex min-h-full flex-col gap-4 p-4">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<span className="text-xs text-muted-foreground">
						{t.section && <span className="font-medium text-foreground">{t.section} · </span>}
						No. {rank.get(t.clauseId)} in importance
					</span>
					<span className="flex gap-2">
						<button
							type="button"
							onClick={() => onOpen(t.clauseId)}
							className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted/40"
						>
							View in contract
						</button>
						{onOpenGraph && (
							<button
								type="button"
								onClick={() => onOpenGraph(t.clauseId)}
								className="inline-flex items-center gap-0.5 rounded-md border border-primary/50 bg-card px-2.5 py-1 text-xs font-medium text-primary hover:bg-accent"
							>
								View in graph
								<ArrowUpRightIcon className="size-3" />
							</button>
						)}
					</span>
				</div>

				<h3 className="text-2xl leading-tight font-bold text-foreground">{t.heading}</h3>

				<div
					className="flex items-center gap-3 rounded-xl px-4 py-3"
					style={{ backgroundColor: tint(color, verdict === 'tie' ? 5 : 9) }}
				>
					<span
						className={cn(
							'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
							verdict === 'mixed' ? 'text-warning-foreground' : 'text-background'
						)}
						style={{ backgroundColor: color }}
					>
						{side ? short(names[side]).charAt(0).toUpperCase() : verdict === 'mixed' ? '?' : '='}
					</span>
					<span className="min-w-0">
						<span
							className={cn(
								'block text-base font-semibold',
								verdict === 'mixed' && 'text-warning-foreground'
							)}
							style={side ? { color } : undefined}
						>
							{side ? `Favours ${short(names[side])}` : verdictLabel(verdict, names)}
						</span>
						<span className="block text-xs text-foreground">{reason}</span>
					</span>
				</div>

				<div className="space-y-2">
					<p className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
						Type by type
					</p>
					{kinds.map((kind) => {
						const { a, b } = t.count[kind];
						const favour = byKind[kind];
						const tone = (s: Side) =>
							favour === s ? { color: SIDE_COLOR[s], fontWeight: 700 } : undefined;
						return (
							<div key={kind} className="flex items-center gap-2 text-xs">
								<span className="flex w-28 shrink-0 items-center gap-1.5 font-medium">
									<span
										className="size-2.5 rounded-[2px]"
										style={{ backgroundColor: KIND_COLORS[kind] }}
									/>
									{KIND_PLURAL[kind]}
								</span>
								<span className="w-6 shrink-0 text-right tabular-nums" style={tone('a')}>
									{a}
								</span>
								<span className="flex h-2.5 flex-1 justify-end">
									<span
										className="rounded-full"
										style={{ width: `${(a / peak) * 100}%`, backgroundColor: SIDE_COLOR.a }}
									/>
								</span>
								<span className="h-4 w-px shrink-0 bg-border" />
								<span className="flex h-2.5 flex-1">
									<span
										className="rounded-full"
										style={{ width: `${(b / peak) * 100}%`, backgroundColor: SIDE_COLOR.b }}
									/>
								</span>
								<span className="w-6 shrink-0 tabular-nums" style={tone('b')}>
									{b}
								</span>
								<span
									className="w-24 shrink-0 text-2xs text-muted-foreground"
									style={
										favour === 'a' || favour === 'b' ? { color: SIDE_COLOR[favour] } : undefined
									}
								>
									{a + b === 0
										? 'no statements'
										: favour === 'a' || favour === 'b'
											? `${short(names[favour])} wins`
											: 'tie'}
								</span>
							</div>
						);
					})}
				</div>

				<div className="space-y-2">
					<div role="tablist" className="flex gap-4 border-b border-border">
						{SIDES.map((s) => {
							const n = servedTo(t, s, kinds).length;
							const on = shownSide === s;
							return (
								<button
									type="button"
									role="tab"
									key={s}
									aria-selected={on}
									onClick={() => {
										setTab({ clauseId: t.clauseId, side: s });
										setAllFragments(false);
									}}
									className={cn(
										'-mb-px flex items-center gap-1.5 border-b-2 pb-1.5 text-xs',
										on
											? 'font-semibold'
											: 'border-transparent text-foreground hover:text-foreground/80'
									)}
									style={on ? { borderColor: SIDE_COLOR[s], color: SIDE_COLOR[s] } : undefined}
								>
									What {short(names[s])} gets
									<span
										className="rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
										style={{
											backgroundColor: on ? SIDE_COLOR[s] : tint(SIDE_COLOR[s], 15),
											color: on ? 'white' : SIDE_COLOR[s],
										}}
									>
										{n}
									</span>
								</button>
							);
						})}
					</div>
					{gets.length === 0 ? (
						<p className="py-3 text-xs text-muted-foreground">
							Nothing of the types shown serves {short(names[shownSide])} in this clause.
						</p>
					) : (
						<div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-card">
							{fragments.map((s) => (
								<Fragment
									key={`${s.mark.id}-${s.to}`}
									served={s}
									section={t.section}
									tag={tagOf(s, names)}
									onOpen={onOpen}
								/>
							))}
						</div>
					)}
					{gets.length > SHOWN_FRAGMENTS && (
						<button
							type="button"
							onClick={() => setAllFragments((on) => !on)}
							className="text-2xs font-medium text-primary hover:underline"
						>
							{allFragments
								? '− fewer fragments'
								: `+ ${gets.length - SHOWN_FRAGMENTS} more fragments`}
						</button>
					)}
				</div>

				{/* Pinned to the bottom of the record, so the question is never scrolled away. */}
				<div className="sticky bottom-0 mt-auto">
					<div className="flex flex-wrap items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-xs text-background">
						<span className="mr-1 font-medium">Agree with the verdict?</span>
						{options.map((o) => {
							const on = answer === o.id;
							return (
								<button
									type="button"
									key={o.id}
									onClick={() => review(t.clauseId, o.id)}
									className={cn(
										'inline-flex items-center gap-1 rounded-md border px-2.5 py-1',
										on
											? 'border-transparent font-semibold text-white'
											: 'border-background/30 hover:bg-background/10'
									)}
									style={
										on
											? {
													backgroundColor:
														o.id === 'agree'
															? side
																? SIDE_COLOR[side]
																: 'var(--primary)'
															: 'var(--primary)',
												}
											: undefined
									}
								>
									{o.id === 'agree' && <CheckIcon className="size-3" />}
									{o.label}
								</button>
							);
						})}
					</div>
				</div>
			</div>
		);
	};

	return (
		<div className="@container min-h-0 flex-1 overflow-y-auto @3xl:overflow-hidden">
			<div className="flex flex-col @3xl:h-full @3xl:flex-row">
				<div className="border-border/60 @3xl:w-[340px] @3xl:shrink-0 @3xl:border-r @5xl:w-[400px] @3xl:flex @3xl:flex-col @3xl:min-h-0 order-2 @3xl:order-1 border-t @3xl:border-t-0">
					{list}
				</div>
				{/* On a narrow panel the record opens above the list. */}
				<div className="order-1 min-w-0 flex-1 @3xl:order-2 @3xl:overflow-y-auto">
					{opened ? (
						record(opened)
					) : (
						<p className="p-6 text-center text-sm text-muted-foreground">
							Pick a clause to see its evidence.
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
