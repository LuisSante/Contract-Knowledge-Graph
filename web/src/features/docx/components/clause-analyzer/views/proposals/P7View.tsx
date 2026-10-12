'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
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
	GRADES,
	GradeAgree,
	GradeTag,
	NEUTRAL_INK,
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
	typeVerdict,
	type ClauseTally,
	type Served,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind } from '@/types/knowledge';
import type { ViewProps } from '@/features/docx/components/clause-analyzer/views/types';

/*
 * Proposal 7, double entry: every number is "in favour of" a party, and a party's side splits
 * into the rights it holds itself and what it derives from the other party — that party's
 * obligations and prohibitions, borne by it. What a party must do itself lives in its chip.
 */

const PAGE = 10;
/** Past five a side's marks stop growing and the number says the rest, so half of the
 *  narrowest type column still holds them. */
const MAX_MARKS = 5;
/** Fragments shown per group before "+ n more". */
const SHOWN_FRAGMENTS = 2;
/** Rights first: what a party holds itself, then what it gets from the other party. */
const ORDER: DeonticKind[] = ['right', 'obligation', 'prohibition'];
/** The types a party gets from the other party, which that party bears. */
type DerivedKind = Exclude<DeonticKind, 'right'>;
const DERIVED: DerivedKind[] = ['obligation', 'prohibition'];
/** A balanced clause's tick: legible on the dark beam and on a light one. */
const BALANCED_INK = '#a1a1aa';
/*
 * The table's columns, the same in the header and in every row so their axes line up: the
 * clause takes a little more than a type, the types share the rest, none below its minimum.
 */
const CLAUSE_COLUMN: CSSProperties = { flex: '1.2 1 0%', minWidth: 170 };
const TYPE_MIN = 140;
/** A group of `n` type columns; `extra` is the group's own border and padding. */
const typeColumns = (n: number, extra = 0): CSSProperties => ({
	flex: `${n} 1 0%`,
	minWidth: n * TYPE_MIN + extra,
});
/** One type column inside its group. */
const CELL = 'min-w-0 flex-1 basis-0';
/** The dashed line between own and derived: 1 px of border and 4 px of padding. */
const DERIVED_EDGE = 5;

type GradeFilterValue = 'all' | Side | 'balanced' | 'mixed';

const plural = (kind: DeonticKind) => KIND_PLURAL[kind].toLowerCase();
/** A deontic kind's name is its own singular noun. */
const noun = (kind: DeonticKind, n: number) => (n === 1 ? kind : plural(kind));
const possessive = (name: string) => `${short(name)}'s`;

const matches = (grade: Grade, filter: GradeFilterValue) =>
	filter === 'all' ||
	(filter === 'a' || filter === 'b' ? gradeSide(grade) === filter : grade === filter);

/** "2 rights in favour of Equidata", "11 of National's obligations in favour of Equidata". */
function entryText(kind: DeonticKind, side: Side, n: number, names: Record<Side, string>) {
	const what =
		kind === 'right'
			? `${n} ${noun(kind, n)}`
			: `${n} of ${possessive(names[otherSide(side)])} ${plural(kind)}`;
	return `${what} in favour of ${short(names[side])}`;
}

/** One paragraph's statements by beneficiary, for the contract pane: "In favour of Equidata:
 *  2 rights, 11 of National's obligations · In favour of National: 4 of Equidata's obligations". */
function paragraphNote(served: Served[], names: Record<Side, string>) {
	return SIDES.flatMap((side) => {
		const parts = ORDER.flatMap((kind) => {
			const n = served.filter((s) => s.kind === kind && (s.to === side || s.to === 'both')).length;
			if (n === 0) return [];
			return kind === 'right'
				? [`${n} ${noun(kind, n)}`]
				: [`${n} of ${possessive(names[otherSide(side)])} ${plural(kind)}`];
		});
		return parts.length > 0 ? [`In favour of ${short(names[side])}: ${parts.join(', ')}`] : [];
	}).join(' · ');
}

