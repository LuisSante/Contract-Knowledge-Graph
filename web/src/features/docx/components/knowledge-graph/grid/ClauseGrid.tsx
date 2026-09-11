'use client';

import { useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type {
	GridLane,
	GridMark,
	GridRow,
	MarkKind,
} from '@/features/docx/utils/knowledge/statement-grid';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ClauseRow } from '@/features/docx/components/knowledge-graph/grid/ClauseRow';
import {
	LABEL_WIDTH,
	LANE_WIDTH,
	PAIR_SECOND_COLOR,
	PARTY_COLOR,
	ROW_PAGE,
} from '@/features/docx/components/knowledge-graph/constants';

interface ClauseGridProps {
	clauseRows: GridRow[];
	/** Entities the extraction filed under no clause; null when there are none. */
	unfiledRow: GridRow | null;
	lanes: GridLane[];
	visibleKinds: Set<MarkKind>;
	activeClauseId: string | null;
	shareOf: (clauseId: string | null) => { a: number; b: number } | null;
	laneName: (lane: GridLane) => string;
	sortByImportance: boolean;
	/** The importance is fetched, so the ordering cannot be offered before it lands. */
	sortable: boolean;
	onToggleSort: () => void;
	paintLanes: Record<GridLane, boolean>;
	onPaintLane: (lane: GridLane, on: boolean) => void;
	canPaintB: boolean;
	showShared: boolean;
	onSelectClause: (clauseId: string) => void;
	onOpenMark: (nodeId: string) => void;
	onFocusMark: (nodeId: string) => void;
	onHoverMark: (event: ReactMouseEvent, mark: GridMark) => void;
	onLeaveMark: () => void;
}

export function ClauseGrid({
	clauseRows,
	unfiledRow,
	lanes,
	visibleKinds,
	activeClauseId,
	shareOf,
	laneName,
	sortByImportance,
	sortable,
	onToggleSort,
	paintLanes,
	onPaintLane,
	canPaintB,
	showShared,
	onSelectClause,
	onOpenMark,
	onFocusMark,
	onHoverMark,
	onLeaveMark,
}: ClauseGridProps) {
	const [rowLimit, setRowLimit] = useState(ROW_PAGE);
	const [showUnfiled, setShowUnfiled] = useState(false);

	const hiddenRows = Math.max(0, clauseRows.length - rowLimit);
	const shownRows = useMemo(
		() => [...clauseRows.slice(0, rowLimit), ...(showUnfiled && unfiledRow ? [unfiledRow] : [])],
		[clauseRows, rowLimit, showUnfiled, unfiledRow]
	);

	return (
		<div className="h-full overflow-auto">
			<div className="min-w-[620px]">
				<div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-background/95 px-3 py-1.5 text-2xs backdrop-blur">
					<button
						type="button"
						onClick={onToggleSort}
						disabled={!sortable}
						className="mr-2 shrink-0 truncate text-left font-medium text-muted-foreground/70 enabled:hover:text-foreground disabled:cursor-default"
						style={{ width: LABEL_WIDTH }}
						title="Order the rows by how much each clause weighs inside the contract (PageRank with a per-clause prior), or by its position in the document"
					>
						CLAUSE
						{sortable && (
							<span className="font-normal opacity-70">
								{sortByImportance ? ' · most important first ↓' : ' · document order'}
							</span>
						)}
					</button>
					{(['a', 'b'] as const).map((lane) => (
						<label
							key={lane}
							className={`flex min-w-0 shrink-0 cursor-pointer items-center gap-1.5 font-semibold ${
								lane === 'a' ? 'justify-end' : 'justify-start'
							}`}
							style={{
								width: LANE_WIDTH,
								color: lane === 'a' ? PARTY_COLOR : PAIR_SECOND_COLOR,
							}}
							title={`Paint ${laneName(lane)}’s entities in the document`}
						>
							{lane === 'b' && (
								<Checkbox
									checked={paintLanes.b}
									disabled={!canPaintB}
									onCheckedChange={(value) => onPaintLane('b', value === true)}
									className="size-3.5 shrink-0 border-current"
									style={{ backgroundColor: paintLanes.b ? PAIR_SECOND_COLOR : undefined }}
									aria-label={`Paint ${laneName('b')}’s statements`}
								/>
							)}
							<span className="truncate">{laneName(lane)}</span>
							{lane === 'a' && (
								<Checkbox
									checked={paintLanes.a}
									onCheckedChange={(value) => onPaintLane('a', value === true)}
									className="size-3.5 shrink-0 border-current"
									style={{ backgroundColor: paintLanes.a ? PARTY_COLOR : undefined }}
									aria-label={`Paint ${laneName('a')}’s statements`}
								/>
							)}
						</label>
					))}
					{showShared && (
						<span
							className="shrink-0 truncate font-medium text-muted-foreground/70"
							style={{ width: LANE_WIDTH }}
							title="Provisiones que el contrato dirige a las dos partes a la vez"
						>
							{laneName('shared')}
						</span>
					)}
				</div>

				{shownRows.map((row, index) => (
					<ClauseRow
						key={row.clauseId ?? 'unfiled'}
						row={row}
						striped={index % 2 === 0}
						active={activeClauseId !== null && row.clauseId === activeClauseId}
						dimmed={activeClauseId !== null && row.clauseId !== activeClauseId}
						lanes={lanes}
						visibleKinds={visibleKinds}
						paintLanes={paintLanes}
						share={shareOf(row.clauseId)}
						laneName={laneName}
						onSelect={onSelectClause}
						onOpenMark={onOpenMark}
						onFocusMark={onFocusMark}
						onHoverMark={onHoverMark}
						onLeaveMark={onLeaveMark}
					/>
				))}

				<div className="flex items-center gap-3 px-3 py-2 text-2xs text-muted-foreground">
					{/* Both steps stay available at once: opening ten and closing ten are
					    the same move in opposite directions. */}
					{hiddenRows > 0 && (
						<Button
							variant="ghost"
							size="xs"
							className="h-6 px-1.5 text-2xs"
							onClick={() => setRowLimit((limit) => Math.min(clauseRows.length, limit + ROW_PAGE))}
						>
							↓ Show {Math.min(ROW_PAGE, hiddenRows)} more · {hiddenRows} left
						</Button>
					)}
					{rowLimit > ROW_PAGE && (
						<Button
							variant="ghost"
							size="xs"
							className="h-6 px-1.5 text-2xs"
							onClick={() => setRowLimit((limit) => Math.max(ROW_PAGE, limit - ROW_PAGE))}
						>
							↑ Hide {Math.min(ROW_PAGE, rowLimit - ROW_PAGE)}
						</Button>
					)}
					{unfiledRow && (
						<label
							className="flex cursor-pointer items-center gap-1.5"
							title="Entities the extraction filed under no clause. A gap in the graph, not a part of the contract."
						>
							<Checkbox
								checked={showUnfiled}
								onCheckedChange={(value) => setShowUnfiled(value === true)}
								className="size-3.5 shrink-0"
								aria-label="Show the No clause assigned band"
							/>
							Show “No clause assigned”
							<span className="tabular-nums opacity-60">{unfiledRow.total}</span>
						</label>
					)}
				</div>
			</div>
		</div>
	);
}
