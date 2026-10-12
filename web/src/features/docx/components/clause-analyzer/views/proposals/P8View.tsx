'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react';
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
	listOf,
	useClauseNotes,
	useKinds,
	useReviews,
	useTallies,
} from '@/features/docx/components/clause-analyzer/views/favour-shared';
import {
	Diverging,
	GradeAgree,
	GradeTag,
	SIDES,
	burdenOf,
	gradeCounts,
	gradeLabel,
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
/** Past five a side's marks stop growing and the number says the rest, so both sides of a
 *  type fit its narrowest column. */
const MAX_MARKS = 5;
/** Fragments shown per group before "+ n more". */
const SHOWN = 2;
/**
 * The table's columns, shared by the header, every row and the opened row so their axes line
 * up: edge bar, rank, clause, grade, one per type shown (sharing what is left), chevron. At
 * their narrowest they fit the drawer's default width.
 */
const columnsOf = (types: number) =>
	`3px 24px minmax(170px, 1.4fr) 130px repeat(${types}, minmax(140px, 1fr)) 16px`;
/** A heading longer than this may be cut at the clause column's narrowest. */
const LONG_HEADING = 22;
/** Room kept at each bar's outer end for its answer, so all six bars share one scale. */
const ANSWER_ROOM = 120;

/** The two types a party bears for the other: what it must do and what it may not do. */
type Owed = Exclude<DeonticKind, 'right'>;
const OWED: Owed[] = ['obligation', 'prohibition'];

/** One party's own load of one type, as a filter on the clauses. */
interface Load {
	side: Side;
	kind: Owed;
}

type GradeFilter = 'all' | Side | 'balanced' | 'mixed';

/** Each type as a question whose subject is the party that gains. */
const QUESTION: Record<DeonticKind, string> = {
	obligation: 'What can it demand?',
	right: 'What can it do?',
	prohibition: 'What is it protected from?',
};

const GLOSS: Record<DeonticKind, string> = {
	obligation: 'the other’s obligations',
	right: 'own rights',
	prohibition: 'the other’s prohibitions',
};

const WORD: Record<DeonticKind, string> = {
	obligation: 'Demand',
	right: 'Do',
	prohibition: 'Protected',
};

const CAN: Record<DeonticKind, string> = {
	obligation: 'Can demand',
	right: 'Can do',
	prohibition: 'Protected from',
};

const VERB: Record<DeonticKind, string> = {
	obligation: 'can demand',
	right: 'can do',
	prohibition: 'is protected from',
};

const MORE: Record<DeonticKind, string> = {
	obligation: 'can demand more',
	right: 'can do more',
	prohibition: 'is protected from more',
};

/** A party's own load, asked of the party itself. */
const LOAD_QUESTION: Record<Owed, string> = {
	obligation: 'What does it owe?',
	prohibition: 'What may it not do?',
};

const sameLoad = (x: Load | null, y: Load) => x?.side === y.side && x.kind === y.kind;

/** The clause holds some of that party's load. */
const bears = (t: ClauseTally, load: Load) =>
	t.served.some((s) => s.kind === load.kind && s.by === load.side);

const matches = (grade: Grade, filter: GradeFilter) =>
	filter === 'all' ||
	(filter === 'a' || filter === 'b' ? gradeSide(grade) === filter : grade === filter);

/** The grade's colour on the row's edge: full when it all goes to one party, washed when it
 *  only gets more, amber when it depends on the type. */
function gradeInk(grade: Grade) {
	const side = gradeSide(grade);
	if (side) return isOnly(grade) ? SIDE_COLOR[side] : tint(SIDE_COLOR[side], 45);
	return grade === 'mixed' ? 'var(--warning)' : 'var(--border)';
}

/** "owed by National", "own right", "National may not": who bears what the other gains. */
const correlativeText = (kind: DeonticKind, bearer: string) =>
	kind === 'right'
		? 'own right'
		: kind === 'obligation'
			? `owed by ${short(bearer)}`
			: `${short(bearer)} may not`;

/** "Equidata can demand 29 · owed by National". */
const answerTitle = (kind: DeonticKind, n: number, side: Side, names: Record<Side, string>) =>
	`${short(names[side])} ${VERB[kind]} ${n} · ${correlativeText(kind, names[otherSide(side)])}`;

/** The party that bears a statement, named on the other party's side: neutral ink. */
function Bearer({ name }: { name: string }) {
	return <span className="font-semibold text-foreground">{short(name)}</span>;
}

function Correlative({ kind, bearer }: { kind: DeonticKind; bearer: string }) {
	if (kind === 'right') return <>own right</>;
	if (kind === 'obligation')
		return (
			<>
				owed by <Bearer name={bearer} />
			</>
		);
	return (
		<>
			<Bearer name={bearer} /> may not
		</>
	);
}

/** The contract's grade in one line, without adding types together. */
function contractLine(
	total: ClauseTally['count'],
	kinds: DeonticKind[],
	names: Record<Side, string>
) {
	const { byKind } = typeVerdict(total, kinds);
	const grade = gradeOf(total, kinds);
	const side = gradeSide(grade);
	const won = (s: Side) => kinds.filter((k) => byKind[k] === s);
	const words = (ks: DeonticKind[]) => listOf(ks.map((k) => WORD[k].toLowerCase()));
	if (side) {
		const ahead = won(side);
		if (ahead.length === kinds.length)
			return `Ahead in ${
				kinds.length === 3
					? 'all 3 types'
					: kinds.length === 2
						? 'both types shown'
						: 'the type shown'
			}, behind in none`;
		const level = kinds.filter((k) => byKind[k] === 'tie');
		return `Ahead in ${words(ahead)}, level in ${words(level)}, behind in none`;
	}
	if (grade === 'balanced') return 'Level in every type shown';
	return SIDES.map((s) => `${short(names[s])} ${listOf(won(s).map((k) => MORE[k]))}`).join('; ');
}

/** Each party with its role and its own load, each count pointing to the party it is owed to;
 *  a count narrows the clauses to the ones that hold it. */
function PartyStrip({
	names,
	roles,
	burden,
	load,
	onLoad,
}: {
	names: Record<Side, string>;
	roles: Record<Side, string>;
	burden: Record<Side, Burden>;
	load: Load | null;
	onLoad: (load: Load) => void;
}) {
	const party = (side: Side) => {
		const color = SIDE_COLOR[side];
		const toward = otherSide(side);
		const pill = (kind: Owed) => {
			const n = burden[side][kind];
			const on = sameLoad(load, { side, kind });
			const clauses = burden[side].clauses[kind];
			const what = kind === 'obligation' ? `owes ${n} obligations` : `may not do ${n} things`;
			return (
				<button
					key={kind}
					type="button"
					onClick={() => onLoad({ side, kind })}
					disabled={n === 0}
					aria-pressed={on}
					title={`${short(names[side])} ${what} in favour of ${short(names[toward])}, in ${clauses} ${
						clauses === 1 ? 'clause' : 'clauses'
					} — ${on ? 'click to show every clause' : 'click to show only those clauses'}`}
					className={cn(
						'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs whitespace-nowrap disabled:cursor-default disabled:opacity-50',
						on
							? 'border-foreground bg-foreground text-background'
							: 'border-border bg-card text-muted-foreground enabled:hover:bg-muted'
					)}
				>
					{toward === 'a' && <ArrowLeftIcon className="size-3" />}
					{LOAD_QUESTION[kind]}
					<span className={cn('font-semibold tabular-nums', !on && 'text-foreground')}>{n}</span>
					{toward === 'b' && <ArrowRightIcon className="size-3" />}
				</button>
			);
		};
		return (
			<div
				className={cn(
					'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border px-3 py-1.5',
					side === 'b' && 'justify-end'
				)}
				style={{ borderColor: tint(color, 40), backgroundColor: tint(color, 6) }}
			>
				<span className="flex min-w-0 items-center gap-1.5">
					<span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
					<span className="truncate text-sm font-semibold" style={{ color }} title={names[side]}>
						{names[side]}
					</span>
					{roles[side] && (
						<span className="shrink-0 text-2xs text-muted-foreground">{roles[side]}</span>
					)}
				</span>
				<span className="flex items-center gap-1">{OWED.map(pill)}</span>
			</div>
		);
	};
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
			{party('a')}
			<span className="text-2xs text-muted-foreground">vs</span>
			{party('b')}
		</div>
	);
}