/** A clause's tick in the grade strip: filled when everything goes to one party, outlined when
 *  it only gets more, grey when balanced, amber when it depends on the type. */
function tickStyle(grade: Grade): CSSProperties {
	const side = gradeSide(grade);
	if (side) {
		const color = SIDE_COLOR[side];
		return isOnly(grade)
			? { backgroundColor: color }
			: { border: `1.5px solid ${color}`, backgroundColor: tint(color, 30) };
	}
	return { backgroundColor: grade === 'mixed' ? 'var(--warning)' : BALANCED_INK };
}

function Tick({ grade, title }: { grade: Grade; title?: string }) {
	return (
		<span title={title} className="h-2.5 w-1.5 shrink rounded-[1px]" style={tickStyle(grade)} />
	);
}

function Square({ kind, className }: { kind: DeonticKind; className?: string }) {
	return (
		<span
			className={cn('size-2 shrink-0 rounded-[2px]', className)}
			style={{ backgroundColor: KIND_COLORS[kind] }}
		/>
	);
}

/** The party that bears a statement, named inside the other party's side: neutral ink, never
 *  its own colour (the theme's ink in dark mode, where the fixed one would not show). */
function Bearer({ children }: { children: ReactNode }) {
	return (
		<span
			className="font-semibold text-[color:var(--bearer-ink)] dark:text-foreground"
			style={{ '--bearer-ink': NEUTRAL_INK } as CSSProperties}
		>
			{children}
		</span>
	);
}

/** What one party gets of one type, the double-entry way: its own rights, or the other
 *  party's obligations and prohibitions. */
function EntryLabel({
	kind,
	side,
	names,
	capital,
}: {
	kind: DeonticKind;
	side: Side;
	names: Record<Side, string>;
	capital?: boolean;
}) {
	if (kind === 'right') return <span>{capital ? 'Own rights' : 'own rights'}</span>;
	return (
		<span>
			<Bearer>{possessive(names[otherSide(side)])}</Bearer> {plural(kind)}
		</span>
	);
}

/** The dashed line under which a party's side lists what the other party bears for it. */
function DerivedRule({
	side,
	names,
	mirrored,
	className,
}: {
	side: Side;
	names: Record<Side, string>;
	mirrored?: boolean;
	className?: string;
}) {
	return (
		<div className={cn('flex items-center gap-2', mirrored && 'flex-row-reverse', className)}>
			<span className="shrink-0 text-[10px] font-medium tracking-wider whitespace-nowrap text-muted-foreground uppercase">
				Derived · borne by <Bearer>{short(names[otherSide(side)])}</Bearer>
			</span>
			<span className="flex-1 border-t border-dashed border-border" />
		</div>
	);
}

/** Each party with its role and its own load: the obligations it must perform and the
 *  prohibitions that bind it, each in favour of the other party. */
function PartyStrip({
	names,
	roles,
	burden,
	kinds,
}: {
	names: Record<Side, string>;
	roles: Record<Side, string>;
	burden: Record<Side, Burden>;
	kinds: DeonticKind[];
}) {
	const loads = DERIVED.filter((kind) => kinds.includes(kind));
	const chip = (side: Side) => {
		const color = SIDE_COLOR[side];
		return (
			<div
				className="flex max-w-full min-w-0 items-center gap-2 rounded-full border px-3 py-1 text-xs"
				style={{ borderColor: tint(color, 40), backgroundColor: tint(color, 6) }}
			>
				<span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
				<span className="truncate font-semibold" style={{ color }} title={names[side]}>
					{names[side]}
				</span>
				{roles[side] && <span className="shrink-0 text-muted-foreground">{roles[side]}</span>}
				{loads.length > 0 && (
					<>
						<span className="h-3.5 w-px shrink-0 bg-border" />
						<span className="shrink-0 whitespace-nowrap text-muted-foreground">
							borne:{' '}
							{loads.map((kind, i) => {
								const n = burden[side][kind];
								const clauses = burden[side].clauses[kind];
								return (
									<span
										key={kind}
										title={`${n} ${noun(kind, n)} borne by ${short(names[side])}, in favour of ${short(names[otherSide(side)])}, in ${clauses} ${clauses === 1 ? 'clause' : 'clauses'}`}
									>
										{i > 0 && ' · '}
										<span className="font-semibold text-foreground tabular-nums">{n}</span>{' '}
										{noun(kind, n)}
									</span>
								);
							})}
						</span>
					</>
				)}
			</div>
		);
	};
	return (
		<div className="flex flex-wrap items-center gap-2">
			{chip('a')}
			<span className="text-2xs text-muted-foreground">vs</span>
			{chip('b')}
		</div>
	);
}

