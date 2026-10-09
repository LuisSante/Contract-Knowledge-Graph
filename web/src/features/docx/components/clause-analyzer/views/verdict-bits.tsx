'use client';

import { useState } from 'react';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KIND_COLORS } from '@/features/docx/components/clause-analyzer/constants';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import {
	Fragment,
	GraphLink,
	KIND_PLURAL,
	tint,
	verdictColor,
	verdictLabel,
} from '@/features/docx/components/clause-analyzer/views/favour-bits';
import {
	listOf,
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
import type { DeonticKind } from '@/types/knowledge';

const SIDES: Side[] = ['a', 'b'];
const SHOWN_FRAGMENTS = 3;

export type VerdictFilterValue = TypeVerdict | 'all';

/** The whole contract at a glance: one card per type with each party's count, and the
 *  weight-free verdict over the types on screen. */
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
		const ties = `${counts.tie} ${counts.tie === 1 ? 'tie' : 'ties'}`;
		const [first, second]: Side[] = lead === 'b' ? ['b', 'a'] : ['a', 'b'];
		const parts = lead
			? [`${counts[first]} in favour`, ties, `${counts[second]} for ${short(names[second])}`]
			: [`${counts.a} for ${short(names.a)}`, `${counts.b} for ${short(names.b)}`, ties];
		return [
			...parts,
			`${counts.mixed} ${counts.mixed === 1 ? 'depends' : 'depend'} on the type`,
		].join(' · ');
	};

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

	return (
		<div className="grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.25fr)] gap-3">
			{DEONTIC_KINDS.map(card)}
			<div className="rounded-xl bg-foreground p-3 text-background">
				<p className="text-[10px] font-semibold tracking-wider uppercase opacity-70">
					Contract verdict
				</p>
				<p className="mt-0.5 flex items-center gap-2 text-2xl leading-tight font-bold">
					<span
						className="size-2.5 shrink-0 rounded-full"
						style={{ backgroundColor: verdictColor(contract.verdict) }}
					/>
					{verdictLabel(contract.verdict, names)}
				</p>
				<p className="mt-1 text-xs leading-snug opacity-90">{contractLine()}</p>
				<p className="mt-1.5 text-2xs leading-snug opacity-70">{clauseLine()}</p>
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
		{ id: 'tie', label: 'Tie' },
		{ id: 'mixed', label: 'Depends', color: 'var(--warning-foreground)' },
		{ id: 'b', label: short(names.b), color: SIDE_COLOR.b },
	];
	return (
		<div
			role="tablist"
			aria-label="Clauses by verdict"
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
 * its name and number, and the way to it in the graph. It sits over the row's accordion
 * trigger, so only the graph link takes clicks.
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
			<span className="pointer-events-none flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-2xs font-semibold tabular-nums">
				{rank}
			</span>
			<span className="min-w-0 flex-1">
				<span className="pointer-events-none block truncate text-sm font-semibold text-foreground">
					{tally.heading}
				</span>
				<span className="flex items-center gap-2">
					{tally.section && (
						<span className="pointer-events-none rounded bg-secondary px-1 text-[10px] font-medium">
							{tally.section}
						</span>
					)}
					{onOpenGraph && <GraphLink onClick={() => onOpenGraph(tally.clauseId)} />}
				</span>
			</span>
		</>
	);
}

/** What the clause gives each party, side by side, in the contract's own words. */
export function WhatEachGets({
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
	const [unfolded, setUnfolded] = useState<Set<Side>>(new Set());

	const column = (side: Side) => {
		const gets = servedTo(tally, side, kinds);
		const all = unfolded.has(side);
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
								section={tally.section}
								onOpen={onOpen}
							/>
						))}
					</div>
				)}
				{gets.length > SHOWN_FRAGMENTS && (
					<button
						type="button"
						onClick={() =>
							setUnfolded((prev) => {
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

	return <div className="grid grid-cols-2 gap-3">{SIDES.map(column)}</div>;
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
	const options = [
		{ id: 'agree', label: 'Yes' },
		...otherVerdicts(verdict).map((f) => ({
			id: f,
			label: f === 'tie' ? 'No, it is a tie' : `No, it favours ${short(names[f])}`,
		})),
	];
	return (
		<div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium">
			Do you agree with «
			{verdict === 'mixed' ? 'Depends on the type' : `Favours ${verdictLabel(verdict, names)}`}
			»?
			{options.map((o) => (
				<button
					type="button"
					key={o.id}
					onClick={() => onAnswer(o.id)}
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
	);
}
