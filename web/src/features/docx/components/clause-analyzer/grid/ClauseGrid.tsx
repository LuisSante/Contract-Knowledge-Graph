'use client';

import { Fragment, useCallback, useMemo, useState, type ReactNode } from 'react';
import type {
	GridLane,
	GridMark,
	GridRow,
	MarkKind,
} from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind } from '@/types/knowledge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
	ClauseRow,
	LinkedHeading,
	type ClauseRowLead,
} from '@/features/docx/components/clause-analyzer/grid/ClauseRow';
import type { HoverPoint } from '@/features/docx/components/clause-analyzer/grid/Mark';
import {
	LABEL_MIN_WIDTH,
	laneWidth,
	PAIR_SECOND_COLOR,
	PAIR_SECOND_TEXT_COLOR,
	PARTY_COLOR,
	PARTY_TEXT_COLOR,
	ROW_PAGE,
} from '@/features/docx/components/clause-analyzer/constants';

/** The Clause Analyzer's layout: room for a long clause name on one line, and 10 marks to a
 *  column before it wraps, which leaves room for the «Linked» column. */
const NAME_WIDTH = 320;
const COLUMN_MARKS = 10;
/** The words after "CLAUSE" for each ordering. */
const SORT_LABELS = { importance: 'by relevance ↓', order: 'by order' };

interface ClauseGridProps {
	clauseRows: GridRow[];
	/** Entities the extraction filed under no clause; null when there are none. */
	unfiledRow: GridRow | null;
	lanes: GridLane[];
	visibleKinds: Set<MarkKind>;
	activeClauseId: string | null;
	laneName: (lane: GridLane) => string;
	sortByImportance: boolean;
	/** The importance is fetched, so the ordering cannot be offered before it lands. */
	sortable: boolean;
	onToggleSort: () => void;
	paintLanes: Record<GridLane, boolean>;
	onPaintLane: (lane: GridLane, on: boolean) => void;
	canPaintB: boolean;
	/** Names each row by rank, number and heading; absent, rows show their plain heading. */
	leadOf?: (row: GridRow) => ClauseRowLead;
	/** Statements a condition gates; their squares are drawn as outlines. */
	conditionalIds?: ReadonlySet<string>;
	/** The reader's party («You are»): its column's name is marked «(you)». */
	youLane?: GridLane | null;
	/** Clauses where the other party has more squares than the reader in the type shown. */
	againstIds?: ReadonlySet<string> | null;
	/** Said in place of the rows when a filter leaves none. */
	emptyNote?: string;
	onSelectClause: (clauseId: string) => void;
	onOpenGraph?: (clauseId: string) => void;
	/** Each row unfolds this under it while it is the picked one and «Details» is open. */
	renderDetail?: (row: GridRow) => ReactNode;
	/** Goes to a clause that modifies a row, or that it depends on or refers to, from that row's
	 *  «modified by», «depends on» or «refers to». */
	onGoToModifier?: (clauseId: string, kind: DeonticKind | null) => void;
	onOpenMark: (nodeId: string) => void;
	onFocusMark: (nodeId: string) => void;
	onHoverMark: (point: HoverPoint, mark: GridMark) => void;
	onLeaveMark: () => void;
}