/** The whole contract's grade, read first. */
function ContractCard({
	total,
	kinds,
	names,
}: {
	total: ClauseTally['count'];
	kinds: DeonticKind[];
	names: Record<Side, string>;
}) {
	const grade = gradeOf(total, kinds);
	const side = gradeSide(grade);
	return (
		<div className="rounded-xl bg-foreground p-4 text-background">
			<p className="text-[10px] font-semibold tracking-wider uppercase opacity-70">
				In whose favour? · Contract
			</p>
			<GradeTag
				grade={grade}
				names={names}
				size="lg"
				className={cn('mt-2', grade === 'mixed' && 'bg-warning')}
				// On the dark card the outlined tag keeps its border and fill; its words go light.
				label={
					side && !isOnly(grade) ? (
						<span className="text-background">{gradeLabel(grade, names)}</span>
					) : undefined
				}
			/>
			<p className="mt-2 text-xs leading-snug opacity-90">{contractLine(total, kinds, names)}</p>
		</div>
	);
}

/**
 * One row per type, its question on the spine and each party's answer growing outward from
 * it: the count in the colour of the party that gains, and on the same line who bears it.
 * Every bar shares one scale, the largest count being the full length.
 */
function SpineBoard({
	total,
	kinds,
	names,
	load,
	onLoad,
}: {
	total: ClauseTally['count'];
	kinds: DeonticKind[];
	names: Record<Side, string>;
	load: Load | null;
	onLoad: (load: Load) => void;
}) {
	const max = Math.max(1, ...DEONTIC_KINDS.flatMap((k) => SIDES.map((s) => total[k][s])));
	const columns = 'grid grid-cols-[minmax(0,1fr)_12rem_minmax(0,1fr)]';

	const half = (kind: DeonticKind, side: Side) => {
		const n = total[kind][side];
		const other = otherSide(side);
		const trailing = n < total[kind][other];
		const color = SIDE_COLOR[side];
		const length = `calc((100% - ${ANSWER_ROOM}px) * ${n / max})`;
		const edge = side === 'a' ? 'right' : 'left';
		const owed: Load | null = kind === 'right' ? null : { side: other, kind };
		const on = owed !== null && sameLoad(load, owed);
		return (
			<div className="relative h-9 min-w-0">
				<span
					className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full"
					style={{ [edge]: 0, width: length, backgroundColor: color, opacity: trailing ? 0.55 : 1 }}
				/>
				{/* The answer wraps the bearer's name when the bar leaves it little room; never the number. */}
				<span
					className={cn(
						'absolute top-1/2 flex -translate-y-1/2 items-baseline gap-1',
						side === 'a' && 'text-right'
					)}
					style={{ [edge]: `calc(${length} + 8px)`, maxWidth: `calc(100% - ${length} - 8px)` }}
				>
					<span
						className="shrink-0 text-xl leading-none font-bold whitespace-nowrap tabular-nums"
						style={
							n === 0
								? { color: 'var(--muted-foreground)', opacity: 0.6 }
								: { color, opacity: trailing ? 0.55 : 1 }
						}
						title={answerTitle(kind, n, side, names)}
					>
						{n}
					</span>
					<span className="shrink-0 text-muted-foreground">·</span>
					{owed ? (
						<button
							type="button"
							onClick={() => onLoad(owed)}
							disabled={n === 0}
							aria-pressed={on}
							title={
								on
									? 'Show every clause'
									: `Show only the clauses where ${short(names[other])} ${
											kind === 'obligation' ? 'owes something' : 'may not do something'
										}`
							}
							className={cn(
								'min-w-0 rounded px-1 text-2xs leading-tight text-muted-foreground enabled:hover:bg-muted disabled:cursor-default',
								side === 'a' ? 'text-right' : 'text-left',
								on && 'bg-accent ring-1 ring-primary/40'
							)}
						>
							<Correlative kind={kind} bearer={names[other]} />
						</button>
					) : (
						<span className="min-w-0 px-1 text-2xs leading-tight text-muted-foreground">
							own right
						</span>
					)}
				</span>
			</div>
		);
	};

	return (
		<div className="rounded-xl border border-border bg-card px-3 py-3">
			<div className={cn(columns, 'text-[10px] font-semibold')}>
				<span className="flex items-center justify-end gap-1 pr-3" style={{ color: SIDE_COLOR.a }}>
					<ArrowLeftIcon className="size-3" />
					In favour of {short(names.a)}
				</span>
				<span />
				<span className="flex items-center gap-1 pl-3" style={{ color: SIDE_COLOR.b }}>
					In favour of {short(names.b)}
					<ArrowRightIcon className="size-3" />
				</span>
			</div>
			<div className="relative mt-1">
				<span className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-border" />
				{DEONTIC_KINDS.map((kind) => (
					<div
						key={kind}
						className={cn(columns, 'relative items-center', !kinds.includes(kind) && 'opacity-40')}
					>
						{half(kind, 'a')}
						<span className="flex justify-center px-2">
							<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-foreground">
								<span
									className="size-2 shrink-0 rounded-[2px]"
									style={{ backgroundColor: KIND_COLORS[kind] }}
								/>
								{QUESTION[kind]}
							</span>
						</span>
						{half(kind, 'b')}
					</div>
				))}
			</div>
		</div>
	);
}