/** One tick per clause, grouped by grade from "only A" to "only B", each group's count under it. */
function GradeStrip({
	rows,
	kinds,
	names,
}: {
	rows: ClauseTally[];
	kinds: DeonticKind[];
	names: Record<Side, string>;
}) {
	const groups = GRADES.map((grade) => ({
		grade,
		clauses: rows.filter((t) => gradeOf(t.count, kinds) === grade),
	})).filter((g) => g.clauses.length > 0);
	return (
		<span className="flex min-w-0 items-start gap-2">
			{groups.map(({ grade, clauses }) => (
				<span
					key={grade}
					className="flex min-w-0 flex-col items-center gap-1"
					style={{ flexShrink: clauses.length }}
				>
					<span className="flex min-w-0 gap-[2px]">
						{clauses.map((t) => (
							<Tick
								key={t.clauseId}
								grade={grade}
								title={`${t.section ?? t.heading} · ${gradeLabel(grade, names)}`}
							/>
						))}
					</span>
					<span className="text-[10px] leading-none tabular-nums opacity-80">{clauses.length}</span>
				</span>
			))}
		</span>
	);
}

/** The contract's grade first, on the darkest block of the panel, and how its clauses spread. */
function Beam({
	grade,
	rows,
	kinds,
	names,
}: {
	grade: Grade;
	rows: ClauseTally[];
	kinds: DeonticKind[];
	names: Record<Side, string>;
}) {
	return (
		<div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-foreground px-4 py-2.5 text-background">
			<span className="text-[10px] font-semibold tracking-wider uppercase opacity-70">
				Who does the contract favour?
			</span>
			{/* A card underneath keeps the tag's own colours legible on the dark beam. */}
			<span className="inline-flex rounded-md bg-card">
				<GradeTag grade={grade} names={names} size="lg" />
			</span>
			<span className="flex min-w-0 items-center gap-3">
				<GradeStrip rows={rows} kinds={kinds} names={names} />
				<span className="inline-flex shrink-0 items-center gap-1 text-2xs opacity-70">
					<Caret to="a" color="currentColor" />
					{rows.length === 1 ? 'the 1 clause' : `the ${rows.length} clauses`}, by grade
				</span>
			</span>
		</div>
	);
}

/** One party's book: what the contract puts in its favour, its own rights apart from what it
 *  derives from the other party. The numbers face the middle. */
