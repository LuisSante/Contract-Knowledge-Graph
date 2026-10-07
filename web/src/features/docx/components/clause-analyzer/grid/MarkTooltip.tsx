'use client';

import { useCallback, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { deonticNodes, type KnowledgeGraph } from '@/types/knowledge';
import {
	GRID_LANES,
	type GridMark,
	type MarkKind,
	type StatementGrid,
} from '@/features/docx/utils/knowledge/statement-grid';
import { clauseTitle } from '@/features/docx/utils/knowledge/clause-favour';
import {
	KIND_COLORS,
	KIND_LABEL,
	PAIR_SECOND_COLOR,
	PARTY_COLOR,
} from '@/features/docx/components/clause-analyzer/constants';

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
}

type MarkDetails = Omit<HoverInfo, 'x' | 'y'>;

/**
 * What the card says about a mark, from what the mark does not carry itself: the
 * contract's own words and the clause it sits in. Built once per graph and grid.
 */
export function markDetails(
	kg: KnowledgeGraph,
	grid: StatementGrid
): (mark: GridMark) => MarkDetails {
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
		if (!mark.ownerName) return null;
		return { name: mark.ownerName, color: mark.lane === 'a' ? PARTY_COLOR : PAIR_SECOND_COLOR };
	};
	return (mark) => ({
		kind: mark.kind,
		owner: ownerOf(mark),
		quote: textOf.get(mark.id) || mark.detail,
		clause: clauseByMark.get(mark.id) ?? null,
	});
}

/** One card for every mark in a scrolling view, placed next to the pointer. */
export function useMarkHover(kg: KnowledgeGraph, grid: StatementGrid) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [hover, setHover] = useState<HoverInfo | null>(null);
	const detailsOf = useMemo(() => markDetails(kg, grid), [kg, grid]);
	const show = useCallback(
		(event: ReactMouseEvent, mark: GridMark) => {
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

const trim = (text: string, max: number) =>
	text.length > max ? `${text.slice(0, max).trim()}…` : text;

/** The mark card: the kind as a tag, the party it belongs to, the words, the clause. */
export function MarkTooltip({ hover }: { hover: HoverInfo | null }) {
	if (!hover) return null;
	const color = KIND_COLORS[hover.kind];
	return (
		<div
			className="pointer-events-none absolute z-30 w-[22rem] rounded-xl border border-border bg-card px-3.5 py-3 text-xs shadow-lg"
			style={{ left: Math.max(8, hover.x - 362), top: hover.y + 14 }}
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
			<div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2">
				<span className="truncate text-muted-foreground/80">
					{hover.clause ?? 'No clause assigned'}
				</span>
				<span className="shrink-0 font-medium text-primary">Open in contract ↗</span>
			</div>
		</div>
	);
}
