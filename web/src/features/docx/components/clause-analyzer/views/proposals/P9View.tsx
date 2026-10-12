'use client';

import { useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import { ChevronDownIcon } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem } from '@/components/ui/accordion';
import { KIND_COLORS } from '@/features/docx/components/clause-analyzer/constants';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import {
	Fragment,
	GraphLink,
	KIND_PLURAL,
	KindFilter,
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
	Caret,
	Diverging,
	GradeAgree,
	GradeTag,
	NEUTRAL_INK,
	SIDES,
	gradeCounts,
	gradeLabel,
	gradeOf,
	gradeSide,
	isOnly,
	otherSide,
	servedOf,
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
/** Fragments shown under each group before "+ n more". */
const SHOWN_FRAGMENTS = 2;
/** Past this a row's marks stop growing, so a count never pushes its half past the axis. */
const MAX_MARKS = 6;
/** Past this the whole contract's marks stop growing, and the number says the rest. */
const MAX_TOTAL_MARKS = 30;

/*
 * The columns every row shares, the header and the whole-contract row included, sized for the
 * drawer's default width (about 880 px of content): the clause keeps at least 176 px and the
 * types share what is left, never under 150 px each. Every row has the same fixed parts and
 * the same 4 px gaps, so the flex shares — and each type's axis — come out the same in all.
 * No flex-1 column carries padding or a border: either would change its share.
 */
const CLAUSE_COL = 'min-w-[176px] flex-1';
const GRADE_COL = 'w-[118px] shrink-0';
/** The clause and grade columns as one, with the gap between them: the contract row's lead. */
const LEAD_COL = 'min-w-[298px] flex-[1_1_122px]';
const TYPE_COL = 'min-w-[150px] flex-1';
const ROW = 'flex items-center gap-1 px-2';

/*
 * Proposal 9, "From my seat". The reader picks the party they read as, and every count is
 * conjugated from there: "National owes me 29" and "I owe 15" where Table v2 printed
 * "Obligations 29 : 15". Sides, colours and marks never move with the seat — only the verbs
 * do — so one party's duty reads as the other's claim.
 */

/** Where the reader sits: one of the parties, or neither. */
type Seat = Side | 'neutral';

/** A statement type's words from a seat, for the statements that benefit one side. */
interface Words {
	/** The side the statements benefit. */
	to: Side;
	/** The party the phrase names, when it is not the reader. */
	who: Side | null;
	/** What follows the name; the whole phrase in the first person. */
	verb: string;
	/** What it means, in two or three words; "%" stands for the party it benefits. */
	gloss: string;
}

/**
 * An obligation is performed by the party it is not owed to, a prohibition binds the party it
 * does not protect, a right belongs to its holder: so `to`, the side it benefits, decides who
 * the phrase names.
 */
function wordsFrom(kind: DeonticKind, to: Side, seat: Seat): Words {
	const by = otherSide(to);
	if (kind === 'right')
		return seat === to
			? { to, who: null, verb: 'I may', gloss: 'my rights' }
			: { to, who: to, verb: 'may', gloss: 'its rights' };
	const owes = kind === 'obligation';
	if (seat === to)
		return owes
			? { to, who: by, verb: 'owes me', gloss: 'I can demand it' }
			: { to, who: by, verb: 'may not', gloss: 'protects me' };
	if (seat === by) return { to, who: null, verb: owes ? 'I owe' : 'I may not', gloss: 'my burden' };
	return owes
		? { to, who: by, verb: 'owes', gloss: '% can demand it' }
		: { to, who: by, verb: 'may not', gloss: 'protects %' };
}

const plain = (words: Words, names: Record<Side, string>) =>
	words.who ? `${short(names[words.who])} ${words.verb}` : words.verb;

const glossText = (words: Words, names: Record<Side, string>) =>
	words.gloss.replace('%', short(names[words.to]));

/** The beneficiary, never the bearer: "in my favour", "in National's favour", "for National". */
const favourOf = (side: Side, seat: Seat, names: Record<Side, string>) =>
	seat === 'neutral'
		? `for ${short(names[side])}`
		: seat === side
			? 'in my favour'
			: `in ${short(names[side])}'s favour`;

/** "Only in my favour", "More in National's favour"; from no seat, Table v2's words. */
function seatGrade(grade: Grade, seat: Seat, names: Record<Side, string>) {
	const side = gradeSide(grade);
	if (!side || seat === 'neutral') return gradeLabel(grade, names);
	return `${isOnly(grade) ? 'Only' : 'More'} ${favourOf(side, seat, names)}`;
}

/** A party's grades sit on its side of the column, the others in the middle. */
const gradeAlign = (grade: Grade) => {
	const side = gradeSide(grade);
	return side === 'a' ? 'items-start' : side === 'b' ? 'items-end' : 'items-center';
};

type GradeFilterValue = 'all' | Side | 'balanced' | 'mixed';

const inFilter = (grade: Grade, filter: GradeFilterValue) =>
	filter === 'all' ||
	(filter === 'a' || filter === 'b' ? gradeSide(grade) === filter : grade === filter);

/** A party's short name, cut with an ellipsis when its cell is short: names give way, the
 *  verbs and the numbers never do. */
function Name({
	side,
	names,
	className,
	style,
}: {
	side: Side;
	names: Record<Side, string>;
	className?: string;
	style?: CSSProperties;
}) {
	return (
		<span className={cn('inline-block max-w-full truncate align-bottom', className)} style={style}>
			{short(names[side])}
		</span>
	);
}

/** "in my favour", "In National's favour", "for National", with the name allowed to give way. */
function Favour({
	side,
	seat,
	names,
	capital,
}: {
	side: Side;
	seat: Seat;
	names: Record<Side, string>;
	capital?: boolean;
}) {
	const lead = (word: string) => (capital ? word.replace(/^./, (c) => c.toUpperCase()) : word);
	if (seat === side) return <>{lead('in')} my favour</>;
	if (seat === 'neutral')
		return (
			<>
				{lead('for')} <Name side={side} names={names} />
			</>
		);
	return (
		<>
			{lead('in')} <Name side={side} names={names} />
			&apos;s favour
		</>
	);
}

/** The grade's words as a tag label, one wrapping run so the tag can take two lines. */
function GradeWords({
	grade,
	seat,
	names,
}: {
	grade: Grade;
	seat: Seat;
	names: Record<Side, string>;
}) {
	const side = gradeSide(grade);
	if (!side) return <span className="min-w-0">{gradeLabel(grade, names)}</span>;
	return (
		<span className="min-w-0">
			{isOnly(grade) ? 'Only' : 'More'} <Favour side={side} seat={seat} names={names} />
		</span>
	);
}

/**
 * The words as printed on one side: a party named on its own side keeps its colour; named on
 * the other's side, it is the one bearing the statement, so it goes in neutral ink. A line
 * breaks only between the name and the verb.
 */
function Said({
	words,
	side,
	names,
	className,
}: {
	words: Words;
	side: Side;
	names: Record<Side, string>;
	className?: string;
}) {
	const own = words.who === side;
	return (
		<span className={className}>
			{words.who && (
				<>
					<Name
						side={words.who}
						names={names}
						className={cn('font-semibold', !own && 'dark:text-foreground!')}
						style={{ color: own ? SIDE_COLOR[side] : NEUTRAL_INK }}
					/>{' '}
				</>
			)}
			<span
				className={cn(
					'whitespace-nowrap text-foreground',
					words.who ? 'font-medium' : 'font-semibold'
				)}
			>
				{words.verb}
			</span>
		</span>
	);
}

/** "(I can demand it)", "(protects Equidata)": a name inside it gives way like any other. */
function Gloss({
	words,
	names,
	className,
}: {
	words: Words;
	names: Record<Side, string>;
	className?: string;
}) {
	const [before, after] = words.gloss.split('%');
	return (
		<span className={className}>
			({before}
			{after !== undefined && (
				<>
					<Name side={words.to} names={names} />
					{after}
				</>
			)}
			)
		</span>
	);
}

/** The row's leading bar: full colour when everything goes to one party, washed out when it
 *  only gets more, amber when it depends on the type. */
function GradeBar({ grade, className }: { grade: Grade; className?: string }) {
	const side = gradeSide(grade);
	const color = side
		? isOnly(grade)
			? SIDE_COLOR[side]
			: tint(SIDE_COLOR[side], 45)
		: grade === 'mixed'
			? 'var(--warning)'
			: 'var(--border)';
	return (
		<span
			className={cn('pointer-events-none w-1 shrink-0 rounded-full', className)}
			style={{ backgroundColor: color }}
		/>
	);
}

/** Under "Depends on the type": which types each party wins, on its side and in its colour. */
function DependsLine({ count, kinds }: { count: ClauseTally['count']; kinds: DeonticKind[] }) {
	const { byKind } = typeVerdict(count, kinds);
	const won = (side: Side) =>
		listOf(kinds.filter((k) => byKind[k] === side).map((k) => KIND_PLURAL[k].toLowerCase()));
	return (
		<span className="flex flex-wrap items-center justify-center gap-x-1 text-[10px] leading-tight font-semibold">
			<span className="inline-flex items-center gap-0.5" style={{ color: SIDE_COLOR.a }}>
				<Caret to="a" color={SIDE_COLOR.a} size={6} />
				in {won('a')}
			</span>
			<span className="text-muted-foreground">·</span>
			<span className="inline-flex items-center gap-0.5" style={{ color: SIDE_COLOR.b }}>
				in {won('b')}
				<Caret to="b" color={SIDE_COLOR.b} size={6} />
			</span>
		</span>
	);
}

/** The whole contract's marks, wrapping in rows of ten outward from the axis. */
function MarkWrap({
	n,
	side,
	hollow,
	className,
}: {
	n: number;
	side: Side;
	hollow: boolean;
	className?: string;
}) {
	const color = SIDE_COLOR[side];
	return (
		<span
			className={cn(
				'flex max-w-[64px] flex-wrap gap-[1.5px]',
				side === 'a' ? 'flex-row-reverse justify-self-end' : 'justify-self-start',
				className
			)}
		>
			{Array.from({ length: Math.min(n, MAX_TOTAL_MARKS) }, (_, i) => (
				<span
					key={i}
					className="size-[5px] shrink-0 rounded-full"
					style={{ border: `1px solid ${color}`, backgroundColor: hollow ? 'transparent' : color }}
				/>
			))}
		</span>
	);
}

/** "Reading as": the first party on the left, neither in the middle, the second on the right —
 *  the same sides as everything below. */
function SeatPicker({
	seat,
	names,
	roles,
	onChange,
}: {
	seat: Seat;
	names: Record<Side, string>;
	roles: Record<Side, string>;
	onChange: (seat: Seat) => void;
}) {
	const party = (side: Side) => {
		const on = seat === side;
		const color = SIDE_COLOR[side];
		return (
			<button
				type="button"
				role="radio"
				aria-checked={on}
				onClick={() => onChange(side)}
				title={roles[side] ? `${names[side]} · ${roles[side]}` : names[side]}
				className={cn(
					'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border-[1.5px] px-2.5 py-1 text-xs font-semibold',
					side === 'a' ? 'justify-self-start' : 'justify-self-end',
					!on && 'bg-card hover:bg-muted'
				)}
				style={
					on
						? { backgroundColor: color, borderColor: color, color: 'white' }
						: { borderColor: tint(color, 50), color }
				}
			>
				<span
					className="size-2 shrink-0 rounded-full"
					style={{ backgroundColor: on ? 'white' : color }}
				/>
				<span className="truncate">{names[side]}</span>
				{roles[side] && (
					<span
						className={cn(
							'max-w-[120px] truncate font-normal',
							on ? 'opacity-75' : 'text-muted-foreground'
						)}
					>
						{roles[side]}
					</span>
				)}
				{on && (
					<span className="shrink-0 rounded-full border border-white/80 px-1.5 text-[10px] leading-4 font-bold">
						me
					</span>
				)}
			</button>
		);
	};
	const neutral = seat === 'neutral';
	return (
		<div className="flex items-center gap-2">
			<span className="shrink-0 text-2xs text-muted-foreground">Reading as</span>
			<div
				role="radiogroup"
				aria-label="Reading as"
				className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-full bg-secondary p-[3px]"
			>
				{party('a')}
				<button
					type="button"
					role="radio"
					aria-checked={neutral}
					onClick={() => onChange('neutral')}
					className={cn(
						'rounded-full border-[1.5px] px-3 py-1 text-xs font-semibold',
						neutral
							? 'border-foreground bg-foreground text-background'
							: 'border-border bg-card text-foreground hover:bg-muted'
					)}
				>
					Neutral
				</button>
				{party('b')}
			</div>
		</div>
	);
}

/** Narrows the clauses to a grade, "only" and "more" merged on each party's side. */
function GradeFilter({
	value,
	counts,
	seat,
	names,
	onChange,
}: {
	value: GradeFilterValue;
	counts: Record<Grade, number>;
	seat: Seat;
	names: Record<Side, string>;
	onChange: (value: GradeFilterValue) => void;
}) {
	const options: Array<{ id: GradeFilterValue; n: number }> = [
		{ id: 'all', n: Object.values(counts).reduce((x, y) => x + y, 0) },
		{ id: 'a', n: counts['a-only'] + counts.a },
		{ id: 'balanced', n: counts.balanced },
		{ id: 'mixed', n: counts.mixed },
		{ id: 'b', n: counts.b + counts['b-only'] },
	];
	return (
		<div
			role="tablist"
			aria-label="Clauses by grade"
			className="inline-flex max-w-full rounded-lg border border-border bg-secondary p-[3px]"
		>
			{options.map((o) => {
				const on = value === o.id;
				const side = o.id === 'a' || o.id === 'b' ? o.id : null;
				return (
					<button
						type="button"
						role="tab"
						key={o.id}
						aria-selected={on}
						disabled={o.n === 0 && !on}
						onClick={() => onChange(o.id)}
						className={cn(
							'inline-flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold whitespace-nowrap disabled:opacity-40',
							on ? 'bg-foreground text-background' : 'hover:bg-card',
							!on && o.id === 'mixed' && 'text-warning-foreground dark:text-warning'
						)}
						style={on || !side ? undefined : { color: SIDE_COLOR[side] }}
					>
						{side === 'a' && <Caret to="a" color="currentColor" />}
						{o.id === 'balanced' && <span aria-hidden>=</span>}
						{side ? (
							<span className="min-w-0 truncate">
								<Favour side={side} seat={seat} names={names} capital />
							</span>
						) : o.id === 'all' ? (
							'All'
						) : o.id === 'balanced' ? (
							'Balanced'
						) : (
							'Depends'
						)}
						{side === 'b' && <Caret to="b" color="currentColor" />}
						<span className="ml-0.5 font-normal tabular-nums opacity-80">{o.n}</span>
					</button>
				);
			})}
		</div>
	);
}

/**
 * An open clause: what goes to each side, on that side, a group per type worded from the
 * seat, each with the first fragments in the contract's own words.
 */
function Lanes({
	tally,
	kinds,
	seat,
	names,
	onOpen,
}: {
	tally: ClauseTally;
	kinds: DeonticKind[];
	seat: Seat;
	names: Record<Side, string>;
	onOpen: (nodeId: string) => void;
}) {
	const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
	// A type the clause holds for neither party has no group; one it holds for the other
	// party only shows its zero, so "I owe 0" reads as plainly as "National owes me 11".
	const present = kinds.filter((kind) => tally.count[kind].a + tally.count[kind].b > 0);

	const toggle = (key: string) =>
		setUnfolded((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});

	const group = (side: Side, kind: DeonticKind) => {
		const served = servedOf(tally, side, kind);
		const words = wordsFrom(kind, side, seat);
		const key = `${side}-${kind}`;
		const all = unfolded.has(key);
		const fragments = all ? served : served.slice(0, SHOWN_FRAGMENTS);
		return (
			<div key={kind} className={cn('py-1.5', served.length === 0 && 'opacity-60')}>
				<p className="flex flex-wrap items-baseline gap-x-1.5 px-3 pt-1 pb-0.5 text-xs">
					<span
						className="size-2 shrink-0 self-center rounded-[2px]"
						style={{ backgroundColor: KIND_COLORS[kind] }}
					/>
					<Said words={words} side={side} names={names} />
					<span className="font-bold tabular-nums" style={{ color: SIDE_COLOR[side] }}>
						{served.length}
					</span>
					<Gloss words={words} names={names} className="text-2xs text-muted-foreground" />
				</p>
				{fragments.map((s) => (
					<Fragment
						key={`${s.mark.id}-${s.to}`}
						served={s}
						section={tally.section}
						square={false}
						onOpen={onOpen}
					/>
				))}
				{served.length > SHOWN_FRAGMENTS && (
					<button
						type="button"
						onClick={() => toggle(key)}
						className="px-3 py-0.5 text-2xs font-medium text-primary hover:underline"
					>
						{all ? '− fewer' : `+ ${served.length - SHOWN_FRAGMENTS} more`}
					</button>
				)}
			</div>
		);
	};

	const lane = (side: Side) => {
		const color = SIDE_COLOR[side];
		return (
			<div
				key={side}
				className="min-w-0 overflow-hidden rounded-lg border"
				style={{ borderColor: tint(color, 35) }}
			>
				<div
					className={cn(
						'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold',
						side === 'b' && 'justify-end'
					)}
					style={{ backgroundColor: tint(color, 10), color }}
				>
					{side === 'a' && <Caret to="a" color={color} />}
					<span className="min-w-0 truncate">
						<Favour side={side} seat={seat} names={names} capital />
					</span>
					{side === 'b' && <Caret to="b" color={color} />}
				</div>
				<div className="divide-y divide-border/60 bg-card">
					{present.map((kind) => group(side, kind))}
				</div>
			</div>
		);
	};

	return <div className="grid grid-cols-2 gap-3">{SIDES.map(lane)}</div>;
}

/** Each clause's grade worded from the seat the reader picks, every count with its verb. */
export function P9View({
	docId,
	kg,
	grid,
	names,
	roles,
	importance,
	onOpen,
	onOpenGraph,
}: ViewProps) {
	// The reader sits first where they focused: the pair's first party.
	const [seat, setSeat] = useState<Seat>('a');
	const [limit, setLimit] = useState(PAGE);
	const [kinds, toggleKind] = useKinds();
	const [filter, setFilter] = useState<GradeFilterValue>('all');
	const [sortByImportance, setSortByImportance] = useState(true);
	// Every row starts closed; the reader opens the one they want.
	const [openId, setOpenId] = useState<string | null>(null);
	const [fragmentKind, setFragmentKind] = useState<DeonticKind | null>(null);
	const { reviews, review } = useReviews(docId);
	const { tallies, total, rank } = useTallies(grid, kg, importance, sortByImportance);
	const shown = tallies.filter((t) => hasKinds(t, kinds));
	const counts = gradeCounts(shown, kinds);
	const rows = shown.filter((t) => inFilter(gradeOf(t.count, kinds), filter));
	const opened = rows.find((t) => t.clauseId === openId) ?? null;
	const contract = gradeOf(total, kinds);

	const words = (kind: DeonticKind, side: Side) => wordsFrom(kind, side, seat);
	const say = (kind: DeonticKind, side: Side) => plain(words(kind, side), names);

	// The contract pane words each paragraph from the same seat: "National owes me 1 · I may 2".
	useClauseNotes(
		kg,
		opened,
		kinds,
		names,
		(served: Served[]) =>
			DEONTIC_KINDS.flatMap((kind) =>
				SIDES.map((side) => {
					const n = served.filter(
						(s) => s.kind === kind && (s.to === side || s.to === 'both')
					).length;
					return n > 0 ? `${say(kind, side)} ${n}` : null;
				})
			)
				.filter(Boolean)
				.join(' · '),
		seat
	);

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

	/** One type of the whole contract: each half says who does what, then the count. */
	const totalCell = (kind: DeonticKind) => {
		const hollow = kind !== 'right';
		return (
			<span
				key={kind}
				className={cn(TYPE_COL, 'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-1')}
			>
				{SIDES.map((side) => {
					const n = total[kind][side];
					const w = words(kind, side);
					const col = side === 'a' ? 'col-start-1 text-right' : 'col-start-3 text-left';
					const clauses = shown.filter((t) => t.count[kind][side] > 0).length;
					const tip = `${say(kind, side)} ${n} (${glossText(w, names)}), in ${clauses} ${clauses === 1 ? 'clause' : 'clauses'}`;
					return (
						<span key={side} className="contents">
							<span
								className={cn(col, 'row-start-1 self-end text-[10px] leading-tight')}
								title={tip}
							>
								<Said words={w} side={side} names={names} className="block" />
								<Gloss words={w} names={names} className="block text-[9px] text-muted-foreground" />
							</span>
							<span
								className={cn(col, 'row-start-2 text-xl leading-tight font-bold tabular-nums')}
								style={{ color: n === 0 ? 'var(--muted-foreground)' : SIDE_COLOR[side] }}
								title={tip}
							>
								{n}
							</span>
							<MarkWrap
								n={n}
								side={side}
								hollow={hollow}
								className={cn(side === 'a' ? 'col-start-1' : 'col-start-3', 'row-start-3 mt-0.5')}
							/>
						</span>
					);
				})}
				<span className="col-start-2 row-span-3 row-start-1 w-px bg-foreground/20" />
			</span>
		);
	};

	const cell = (t: ClauseTally, kind: DeonticKind) => {
		const { a, b } = t.count[kind];
		if (a + b === 0)
			return (
				<span
					className={cn(
						TYPE_COL,
						'pointer-events-none flex justify-center text-xs text-muted-foreground/60'
					)}
				>
					—
				</span>
			);
		const active = opened?.clauseId === t.clauseId && fragmentKind === kind;
		return (
			<button
				type="button"
				onClick={() => filterBy(t.clauseId, kind)}
				className={cn(
					TYPE_COL,
					'relative z-10 flex items-center rounded-md py-1 hover:bg-muted',
					active && 'bg-accent ring-1 ring-primary/40'
				)}
				title={
					active
						? 'Show the fragments of every type'
						: `${say(kind, 'a')} ${a} · ${say(kind, 'b')} ${b} — click to see only these fragments`
				}
			>
				<Diverging a={a} b={b} hollow={kind !== 'right'} max={MAX_MARKS} className="px-0.5" />
			</button>
		);
	};

	const detail = (t: ClauseTally, grade: Grade) => (
		<div className="space-y-3">
			{fragmentKind && (
				<p className="flex items-center gap-1.5 text-2xs text-foreground/70">
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
			<Lanes
				key={fragmentKind ?? 'every'}
				tally={t}
				kinds={fragmentKind ? [fragmentKind] : kinds}
				seat={seat}
				names={names}
				onOpen={onOpen}
			/>
			<GradeAgree
				grade={grade}
				names={names}
				answer={reviews[t.clauseId]}
				onAnswer={(answer) => review(t.clauseId, answer)}
				labelOf={(g) => seatGrade(g, seat, names)}
			/>
		</div>
	);

	return (
		<div className="min-h-0 flex-1 overflow-auto">
			<div className="min-w-[860px] space-y-3 p-3">
				<SeatPicker seat={seat} names={names} roles={roles} onChange={setSeat} />

				<div className="flex flex-wrap items-center gap-2">
					<h2 className="text-lg font-bold text-foreground">
						{seat === 'neutral' ? 'Who does each clause favour?' : 'Does each clause favour me?'}
					</h2>
					{seat !== 'neutral' && (
						<span
							className="max-w-[220px] truncate rounded-full border px-2 py-0.5 text-2xs text-muted-foreground"
							style={{ borderColor: tint(SIDE_COLOR[seat], 40) }}
						>
							reading as{' '}
							<span className="font-medium" style={{ color: SIDE_COLOR[seat] }}>
								{short(names[seat])}
							</span>
						</span>
					)}
				</div>

				<div className="flex flex-wrap items-center justify-between gap-2">
					<KindFilter kinds={kinds} onToggle={showKind} compact />
					<GradeFilter
						value={filter}
						counts={counts}
						seat={seat}
						names={names}
						onChange={(value) => {
							setFilter(value);
							setOpenId(null);
							setFragmentKind(null);
							setLimit(PAGE);
						}}
					/>
				</div>

				{/* Clipped rather than hidden, so the header and the contract row can stick. */}
				<div className="overflow-clip rounded-xl border border-border bg-card">
					<div className="sticky top-0 z-20 bg-card">
						<div
							className={cn(
								ROW,
								'bg-secondary py-1.5 text-[10px] font-bold tracking-wider uppercase'
							)}
						>
							<span className="w-1 shrink-0" />
							<span className="w-6 shrink-0" />
							{/* The importance is fetched, so the ordering cannot be offered before it lands. */}
							<button
								type="button"
								onClick={() => setSortByImportance((on) => !on)}
								disabled={!importance}
								className={cn(
									CLAUSE_COL,
									'truncate text-left text-muted-foreground uppercase enabled:hover:text-foreground disabled:cursor-default'
								)}
								title="Order the rows by how much each clause weighs inside the contract (PageRank with a per-clause prior), or by its position in the document"
							>
								Clause
								{importance && (
									<span className="font-normal normal-case">
										{sortByImportance ? ' · by importance ↓' : ' · by order'}
									</span>
								)}
							</button>
							<span className={cn(GRADE_COL, 'pl-1 text-foreground')}>
								{seat === 'neutral' ? 'Favours whom?' : 'Favours me?'}
							</span>
							{kinds.map((kind) => (
								<span key={kind} className={cn(TYPE_COL, 'flex flex-col items-center gap-1')}>
									<span className="flex items-center gap-1 rounded-full border border-border bg-card px-2 py-px text-foreground">
										<span
											className="size-2 rounded-[2px]"
											style={{ backgroundColor: KIND_COLORS[kind] }}
										/>
										{KIND_PLURAL[kind]}
									</span>
									<span className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-1 text-[10px] leading-tight font-medium tracking-normal normal-case">
										<span
											className="flex items-center justify-end gap-0.5 self-end text-right text-balance"
											style={{ color: SIDE_COLOR.a }}
										>
											<Caret to="a" color={SIDE_COLOR.a} size={6} />
											<span className="min-w-0">
												<Favour side="a" seat={seat} names={names} />
											</span>
										</span>
										<span className="w-px bg-foreground/20" />
										<span
											className="flex items-center gap-0.5 self-end text-left text-balance"
											style={{ color: SIDE_COLOR.b }}
										>
											<span className="min-w-0">
												<Favour side="b" seat={seat} names={names} />
											</span>
											<Caret to="b" color={SIDE_COLOR.b} size={6} />
										</span>
									</span>
								</span>
							))}
							{/* Room for the accordion's chevron, so the columns line up. */}
							<span className="w-4 shrink-0" />
						</div>

						<div className={cn(ROW, 'border-b-2 border-border bg-secondary/40 py-2.5')}>
							<GradeBar grade={contract} className="h-14" />
							<span className="w-6 shrink-0" />
							<span className={cn(LEAD_COL, 'flex items-center gap-2')}>
								<span className="shrink-0">
									<span className="block text-sm font-semibold text-foreground">
										Whole contract
									</span>
									<span className="block text-2xs text-muted-foreground">
										{shown.length} {shown.length === 1 ? 'clause' : 'clauses'}
									</span>
								</span>
								<span className={cn('flex min-w-0 flex-1 flex-col gap-1', gradeAlign(contract))}>
									<GradeTag
										grade={contract}
										names={names}
										label={<GradeWords grade={contract} seat={seat} names={names} />}
										size="lg"
										className="max-w-full whitespace-normal"
									/>
									{contract === 'mixed' && <DependsLine count={total} kinds={kinds} />}
								</span>
							</span>
							{kinds.map(totalCell)}
							<span className="w-4 shrink-0" />
						</div>
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
							return (
								<AccordionItem
									key={t.clauseId}
									value={t.clauseId}
									className={cn('border-border/60', grade === 'mixed' && 'bg-warning/10')}
								>
									{/* The trigger fills the row from underneath; the cells are buttons
									    on top of it, so a click on a count filters instead of toggling.
									    Its title gives the whole heading when the cell cuts it. */}
									<AccordionPrimitive.Header
										className={cn(
											ROW,
											'group relative py-2.5 hover:bg-muted/30 data-[state=open]:bg-muted/30'
										)}
									>
										<AccordionPrimitive.Trigger
											className="absolute inset-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
											aria-label={`${t.heading}: show what it gives each party`}
											title={t.heading}
										/>
										<GradeBar grade={grade} className="h-8" />
										<span className="pointer-events-none flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-2xs font-semibold tabular-nums">
											{rank.get(t.clauseId)}
										</span>
										<span className={CLAUSE_COL}>
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
										<span
											className={cn(
												GRADE_COL,
												'pointer-events-none flex flex-col gap-0.5 pl-1',
												gradeAlign(grade)
											)}
										>
											<GradeTag
												grade={grade}
												names={names}
												label={<GradeWords grade={grade} seat={seat} names={names} />}
												size="sm"
												className="max-w-full whitespace-normal"
											/>
											{grade === 'mixed' && <DependsLine count={t.count} kinds={kinds} />}
										</span>
										{kinds.map((kind) => (
											<span key={kind} className="contents">
												{cell(t, kind)}
											</span>
										))}
										<ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
									</AccordionPrimitive.Header>
									<AccordionContent className="pt-1 pr-3 pl-11">
										{detail(t, grade)}
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
