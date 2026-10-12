'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem } from '@/components/ui/accordion';
import { KIND_COLORS } from '@/features/docx/components/clause-analyzer/constants';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import {
	Fragment,
	GraphLink,
	tint,
} from '@/features/docx/components/clause-analyzer/views/favour-bits';
import {
	hasKinds,
	useClauseNotes,
	useKinds,
	useReviews,
	useTallies,
} from '@/features/docx/components/clause-analyzer/views/favour-shared';
import {
	Caret,
	Diverging,
	GradeAgree,
	GradeTag,
	NEUTRAL_INK,
	SIDES,
	SideMarks,
	burdenOf,
	gradeCounts,
	gradeOf,
	gradeSide,
	isOnly,
	otherSide,
	servedOf,
	type Burden,
	type Grade,
} from '@/features/docx/components/clause-analyzer/views/proposals/shared';
import {
	DEONTIC_KINDS,
	typeVerdict,
	type ClauseTally,
	type Served,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind } from '@/types/knowledge';
import type { ViewProps } from '@/features/docx/components/clause-analyzer/views/types';

const PAGE = 10;
/** Past six a side's marks stop growing in a row, so the number says the rest and the
 *  marks fit the narrowest column. */
const MAX_MARKS = 6;
/** Marks per line under a header sentence, as many as the narrowest half holds; two lines
 *  at most. */
const HEADER_LINE = 10;
/** Fragments shown per group before "+ n more". */
const SHOWN_FRAGMENTS = 2;
/** The clause column: rank, number and a readable heading, then the grade's slot. The
 *  header and every row size it alike, so the type columns line up under their sentences. */
const LEAD = 'min-w-[302px] flex-[1_1_334px]';
/** The type columns share what the clause column leaves, never under 150 px each. */
const COLUMNS = 'flex min-w-[458px] flex-[3_1_608px] gap-1';
/** The grade's slot, in the header and every row; a longer tag widens it and the heading
 *  gives way. */
const GRADE_SLOT = 'min-w-[124px]';
/** A name outside its own side: neutral ink, and the theme's ink in dark mode. */
const INK = 'text-(--p6-ink) dark:text-foreground';

/** Each type is named by what the party that bears it does. */
const VERB: Record<DeonticKind, string> = {
	obligation: 'owes',
	right: 'may',
	prohibition: 'may not',
};
/** The same verbs for a single statement, on its fragment. */
const MODAL: Record<DeonticKind, string> = {
	obligation: 'must',
	right: 'may',
	prohibition: 'must not',
};

/** Rings for what a party gets through the other's duty, discs for what it may do itself. */
const hollow = (kind: DeonticKind) => kind !== 'right';

/** Who a statement serving `to` is said of: the holder of a right, otherwise the other
 *  party, which has to honour it. */
const subjectOf = (kind: DeonticKind, to: Side): Side => (kind === 'right' ? to : otherSide(to));

/** "National owes 11 for Equidata"; a right needs no beneficiary, its holder is one. */
const say = (kind: DeonticKind, to: Side, n: number, names: Record<Side, string>) =>
	`${short(names[subjectOf(kind, to)])} ${VERB[kind]} ${n}${kind === 'right' ? '' : ` for ${short(names[to])}`}`;

/** One half of a type column: the statements of one type that serve one party. */
interface Half {
	kind: DeonticKind;
	to: Side;
}

/** The grade filter merges "only" and "more" into each party's option. */
type GradeGroup = Side | 'balanced' | 'mixed';
type GradeFilter = GradeGroup | 'all';

const groupOf = (grade: Grade): GradeGroup =>
	gradeSide(grade) ?? (grade === 'mixed' ? 'mixed' : 'balanced');

function groupCounts(rows: ClauseTally[]): Record<GradeGroup, number> {
	const c = gradeCounts(rows, DEONTIC_KINDS);
	return { a: c['a-only'] + c.a, balanced: c.balanced, mixed: c.mixed, b: c.b + c['b-only'] };
}