function Book({
	side,
	total,
	kinds,
	names,
}: {
	side: Side;
	total: ClauseTally['count'];
	kinds: DeonticKind[];
	names: Record<Side, string>;
}) {
	const color = SIDE_COLOR[side];
	const mirrored = side === 'b';
	const derived = DERIVED.filter((kind) => kinds.includes(kind));
	const line = (kind: DeonticKind) => {
		const n = total[kind][side];
		const borne = kind === 'right' ? '' : `, borne by ${short(names[otherSide(side)])}`;
		return (
			<div
				key={kind}
				className={cn('flex h-8 items-center gap-3', mirrored && 'flex-row-reverse')}
				title={`${n} ${noun(kind, n)} in favour of ${short(names[side])}${borne}`}
			>
				<span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-sm whitespace-nowrap text-foreground">
					<Square kind={kind} />
					<EntryLabel kind={kind} side={side} names={names} />
				</span>
				<span
					className={cn(
						'w-10 shrink-0 text-xl font-bold tabular-nums',
						mirrored ? 'text-left' : 'text-right'
					)}
					style={{ color }}
				>
					{n}
				</span>
			</div>
		);
	};
	return (
		<div className="rounded-xl border border-border bg-card px-4 py-3">
			<p
				className={cn(
					'flex h-5 items-center text-[10px] font-bold tracking-wider uppercase',
					mirrored && 'justify-end'
				)}
				style={{ color }}
			>
				In favour of {short(names[side])}
			</p>
			{kinds.includes('right') && line('right')}
			{derived.length > 0 && (
				<DerivedRule side={side} names={names} mirrored={mirrored} className="h-5" />
			)}
			{derived.map(line)}
		</div>
	);
}

/** Each type on its own, row by row with the books: the two parties' counts as bars from one
 *  axis, on one scale common to every type. */
function EachType({
	total,
	kinds,
	names,
}: {
	total: ClauseTally['count'];
	kinds: DeonticKind[];
	names: Record<Side, string>;
}) {
	const shown = ORDER.filter((kind) => kinds.includes(kind));
	const derived = DERIVED.filter((kind) => kinds.includes(kind));
	const max = Math.max(1, ...shown.flatMap((kind) => [total[kind].a, total[kind].b]));
	const axis = <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/25" />;
	const bar = (kind: DeonticKind) => {
		const half = (side: Side) => {
			const n = total[kind][side];
			const behind = n < total[kind][otherSide(side)];
			return (
				<span
					className={cn(
						'absolute top-1/2 h-1.5 -translate-y-1/2',
						side === 'a' ? 'right-1/2 rounded-l-full' : 'left-1/2 rounded-r-full'
					)}
					style={{
						width: `${(n / max) * 50}%`,
						backgroundColor: SIDE_COLOR[side],
						opacity: behind ? 0.55 : 1,
					}}
				/>
			);
		};
		return (
			<div
				key={kind}
				className="flex h-8 items-center gap-2"
				title={`${KIND_PLURAL[kind]}: ${total[kind].a} in favour of ${short(names.a)}, ${total[kind].b} in favour of ${short(names.b)}`}
			>
				<Square kind={kind} className="size-2.5" />
				<span className="relative h-full flex-1">
					{axis}
					{half('a')}
					{half('b')}
				</span>
			</div>
		);
	};
	return (
		<div className="rounded-xl border border-transparent bg-secondary/60 px-3 py-3">
			<p className="flex h-5 items-center justify-center overflow-hidden text-[9px] font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase">
				Each type separately
			</p>
			{kinds.includes('right') && bar('right')}
			{derived.length > 0 && (
				<div className="relative flex h-5 items-center gap-2">
					<span className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
					<span className="size-2.5 shrink-0" />
					<span className="relative h-full flex-1">{axis}</span>
				</div>
			)}
			{derived.map(bar)}
		</div>
	);
}

/** Which deontic types are on screen, rights first; the last one on stays on. */
function KindToggles({
	kinds,
	onToggle,
}: {
	kinds: DeonticKind[];
	onToggle: (kind: DeonticKind) => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
			Show
			{ORDER.map((kind) => {
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
						<Square kind={kind} className="size-2.5" />
						{KIND_PLURAL[kind]}
						{on && <CheckIcon className="size-3" />}
					</button>
				);
			})}
		</div>
	);
}

