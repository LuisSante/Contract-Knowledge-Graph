'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { deonticNodes, type KnowledgeGraph } from '@/types/knowledge';
import {
	GRID_LANES,
	type GridMark,
	type MarkKind,
	type StatementGrid,
} from '@/features/docx/utils/knowledge/statement-grid';
import { clauseTitle, conditionLead } from '@/features/docx/utils/knowledge/clause-favour';
import {
	KIND_COLORS,
	KIND_LABEL,
	PAIR_SECOND_COLOR,
	PARTY_COLOR,
} from '@/features/docx/components/clause-analyzer/constants';
import type { HoverPoint } from '@/features/docx/components/clause-analyzer/grid/Mark';
import { afterLead } from '@/features/docx/components/clause-analyzer/parts/table-bits';

/** Where the pointer is, relative to the panel, plus what it is over. */
export interface HoverInfo {
	x: number;
	y: number;
	kind: MarkKind;
	/** The party the mark belongs to; null for a qualifier, which belongs to none. */
	owner: { name: string; color: string } | null;
	/** The contract's own words, or the extracted detail when there are none. */
	quote: string;
	/** "§1 Compensation", when the mark sits in a clause. */
	clause: string | null;
	/** What the statement waits on, when a condition gates it: «Only if…», «Unless…». */
	conditions?: Array<{ lead: string; trigger: string }>;
}

type MarkDetails = Omit<HoverInfo, 'x' | 'y'>;

/**
 * What the card says about a mark, from what the mark does not carry itself: the
 * contract's own words and the clause it sits in. Built once per graph and grid.
 */
export function markDetails(
	kg: KnowledgeGraph,
	grid: StatementGrid,
	/** Add the conditions that gate each statement, as the mark's card shows them. */
	withConditions = false
): (mark: GridMark) => MarkDetails {
	const conditionsOf = new Map<string, Array<{ lead: string; trigger: string }>>();
	if (withConditions) {
		for (const condition of kg.conditions) {
			if (!condition.gatesId || !condition.trigger) continue;
			const list = conditionsOf.get(condition.gatesId) ?? [];
			const lead = conditionLead(condition.operator);
			list.push({ lead, trigger: afterLead(lead, condition.trigger) });
			conditionsOf.set(condition.gatesId, list);
		}
	}
	const textOf = new Map(deonticNodes(kg).map((s) => [s.id, s.text] as const));
	const clauseOf = new Map(kg.clauses.map((c) => [c.id, c] as const));
	const clauseByMark = new Map<string, string | null>();
	for (const row of grid.rows) {
		const title = row.clauseId ? clauseTitle(clauseOf.get(row.clauseId), row.heading) : null;
		const label = title ? [title.section, title.heading].filter(Boolean).join(' ') : null;
		for (const lane of GRID_LANES)
			for (const mark of row.marks[lane]) clauseByMark.set(mark.id, label);
	}
	const ownerOf = (mark: GridMark): HoverInfo['owner'] => {
		if (mark.lane === 'shared') return { name: 'Both parties', color: 'var(--muted-foreground)' };
		const color = mark.lane === 'a' ? PARTY_COLOR : PAIR_SECOND_COLOR;
		if (!mark.ownerName) return null;
		return { name: mark.ownerName, color };
	};
	return (mark) => ({
		kind: mark.kind,
		owner: ownerOf(mark),
		quote: textOf.get(mark.id) || mark.detail,
		clause: clauseByMark.get(mark.id) ?? null,
		conditions: conditionsOf.get(mark.id),
	});
}

/** One card for every mark in a scrolling view, placed next to the pointer. */
export function useMarkHover(kg: KnowledgeGraph, grid: StatementGrid) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [hover, setHover] = useState<HoverInfo | null>(null);
	const detailsOf = useMemo(() => markDetails(kg, grid), [kg, grid]);
	const show = useCallback(
		(event: HoverPoint, mark: GridMark) => {
			const element = containerRef.current;
			const rect = element?.getBoundingClientRect();
			if (!element || !rect) return;
			setHover({
				x: event.clientX - rect.left + element.scrollLeft,
				y: event.clientY - rect.top + element.scrollTop,
				...detailsOf(mark),
			});
		},
		[detailsOf]
	);
	const hide = useCallback(() => setHover(null), []);
	return { containerRef, hover, show, hide };
}

/** The card's state kept outside the view that draws the marks, so a mouse move redraws the
 *  card alone and not every row. One store per view. */
export type MarkHoverStore = StoreApi<{ hover: HoverInfo | null }>;

export const createMarkHoverStore = (): MarkHoverStore =>
	createStore<{ hover: HoverInfo | null }>()(() => ({ hover: null }));

/** The mark card, read from a hover store. */
export function LiveMarkTooltip({ store, above }: { store: MarkHoverStore; above?: boolean }) {
	const hover = useStore(store, (s) => s.hover);
	return <MarkTooltip hover={hover} above={above} />;
}

const trim = (text: string, max: number) =>
	text.length > max ? `${text.slice(0, max).trim()}…` : text;

/** The mark card: the kind as a tag, the party it belongs to, the words, the clause. */
export function MarkTooltip({
	hover,
	above = false,
}: {
	hover: HoverInfo | null;
	/** Opens upwards, for marks at the foot of the panel where below there is no room. */
	above?: boolean;
}) {
	if (!hover) return null;
	const color = KIND_COLORS[hover.kind];
	return (
		<div
			role="tooltip"
			className="pointer-events-none absolute z-30 w-[22rem] rounded-xl border border-border bg-card px-3.5 py-3 text-xs shadow-lg"
			style={{
				left: Math.max(8, hover.x - 362),
				top: above ? hover.y - 14 : hover.y + 14,
				transform: above ? 'translateY(-100%)' : undefined,
			}}
		>
			<div className="flex items-center justify-between gap-3">
				<span
					className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium text-foreground"
					style={{ backgroundColor: `${color}22` }}
				>
					<span className="size-2 rounded-[2px]" style={{ backgroundColor: color }} />
					{KIND_LABEL[hover.kind]}
				</span>
				{hover.owner && (
					<span className="inline-flex min-w-0 items-center gap-1.5 text-foreground">
						<span
							className="size-2 shrink-0 rounded-full"
							style={{ backgroundColor: hover.owner.color }}
						/>
						<span className="truncate">{hover.owner.name}</span>
					</span>
				)}
			</div>
			{hover.quote && (
				<p className="mt-2.5 leading-relaxed text-muted-foreground italic">
					«{trim(hover.quote, 220)}»
				</p>
			)}
			{hover.conditions?.map((condition, index) => (
				<p key={index} className="mt-2 leading-relaxed text-foreground">
					<span
						className="mr-1.5 inline-block size-2 rounded-[2px] align-middle"
						style={{ backgroundColor: KIND_COLORS.condition }}
					/>
					<span className="font-semibold">{condition.lead}</span> {trim(condition.trigger, 160)}
				</p>
			))}
			<div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2">
				<span className="truncate text-muted-foreground">
					{hover.clause ?? 'No clause assigned'}
				</span>
				<span className="shrink-0 font-medium text-primary">Open in contract ↗</span>
			</div>
		</div>
	);
}
