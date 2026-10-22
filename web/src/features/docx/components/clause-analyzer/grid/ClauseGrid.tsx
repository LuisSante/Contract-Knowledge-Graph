'use client';

import {
	Fragment,
	useMemo,
	useState,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
} from 'react';
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
	type ClauseRowLead,
} from '@/features/docx/components/clause-analyzer/grid/ClauseRow';
import {
	LABEL_MIN_WIDTH,
	LABEL_WIDTH,
	LANE_COLUMNS,
	laneWidth,
	PAIR_SECOND_COLOR,
	PARTY_COLOR,
	ROW_PAGE,
} from '@/features/docx/components/clause-analyzer/constants';

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
	/** Centres the parties' columns in the room the clause names leave, instead of packing
	 *  them to the left. */
	centerLanes?: boolean;
	/** How many marks a lane holds before it wraps to a new line. */
	laneColumns?: number;
	/** Names each row as Table v2 does; absent, rows show their plain heading. */
	leadOf?: (row: GridRow) => ClauseRowLead;
	labelWidth?: number;
	/** Every other row in solid grey instead of a faint tint. */
	boldStripes?: boolean;
	/** Statements a condition gates; their squares are drawn as outlines. */
	conditionalIds?: ReadonlySet<string>;
	/** The words after "CLAUSE" for each ordering. */
	sortLabels?: { importance: string; order: string };
	/** The columns hold what each party gains (a credited grid), not what it carries: the
	 *  header reads "In favour of" over each name. */
	favourSide?: boolean;
	/** Each row marks, on the rule between the columns, the party it favours. */
	favourAxis?: boolean;
	/** The reader's party (Table v1.2's «You are»): its column reads «In favour of you». */
	youLane?: GridLane | null;
	/** Clauses where the other party has more squares than the reader in the type shown. */
	againstIds?: ReadonlySet<string> | null;
	/** Said in place of the rows when a filter leaves none. */
	emptyNote?: string;
	onSelectClause: (clauseId: string) => void;
	onOpenGraph?: (clauseId: string) => void;
	/** Opens a clause in Table v2; each row then ends in a «Details» link. */
	onDetails?: (clauseId: string) => void;
	/** Each row unfolds this under it while it is the picked one (Table v1.2). */
	renderDetail?: (row: GridRow) => ReactNode;
	/** Goes to a clause that modifies a row, from that row's «modified by». */
	onGoToModifier?: (clauseId: string, kind: DeonticKind | null) => void;
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
	centerLanes = false,
	laneColumns = LANE_COLUMNS,
	leadOf,
	labelWidth = LABEL_WIDTH,
	boldStripes = false,
	conditionalIds,
	sortLabels = { importance: 'most important first ↓', order: 'document order' },
	favourSide = false,
	favourAxis = false,
	youLane = null,
	againstIds = null,
	emptyNote,
	onSelectClause,
	onOpenGraph,
	onDetails,
	renderDetail,
	onGoToModifier,
	onOpenMark,
	onFocusMark,
	onHoverMark,
	onLeaveMark,
}: ClauseGridProps) {
	const [rowLimit, setRowLimit] = useState(ROW_PAGE);
	const [showUnfiled, setShowUnfiled] = useState(false);

	// The picked row is always shown, even when it sits past «Show more».
	const activeIndex = clauseRows.findIndex((row) => row.clauseId === activeClauseId);
	const limit = Math.max(rowLimit, activeIndex + 1);
	const hiddenRows = Math.max(0, clauseRows.length - limit);
	const shownRows = useMemo(
		() => [...clauseRows.slice(0, limit), ...(showUnfiled && unfiledRow ? [unfiledRow] : [])],
		[clauseRows, limit, showUnfiled, unfiledRow]
	);

	return (
		<div className="h-full overflow-auto">
			{/* With centred lanes the clause column gives up width first; below its minimum the
			    whole table scrolls sideways, so nothing at a row's end is cut off. */}
			<div className={centerLanes ? 'min-w-min' : 'min-w-[620px]'}>
				<div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-background/95 px-3 py-1.5 text-2xs backdrop-blur">
					<button
						type="button"
						onClick={onToggleSort}
						disabled={!sortable}
						className={`mr-2 truncate text-left font-medium text-muted-foreground/70 enabled:hover:text-foreground disabled:cursor-default ${
							centerLanes ? '' : 'shrink-0'
						}`}
						style={
							centerLanes
								? { flexBasis: labelWidth, minWidth: LABEL_MIN_WIDTH }
								: { width: labelWidth }
						}
						title="Order the rows by how much each clause weighs inside the contract (PageRank with a per-clause prior), or by its position in the document"
					>
						CLAUSE
						{sortable && (
							<span className="font-normal opacity-70">
								{' · '}
								{sortByImportance ? sortLabels.importance : sortLabels.order}
							</span>
						)}
					</button>
					{/* The rows' gap, so each name stays over its column. */}
					<div
						className={
							centerLanes
								? `flex flex-1 items-center justify-center ${favourAxis ? 'gap-3.5' : 'gap-2'}`
								: 'contents'
						}
					>
						{(['a', 'b'] as const).map((lane) => (
							<Fragment key={lane}>
								{/* The rows put a rule between the two columns; the header keeps its width. */}
								{centerLanes && lane === 'b' && <span className="w-px shrink-0" />}
								<label
									className={`flex min-w-0 shrink-0 cursor-pointer items-center gap-1.5 font-semibold ${
										lane === 'a' ? 'justify-end' : 'justify-start'
									}`}
									style={{
										width: laneWidth(laneColumns),
										color: lane === 'a' ? PARTY_COLOR : PAIR_SECOND_COLOR,
									}}
									title={
										favourSide
											? `Paint what favours ${laneName(lane)} in the document`
											: `Paint ${laneName(lane)}’s entities in the document`
									}
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
									{favourSide ? (
										<span
											className={`flex min-w-0 flex-col ${lane === 'a' ? 'items-end' : 'items-start'}`}
										>
											{youLane === lane ? (
												<span className="font-semibold">In favour of you</span>
											) : (
												<span className="font-normal text-muted-foreground">In favour of</span>
											)}
											<span className="max-w-full truncate">{laneName(lane)}</span>
										</span>
									) : (
										<span className="truncate">{laneName(lane)}</span>
									)}
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
						{showShared && (
							<span
								className="shrink-0 truncate font-medium text-muted-foreground/70"
								style={{ width: laneWidth(laneColumns) }}
								title="Provisiones que el contrato dirige a las dos partes a la vez"
							>
								{laneName('shared')}
							</span>
						)}
					</div>
					{/* As wide as the rows' «Details» link, so the columns stay under their names. */}
					{(onDetails || renderDetail) && <span className="w-16 shrink-0" />}
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
						share={shareOf(row.clauseId)}
						centerLanes={centerLanes}
						laneColumns={laneColumns}
						lead={leadOf?.(row)}
						labelWidth={labelWidth}
						boldStripes={boldStripes}
						conditionalIds={conditionalIds}
						favourAxis={favourAxis}
						against={row.clauseId !== null && Boolean(againstIds?.has(row.clauseId))}
						laneName={laneName}
						onSelect={onSelectClause}
						onOpenGraph={onOpenGraph}
						onDetails={onDetails}
						expandable={Boolean(renderDetail)}
						detail={
							renderDetail && activeClauseId !== null && row.clauseId === activeClauseId
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