/** Which types are on screen, named by what the party that gains does with them. */
function TypeToggles({
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
				// The last type on stays on: with none, there is nothing to compare.
				const last = on && kinds.length === 1;
				return (
					<button
						type="button"
						key={kind}
						onClick={() => onToggle(kind)}
						disabled={last}
						aria-pressed={on}
						title={last ? 'At least one type stays on' : `${QUESTION[kind]} · ${GLOSS[kind]}`}
						className={cn(
							'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs disabled:cursor-default',
							on ? 'border-foreground/30 text-foreground' : 'border-border opacity-50'
						)}
					>
						<span
							className="size-2.5 rounded-[2px]"
							style={{ backgroundColor: KIND_COLORS[kind] }}
						/>
						{WORD[kind]}
						{on && <CheckIcon className="size-3" />}
					</button>
				);
			})}
		</div>
	);
}

/** Narrows the clauses to one grade, "only" and "more" merged per party. */
function GradeFilterBar({
	value,
	counts,
	all,
	names,
	onChange,
}: {
	value: GradeFilter;
	counts: Record<Grade, number>;
	all: number;
	names: Record<Side, string>;
	onChange: (value: GradeFilter) => void;
}) {
	const options: Array<{
		id: GradeFilter;
		label: ReactNode;
		n: number;
		color?: string;
		className?: string;
	}> = [
		{ id: 'all', label: 'All', n: all },
		{
			id: 'a',
			label: (
				<>
					<ArrowLeftIcon className="size-3" />
					In favour of {short(names.a)}
				</>
			),
			n: counts.a + counts['a-only'],
			color: SIDE_COLOR.a,
		},
		{ id: 'balanced', label: 'Balanced', n: counts.balanced },
		{
			id: 'mixed',
			label: 'Depends on the type',
			n: counts.mixed,
			className: 'text-warning-foreground dark:text-warning',
		},
		{
			id: 'b',
			label: (
				<>
					In favour of {short(names.b)}
					<ArrowRightIcon className="size-3" />
				</>
			),
			n: counts.b + counts['b-only'],
			color: SIDE_COLOR.b,
		},
	];
	return (
		<div
			role="tablist"
			aria-label="Clauses by grade"
			className="inline-flex flex-wrap rounded-lg border border-border bg-secondary p-[3px]"
		>
			{options.map((o) => {
				const on = value === o.id;
				return (
					<button
						type="button"
						role="tab"
						key={o.id}
						aria-selected={on}
						disabled={o.n === 0 && !on}
						onClick={() => onChange(o.id)}
						className={cn(
							'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-40',
							on ? 'bg-foreground text-background' : cn('hover:bg-card', o.className)
						)}
						style={on ? undefined : { color: o.color }}
					>
						{o.label}
						<span className="ml-0.5 font-normal tabular-nums opacity-80">{o.n}</span>
					</button>
				);
			})}
		</div>
	);
}