/** Narrows the clauses to a grade, "only" and "more" merged per party. */
function GradeFilter({
	value,
	counts,
	all,
	names,
	onChange,
}: {
	value: GradeFilterValue;
	counts: Record<Grade, number>;
	all: number;
	names: Record<Side, string>;
	onChange: (value: GradeFilterValue) => void;
}) {
	const options: Array<{
		id: GradeFilterValue;
		n: number;
		label: ReactNode;
		grades: Grade[];
		color?: string;
	}> = [
		{ id: 'all', n: all, label: 'All', grades: [] },
		{
			id: 'a',
			n: counts['a-only'] + counts.a,
			label: (
				<>
					<Caret to="a" color="currentColor" />
					For {short(names.a)}
				</>
			),
			grades: ['a-only', 'a'],
			color: SIDE_COLOR.a,
		},
		{ id: 'balanced', n: counts.balanced, label: '= Balanced', grades: ['balanced'] },
		{ id: 'mixed', n: counts.mixed, label: 'Depends on the type', grades: ['mixed'] },
		{
			id: 'b',
			n: counts.b + counts['b-only'],
			label: (
				<>
					For {short(names.b)}
					<Caret to="b" color="currentColor" />
				</>
			),
			grades: ['b', 'b-only'],
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
							'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-40',
							on ? 'bg-foreground text-background' : 'hover:bg-card'
						)}
						style={on ? undefined : { color: o.color }}
					>
						{o.grades.length > 0 && (
							<span className="flex gap-[2px]">
								{o.grades.map((g) => (
									<Tick key={g} grade={g} />
								))}
							</span>
						)}
						<span className="inline-flex items-center gap-0.5">{o.label}</span>
						<span className="font-normal tabular-nums opacity-80">{o.n}</span>
					</button>
				);
			})}
		</div>
	);
}

/** Under "Depends on the type", which types each party wins: "◂ rights · obligations ▸". */
function DependsLine({ count, kinds }: { count: ClauseTally['count']; kinds: DeonticKind[] }) {
	const { byKind } = typeVerdict(count, kinds);
	const won = (side: Side) =>
		ORDER.filter((kind) => kinds.includes(kind) && byKind[kind] === side)
			.map(plural)
			.join(', ');
	return (
		<span className="flex flex-wrap items-center justify-center gap-x-1 text-[10px] leading-tight font-semibold">
			<span className="inline-flex items-center gap-0.5" style={{ color: SIDE_COLOR.a }}>
				<Caret to="a" color={SIDE_COLOR.a} size={6} />
				{won('a')}
			</span>
			<span className="text-muted-foreground">·</span>
			<span className="inline-flex items-center gap-0.5" style={{ color: SIDE_COLOR.b }}>
				{won('b')}
				<Caret to="b" color={SIDE_COLOR.b} size={6} />
			</span>
		</span>
	);
}

/** An open clause, one lane per party: its own rights, then under the dashed line what the
 *  other party bears for it. A type the clause holds on one side only shows greyed, with 0, on
 *  the other. */
