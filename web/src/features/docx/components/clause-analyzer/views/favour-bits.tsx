'use client';

import type { MouseEvent as ReactMouseEvent } from 'react';
import { ArrowUpRightIcon, CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KIND_COLORS } from '@/features/docx/components/clause-analyzer/constants';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import {
	DEONTIC_KINDS,
	type Served,
	type TypeVerdict,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { MarkKind, Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind } from '@/types/knowledge';

export const KIND_PLURAL: Record<DeonticKind, string> = {
	obligation: 'Obligations',
	right: 'Rights',
	prohibition: 'Prohibitions',
};

/** A verdict's colour: the side it favours, amber when it depends on the type. */
export const verdictColor = (verdict: TypeVerdict) =>
	verdict === 'a' || verdict === 'b'
		? SIDE_COLOR[verdict]
		: verdict === 'mixed'
			? 'var(--warning)'
			: 'var(--foreground)';

export const verdictLabel = (verdict: TypeVerdict, names: Record<Side, string>) =>
	verdict === 'a' || verdict === 'b'
		? short(names[verdict])
		: verdict === 'mixed'
			? 'Depends on the type'
			: 'Tie';

/** A colour washed out to a background, for hex and CSS variables alike. */
export const tint = (color: string, percent: number) =>
	`color-mix(in oklab, ${color} ${percent}%, transparent)`;

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

/** Which deontic types are on screen. */
export function KindFilter({
	kinds,
	onToggle,
	label = 'Show',
	compact,
}: {
	kinds: DeonticKind[];
	onToggle: (kind: DeonticKind) => void;
	label?: string;
	compact?: boolean;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
			{label}
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
						title={last ? 'At least one type stays on' : undefined}
						className={cn(
							'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 disabled:cursor-default',
							compact ? 'text-2xs' : 'text-xs',
							on ? 'border-foreground/30 text-foreground' : 'border-border opacity-50'
						)}
					>
						<span
							className="size-2.5 rounded-[2px]"
							style={{ backgroundColor: KIND_COLORS[kind] }}
						/>
						{KIND_PLURAL[kind]}
						{on && !compact && <CheckIcon className="size-3" />}
					</button>
				);
			})}
		</div>
	);
}

/** Jumps to the clause in the knowledge graph tab. */
export function GraphLink({ onClick, className }: { onClick: () => void; className?: string }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				'relative z-10 inline-flex items-center gap-0.5 text-2xs font-medium text-primary hover:underline',
				className
			)}
		>
			View in graph
			<ArrowUpRightIcon className="size-3" />
		</button>
	);
}

/** One statement in the contract's own words, with a link to where it sits. */
export function Fragment({
	served,
	section,
	tag,
	square = true,
	onOpen,
}: {
	served: Served;
	section: string | null;
	tag?: string;
	square?: boolean;
	onOpen: (nodeId: string) => void;
}) {
	return (
		<div className="flex items-start gap-2.5 px-3 py-2">
			{square && (
				<span className="mt-1">
					<KindSquare kind={served.kind} size={8} onClick={() => onOpen(served.mark.id)} />
				</span>
			)}
			<span className="min-w-0 flex-1">
				<span className="flex flex-wrap items-center gap-1.5">
					<span className="text-xs font-semibold text-foreground">{served.mark.label}</span>
					{tag && (
						<span className="rounded bg-secondary px-1.5 py-px text-[10px] text-muted-foreground">
							{tag}
						</span>
					)}
				</span>
				<span className="block text-2xs leading-relaxed text-muted-foreground italic">
					«{served.text}»
				</span>
			</span>
			<button
				type="button"
				onClick={() => onOpen(served.mark.id)}
				title="Show it in the contract"
				className="inline-flex shrink-0 items-center text-2xs font-medium text-primary hover:underline"
			>
				{section ?? 'View'}
				<ArrowUpRightIcon className="size-3" />
			</button>
		</div>
	);
}
