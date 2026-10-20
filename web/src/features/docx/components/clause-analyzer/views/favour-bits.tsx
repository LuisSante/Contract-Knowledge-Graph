'use client';

import type { MouseEvent as ReactMouseEvent } from 'react';
import { ArrowUpRightIcon, CheckIcon, InfoIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { KgCondition } from '@/types/knowledge';
import { cn } from '@/lib/utils';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import { KIND_COLORS } from '@/features/docx/components/clause-analyzer/constants';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import {
	DEONTIC_KINDS,
	type Served,
	type TypeVerdict,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { MarkKind, Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind } from '@/types/knowledge';

/**
 * The types by their plain names, as Table v1.1 shows them. Each is counted in favour of a
 * party, as Table v1.1's columns say: a right for its holder, an obligation or prohibition for
 * the party on its other end.
 */
export const KIND_LABEL: Record<DeonticKind, string> = {
	obligation: 'Obligations',
	right: 'Rights',
	prohibition: 'Prohibitions',
};

/** What each type is, and in whose favour it counts, in a few words. */
export const KIND_GLOSS: Record<DeonticKind, string> = {
	obligation: 'what one party must do, counted in favour of the other',
	right: 'what one party may do, counted in favour of that party',
	prohibition: 'what one party must not do, counted in favour of the other',
};

/** What a side's count is made of, named the way Table v1.1 names its columns. */
export function favourLine(kind: DeonticKind, side: Side, names: Record<Side, string>) {
	const recipient = short(names[side]);
	const other = short(names[side === 'a' ? 'b' : 'a']);
	if (kind === 'right') return `In favour of ${recipient}: its own rights`;
	return `In favour of ${recipient}: ${other}'s ${kind === 'obligation' ? 'obligations' : 'prohibitions'}`;
}

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
			: 'Equal counts';

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

/** One deontic type on screen at a time, as tabs: obligations, rights and prohibitions are
 *  never shown or counted together. Each tab carries its two counts, the first party's then
 *  the second's, with the larger in bold, so who leads a type shows before opening it. */
export function KindTabs({
	kind,
	onPick,
	counts,
	names,
	labels = KIND_LABEL,
}: {
	kind: DeonticKind;
	onPick: (kind: DeonticKind) => void;
	counts: Record<DeonticKind, Record<Side, number>> | null;
	names: Record<Side, string>;
	labels?: Record<DeonticKind, string>;
}) {
	return (
		<div
			role="tablist"
			aria-label="Type shown"
			className="flex gap-8 border-b border-border/60 px-6"
		>
			{DEONTIC_KINDS.map((k) => {
				const active = kind === k;
				const count = counts?.[k];
				return (
					<button
						key={k}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => onPick(k)}
						title={
							count
								? `${count.a} in favour of ${names.a} and ${count.b} in favour of ${names.b}`
								: undefined
						}
						className={cn(
							'-mb-px inline-flex items-center gap-2 border-b-2 pt-3 pb-2.5 text-sm',
							active
								? 'font-semibold text-foreground'
								: 'border-transparent font-medium text-muted-foreground hover:text-foreground'
						)}
						style={active ? { borderBottomColor: KIND_COLORS[k] } : undefined}
					>
						<span className="size-2.5 rounded-[2px]" style={{ backgroundColor: KIND_COLORS[k] }} />
						{labels[k]}
						{count && (
							<span className="inline-flex gap-1.5 text-xs tabular-nums">
								{(['a', 'b'] as const).map((side) => (
									<span
										key={side}
										className={
											count[side] > count[side === 'a' ? 'b' : 'a'] ? 'font-bold' : 'font-normal'
										}
										style={{ color: SIDE_COLOR[side] }}
									>
										{count[side]}
									</span>
								))}
							</span>
						)}
					</button>
				);
			})}
		</div>
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
						{KIND_LABEL[kind]}
						{on && !compact && <CheckIcon className="size-3" />}
					</button>
				);
			})}
		</div>
	);
}

/*
 * A clause's place by relevance and its number in the contract, each with a shape of its own
 * so the two are not read as one number: a ringed circle for the place, a tag for the number.
 * Both on the card colour, so they show on grey rows too. Table v1.1 and Table v2 share them.
 */

export function RankBadge({ rank, className }: { rank: number | undefined; className?: string }) {
	return (
		<span
			className={cn(
				'flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-card text-2xs font-semibold tabular-nums',
				className
			)}
		>
			{rank}
		</span>
	);
}