/** The grade leans to the side it favours; balanced and mixed stay in the middle. */
const lean = (grade: Grade) => {
	const side = gradeSide(grade);
	return side === 'a' ? 'items-start' : side === 'b' ? 'items-end' : 'items-center';
};

/** The bar down a row's edge: solid for "only", washed for "more", amber when it depends. */
const gradeBar = (grade: Grade) => {
	const side = gradeSide(grade);
	if (side) return isOnly(grade) ? SIDE_COLOR[side] : tint(SIDE_COLOR[side], 45);
	return grade === 'mixed' ? 'var(--warning)' : 'var(--border)';
};

/**
 * Each number, a sentence. The types are verbs — owes, may, may not — whose subject is the
 * party that bears the statement, while the side it is drawn on stays the party it serves:
 * under "National owes 29" on Equidata's side, every row's number finishes that sentence.
 * The grade comes first, over all three types; "Show" only hides columns.
 */
export function P6View({
	docId,
	kg,
	grid,
	names,
	roles,
	importance,
	onOpen,
	onOpenGraph,
}: ViewProps) {
	const [limit, setLimit] = useState(PAGE);
	const [kinds, toggleKind] = useKinds();
	const [filter, setFilter] = useState<GradeFilter>('all');
	const [half, setHalf] = useState<Half | null>(null);
	const [sortByImportance, setSortByImportance] = useState(true);
	// Every row starts closed; the reader opens the one they want.
	const [openId, setOpenId] = useState<string | null>(null);
	const [fragmentKind, setFragmentKind] = useState<DeonticKind | null>(null);
	const { reviews, review } = useReviews(docId);
	const { tallies, total, rank } = useTallies(grid, kg, importance, sortByImportance);
	const burden = burdenOf(tallies);
	const contract = gradeOf(total);
	const shown = tallies.filter(
		(t) => hasKinds(t, kinds) && (!half || t.count[half.kind][half.to] > 0)
	);
	const counts = groupCounts(shown);
	const rows = filter === 'all' ? shown : shown.filter((t) => groupOf(gradeOf(t.count)) === filter);
	const opened = rows.find((t) => t.clauseId === openId) ?? null;

	// "National owes 1 · Equidata may 2": a paragraph's statements, said of who bears them.
	const describe = (served: Served[]) => {
		const order = (to: Served['to']) => (to === 'a' ? 0 : to === 'b' ? 1 : 2);
		const said = new Map<string, number>();
		const sorted = served
			.slice()
			.sort(
				(x, y) =>
					DEONTIC_KINDS.indexOf(x.kind) - DEONTIC_KINDS.indexOf(y.kind) || order(x.to) - order(y.to)
			);
		for (const s of sorted) {
			const who = s.to === 'both' ? 'Both' : short(names[subjectOf(s.kind, s.to)]);
			const words = `${who} ${VERB[s.kind]}`;
			said.set(words, (said.get(words) ?? 0) + 1);
		}
		return [...said].map(([words, n]) => `${words} ${n}`).join(' · ');
	};
	useClauseNotes(kg, opened, kinds, names, describe, 'p6-verbs');

	const narrow = () => {
		setOpenId(null);
		setFragmentKind(null);
		setLimit(PAGE);
	};

	/** Keeps only the clauses holding that half; on the half already picked, every clause. */
	const pickHalf = (next: Half) => {
		const same = half?.kind === next.kind && half.to === next.to;
		setHalf(same ? null : next);
		if (!kinds.includes(next.kind)) toggleKind(next.kind);
		narrow();
	};

	const showKind = (kind: DeonticKind) => {
		setFragmentKind(null);
		// Hiding the type a half is picked in lets go of the half too.
		if (half?.kind === kind && kinds.length > 1) setHalf(null);
		toggleKind(kind);
	};

	/** Opens the clause on that type's fragments; on the type already shown, on all of them. */
	const filterBy = (clauseId: string, kind: DeonticKind) => {
		const same = opened?.clauseId === clauseId && fragmentKind === kind;
		setOpenId(clauseId);
		setFragmentKind(same ? null : kind);
	};

	const headerHalf = (kind: DeonticKind, to: Side) => {
		const n = total[kind][to];
		const color = SIDE_COLOR[to];
		const on = half?.kind === kind && half.to === to;
		return (
			<button
				key={to}
				type="button"
				onClick={() => pickHalf({ kind, to })}
				disabled={n === 0 && !on}
				aria-pressed={on}
				title={on ? 'Show every clause' : `${say(kind, to, n, names)} · show only these clauses`}
				className={cn(
					'flex min-w-0 flex-1 flex-col gap-1 bg-(--half) px-1 pt-1 pb-2 enabled:hover:bg-(--half-hover) disabled:cursor-default',
					// In a narrow column the padding keeps clear of the axis and little else.
					to === 'a'
						? 'items-end @max-[190px]:pr-[3px] @max-[190px]:pl-px'
						: 'items-start @max-[190px]:pr-px @max-[190px]:pl-[3px]'
				)}
				style={
					{
						'--half': tint(color, on ? 14 : 6),
						'--half-hover': tint(color, 14),
						boxShadow: on ? `inset 0 0 0 1.5px ${color}` : undefined,
					} as CSSProperties
				}
			>
				<Sentence
					kind={kind}
					to={to}
					n={n}
					names={names}
					caret
					big
					dim={n < total[kind][otherSide(to)]}
				/>
				<span className="flex flex-col gap-[3px]">
					{[Math.min(n, HEADER_LINE), Math.min(Math.max(n - HEADER_LINE, 0), HEADER_LINE)]
						.filter((k) => k > 0)
						.map((k, i) => (
							<SideMarks key={i} n={k} side={to} hollow={hollow(kind)} max={HEADER_LINE} size={5} />
						))}
				</span>
			</button>
		);
	};

	const headerColumn = (kind: DeonticKind) => (
		<div key={kind} className="@container relative flex min-w-0 flex-1 flex-col">
			<span className="pointer-events-none absolute inset-y-0 left-1/2 z-[1] w-px bg-border" />
			<span className="relative z-[2] mx-auto mt-1.5 mb-1 inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-px text-[10px] font-semibold text-foreground">
				<span className="size-2 rounded-[2px]" style={{ backgroundColor: KIND_COLORS[kind] }} />
				{VERB[kind]}
			</span>
			<div className="flex flex-1">{SIDES.map((to) => headerHalf(kind, to))}</div>
		</div>
	);

	const cell = (t: ClauseTally, kind: DeonticKind) => {
		const { a, b } = t.count[kind];
		const active = opened?.clauseId === t.clauseId && fragmentKind === kind;
		return (
			// The cell lets clicks through to the row; only its button takes them.
			<span key={kind} className="pointer-events-none relative flex min-w-0 flex-1 items-center">
				<span className="absolute inset-y-0 left-1/2 w-px bg-border/70" />
				{a + b === 0 ? (
					<Diverging a={0} b={0} hollow className="relative w-full" />
				) : (
					<button
						type="button"
						onClick={() => filterBy(t.clauseId, kind)}
						className={cn(
							'pointer-events-auto relative z-10 flex w-full items-center rounded-md px-1 py-1 hover:bg-muted/60',
							active && 'bg-accent ring-1 ring-primary/40'
						)}
						title={
							active
								? 'Show the fragments of every type'
								: `${SIDES.filter((to) => t.count[kind][to] > 0)
										.map((to) => say(kind, to, t.count[kind][to], names))
										.join(' · ')} — click to see only these fragments`
						}
					>
						<Diverging a={a} b={b} hollow={hollow(kind)} max={MAX_MARKS} />
					</button>
				)}
			</span>
		);
	};

	return (
		<div
			className="min-h-0 flex-1 overflow-auto"
			style={{ '--p6-ink': NEUTRAL_INK } as CSSProperties}
		>
			<div className="min-w-[850px] space-y-3 p-4">
				<PartyStrip names={names} roles={roles} burden={burden} half={half} onPick={pickHalf} />

				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="flex flex-wrap items-center gap-2">
						<VerbFilter kinds={kinds} onToggle={showKind} />
						{half && (
							<button
								type="button"
								onClick={() => pickHalf(half)}
								title="Show every clause"
								className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] bg-card px-2 py-0.5 hover:bg-muted"
								style={{ borderColor: SIDE_COLOR[half.to] }}
							>
								<Sentence
									kind={half.kind}
									to={half.to}
									n={total[half.kind][half.to]}
									names={names}
									caret
								/>
								<XIcon className="size-3 text-muted-foreground" />
							</button>
						)}
					</div>
					<GradeFilterBar
						value={filter}
						counts={counts}
						names={names}
						onChange={(value) => {
							setFilter(value);
							narrow();
						}}
					/>
				</div>

				<div className="overflow-clip rounded-xl border border-border bg-card">
					{/* The whole contract heads the table and stays in sight: the rows only carry the
					    number that ends each of its sentences. */}
					<div className="sticky top-0 z-20 flex items-stretch gap-2 border-b-2 border-border bg-secondary px-3">
						<div className={cn('flex items-start gap-2 py-2.5 pl-1', LEAD)}>
							<div className="min-w-0 flex-1 space-y-0.5">
								<p className="text-[10px] font-bold tracking-wider whitespace-nowrap text-muted-foreground uppercase">
									Whole contract
								</p>
								<p className="text-2xs text-muted-foreground">
									{tallies.length} {tallies.length === 1 ? 'clause' : 'clauses'}
								</p>
								{/* The importance is fetched, so the ordering cannot be offered before it lands. */}
								{importance && (
									<button
										type="button"
										onClick={() => setSortByImportance((on) => !on)}
										className="text-2xs font-medium text-primary hover:underline"
										title="Order the rows by how much each clause weighs inside the contract (PageRank with a per-clause prior), or by its position in the document"
									>
										{sortByImportance ? 'by importance ↓' : 'by order'}
									</button>
								)}
							</div>
							<div className={cn('flex shrink-0 flex-col gap-1', GRADE_SLOT, lean(contract))}>
								<p className="text-[10px] font-bold tracking-wider whitespace-nowrap text-foreground uppercase">
									Who does it favour?
								</p>
								<GradeTag grade={contract} names={names} />
							</div>
						</div>
						<div className={COLUMNS}>{kinds.map(headerColumn)}</div>
						{/* Room for the accordion's chevron, so the columns line up. */}
						<span className="w-4 shrink-0" />
					</div>

					{rows.length === 0 && (
						<p className="px-4 py-6 text-center text-xs text-muted-foreground">
							No clause has this grade in the types shown.
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
							const grade = gradeOf(t.count);
							return (
								<AccordionItem
									key={t.clauseId}
									value={t.clauseId}
									className={cn('border-border/60', grade === 'mixed' && 'bg-warning/10')}
								>
									{/* The trigger fills the row from underneath; the cells are buttons
									    on top of it, so a click on a count filters instead of toggling. */}
									<AccordionPrimitive.Header className="group relative flex items-stretch gap-2 px-3 hover:bg-muted/30 data-[state=open]:bg-muted/30">
										<AccordionPrimitive.Trigger
											className="absolute inset-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
											aria-label={`${t.heading}: show the fragments behind its grade`}
										/>
										<span
											className="pointer-events-none absolute inset-y-0 left-0 w-1"
											style={{ backgroundColor: gradeBar(grade) }}
										/>
										<span
											className={cn('pointer-events-none flex items-center gap-2 py-2.5', LEAD)}
										>
											<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-2xs font-semibold tabular-nums">
												{rank.get(t.clauseId)}
											</span>
											<span className="flex min-w-0 flex-1 items-center gap-1.5">
												{t.section && (
													<span className="shrink-0 rounded bg-secondary px-1 text-[10px] font-medium">
														{t.section}
													</span>
												)}
												<span className="truncate text-xs font-semibold text-foreground">
													{t.heading}
												</span>
											</span>
											<span
												className={cn('flex shrink-0 flex-col gap-0.5', GRADE_SLOT, lean(grade))}
											>
												<GradeTag grade={grade} names={names} />
												{grade === 'mixed' && <TypeWins count={t.count} />}
											</span>
										</span>
										<span className={cn('pointer-events-none', COLUMNS)}>
											{kinds.map((kind) => cell(t, kind))}
										</span>
										<ChevronDownIcon className="pointer-events-none size-4 shrink-0 self-center text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
									</AccordionPrimitive.Header>
									<AccordionContent className="space-y-3 pt-1 pr-3 pl-11">
										{fragmentKind && (
											<p className="flex items-center gap-1.5 text-2xs text-foreground/70">
												<span
													className="size-2.5 rounded-[2px]"
													style={{ backgroundColor: KIND_COLORS[fragmentKind] }}
												/>
												Only “{VERB[fragmentKind]}”
												<button
													type="button"
													onClick={() => setFragmentKind(null)}
													className="font-medium text-primary hover:underline"
												>
													show every type
												</button>
											</p>
										)}
										<ClauseDetail
											key={fragmentKind ?? 'every'}
											tally={t}
											kinds={fragmentKind ? [fragmentKind] : kinds}
											names={names}
											onOpen={onOpen}
										/>
										<div className="flex items-center gap-3">
											<div className="min-w-0 flex-1">
												<GradeAgree
													grade={grade}
													names={names}
													answer={reviews[t.clauseId]}
													onAnswer={(answer) => review(t.clauseId, answer)}
												/>
											</div>
											{onOpenGraph && (
												<GraphLink onClick={() => onOpenGraph(t.clauseId)} className="shrink-0" />
											)}
										</div>
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

/**
 * A type as a sentence whose subject is the party that bears it: "National owes 29". The
 * name stays in neutral ink, the number takes the colour of the party it serves, and the
 * caret points to that party. When room runs out only the name gives way; in a type column
 * under 190 px the number and the gaps tighten first.
 */
function Sentence({
	kind,
	to,
	n,
	names,
	caret = false,
	big = false,
	dim = false,
}: {
	kind: DeonticKind;
	to: Side;
	n: number;
	names: Record<Side, string>;
	caret?: boolean;
	big?: boolean;
	/** The side behind in that type draws its number fainter. */
	dim?: boolean;
}) {
	const color = SIDE_COLOR[to];
	return (
		<span
			className={cn(
				'flex max-w-full min-w-0 items-baseline whitespace-nowrap',
				big ? 'gap-[2px] text-[10px] @max-[190px]:gap-px' : 'gap-[3px] text-2xs'
			)}
		>
			{caret && to === 'a' && <Caret to="a" color={color} />}
			<span className={cn('min-w-0 truncate font-semibold', INK)}>
				{short(names[subjectOf(kind, to)])}
			</span>
			<span className="shrink-0 text-muted-foreground">{VERB[kind]}</span>
			<span
				className={cn(
					'shrink-0 font-bold tabular-nums',
					big && 'text-sm leading-none @max-[190px]:text-xs'
				)}
				style={{ color, opacity: dim ? 0.55 : 1 }}
			>
				{n}
			</span>
			{caret && to === 'b' && <Caret to="b" color={color} />}
		</span>
	);
}

/** Which types each party wins when the grade depends on the type, each verb in the colour
 *  of the party that wins it, on its side: "◂ may · owes ▸". */
function TypeWins({ count }: { count: ClauseTally['count'] }) {
	const { byKind } = typeVerdict(count);
	const won = (side: Side) =>
		DEONTIC_KINDS.filter((kind) => byKind[kind] === side)
			.map((kind) => VERB[kind])
			.join(', ');
	return (
		<span className="flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap">
			<Caret to="a" color={SIDE_COLOR.a} />
			<span style={{ color: SIDE_COLOR.a }}>{won('a')}</span>
			<span className="font-normal text-muted-foreground">·</span>
			<span style={{ color: SIDE_COLOR.b }}>{won('b')}</span>
			<Caret to="b" color={SIDE_COLOR.b} />
		</span>
	);
}

/** Each party with its role and its own load: what it owes and what it may not do, each a
 *  way to keep only the clauses that hold it. */
function PartyStrip({
	names,
	roles,
	burden,
	half,
	onPick,
}: {
	names: Record<Side, string>;
	roles: Record<Side, string>;
	burden: Record<Side, Burden>;
	half: Half | null;
	onPick: (half: Half) => void;
}) {
	const party = (side: Side) => {
		const color = SIDE_COLOR[side];
		const other = otherSide(side);
		const pill = (kind: 'obligation' | 'prohibition') => {
			// What a party bears serves the other one, so it is that party's half.
			const on = half?.kind === kind && half.to === other;
			const n = burden[side][kind];
			const clauses = burden[side].clauses[kind];
			return (
				<button
					key={kind}
					type="button"
					onClick={() => onPick({ kind, to: other })}
					disabled={n === 0 && !on}
					aria-pressed={on}
					title={
						on
							? 'Show every clause'
							: `${say(kind, other, n, names)}, in ${clauses} ${clauses === 1 ? 'clause' : 'clauses'} · show only those clauses`
					}
					className={cn(
						'inline-flex shrink-0 items-center gap-1 rounded-full border bg-card px-2 py-px text-2xs disabled:cursor-default disabled:opacity-50',
						on
							? 'border-foreground/50 ring-1 ring-foreground/30'
							: 'border-border enabled:hover:bg-muted'
					)}
				>
					<span className="text-muted-foreground">{VERB[kind]}</span>
					<span className="font-semibold text-foreground tabular-nums">{n}</span>
				</button>
			);
		};
		return (
			<div
				key={side}
				className="flex min-w-0 items-center gap-2 rounded-full border px-3 py-1"
				style={{ borderColor: tint(color, 40), backgroundColor: tint(color, 6) }}
			>
				<span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
				<span
					className="max-w-[220px] truncate text-xs font-semibold"
					style={{ color }}
					title={names[side]}
				>
					{names[side]}
				</span>
				{roles[side] && (
					<span className="max-w-[140px] truncate text-2xs text-muted-foreground">
						{roles[side]}
					</span>
				)}
				{pill('obligation')}
				{pill('prohibition')}
			</div>
		);
	};
	return (
		<div className="flex flex-wrap items-center gap-2">
			{party('a')}
			<span className="text-2xs text-muted-foreground">vs</span>
			{party('b')}
		</div>
	);
}

/** Which types are on screen, each named by its verb; the last one on stays on. */
function VerbFilter({
	kinds,
	onToggle,
}: {
	kinds: DeonticKind[];
	onToggle: (kind: DeonticKind) => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
			Show
			{DEONTIC_KINDS.map((kind) => {
				const on = kinds.includes(kind);
				const last = on && kinds.length === 1;
				return (
					<button
						type="button"
						key={kind}
						onClick={() => onToggle(kind)}
						disabled={last}
						aria-pressed={on}
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
						{VERB[kind]}
						{on && <CheckIcon className="size-3" />}
					</button>
				);
			})}
		</div>
	);
}

/** Narrows the clauses to one grade, "only" and "more" merged into each party's option,
 *  ordered like the sides. */
function GradeFilterBar({
	value,
	counts,
	names,
	onChange,
}: {
	value: GradeFilter;
	counts: Record<GradeGroup, number>;
	names: Record<Side, string>;
	onChange: (value: GradeFilter) => void;
}) {
	const all = counts.a + counts.balanced + counts.mixed + counts.b;
	const options: Array<{ id: GradeFilter; label: ReactNode; color?: string; tone?: string }> = [
		{ id: 'all', label: 'All' },
		{
			id: 'a',
			label: (
				<>
					<Caret to="a" color="currentColor" />
					For {short(names.a)}
				</>
			),
			color: SIDE_COLOR.a,
		},
		{ id: 'balanced', label: '= Balanced' },
		{
			id: 'mixed',
			label: 'Depends on the type',
			tone: 'text-warning-foreground dark:text-warning',
		},
		{
			id: 'b',
			label: (
				<>
					For {short(names.b)}
					<Caret to="b" color="currentColor" />
				</>
			),
			color: SIDE_COLOR.b,
		},
	];
	return (
		<div
			role="tablist"
			aria-label="Clauses by grade"
			className="inline-flex rounded-lg border border-border bg-secondary p-[3px]"
		>
			{options.map((o) => {
				const n = o.id === 'all' ? all : counts[o.id];
				const on = value === o.id;
				return (
					<button
						type="button"
						role="tab"
						key={o.id}
						aria-selected={on}
						disabled={n === 0 && !on}
						onClick={() => onChange(o.id)}
						className={cn(
							'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-40',
							on ? 'bg-foreground text-background' : cn('hover:bg-card', o.tone)
						)}
						style={on ? undefined : { color: o.color }}
					>
						<span className="inline-flex items-center gap-1">{o.label}</span>
						<span className="font-normal tabular-nums opacity-80">{n}</span>
					</button>
				);
			})}
		</div>
	);
}

/**
 * What the clause gives each party, in two lanes on the sides they serve. Inside a lane, one
 * group per type said of who bears it — "National owes 11", derived from the other party's
 * duty, or "Equidata may 2", its own right — and the fragments in the contract's own words.
 */
function ClauseDetail({
	tally,
	kinds,
	names,
	onOpen,
}: {
	tally: ClauseTally;
	kinds: DeonticKind[];
	names: Record<Side, string>;
	onOpen: (nodeId: string) => void;
}) {
	const [unfolded, setUnfolded] = useState<Set<string>>(new Set());

	const unfold = (key: string) =>
		setUnfolded((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});

	const group = (side: Side, kind: DeonticKind, served: Served[]) => {
		const color = SIDE_COLOR[side];
		const key = `${side}:${kind}`;
		const all = unfolded.has(key);
		const tag = `${short(names[subjectOf(kind, side)])} ${MODAL[kind]}`;
		return (
			<div key={kind} className="pb-1">
				<div className="flex items-center gap-1.5 px-3 pt-2 pb-0.5">
					<span
						className="size-[7px] shrink-0 rounded-full"
						style={{
							border: `1.5px solid ${color}`,
							backgroundColor: hollow(kind) ? 'transparent' : color,
						}}
					/>
					<Sentence kind={kind} to={side} n={served.length} names={names} />
					<span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
						{hollow(kind) ? 'derived' : 'own right'}
					</span>
				</div>
				{(all ? served : served.slice(0, SHOWN_FRAGMENTS)).map((s) => (
					<Fragment
						key={`${s.mark.id}-${s.to}`}
						served={s}
						section={tally.section}
						tag={tag}
						onOpen={onOpen}
					/>
				))}
				{served.length > SHOWN_FRAGMENTS && (
					<button
						type="button"
						onClick={() => unfold(key)}
						className="px-3 text-2xs font-medium text-primary hover:underline"
					>
						{all ? '− fewer' : `+ ${served.length - SHOWN_FRAGMENTS} more`}
					</button>
				)}
			</div>
		);
	};

	const lane = (side: Side) => {
		const color = SIDE_COLOR[side];
		const groups = kinds
			.map((kind) => ({ kind, served: servedOf(tally, side, kind) }))
			.filter((g) => g.served.length > 0);
		return (
			<div
				key={side}
				className="overflow-hidden rounded-lg border bg-card"
				style={{ borderColor: tint(color, 35) }}
			>
				<div
					className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
					style={{ backgroundColor: tint(color, 10), color }}
				>
					{side === 'a' && <Caret to="a" color={color} />}
					In favour of {short(names[side])}
					{side === 'b' && <Caret to="b" color={color} />}
				</div>
				{groups.length === 0 ? (
					<p className="px-3 py-3 text-2xs text-muted-foreground">
						Nothing for {short(names[side])} here in the types shown.
					</p>
				) : (
					<div className="divide-y divide-border/60">
						{groups.map((g) => group(side, g.kind, g.served))}
					</div>
				)}
			</div>
		);
	};

	return <div className="grid grid-cols-2 gap-3">{SIDES.map(lane)}</div>;
}