/**
 * The grade on a track: the tag sits at the end of the party it favours, in the centre when
 * balanced or when it depends on the type; then a line says which type each party wins.
 */
function GradeTrack({
	grade,
	count,
	kinds,
	names,
}: {
	grade: Grade;
	count: ClauseTally['count'];
	kinds: DeonticKind[];
	names: Record<Side, string>;
}) {
	const side = gradeSide(grade);
	const line = <span className="h-px min-w-1 flex-1 bg-border" />;
	const { byKind } = typeVerdict(count, kinds);
	const won = (s: Side) =>
		kinds
			.filter((k) => byKind[k] === s)
			.map((k) => WORD[k].toLowerCase())
			.join(', ');
	return (
		<span className="pointer-events-none flex min-w-0 flex-col gap-0.5">
			<span className="flex min-w-0 items-center">
				{side !== 'a' && line}
				{/* A long party name shortens the words, never the column. */}
				<GradeTag
					grade={grade}
					names={names}
					size="sm"
					className="max-w-full min-w-0"
					label={<span className="min-w-0 truncate">{gradeLabel(grade, names)}</span>}
				/>
				{side !== 'b' && line}
			</span>
			{grade === 'mixed' && (
				<span className="flex items-center justify-between text-[10px] font-semibold">
					<span className="inline-flex items-center gap-0.5" style={{ color: SIDE_COLOR.a }}>
						<ArrowLeftIcon className="size-2.5" />
						{won('a')}
					</span>
					<span className="text-muted-foreground">·</span>
					<span className="inline-flex items-center gap-0.5" style={{ color: SIDE_COLOR.b }}>
						{won('b')}
						<ArrowRightIcon className="size-2.5" />
					</span>
				</span>
			)}
		</span>
	);
}