export function SectionTag({ section }: { section: string }) {
	return (
		<span className="mr-1.5 inline-block rounded-[5px] border border-border bg-card px-1.5 align-[1px] text-2xs leading-4 font-medium text-muted-foreground tabular-nums">
			{section}
		</span>
	);
}

/** What a `modifies` link means, for the ⓘ beside it. */
const MODIFIES_NOTE =
	'One clause changes what another says: it can limit it, add an exception or cancel it. Read them together.';

/** The ⓘ that explains a `modifies` link; `about` names the two clauses when known. */
export function ModifiesInfo({ about }: { about?: string }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label="What modifies means"
					className="relative z-10 inline-flex shrink-0 rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
				>
					<InfoIcon className="size-3.5" aria-hidden="true" />
				</button>
			</TooltipTrigger>
			<TooltipContent
				side="top"
				sideOffset={6}
				className="max-w-64 border border-border bg-card text-card-foreground shadow-sm [&_svg]:bg-card [&_svg]:fill-card"
			>
				{about && <p className="mb-1 font-semibold">{about}</p>}
				{MODIFIES_NOTE}
			</TooltipContent>
		</Tooltip>
	);
}

/** On the contract's margin line, by the picked clause: the linked sentences modify it. */
export function ModifiedByTag({ clause, by }: { clause: string; by: string[] }) {
	return (
		<span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-1.5 py-0.5 text-2xs font-medium whitespace-nowrap text-primary shadow-sm">
			modified by
			<ModifiesInfo about={`${clause} is modified by ${by.join(', ')}`} />
		</span>
	);
}

/** Jumps to the clause in the knowledge graph tab: an arrow right after the clause's name,
 *  inline, so it follows the name's last word when the name wraps. */
export function GraphLink({
	onClick,
	heading,
	className,
}: {
	onClick: () => void;
	/** The clause's name, for screen readers. */
	heading: string;
	className?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				'relative z-10 ml-1 inline-flex rounded p-0.5 align-[-3px] text-primary hover:bg-muted',
				className
			)}
			title="See this clause in the knowledge graph"
			aria-label={`See ${heading} in the knowledge graph`}
		>
			<ArrowUpRightIcon className="size-3.5" />
		</button>
	);
}

/** One statement in the contract's own words; a click underlines it in the contract, and
 *  the one underlined there stays marked here. */
export function Fragment({
	served,
	section,
	tag,
	tagColor,
	conditions = [],
	onOpen,
}: {
	served: Served;
	section: string | null;
	/** Said before the title, so the reader knows whose statement it is. */
	tag?: string;
	/** The colour of the party the tag names. */
	tagColor?: string;
	conditions?: KgCondition[];
	onOpen: (nodeId: string) => void;
}) {
	const shown = useClauseAnalyzerStore(
		(s) => s.focusNodeIds.length === 1 && s.focusNodeIds[0] === served.mark.id
	);
	// "§1 ¶2": the clause's number and, when it runs over several paragraphs, which one.
	const place =
		[section, served.paragraph ? `¶${served.paragraph}` : null].filter(Boolean).join(' ') || 'View';
	return (
		<article
			className={cn('space-y-2 px-3 py-3 text-left', shown && 'bg-accent')}
			style={shown ? { boxShadow: `inset 3px 0 0 ${tagColor ?? 'var(--primary)'}` } : undefined}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 space-y-1">
					{tag && (
						<p
							className={cn('text-xs font-medium', !tagColor && 'text-foreground/80')}
							style={tagColor ? { color: tagColor } : undefined}
						>
							{tag}
						</p>
					)}
					<p className="text-sm font-medium text-foreground">{served.mark.label}</p>
				</div>
				<button
					type="button"
					onClick={() => onOpen(served.mark.id)}
					aria-current={shown || undefined}
					aria-label={`Show ${served.mark.label} in the document`}
					className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
				>
					{place === 'View' ? 'Document' : place}
					<ArrowUpRightIcon className="size-3" />
				</button>
			</div>
			{conditions.map((condition) => (
				<p key={condition.id} className="text-xs text-foreground/90">
					<span className="font-medium">Condition: </span>
					{condition.operator || 'IF'} {condition.trigger}
				</p>
			))}
			<details className="text-xs">
				<summary className="cursor-pointer font-medium text-primary">View evidence</summary>
				<blockquote className="mt-2 border-l-2 border-border pl-3 leading-relaxed text-foreground/90">
					{served.text}
				</blockquote>
			</details>
		</article>
	);
}
