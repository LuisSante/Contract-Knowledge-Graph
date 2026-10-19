'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import {
	Fragment,
	GraphLink,
	KIND_LABEL,
	RankBadge,
	SectionTag,
	tint,
	verdictColor,
	verdictLabel,
	favourLine,
} from '@/features/docx/components/clause-analyzer/views/favour-bits';
import {
	listOf,
	originOf,
	otherVerdicts,
	scoredSentence,
	servedTo,
} from '@/features/docx/components/clause-analyzer/views/favour-shared';
import {
	DEONTIC_KINDS,
	typeVerdict,
	type ClauseTally,
	type TypeVerdict,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind, KgCondition } from '@/types/knowledge';

const SIDES: Side[] = ['a', 'b'];
/** Equal counts use a neutral tone on the contract card. */
const TIE_INK = '#a1a1aa';

export type VerdictFilterValue = TypeVerdict | 'all';

/** The whole contract at a glance: one card per type with each party's count, and who the
 *  contract favours over the types on screen, with its clauses by verdict. */
export function Scoreboard({
	total,
	kinds,
	counts,
	names,
}: {
	total: ClauseTally['count'];
	kinds: DeonticKind[];
	/** How many clauses land on each verdict. */
	counts: Record<TypeVerdict, number>;
	names: Record<Side, string>;
}) {
	const card = (kind: DeonticKind) => {
		const { a, b } = total[kind];
		const big = (side: Side) => {
			const wins = side === 'a' ? a > b : b > a;
			return (
				<span style={{ color: SIDE_COLOR[side], opacity: wins || a === b ? 1 : 0.55 }}>
					{total[kind][side]}
				</span>
			);
		};
		return (
			<div
				key={kind}
				className={cn(
					'rounded-xl border border-border bg-card p-3',
					!kinds.includes(kind) && 'opacity-40'
				)}
			>
				<p className="text-sm font-medium">{KIND_LABEL[kind]}</p>
				<div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-3xl leading-tight font-bold tabular-nums">
					{big('a')}
					<span className="text-xl text-foreground">:</span>
					{big('b')}
					<span className="ml-auto text-2xs font-normal whitespace-nowrap text-muted-foreground">
						{a + b} statements
					</span>
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
				<div className="mt-3 space-y-1 text-xs text-foreground/80">
					{SIDES.map((side) => (
						<p key={side}>{favourLine(kind, side, names)}</p>
					))}
				</div>
			</div>
		);
	};

	return (
		<div className="grid grid-cols-2 gap-3 @min-[900px]:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.5fr)]">
			{DEONTIC_KINDS.map(card)}
			<ContractCard total={total} kinds={kinds} counts={counts} names={names} />
		</div>
	);
}

/**
 * Who the contract favours over the types on screen, and its clauses by verdict. Stacked
 * beside the type cards, or laid out in a row above a table.
 */