/** What the clause gives each party, a type at a time, in the contract's own words. */
function Lanes({
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

	const lane = (side: Side) => {
		const color = SIDE_COLOR[side];
		const bearer = names[otherSide(side)];
		return (
			<div
				key={side}
				className="overflow-hidden rounded-lg border"
				style={{ borderColor: tint(color, 35) }}
			>
				<div
					className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold"
					style={{ backgroundColor: tint(color, 10), color }}
				>
					<span className="size-2 rounded-full" style={{ backgroundColor: color }} />
					In favour of {short(names[side])}
				</div>
				<div className="divide-y divide-border/60 bg-card">
					{kinds.map((kind) => {
						const served = servedOf(tally, side, kind);
						const key = `${side}:${kind}`;
						const all = unfolded.has(key);
						const empty = served.length === 0;
						return (
							<div key={kind} className={cn('py-1.5', empty && 'opacity-50')}>
								<div className="flex items-baseline justify-between gap-2 px-3 text-2xs">
									<span
										className="flex items-center gap-1.5 font-semibold"
										style={{ color: empty ? 'var(--muted-foreground)' : color }}
									>
										<span
											className="size-2 shrink-0 rounded-[2px]"
											style={{
												backgroundColor: empty ? 'var(--muted-foreground)' : KIND_COLORS[kind],
											}}
										/>
										{CAN[kind]} {served.length}
									</span>
									<span className="text-[10px] text-muted-foreground">
										<Correlative kind={kind} bearer={bearer} />
									</span>
								</div>
								{(all ? served : served.slice(0, SHOWN)).map((s) => (
									<Fragment
										key={`${s.mark.id}-${s.to}`}
										served={s}
										section={tally.section}
										square={false}
										onOpen={onOpen}
									/>
								))}
								{served.length > SHOWN && (
									<button
										type="button"
										onClick={() => unfold(key)}
										className="block px-3 text-left text-2xs font-medium text-primary hover:underline"
									>
										{all ? '− fewer' : `+ ${served.length - SHOWN} more`}
									</button>
								)}
							</div>
						);
					})}
				</div>
			</div>
		);
	};

	return <div className="grid grid-cols-2 gap-3">{SIDES.map(lane)}</div>;
}

/** Proposal 8: every count answers a question whose subject is the party that gains — what
 *  it can demand, what it can do, what it is protected from — with who bears it on the same
 *  line, and the grade of each clause read first. */
export function P8View({
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
	const [load, setLoad] = useState<Load | null>(null);
	const [sortByImportance, setSortByImportance] = useState(true);
	// Every row starts closed; the reader opens the one they want.
	const [openId, setOpenId] = useState<string | null>(null);
	const [fragmentKind, setFragmentKind] = useState<DeonticKind | null>(null);
	const { reviews, review } = useReviews(docId);
	const { tallies, total, rank } = useTallies(grid, kg, importance, sortByImportance);
	const burden = useMemo(() => burdenOf(tallies), [tallies]);

	const shown = tallies.filter((t) => hasKinds(t, kinds) && (!load || bears(t, load)));
	const counts = gradeCounts(shown, kinds);
	const rows = shown
		.map((t) => ({ t, grade: gradeOf(t.count, kinds) }))
		.filter(({ grade }) => matches(grade, filter));
	const opened = rows.find(({ t }) => t.clauseId === openId)?.t ?? null;

	// "Equidata can demand 1 · can do 2 | National can demand 4" beside each paragraph.
	const describe = (served: Served[]) =>
		SIDES.map((side) => {
			const parts = DEONTIC_KINDS.map((kind) => {
				const n = served.filter(
					(s) => s.kind === kind && (s.to === side || s.to === 'both')
				).length;
				return n > 0 ? `${VERB[kind]} ${n}` : null;
			}).filter(Boolean);
			return parts.length > 0 ? `${short(names[side])} ${parts.join(' · ')}` : null;
		})
			.filter(Boolean)
			.join(' | ');

	useClauseNotes(kg, opened, kinds, names, describe, 'p8-demand-do-protected');

	const reset = () => {
		setOpenId(null);
		setFragmentKind(null);
		setLimit(PAGE);
	};

	const toggleLoad = (next: Load) => {
		// Picking a load whose type is hidden brings that type back, so its column is there.
		if (!sameLoad(load, next) && !kinds.includes(next.kind)) toggleKind(next.kind);
		setLoad((prev) => (sameLoad(prev, next) ? null : next));
		reset();
	};

	const showKind = (kind: DeonticKind) => {
		setFragmentKind(null);
		// A party's load of a type that leaves the screen stops narrowing the clauses.
		if (load?.kind === kind && kinds.includes(kind) && kinds.length > 1) setLoad(null);
		toggleKind(kind);
	};

	/** Opens the clause on that type's fragments; on the type already shown, on all of them. */
	const filterBy = (clauseId: string, kind: DeonticKind) => {
		const same = opened?.clauseId === clauseId && fragmentKind === kind;
		setOpenId(clauseId);
		setFragmentKind(same ? null : kind);
	};

	/** With a party's load picked, the other types step back. */
	const dimmed = (kind: DeonticKind) => load !== null && load.kind !== kind;

	const columns = columnsOf(kinds.length);

	const cell = (t: ClauseTally, kind: DeonticKind) => {
		const { a, b } = t.count[kind];
		if (a + b === 0)
			return (
				<span className={cn('pointer-events-none w-full min-w-0', dimmed(kind) && 'opacity-30')}>
					<Diverging a={0} b={0} hollow />
				</span>
			);
		const active = opened?.clauseId === t.clauseId && fragmentKind === kind;
		return (
			<button
				type="button"
				onClick={() => filterBy(t.clauseId, kind)}
				className={cn(
					'relative z-10 flex w-full min-w-0 items-center rounded-md px-0.5 py-1 hover:bg-muted',
					active && 'bg-accent ring-1 ring-primary/40',
					dimmed(kind) && 'opacity-30'
				)}
				title={
					active
						? 'Show the fragments of every type'
						: `${answerTitle(kind, a, 'a', names)} | ${answerTitle(kind, b, 'b', names)} — click to see only these fragments`
				}
			>
				<Diverging a={a} b={b} hollow={kind !== 'right'} max={MAX_MARKS} />
			</button>
		);
	};

	/** The answer box under the clause name and the lanes under the grade and the types; with a
	 *  single type the lanes would be too narrow, so both take the full width, one above the other. */
	const detail = (t: ClauseTally, grade: Grade) => {
		const beside = kinds.length > 1;
		return (
			<div
				className="grid items-start gap-x-1.5 gap-y-2 px-3"
				style={{ gridTemplateColumns: columns }}
			>
				<div
					className="min-w-0"
					style={{ gridColumn: beside ? '3' : '3 / -1', gridRow: beside ? '1' : '2' }}
				>
					<GradeAgree
						grade={grade}
						names={names}
						answer={reviews[t.clauseId]}
						onAnswer={(answer) => review(t.clauseId, answer)}
					/>
				</div>
				<div
					className="min-w-0 space-y-2"
					style={{ gridColumn: beside ? '4 / -1' : '3 / -1', gridRow: '1' }}
				>
					{fragmentKind && (
						<p className="flex items-center gap-1.5 text-2xs text-foreground/70">
							<span
								className="size-2.5 rounded-[2px]"
								style={{ backgroundColor: KIND_COLORS[fragmentKind] }}
							/>
							Only {QUESTION[fragmentKind].replace(/^./, (c) => c.toLowerCase())}
							<button
								type="button"
								onClick={() => setFragmentKind(null)}
								className="font-medium text-primary hover:underline"
							>
								show every type
							</button>
						</p>
					)}
					<Lanes
						key={fragmentKind ?? 'every'}
						tally={t}
						kinds={fragmentKind ? [fragmentKind] : kinds}
						names={names}
						onOpen={onOpen}
					/>
				</div>
			</div>
		);
	};

	return (
		<div className="min-h-0 flex-1 overflow-auto">
			{/* Narrow enough for the drawer's default width without scrolling sideways. */}
			<div className="min-w-[856px] space-y-3 px-3 py-4">
				<PartyStrip names={names} roles={roles} burden={burden} load={load} onLoad={toggleLoad} />

				<div className="grid grid-cols-[12rem_minmax(0,1fr)] gap-3">
					<ContractCard total={total} kinds={kinds} names={names} />
					<SpineBoard total={total} kinds={kinds} names={names} load={load} onLoad={toggleLoad} />
				</div>

				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="flex flex-wrap items-center gap-2">
						<TypeToggles kinds={kinds} onToggle={showKind} />
						{load && (
							<button
								type="button"
								onClick={() => toggleLoad(load)}
								title="Show every clause"
								className="inline-flex items-center gap-1 rounded-full border border-foreground/30 bg-card px-2 py-0.5 text-xs hover:bg-muted"
							>
								<span className="font-semibold" style={{ color: SIDE_COLOR[load.side] }}>
									{short(names[load.side])}
								</span>
								<span className="text-muted-foreground">·</span>
								{LOAD_QUESTION[load.kind]}
								<XIcon className="size-3" />
							</button>
						)}
					</div>
					<GradeFilterBar
						value={filter}
						counts={counts}
						all={shown.length}
						names={names}
						onChange={(value) => {
							setFilter(value);
							reset();
						}}
					/>
				</div>

				<div className="overflow-hidden rounded-xl border border-border bg-card">
					<div
						className="grid items-end gap-x-1.5 bg-secondary px-3 py-2 text-[11px]"
						style={{ gridTemplateColumns: columns }}
					>
						<span />
						<span />
						{/* The importance is fetched, so the ordering cannot be offered before it lands. */}
						<button
							type="button"
							onClick={() => setSortByImportance((on) => !on)}
							disabled={!importance}
							className="min-w-0 text-left disabled:cursor-default"
							title="Order the rows by how much each clause weighs inside the contract (PageRank with a per-clause prior), or by its position in the document"
						>
							<span className="block font-semibold text-foreground">Clause</span>
							{importance && (
								<span className="block text-[10px] text-muted-foreground hover:text-foreground">
									{sortByImportance ? 'by importance ↓' : 'by order'}
								</span>
							)}
						</button>
						<span className="min-w-0">
							<span className="block font-semibold text-foreground">In whose favour?</span>
							<span className="flex justify-between gap-1 text-[10px] font-semibold">
								<span className="flex min-w-0 items-center gap-0.5" style={{ color: SIDE_COLOR.a }}>
									<ArrowLeftIcon className="size-2.5 shrink-0" />
									<span className="truncate">{short(names.a)}</span>
								</span>
								<span className="flex min-w-0 items-center gap-0.5" style={{ color: SIDE_COLOR.b }}>
									<span className="truncate">{short(names.b)}</span>
									<ArrowRightIcon className="size-2.5 shrink-0" />
								</span>
							</span>
						</span>
						{kinds.map((kind) => (
							<span
								key={kind}
								className={cn(
									'flex min-w-0 flex-col items-center text-center',
									dimmed(kind) && 'opacity-30'
								)}
							>
								<span className="leading-tight font-semibold text-foreground">
									{QUESTION[kind]}
								</span>
								<span className="text-[10px] leading-tight font-medium text-muted-foreground">
									<span
										className="mr-1 inline-block size-2 rounded-[2px]"
										style={{ backgroundColor: KIND_COLORS[kind] }}
									/>
									{GLOSS[kind]}
								</span>
							</span>
						))}
						{/* The chevron's column. */}
						<span />
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
						{rows.slice(0, limit).map(({ t, grade }) => (
							<AccordionItem
								key={t.clauseId}
								value={t.clauseId}
								className={cn('border-border/60', grade === 'mixed' && 'bg-warning/10')}
							>
								{/* The trigger fills the row from underneath; the cells are buttons
								    on top of it, so a click on a count filters instead of toggling. */}
								<AccordionPrimitive.Header
									className="group relative grid items-center gap-x-1.5 px-3 py-2.5 hover:bg-muted/30 data-[state=open]:bg-muted/30"
									style={{ gridTemplateColumns: columns }}
								>
									<AccordionPrimitive.Trigger
										className="absolute inset-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
										aria-label={`${t.heading}: show what each party gains`}
										// The heading is cut at the column's edge; the row says it in full.
										title={t.heading.length > LONG_HEADING ? t.heading : undefined}
									/>
									<span
										className="pointer-events-none h-8 w-[3px] shrink-0 rounded-full"
										style={{ backgroundColor: gradeInk(grade) }}
									/>
									<span className="pointer-events-none flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-2xs font-semibold tabular-nums">
										{rank.get(t.clauseId)}
									</span>
									<span className="min-w-0">
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
									<GradeTrack grade={grade} count={t.count} kinds={kinds} names={names} />
									{kinds.map((kind) => (
										<span key={kind} className="contents">
											{cell(t, kind)}
										</span>
									))}
									<ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
								</AccordionPrimitive.Header>
								<AccordionContent className="pt-1">{detail(t, grade)}</AccordionContent>
							</AccordionItem>
						))}
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
