'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import { tint } from '@/features/docx/components/clause-analyzer/views/favour-bits';
import {
	DEONTIC_KINDS,
	typeVerdict,
	type ClauseTally,
	type Served,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind } from '@/types/knowledge';

/*
 * What proposals 6–9 share. Each one names obligations, rights and prohibitions its own way,
 * but they all keep Table v2's rule and the same reading rules:
 * - the side a mark is drawn on is the party it benefits;
 * - a party's name is printed in its colour only on its own side; the party that bears a
 *   statement, named on the other side, goes in neutral ink;
 * - the grade of a clause is read first, and "only" never looks like "more".
 */

export const SIDES: Side[] = ['a', 'b'];
export const otherSide = (side: Side): Side => (side === 'a' ? 'b' : 'a');

/** Neutral ink for a name printed outside its own side. */
export const NEUTRAL_INK = '#3b3946';

/**
 * Who a clause favours, without weights and without adding types together: everything to one
 * party ("only"), ahead for one in some type and behind in none ("more"), even in every type
 * ("balanced"), or each ahead in a different type ("mixed").
 */
export type Grade = 'a-only' | 'a' | 'balanced' | 'mixed' | 'b' | 'b-only';

export const GRADES: Grade[] = ['a-only', 'a', 'balanced', 'mixed', 'b', 'b-only'];

export function gradeOf(count: ClauseTally['count'], kinds: DeonticKind[] = DEONTIC_KINDS): Grade {
	const { verdict } = typeVerdict(count, kinds);
	if (verdict === 'tie') return 'balanced';
	if (verdict === 'mixed') return 'mixed';
	const other = otherSide(verdict);
	return kinds.every((kind) => count[kind][other] === 0) ? `${verdict}-only` : verdict;
}

/** The party a grade leans to, or null when it leans to neither. */
export const gradeSide = (grade: Grade): Side | null =>
	grade === 'a' || grade === 'a-only' ? 'a' : grade === 'b' || grade === 'b-only' ? 'b' : null;

export const isOnly = (grade: Grade) => grade === 'a-only' || grade === 'b-only';

/** "Only for Equidata", "More for National", "Balanced", "Depends on the type". */
export function gradeLabel(grade: Grade, names: Record<Side, string>) {
	const side = gradeSide(grade);
	if (side) return `${isOnly(grade) ? 'Only' : 'More'} for ${short(names[side])}`;
	return grade === 'balanced' ? 'Balanced' : 'Depends on the type';
}

/** How many clauses land on each grade. */
export function gradeCounts(rows: ClauseTally[], kinds: DeonticKind[]): Record<Grade, number> {
	const counts = Object.fromEntries(GRADES.map((g) => [g, 0])) as Record<Grade, number>;
	for (const t of rows) counts[gradeOf(t.count, kinds)] += 1;
	return counts;
}

/** A clause's statements of one type that serve one party. */
export const servedOf = (t: ClauseTally, side: Side, kind: DeonticKind): Served[] =>
	t.served.filter((s) => s.kind === kind && (s.to === side || s.to === 'both'));

/** A party's own load: the obligations it must perform and the prohibitions that bind it,
 *  each owed to the other party, and in how many clauses they sit. */
export interface Burden {
	obligation: number;
	prohibition: number;
	clauses: { obligation: number; prohibition: number };
}

export function burdenOf(tallies: ClauseTally[]): Record<Side, Burden> {
	const empty = (): Burden => ({
		obligation: 0,
		prohibition: 0,
		clauses: { obligation: 0, prohibition: 0 },
	});
	const out: Record<Side, Burden> = { a: empty(), b: empty() };
	for (const t of tallies) {
		for (const side of SIDES) {
			for (const kind of ['obligation', 'prohibition'] as const) {
				const n = t.served.filter((s) => s.kind === kind && s.by === side).length;
				out[side][kind] += n;
				if (n > 0) out[side].clauses[kind] += 1;
			}
		}
	}
	return out;
}

/** A small triangle pointing to a side, drawn rather than typed so it renders in any font. */
export function Caret({ to, color, size = 7 }: { to: Side; color: string; size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 8 8"
			aria-hidden
			className="inline-block shrink-0"
			style={{ transform: to === 'a' ? 'scaleX(-1)' : undefined }}
		>
			<path d="M1 0.5 L7 4 L1 7.5 Z" fill={color} />
		</svg>
	);
}

/**
 * The grade as a tag: filled in the party's colour when everything goes to it, outlined when
 * it only gets more, a neutral pill when balanced, amber when each party wins a type. The
 * caret points to the favoured side.
 */
