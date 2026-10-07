'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import type { KnowledgeGraph } from '@/types/knowledge';
import {
	GRID_LANES,
	MARK_KINDS,
	type GridLane,
	type MarkKind,
	type Side,
	type StatementGrid,
} from '@/features/docx/utils/knowledge/statement-grid';
import { computeBenefitShare, shareOfClause } from '@/features/docx/utils/knowledge/benefit-share';
import { ClauseRow } from '@/features/docx/components/clause-analyzer/grid/ClauseRow';
import {
	MarkTooltip,
	useMarkHover,
} from '@/features/docx/components/clause-analyzer/grid/MarkTooltip';
import {
	LABEL_WIDTH,
	LANE_WIDTH,
	NEUTRAL_COLOR,
	NODE_COLORS,
	PAIR_SECOND_COLOR,
	PARTY_COLOR,
} from '@/features/docx/components/clause-analyzer/constants';

// The graph lights every kind and the reciprocal lane, so the row shows them all too.
const ALL_KINDS = new Set<MarkKind>(MARK_KINDS);
const PAINT_ALL: Record<GridLane, boolean> = { a: true, b: true, shared: true };
const noop = () => {};

interface SelectedRowProps {
	kg: KnowledgeGraph;
	grid: StatementGrid;
	clauseId: string | null;
	names: Record<Side, string>;
	onSelect: (clauseId: string) => void;
	onOpenMark: (nodeId: string) => void;
	/** Paints the graph by party instead of by kind. */
	byParty: boolean;
	onByParty: (on: boolean) => void;
}

function PartyColors({
	on,
	onChange,
	names,
}: {
	on: boolean;
	onChange: (on: boolean) => void;
	names: Record<Side, string>;
}) {
	const swatch = (color: string, label: string) => (
		<span className="inline-flex items-center gap-1">
			<span className="size-2 rounded-full" style={{ backgroundColor: color }} />
			{label}
		</span>
	);
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-1.5 text-2xs text-muted-foreground">
			{/* Two modes, so each side of the switch names one and either name selects it. */}
			<span
				className="flex items-center gap-2 font-medium"
				title="Paint each node by its kind, or in the colour of the party it belongs to, as the Table's columns do"
			>
				<button
					type="button"
					onClick={() => onChange(false)}
					className={cn(on ? 'text-muted-foreground hover:text-foreground' : 'text-foreground')}
				>
					By kind
				</button>
				<Switch
					size="sm"
					checked={on}
					onCheckedChange={onChange}
					aria-label="Colour the graph by party instead of by kind"
				/>
				<button
					type="button"
					onClick={() => onChange(true)}
					className={cn(on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
				>
					By party
				</button>
			</span>
			{on && (
				<>
					{swatch(PARTY_COLOR, names.a)}
					{swatch(PAIR_SECOND_COLOR, names.b)}
					{swatch(NEUTRAL_COLOR, 'both or neither')}
					{swatch(NODE_COLORS.clause, 'clause')}
				</>
			)}
		</div>
	);
}

/** The selected clause's row, drawn by the Table's own row, under the graph. */
export function SelectedRow({
	kg,
	grid,
	clauseId,
	names,
	onSelect,
	onOpenMark,
	byParty,
	onByParty,
}: SelectedRowProps) {
	const { containerRef, hover, show, hide } = useMarkHover(kg, grid);
	const row = clauseId ? (grid.rows.find((r) => r.clauseId === clauseId) ?? null) : null;
	const withShared = Boolean(row && row.marks.shared.length > 0);
	const lanes = useMemo<GridLane[]>(() => (withShared ? GRID_LANES : ['a', 'b']), [withShared]);
	const share = useMemo(
		() => (row ? shareOfClause(computeBenefitShare(grid, lanes), row.clauseId) : null),
		[grid, lanes, row]
	);
	const laneName = (lane: GridLane) => (lane === 'shared' ? 'Both parties' : names[lane]);

	return (
		<div ref={containerRef} className="relative shrink-0 border-t border-border/60 bg-background">
			<PartyColors on={byParty} onChange={onByParty} names={names} />
			{!row ? (
				<p className="px-3 py-2.5 text-2xs text-muted-foreground">
					Select a clause in the graph, or with the arrow beside its name in the Table, to see its
					row here.
				</p>
			) : (
				<>
					<div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 text-2xs">
						<span
							className="mr-2 shrink-0 font-medium text-muted-foreground/70"
							style={{ width: LABEL_WIDTH }}
						>
							CLAUSE
						</span>
						<span
							className="shrink-0 truncate text-right font-semibold"
							style={{ width: LANE_WIDTH, color: PARTY_COLOR }}
						>
							{names.a}
						</span>
						<span
							className="shrink-0 truncate font-semibold"
							style={{ width: LANE_WIDTH, color: PAIR_SECOND_COLOR }}
						>
							{names.b}
						</span>
						{withShared && (
							<span
								className="shrink-0 truncate font-medium text-muted-foreground/70"
								style={{ width: LANE_WIDTH }}
							>
								Both parties
							</span>
						)}
					</div>
					<ClauseRow
						row={row}
						striped={false}
						active
						dimmed={false}
						lanes={lanes}
						visibleKinds={ALL_KINDS}
						paintLanes={PAINT_ALL}
						share={share}
						laneName={laneName}
						onSelect={onSelect}
						onOpenMark={onOpenMark}
						onFocusMark={noop}
						onHoverMark={show}
						onLeaveMark={hide}
					/>
				</>
			)}
			<MarkTooltip hover={hover} above />
		</div>
	);
}