export function ContractCard({
	total,
	kinds,
	counts,
	names,
	layout = 'stack',
	kindLabel = (kind) => KIND_LABEL[kind].toLowerCase(),
}: {
	total: ClauseTally['count'];
	kinds: DeonticKind[];
	/** How many clauses land on each verdict. */
	counts: Record<TypeVerdict, number>;
	names: Record<Side, string>;
	layout?: 'stack' | 'row';
	/** A type's name inside a sentence, for a view that names the types its own way. */
	kindLabel?: (kind: DeonticKind) => string;
}) {
	const contract = typeVerdict(total, kinds);
	const hasStatements = kinds.some((kind) => total[kind].a + total[kind].b > 0);
	const lead =
		hasStatements && (contract.verdict === 'a' || contract.verdict === 'b')
			? contract.verdict
			: null;
	const tone = verdictColor(contract.verdict);

	/** Why, in one short line: where the favoured party is ahead; the rest are even, since a
	 *  party that lost a type would not be favoured. */
	const contractLine = () => {
		if (!hasStatements) return 'Nothing in either party’s favour in the selected types.';
		if (contract.verdict === 'tie') return 'Same count in each selected type.';
		if (contract.verdict === 'mixed')
			return scoredSentence(total, contract.verdict, contract.byKind, kinds, names);
		const won = kinds.filter((kind) => contract.byKind[kind] === contract.verdict);
		const even = kinds.filter((kind) => !won.includes(kind));
		const label = (ks: DeonticKind[]) => listOf(ks.map(kindLabel));
		if (even.length > 0) return `More ${label(won)} in its favour; equal counts in ${label(even)}.`;
		if (kinds.length === 1) return `More ${label(kinds)} in its favour.`;
		return `More in its favour in all ${kinds.length} selected types.`;
	};

	/** The clauses by verdict, the favoured party first, as a bar and four counts. */
	const [first, second]: Side[] = lead === 'b' ? ['b', 'a'] : ['a', 'b'];
	const clauseGroups: Array<{ key: TypeVerdict; n: number; label: string; color: string }> = [
		{ key: first, n: counts[first], label: short(names[first]), color: SIDE_COLOR[first] },
		{ key: 'tie', n: counts.tie, label: 'Equal counts', color: TIE_INK },
		{ key: second, n: counts[second], label: short(names[second]), color: SIDE_COLOR[second] },
		{ key: 'mixed', n: counts.mixed, label: 'Depends', color: 'var(--warning)' },
	];
	const clauseTotal = clauseGroups.reduce((sum, g) => sum + g.n, 0);
	// With one type shown no clause can depend on the type, so the count would always be 0.
	const groupsShown =
		kinds.length > 1 ? clauseGroups : clauseGroups.filter((g) => g.key !== 'mixed');

	// Washed in the favoured party's colour, its name in full colour: the card says who wins
	// before a word is read. Grey when even, amber when it depends on the type.
	return (
		<div
			className={cn(
				'rounded-xl border p-3 text-foreground',
				layout === 'row' && 'flex flex-wrap items-start gap-x-6 gap-y-3'
			)}
			style={{ backgroundColor: tint(tone, 9), borderColor: tint(tone, 40) }}
		>
			<div className={cn(layout === 'row' && 'min-w-[180px] flex-1')}>
				<p className="text-[10px] font-semibold tracking-wider text-foreground/70 uppercase">
					Count-based advantage
				</p>
				<p
					className={cn(
						'mt-0.5 text-2xl leading-tight font-bold',
						contract.verdict === 'mixed' && 'text-warning-foreground'
					)}
					style={lead ? { color: SIDE_COLOR[lead] } : undefined}
				>
					{hasStatements ? verdictLabel(contract.verdict, names) : 'No statements'}
				</p>
				<p className="mt-1 text-sm leading-snug text-foreground/90">{contractLine()}</p>
			</div>
			<div
				className={cn(
					layout === 'row' ? 'min-w-[220px] flex-1 border-l pl-6' : 'mt-3 border-t pt-2.5'
				)}
				style={{ borderColor: tint(tone, 30) }}
			>
				<p className="text-[10px] font-semibold tracking-wider text-foreground/70 uppercase">
					{clauseTotal} clauses in selected types
				</p>
				<div className="mt-1.5 flex h-1.5 gap-0.5" aria-hidden>
					{clauseGroups
						.filter((g) => g.n > 0)
						.map((g) => (
							<span
								key={g.key}
								className="rounded-full"
								style={{ flexGrow: g.n, backgroundColor: g.color }}
							/>
						))}
				</div>
				<div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-x-3 gap-y-1">
					{groupsShown.map((g) => (
						<span
							key={g.key}
							className={cn('flex items-baseline gap-1.5', g.n === 0 && 'opacity-50')}
							title={g.key === 'mixed' ? 'Each party is ahead in a different type' : undefined}
						>
							<span className="text-base font-bold tabular-nums">{g.n}</span>
							<span className="flex min-w-0 items-center gap-1 text-xs">
								<span
									className="size-1.5 shrink-0 rounded-full"
									style={{ backgroundColor: g.color }}
								/>
								<span className="truncate">{g.label}</span>
							</span>
						</span>
					))}
				</div>
			</div>
		</div>
	);
}

/** Narrows the clauses to one verdict, each option with how many clauses it holds. */
export function VerdictFilter({
	value,
	counts,
	names,
	onChange,
}: {
	value: VerdictFilterValue;
	counts: Record<TypeVerdict, number>;
	names: Record<Side, string>;
	onChange: (value: VerdictFilterValue) => void;
}) {
	const all = counts.a + counts.b + counts.mixed + counts.tie;
	const options: Array<{ id: VerdictFilterValue; label: string; color?: string }> = [
		{ id: 'all', label: 'All' },
		{ id: 'a', label: short(names.a), color: SIDE_COLOR.a },
		{ id: 'tie', label: 'Equal counts' },
		{ id: 'mixed', label: 'Depends', color: 'var(--warning-foreground)' },
		{ id: 'b', label: short(names.b), color: SIDE_COLOR.b },
	];
	return (
		<div
			role="tablist"
			aria-label="Clauses by verdict"
			className="inline-flex flex-wrap rounded-lg border border-border bg-secondary p-[3px]"
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
							on ? 'bg-foreground text-background' : 'hover:bg-card'
						)}
						style={on ? undefined : { color: o.color }}
					>
						{o.label}
						<span className="font-normal tabular-nums opacity-80">{n}</span>
					</button>
				);
			})}
		</div>
	);
}

/** The verdict in the full colour of the party it favours. */
export function VerdictBadge({
	verdict,
	names,
}: {
	verdict: TypeVerdict;
	names: Record<Side, string>;
}) {
	return (
		<span
			className={cn(
				'inline-flex rounded-md px-2 py-0.5 text-2xs font-semibold whitespace-nowrap',
				verdict === 'a' || verdict === 'b'
					? 'text-white'
					: verdict === 'mixed'
						? 'text-warning-foreground'
						: 'bg-secondary text-foreground'
			)}
			style={verdict === 'tie' ? undefined : { backgroundColor: verdictColor(verdict) }}
		>
			{verdictLabel(verdict, names)}
		</span>
	);
}

/**
 * The start of a clause row: a bar in the verdict's colour, the clause's rank in importance,
 * its name and number, and the arrow to it in the graph right after the name. It sits over
 * the row's accordion trigger, so only the arrow takes clicks.
 */