export function ClauseGrid({
	clauseRows,
	unfiledRow,
	lanes,
	visibleKinds,
	activeClauseId,
	laneName,
	sortByImportance,
	sortable,
	onToggleSort,
	paintLanes,
	onPaintLane,
	canPaintB,
	leadOf,
	conditionalIds,
	youLane = null,
	againstIds = null,
	emptyNote,
	onSelectClause,
	onOpenGraph,
	renderDetail,
	onGoToModifier,
	onOpenMark,
	onFocusMark,
	onHoverMark,
	onLeaveMark,
}: ClauseGridProps) {
	const [rowLimit, setRowLimit] = useState(ROW_PAGE);
	// Picking a row paints it in the contract; its detail opens only from «Details».
	const [detailOf, setDetailOf] = useState<string | null>(null);
	const [showUnfiled, setShowUnfiled] = useState(false);

	// The picked row is always shown, even when it sits past «Show more».
	const activeIndex = clauseRows.findIndex((row) => row.clauseId === activeClauseId);
	const limit = Math.max(rowLimit, activeIndex + 1);
	const hiddenRows = Math.max(0, clauseRows.length - limit);
	const shownRows = useMemo(
		() => [...clauseRows.slice(0, limit), ...(showUnfiled && unfiledRow ? [unfiledRow] : [])],
		[clauseRows, limit, showUnfiled, unfiledRow]
	);
	// Each row's name, made once per list so a row redraws only when it changes.
	const leads = useMemo(
		() => new Map(shownRows.map((row) => [row, leadOf?.(row)] as const)),
		[shownRows, leadOf]
	);
	const toggleDetail = useCallback(
		(id: string) => {
			if (id !== activeClauseId) onSelectClause(id);
			setDetailOf((open) => (open === id && id === activeClauseId ? null : id));
		},
		[activeClauseId, onSelectClause]
	);

	return (
		<div className="h-full overflow-auto">
			{/* The clause column gives up width first; below its minimum the whole table scrolls
			    sideways, so nothing at a row's end is cut off. */}
			<div className="min-w-min">
				<div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-background/95 px-3 py-1.5 text-2xs backdrop-blur">
					<button
						type="button"
						onClick={onToggleSort}
						disabled={!sortable}
						className="mr-2 truncate text-left font-medium text-muted-foreground enabled:hover:text-foreground disabled:cursor-default"
						style={{ flexBasis: NAME_WIDTH, minWidth: LABEL_MIN_WIDTH }}
						title="Order the rows by how much each clause weighs inside the contract (PageRank with a per-clause prior), or by its position in the document"
					>
						CLAUSE
						{sortable && (
							<span className="font-normal">
								{' · '}
								{sortByImportance ? SORT_LABELS.importance : SORT_LABELS.order}
							</span>
						)}
					</button>
					{/* The rows' gap, so each name stays over its column. */}
					<div className="flex flex-1 items-center justify-center gap-3.5">
						{(['a', 'b'] as const).map((lane) => (
							<Fragment key={lane}>
								{/* The rows put a rule between the two columns; the header keeps its width. */}
								{lane === 'b' && <span className="w-px shrink-0" />}
								<label
									className={`flex min-w-0 shrink-0 cursor-pointer items-center gap-1.5 font-semibold ${
										lane === 'a' ? 'justify-end' : 'justify-start'
									}`}
									style={{
										width: laneWidth(COLUMN_MARKS),
										color: lane === 'a' ? PARTY_TEXT_COLOR : PAIR_SECOND_TEXT_COLOR,
									}}
									title={`Paint ${laneName(lane)}’s statements in the document`}
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
									<span className="truncate">
										{laneName(lane)}
										{youLane === lane && <span className="font-normal"> (you)</span>}
									</span>
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
							</Fragment>
						))}
					</div>
					{leadOf && <LinkedHeading />}
					{/* As wide as the rows' «Details» button, so the columns stay under their names. */}
					{renderDetail && <span className="w-16 shrink-0" />}
				</div>

				{shownRows.length === 0 && emptyNote && (
					<p className="px-6 py-4 text-sm text-muted-foreground">{emptyNote}</p>
				)}

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
						centerLanes
						laneColumns={COLUMN_MARKS}
						lead={leads.get(row)}
						labelWidth={NAME_WIDTH}
						boldStripes
						conditionalIds={conditionalIds}
						axisMark
						against={row.clauseId !== null && Boolean(againstIds?.has(row.clauseId))}
						laneName={laneName}
						onSelect={onSelectClause}
						onOpenGraph={onOpenGraph}
						expandable={Boolean(renderDetail)}
						detailOpen={
							row.clauseId !== null && row.clauseId === activeClauseId && detailOf === row.clauseId
						}
						onToggleDetail={toggleDetail}
						detail={
							renderDetail &&
							activeClauseId !== null &&
							row.clauseId === activeClauseId &&
							detailOf === row.clauseId
								? renderDetail(row)
								: null
						}
						onGoToModifier={onGoToModifier}
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
					{hiddenRows > ROW_PAGE && (
						<Button
							variant="ghost"
							size="xs"
							className="h-6 px-1.5 text-2xs"
							onClick={() => setRowLimit(clauseRows.length)}
						>
							Show all
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
							<span className="tabular-nums">{unfiledRow.total}</span>
						</label>
					)}
				</div>
			</div>
		</div>
	);
}
