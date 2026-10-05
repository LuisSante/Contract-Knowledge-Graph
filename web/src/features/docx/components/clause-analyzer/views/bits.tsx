'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
	KIND_COLORS,
	PAIR_SECOND_COLOR,
	PARTY_COLOR,
} from '@/features/docx/components/clause-analyzer/constants';
import type { Side } from '@/features/docx/utils/knowledge/mirror';
import type { DeonticKind } from '@/types/knowledge';

export const SIDE_COLOR: Record<Side, string> = { a: PARTY_COLOR, b: PAIR_SECOND_COLOR };

const VERB: Record<DeonticKind, string> = {
	obligation: 'must',
	right: 'may',
	prohibition: 'must not',
};

/** "Miltenyi Biotec GmbH" reads as "Miltenyi" everywhere the space is short. */
export const short = (name: string) => name.split(/[\s,]+/)[0] || name;

export function Kind({ kind }: { kind: DeonticKind }) {
	return (
		<span className="inline-flex items-center gap-1 text-2xs font-semibold text-foreground">
			<span className="size-2.5 rounded-[3px]" style={{ backgroundColor: KIND_COLORS[kind] }} />
			{VERB[kind]}
		</span>
	);
}

export function PartyTag({ name, side }: { name: string; side: Side | null }) {
	return (
		<span className="inline-flex items-center gap-1.5 text-2xs font-semibold text-foreground">
			<span
				className="size-2 rounded-full"
				style={{ backgroundColor: side ? SIDE_COLOR[side] : 'var(--muted-foreground)' }}
			/>
			{name}
		</span>
	);
}

type Tone = 'muted' | 'accent' | 'warn' | Side;

export function Pill({
	children,
	tone = 'muted',
	dashed,
	className,
}: {
	children: ReactNode;
	tone?: Tone;
	dashed?: boolean;
	className?: string;
}) {
	const side = tone === 'a' || tone === 'b' ? tone : null;
	return (
		<span
			className={cn(
				'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium whitespace-nowrap',
				tone === 'muted' && 'bg-secondary text-muted-foreground',
				tone === 'accent' && 'bg-accent text-accent-foreground',
				tone === 'warn' && 'bg-warning/15 text-warning-foreground',
				dashed && 'border border-dashed border-muted-foreground/50 bg-transparent italic',
				className
			)}
			style={
				side ? { backgroundColor: `${SIDE_COLOR[side]}1f`, color: SIDE_COLOR[side] } : undefined
			}
		>
			{side && (
				<span className="size-1.5 rounded-full" style={{ backgroundColor: SIDE_COLOR[side] }} />
			)}
			{children}
		</span>
	);
}

export function Caps({ children }: { children: ReactNode }) {
	return (
		<p className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
			{children}
		</p>
	);
}

export function Quote({ text, color, note }: { text: string; color: string; note?: ReactNode }) {
	return (
		<div
			className="space-y-1.5 border-l-[3px] bg-secondary px-3 py-2"
			style={{ borderColor: color }}
		>
			<p className="text-xs leading-relaxed text-foreground italic">“{text}”</p>
			{note}
		</div>
	);
}

/** The drawn absence: dashed, so it reads as a slot that is empty on purpose. */
export function Hatch({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div
			className={cn(
				'rounded-md border border-dashed border-muted-foreground/45 bg-background px-2 py-1.5 text-2xs text-muted-foreground italic',
				className
			)}
		>
			{children}
		</div>
	);
}

export function Stat({ n, label, color }: { n: number; label: string; color?: string }) {
	return (
		<span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1">
			<span className="text-sm font-bold" style={color ? { color } : undefined}>
				{n}
			</span>
			<span className="text-2xs text-muted-foreground">{label}</span>
		</span>
	);
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div className={cn('rounded-xl border border-border bg-card p-4', className)}>{children}</div>
	);
}

/** Main column and side column side by side once the panel is wide enough. */
export function Frame({ top, main, side }: { top?: ReactNode; main: ReactNode; side: ReactNode }) {
	return (
		<div className="@container min-h-0 flex-1 overflow-auto">
			<div className="space-y-4 p-4">
				{top}
				<div className="grid grid-cols-1 items-start gap-4 @3xl:grid-cols-[minmax(0,1fr)_300px]">
					<div className="min-w-0 space-y-3">{main}</div>
					<div className="space-y-4">{side}</div>
				</div>
			</div>
		</div>
	);
}

export function Head({ title, lead }: { title: string; lead: string }) {
	return (
		<div className="space-y-1">
			<h3 className="text-base font-bold text-foreground">{title}</h3>
			<p className="text-xs leading-relaxed text-muted-foreground">{lead}</p>
		</div>
	);
}