export function GradeTag({
	grade,
	names,
	label,
	size = 'md',
	className,
}: {
	grade: Grade;
	names: Record<Side, string>;
	/** Overrides the words, e.g. in first person. */
	label?: ReactNode;
	size?: 'sm' | 'md' | 'lg';
	className?: string;
}) {
	const side = gradeSide(grade);
	const color = side ? SIDE_COLOR[side] : undefined;
	const text = label ?? gradeLabel(grade, names);
	const pad =
		size === 'lg'
			? 'px-3 py-1 text-sm'
			: size === 'sm'
				? 'px-1.5 py-px text-[10px]'
				: 'px-2 py-0.5 text-2xs';
	const caret = size === 'lg' ? 9 : 7;
	return (
		<span
			className={cn(
				'inline-flex items-center gap-1 rounded-md font-semibold whitespace-nowrap',
				pad,
				grade === 'balanced' && 'border border-border bg-secondary text-foreground/80',
				grade === 'mixed' && 'border border-warning bg-warning/20 text-warning-foreground',
				className
			)}
			style={
				side && color
					? isOnly(grade)
						? { backgroundColor: color, color: 'white', border: `1.5px solid ${color}` }
						: { backgroundColor: tint(color, 10), color, border: `1.5px solid ${color}` }
					: undefined
			}
		>
			{side === 'a' && (
				<Caret to="a" color={isOnly(grade) ? 'white' : (color ?? NEUTRAL_INK)} size={caret} />
			)}
			{grade === 'balanced' && <span aria-hidden>=</span>}
			{text}
			{side === 'b' && (
				<Caret to="b" color={isOnly(grade) ? 'white' : (color ?? NEUTRAL_INK)} size={caret} />
			)}
		</span>
	);
}

/**
 * One party's marks growing out from an axis: rings for what it gets from the other party's
 * obligations or prohibitions, discs for rights it holds itself. Past `max` the marks stop
 * growing and the number says the rest.
 */
export function SideMarks({
	n,
	side,
	hollow,
	max = 8,
	size = 6,
}: {
	n: number;
	side: Side;
	hollow: boolean;
	max?: number;
	size?: number;
}) {
	const color = SIDE_COLOR[side];
	return (
		<span className={cn('flex items-center gap-[2px]', side === 'a' && 'flex-row-reverse')}>
			{Array.from({ length: Math.min(n, max) }, (_, i) => (
				<span
					key={i}
					className="shrink-0 rounded-full"
					style={{
						width: size,
						height: size,
						border: `1.5px solid ${color}`,
						backgroundColor: hollow ? 'transparent' : color,
					}}
				/>
			))}
		</span>
	);
}

/**
 * Both parties' counts of one type around a centre axis, each on the side it benefits, the
 * number at the outer end: bold in the party's colour where that party is ahead.
 */
export function Diverging({
	a,
	b,
	hollow,
	max = 8,
	className,
}: {
	a: number;
	b: number;
	hollow: boolean;
	max?: number;
	className?: string;
}) {
	if (a + b === 0)
		return (
			<span className={cn('block text-center text-xs text-muted-foreground/60', className)}>—</span>
		);
	const half = (side: Side) => {
		const n = side === 'a' ? a : b;
		const ahead = side === 'a' ? a > b : b > a;
		return (
			<span
				className={cn(
					'flex flex-1 items-center gap-1',
					side === 'a' ? 'flex-row-reverse justify-start' : 'justify-start'
				)}
			>
				<SideMarks n={n} side={side} hollow={hollow} max={max} />
				<span
					className="text-xs tabular-nums"
					style={
						n === 0
							? { color: 'var(--muted-foreground)', opacity: 0.6 }
							: ahead
								? { color: SIDE_COLOR[side], fontWeight: 700 }
								: { color: SIDE_COLOR[side], opacity: 0.7 }
					}
				>
					{n}
				</span>
			</span>
		);
	};
	return (
		<span className={cn('flex w-full items-center gap-1.5', className)}>
			{half('a')}
			<span className="h-4 w-px shrink-0 bg-foreground/30" />
			{half('b')}
		</span>
	);
}

/** Every answer a reader can give about a clause's grade; stored with the other views' answers. */
export function GradeAgree({
	grade,
	names,
	answer,
	onAnswer,
	labelOf = (g) => gradeLabel(g, names),
}: {
	grade: Grade;
	names: Record<Side, string>;
	answer: string | undefined;
	onAnswer: (answer: string) => void;
	/** The words for each grade, when a proposal names them differently. */
	labelOf?: (grade: Grade) => string;
}) {
	const pill = (key: string, text: string, on: boolean) => (
		<button
			key={key}
			type="button"
			onClick={() => onAnswer(key)}
			aria-pressed={on}
			className={cn(
				'rounded-full border px-2.5 py-0.5 text-2xs font-medium',
				on
					? 'border-primary bg-primary text-primary-foreground'
					: 'border-border bg-card hover:bg-muted'
			)}
		>
			{text}
		</button>
	);
	return (
		<div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs">
			<span className="mr-1 font-semibold">Do you agree with “{labelOf(grade)}”?</span>
			{pill('agree', 'Yes', answer === 'agree')}
			{GRADES.filter((g) => g !== grade).map((g) =>
				pill(g, `No, ${labelOf(g).replace(/^./, (c) => c.toLowerCase())}`, answer === g)
			)}
		</div>
	);
}