export function ClauseLead({
	tally,
	verdict,
	rank,
	onOpenGraph,
}: {
	tally: ClauseTally;
	verdict: TypeVerdict;
	rank: number | undefined;
	onOpenGraph?: (clauseId: string) => void;
}) {
	return (
		<>
			<span
				className="pointer-events-none h-8 w-[3px] shrink-0 rounded-full"
				style={{ backgroundColor: verdict === 'tie' ? 'var(--border)' : verdictColor(verdict) }}
			/>
			<RankBadge rank={rank} className="pointer-events-none" />
			<span className="pointer-events-none min-w-0 flex-1 text-sm leading-snug">
				<span className="font-semibold text-foreground">
					{tally.section && <SectionTag section={tally.section} />}
					{tally.heading}
				</span>
				{onOpenGraph && (
					<GraphLink
						onClick={() => onOpenGraph(tally.clauseId)}
						heading={tally.heading}
						className="pointer-events-auto"
					/>
				)}
			</span>
		</>
	);
}

/** What the clause gives each party, side by side, in the contract's own words. */
export function WhatEachGets({
	tally,
	kinds,
	names,
	conditions,
	onOpen,
}: {
	tally: ClauseTally;
	kinds: DeonticKind[];
	names: Record<Side, string>;
	conditions: KgCondition[];
	onOpen: (nodeId: string) => void;
}) {
	const column = (side: Side) => {
		const gets = servedTo(tally, side, kinds);
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
					In favour of {short(names[side])}
					<span
						className="rounded-full px-1.5 text-[10px] text-white tabular-nums"
						style={{ backgroundColor: SIDE_COLOR[side] }}
					>
						{gets.length}
					</span>
				</div>
				{gets.length === 0 ? (
					<p className="px-3 py-3 text-2xs text-muted-foreground">
						Nothing in favour of {short(names[side])} in the selected types.
					</p>
				) : (
					<div className="divide-y divide-border/60 bg-card">
						{gets.map((s) => {
							const origin = originOf(s, names);
							return (
								<Fragment
									key={`${s.mark.id}-${s.to}`}
									served={s}
									section={tally.section}
									tag={origin.text}
									tagColor={SIDE_COLOR[side]}
									conditions={conditions.filter((c) => c.gatesId === s.mark.id)}
									onOpen={onOpen}
								/>
							);
						})}
					</div>
				)}
			</div>
		);
	};

	return <div className="grid grid-cols-2 gap-3">{SIDES.map(column)}</div>;
}

/** Counts align with the named party columns without a second visual encoding. */
export function CountTally({ a, b }: { a: number; b: number }) {
	const side = (s: Side) => {
		const n = s === 'a' ? a : b;
		return (
			<span
				className="flex-1 text-center text-sm font-semibold tabular-nums"
				style={{ color: SIDE_COLOR[s] }}
			>
				{n}
			</span>
		);
	};
	return (
		<span className="flex w-full items-center gap-1">
			{side('a')}
			<span className="h-3 w-px shrink-0 bg-border" />
			{side('b')}
		</span>
	);
}

/** A reader's answer as a pill in the colour of the verdict it stands for, filled once picked. */
export function AnswerPill({
	verdict,
	on,
	onClick,
	children,
}: {
	verdict: TypeVerdict;
	on: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	const color = verdictColor(verdict);
	const party = verdict === 'a' || verdict === 'b';
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={on}
			className={cn(
				'inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-0.5 font-medium',
				on ? 'font-semibold' : 'hover:bg-muted/40',
				verdict === 'mixed' && 'text-warning-foreground'
			)}
			style={{
				borderColor: color,
				color: party ? (on ? 'white' : color) : undefined,
				backgroundColor: on
					? party
						? color
						: tint(color, verdict === 'mixed' ? 30 : 12)
					: undefined,
			}}
		>
			<span
				className="size-1.5 rounded-full"
				style={{ backgroundColor: on && party ? 'white' : color }}
			/>
			{children}
		</button>
	);
}

/** Asks the reader whether the verdict holds; the answer is stored the way every view reads it. */
export function AgreeBox({
	verdict,
	names,
	answer,
	onAnswer,
}: {
	verdict: TypeVerdict;
	names: Record<Side, string>;
	answer: string | undefined;
	onAnswer: (answer: string) => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2 text-xs">
			<span className="font-medium">
				Do you agree with «
				{verdict === 'mixed'
					? 'Depends on the type'
					: verdict === 'tie'
						? 'Equal counts'
						: `${verdictLabel(verdict, names)} has a count-based advantage`}
				»?
			</span>
			<AnswerPill verdict={verdict} on={answer === 'agree'} onClick={() => onAnswer('agree')}>
				Yes
			</AnswerPill>
			{otherVerdicts(verdict).map((f) => (
				<AnswerPill key={f} verdict={f} on={answer === f} onClick={() => onAnswer(f)}>
					{f === 'tie' ? 'No, equal counts' : `No, ${short(names[f])} has the advantage`}
				</AnswerPill>
			))}
		</div>
	);
}