function Ledger({
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
	const present = ORDER.filter(
		(kind) => kinds.includes(kind) && tally.count[kind].a + tally.count[kind].b > 0
	);
	const derived = present.filter((kind) => kind !== 'right');

	const group = (side: Side, kind: DeonticKind) => {
		const served = servedOf(tally, side, kind);
		const key = `${side}-${kind}`;
		const all = unfolded.has(key);
		const empty = served.length === 0;
		return (
			<div key={kind} className={cn(empty && 'opacity-50')}>
				<div className="flex items-center gap-1.5 px-3 pt-1.5 text-2xs font-semibold text-foreground">
					<Square kind={kind} />
					<EntryLabel kind={kind} side={side} names={names} capital />
					<span className="text-muted-foreground">·</span>
					<span
						className="tabular-nums"
						style={{ color: empty ? 'var(--muted-foreground)' : SIDE_COLOR[side] }}
					>
						{served.length}
					</span>
					{served.length > SHOWN_FRAGMENTS && (
						<button
							type="button"
							onClick={() =>
								setUnfolded((prev) => {
									const next = new Set(prev);
									if (all) next.delete(key);
									else next.add(key);
									return next;
								})
							}
							className="ml-auto font-medium text-primary hover:underline"
						>
							{all ? '− fewer' : `+ ${served.length - SHOWN_FRAGMENTS} more`}
						</button>
					)}
				</div>
				{!empty && (
					<div className="pl-3.5">
						{(all ? served : served.slice(0, SHOWN_FRAGMENTS)).map((s) => (
							<Fragment
								key={`${s.mark.id}-${s.to}`}
								served={s}
								section={tally.section}
								square={false}
								onOpen={onOpen}
							/>
						))}
					</div>
				)}
			</div>
		);
	};

	const lane = (side: Side) => (
		<div
			key={side}
			className="overflow-hidden rounded-lg border bg-card"
			style={{ borderColor: tint(SIDE_COLOR[side], 35) }}
		>
			<div
				className="px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase"
				style={{ backgroundColor: tint(SIDE_COLOR[side], 10), color: SIDE_COLOR[side] }}
			>
				In favour of {short(names[side])}
			</div>
			<div className="space-y-1 pb-2">
				{present.includes('right') && group(side, 'right')}
				{derived.length > 0 && <DerivedRule side={side} names={names} className="px-3 pt-1.5" />}
				{derived.map((kind) => group(side, kind))}
			</div>
		</div>
	);

	return <div className="grid grid-cols-2 gap-3">{SIDES.map(lane)}</div>;
}

/** Double entry: each clause's counts in favour of each party, own rights apart from the
 *  rights derived from the other party's obligations and prohibitions. */
export function P7View({
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
	const [filter, setFilter] = useState<GradeFilterValue>('all');
	const [sortByImportance, setSortByImportance] = useState(true);
	// Every row starts closed; the reader opens the one they want.
	const [openId, setOpenId] = useState<string | null>(null);
	const [fragmentKind, setFragmentKind] = useState<DeonticKind | null>(null);
	const { reviews, review } = useReviews(docId);
	const { tallies, total, rank } = useTallies(grid, kg, importance, sortByImportance);
	const shownKinds = ORDER.filter((kind) => kinds.includes(kind));
	const own = kinds.includes('right');
	const derived = DERIVED.filter((kind) => kinds.includes(kind));
	const shown = tallies.filter((t) => hasKinds(t, kinds));
	const counts = gradeCounts(shown, kinds);
	const rows = shown.filter((t) => matches(gradeOf(t.count, kinds), filter));
	const opened = rows.find((t) => t.clauseId === openId) ?? null;
	const burden = burdenOf(tallies);

	useClauseNotes(kg, opened, kinds, names, (served) => paragraphNote(served, names), 'p7');

	/** Opens the clause on that type's fragments; on the type already shown, on all of them. */
	const filterBy = (clauseId: string, kind: DeonticKind) => {
		const same = opened?.clauseId === clauseId && fragmentKind === kind;
		setOpenId(clauseId);
		setFragmentKind(same ? null : kind);
	};

	const showKind = (kind: DeonticKind) => {
		setFragmentKind(null);
		toggleKind(kind);
	};

	const cell = (t: ClauseTally, kind: DeonticKind) => {
		const { a, b } = t.count[kind];
		if (a + b === 0)
			return (
				<span key={kind} className={cn('pointer-events-none flex self-center px-1', CELL)}>
					<Diverging a={0} b={0} hollow={false} className="w-full" />
				</span>
			);
		const active = opened?.clauseId === t.clauseId && fragmentKind === kind;
		return (
			<button
				key={kind}
				type="button"
				onClick={() => filterBy(t.clauseId, kind)}
				className={cn(
					'relative z-10 flex items-center self-center rounded-md px-1 py-1 hover:bg-muted',
					CELL,
					active && 'bg-accent ring-1 ring-primary/40'
				)}
				title={
					active
						? 'Show the fragments of every type'
						: `${entryText(kind, 'a', a, names)} · ${entryText(kind, 'b', b, names)} — click to see only these fragments`
				}
			>
				{/* Discs for the rights a party holds, rings for what the other party bears. */}
				<Diverging a={a} b={b} hollow={kind !== 'right'} max={MAX_MARKS} />
			</button>
		);
	};

	const typeHead = (kind: DeonticKind) => (
		<span key={kind} className={cn('flex flex-col items-center gap-1 px-1', CELL)}>
			<span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-card px-2 py-px text-foreground">
				<Square kind={kind} />
				<span className="truncate">{KIND_PLURAL[kind]}</span>
			</span>
			<span className="flex w-full items-center gap-1.5 text-[9px] font-medium tracking-normal normal-case">
				<span
					className="flex min-w-0 flex-1 items-center justify-end gap-0.5"
					style={{ color: SIDE_COLOR.a }}
					title={`for ${names.a}`}
				>
					<Caret to="a" color={SIDE_COLOR.a} size={6} />
					<span className="truncate">for {short(names.a)}</span>
				</span>
				<span className="h-3 w-px shrink-0 bg-foreground/30" />
				<span
					className="flex min-w-0 flex-1 items-center gap-0.5"
					style={{ color: SIDE_COLOR.b }}
					title={`for ${names.b}`}
				>
					<span className="truncate">for {short(names.b)}</span>
					<Caret to="b" color={SIDE_COLOR.b} size={6} />
				</span>
			</span>
		</span>
	);

	const groupLabel = 'text-[9px] font-semibold tracking-widest text-muted-foreground';

	return (
		<div className="min-h-0 flex-1 overflow-auto">
			{/* Fits the drawer's default 900 px; below the columns' minimums it scrolls. */}
			<div className="min-w-[850px] space-y-3 p-4">
				<PartyStrip names={names} roles={roles} burden={burden} kinds={kinds} />

				<Beam grade={gradeOf(total, kinds)} rows={shown} kinds={kinds} names={names} />

				<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.5fr)_minmax(0,1fr)] gap-2">
					<Book side="a" total={total} kinds={kinds} names={names} />
					<EachType total={total} kinds={kinds} names={names} />
					<Book side="b" total={total} kinds={kinds} names={names} />
				</div>

				<div className="flex flex-wrap items-center justify-between gap-2">
					<KindToggles kinds={kinds} onToggle={showKind} />
					<GradeFilter
						value={filter}
						counts={counts}
						all={shown.length}
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
					{/* Stretched, so the dashed line between own and derived runs the full height;
					    the type stacks sit on the bottom, level with each other. */}
					<div className="flex items-stretch gap-2 bg-secondary px-3 text-[10px] font-bold tracking-wider uppercase">
						{/* The column carries no padding of its own, as in the rows, so both get the
						    same share of the width. */}
						<span className="flex" style={CLAUSE_COLUMN}>
							{/* The importance is fetched, so the ordering cannot be offered before it lands. */}
							<button
								type="button"
								onClick={() => setSortByImportance((on) => !on)}
								disabled={!importance}
								className="w-full py-2 pl-8 text-left text-muted-foreground uppercase enabled:hover:text-foreground disabled:cursor-default"
								title="Order the rows by how much each clause weighs inside the contract (PageRank with a per-clause prior), or by its position in the document"
							>
								Clause
								{importance && (
									<span className="font-normal normal-case">
										{sortByImportance ? ' · by importance ↓' : ' · by order'}
									</span>
								)}
							</button>
						</span>
						<span className="flex w-36 shrink-0 items-center justify-center text-center text-muted-foreground">
							Who does it favour?
						</span>
						{own && (
							<span
								className="flex flex-col items-center justify-end gap-1 py-2"
								style={typeColumns(1)}
							>
								<span className={groupLabel}>Own</span>
								<span className="flex w-full">{typeHead('right')}</span>
							</span>
						)}
						{derived.length > 0 && (
							<span
								className="flex flex-col items-center justify-end gap-1 border-l border-dashed border-border py-2 pl-1"
								style={typeColumns(derived.length, DERIVED_EDGE)}
							>
								<span className={cn('flex w-full items-center gap-2', groupLabel)}>
									<span className="h-px min-w-2 flex-1 bg-border" />
									<span className="text-center">Derived · borne by the other party</span>
									<span className="h-px min-w-2 flex-1 bg-border" />
								</span>
								<span className="flex w-full">{derived.map(typeHead)}</span>
							</span>
						)}
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
							const grade = gradeOf(t.count, kinds);
							const side = gradeSide(grade);
							return (
								<AccordionItem
									key={t.clauseId}
									value={t.clauseId}
									className={cn('border-border/60', grade === 'mixed' && 'bg-warning/5')}
								>
									{/* The trigger fills the row from underneath; the cells are buttons
									    on top of it, so a click on a count filters instead of toggling. */}
									<AccordionPrimitive.Header className="group relative flex items-stretch gap-2 px-3 hover:bg-muted/30 data-[state=open]:bg-muted/30">
										<AccordionPrimitive.Trigger
											className="absolute inset-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
											aria-label={`${t.heading}: show what it puts in favour of each party`}
											// The heading lets clicks through to the trigger, so its full name shows here.
											title={t.heading}
										/>
										<span className="flex items-center gap-2 py-2.5" style={CLAUSE_COLUMN}>
											<span className="pointer-events-none flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-2xs font-semibold tabular-nums">
												{rank.get(t.clauseId)}
											</span>
											<span className="min-w-0 flex-1">
												<span className="pointer-events-none block truncate text-sm font-semibold text-foreground">
													{t.heading}
												</span>
												<span className="flex items-center gap-2 overflow-hidden whitespace-nowrap">
													{t.section && (
														<span className="pointer-events-none shrink-0 rounded bg-secondary px-1 text-[10px] font-medium">
															{t.section}
														</span>
													)}
													{onOpenGraph && (
														<GraphLink
															onClick={() => onOpenGraph(t.clauseId)}
															className="shrink-0 whitespace-nowrap"
														/>
													)}
												</span>
											</span>
										</span>
										{/* The tag sits on the side it favours; balanced and depends in the middle. */}
										<span
											className={cn(
												'pointer-events-none flex w-36 shrink-0 flex-col justify-center gap-0.5 py-2',
												side === 'a' ? 'items-start' : side === 'b' ? 'items-end' : 'items-center'
											)}
										>
											<GradeTag
												grade={grade}
												names={names}
												className="max-w-full overflow-hidden"
											/>
											{grade === 'mixed' && <DependsLine count={t.count} kinds={kinds} />}
										</span>
										{own && (
											<span className="flex items-center" style={typeColumns(1)}>
												{cell(t, 'right')}
											</span>
										)}
										{derived.length > 0 && (
											<span
												className="flex items-center border-l border-dashed border-border pl-1"
												style={typeColumns(derived.length, DERIVED_EDGE)}
											>
												{derived.map((kind) => cell(t, kind))}
											</span>
										)}
										<span className="pointer-events-none flex w-4 shrink-0 items-center">
											<ChevronDownIcon className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
										</span>
									</AccordionPrimitive.Header>
									<AccordionContent className="px-3 pt-1 pb-3">
										<div className="space-y-3">
											{fragmentKind && (
												<p className="flex items-center gap-1.5 text-2xs text-foreground/70">
													<Square kind={fragmentKind} className="size-2.5" />
													Only {plural(fragmentKind)}
													<button
														type="button"
														onClick={() => setFragmentKind(null)}
														className="font-medium text-primary hover:underline"
													>
														show every type
													</button>
												</p>
											)}
											<Ledger
												key={fragmentKind ?? 'every'}
												tally={t}
												kinds={fragmentKind ? [fragmentKind] : shownKinds}
												names={names}
												onOpen={onOpen}
											/>
											<GradeAgree
												grade={grade}
												names={names}
												answer={reviews[t.clauseId]}
												onAnswer={(answer) => review(t.clauseId, answer)}
											/>
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
