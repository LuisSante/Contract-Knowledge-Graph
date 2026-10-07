'use client';

import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { KIND_COLORS, KIND_LABEL } from '@/features/docx/components/clause-analyzer/constants';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import type { Favour, Served, TypeVerdict } from '@/features/docx/utils/knowledge/clause-favour';
import type { MarkKind, Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind } from '@/types/knowledge';

export const KIND_PLURAL: Record<DeonticKind, string> = {
	obligation: 'Obligations',
	right: 'Rights',
	prohibition: 'Prohibitions',
};

const who = (side: Side | 'both' | null, names: Record<Side, string>) =>
	side === 'both' ? 'both' : side ? short(names[side]) : 'a third party';

/** Who it serves and who has to honour it, in one line. */
export function relationOf(served: Served, names: Record<Side, string>): string {
	if (served.to === 'both') return 'Reciprocal — serves and binds both';
	const to = who(served.to, names);
	const by = who(served.by, names);
	if (served.kind === 'right')
		return served.by ? `Right of ${to} · ${by} bears it` : `Right of ${to}`;
	return `${KIND_LABEL[served.kind]} · serves ${to} · ${by} complies`;
}

export function ViewHeader({
	tag,
	title,
	lead,
	children,
}: {
	tag?: string;
	title: string;
	lead: string;
	children?: ReactNode;
}) {
	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2">
				{tag && (
					<span className="rounded-md bg-primary px-1.5 py-0.5 text-2xs font-semibold text-primary-foreground">
						{tag}
					</span>
				)}
				<h3 className="text-base font-bold text-foreground">{title}</h3>
			</div>
			<p className="text-xs leading-relaxed text-muted-foreground">{lead}</p>
			{children}
		</div>
	);
}

/** The Table's "Both parties" switch, offered where the Table's legend is not on screen. */
export function ReciprocalToggle({
	on,
	onChange,
}: {
	on: boolean;
	onChange: (on: boolean) => void;
}) {
	return (
		<label
			className="inline-flex cursor-pointer items-center gap-1.5 text-2xs text-muted-foreground"
			title="Statements the contract addresses to both parties at once. They serve both, so they add one to each side."
		>
			<Checkbox
				checked={on}
				onCheckedChange={(value) => onChange(value === true)}
				className="size-3.5"
				aria-label="Count reciprocal statements for both parties"
			/>
			Count reciprocal statements for both
		</label>
	);
}

export function FavourPill({
	favour,
	count,
	names,
	className,
}: {
	favour: TypeVerdict;
	count?: Record<Side, number>;
	names: Record<Side, string>;
	className?: string;
}) {
	const side = favour === 'a' || favour === 'b' ? favour : null;
	const label = side ? short(names[side]) : favour === 'mixed' ? 'Depends on the type' : 'Tie';
	return (
		<span
			className={cn(
				'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap',
				favour === 'tie' && 'bg-secondary text-muted-foreground',
				favour === 'mixed' && 'bg-warning/20 text-warning-foreground',
				className
			)}
			style={
				side ? { backgroundColor: `${SIDE_COLOR[side]}1f`, color: SIDE_COLOR[side] } : undefined
			}
		>
			{label}
			{count && (
				<span className="font-normal opacity-70 tabular-nums">
					{count.a}–{count.b}
				</span>
			)}
		</span>
	);
}

/** "Favours Equidata" in words, for sentences and filters. */
export const favourWords = (favour: Favour, names: Record<Side, string>) =>
	favour === 'tie' ? 'Tie' : `Favours ${short(names[favour])}`;

export function KindSquare({
	kind,
	size = 12,
	dim,
	ring,
	title,
	onClick,
	onEnter,
	onLeave,
}: {
	kind: MarkKind;
	size?: number;
	dim?: boolean;
	ring?: boolean;
	title?: string;
	onClick?: () => void;
	onEnter?: (event: ReactMouseEvent) => void;
	onLeave?: () => void;
}) {
	return (
		<button
			type="button"
			title={title}
			onClick={onClick}
			onMouseEnter={onEnter}
			onMouseMove={onEnter}
			onMouseLeave={onLeave}
			className={cn(
				'shrink-0 rounded-[3px] transition-opacity hover:ring-2 hover:ring-foreground/30',
				ring && 'ring-2 ring-foreground/70 ring-offset-1'
			)}
			style={{
				width: size,
				height: size,
				backgroundColor: KIND_COLORS[kind],
				opacity: dim ? 0.22 : 1,
			}}
		/>
	);
}

/** An empty slot drawn on purpose: the other party has it and this one does not. */
export function GhostSquare({ size = 12, title }: { size?: number; title?: string }) {
	return (
		<span
			title={title}
			className="shrink-0 rounded-[3px] border border-dashed border-muted-foreground/70"
			style={{
				width: size,
				height: size,
				backgroundImage:
					'repeating-linear-gradient(135deg, transparent 0 2px, var(--muted-foreground) 2px 3px)',
				opacity: 0.6,
			}}
		/>
	);
}
