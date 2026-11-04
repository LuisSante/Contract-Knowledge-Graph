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
	LABEL_MAX_WIDTH,
	LABEL_MIN_WIDTH,
	laneWidth,
	PAIR_SECOND_COLOR,
	PAIR_SECOND_TEXT_COLOR,
	PARTY_COLOR,
	PARTY_TEXT_COLOR,
	ROW_PAGE,
	BOTH_COLUMNS,
	bothWidth,
} from '@/features/docx/components/clause-analyzer/constants';
import { pairShort } from '@/features/docx/components/clause-analyzer/parts/bits';
import type { RowOrder } from '@/features/docx/hooks/useClauseRows';

/** The Clause Analyzer's layout: room for a long clause name on one line, and 10 marks to a
 *  column before it wraps, which leaves room for the «Linked» column. */
const NAME_WIDTH = 320;
/** A party's column wraps after this many squares; it is only as wide as its fullest row
 *  needs, and never narrower than MIN_MARKS, so its name still reads above it. */
const COLUMN_MARKS = 10;
const MIN_MARKS = 6;
/** The words after "CLAUSE" for each ordering. */
const SORT_LABELS: Record<RowOrder, string> = {
	size: 'by size ↓',
	importance: 'by relevance ↓',
	order: 'by order',
};

interface ClauseGridProps {
	clauseRows: GridRow[];
	/** Entities the extraction filed under no clause; null when there are none. */
	unfiledRow: GridRow | null;
	lanes: GridLane[];
	visibleKinds: Set<MarkKind>;
	activeClauseId: string | null;
	laneName: (lane: GridLane) => string;
	sortBy: RowOrder;
	/** Goes to the next ordering. */
	onToggleSort: () => void;
	paintLanes: Record<GridLane, boolean>;
	onPaintLane: (lane: GridLane, on: boolean) => void;
	canPaintB: boolean;
	/** Names each row by rank, number and heading; absent, rows show their plain heading. */
	leadOf?: (row: GridRow) => ClauseRowLead;
	/** Statements a condition gates; their squares are drawn as outlines. */
	conditionalIds?: ReadonlySet<string>;
	/** Statements a red flag matched; their squares get a black outline. */
	flaggedIds?: ReadonlySet<string>;
	/** The statements a red flag just picked: their squares get a blue ring. */
	spotlightIds?: ReadonlySet<string>;
	/** «Set shared aside»: a Both column between the parties for the reciprocal pairs. */
	bothLane?: boolean;
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
	sortBy,
	onToggleSort,
	paintLanes,
	onPaintLane,
	canPaintB,
	leadOf,
	conditionalIds,
	flaggedIds,
	spotlightIds,
	bothLane = false,
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

	// Each column as wide as its fullest row in the type shown, over every row (not only those
	// on screen), so «Show more» never shifts the columns: the clause names take the rest.
	const columns = useMemo(() => {
		const most = (count: (row: GridRow) => number) =>
			Math.max(0, ...clauseRows.map(count), ...(unfiledRow ? [count(unfiledRow)] : []));
		const shown = (marks: GridMark[] | undefined) =>
			(marks ?? []).filter((mark) => visibleKinds.has(mark.kind)).length;
		const clamp = (n: number) => Math.min(COLUMN_MARKS, Math.max(MIN_MARKS, n));
		return {
			a: clamp(most((row) => shown(row.marks.a))),
			b: clamp(most((row) => shown(row.marks.b))),
			both: Math.min(
				BOTH_COLUMNS,
				Math.max(
					1,
					most((row) => shown(row.both))
				)
			),
		};
	}, [clauseRows, unfiledRow, visibleKinds]);

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
						className="flex-1 truncate text-left font-medium text-muted-foreground hover:text-foreground"
						style={{ flexBasis: NAME_WIDTH, minWidth: LABEL_MIN_WIDTH, maxWidth: LABEL_MAX_WIDTH }}
						title="Order the rows by size (how many squares each shows in this type, both parties together), by how much each clause weighs inside the contract (PageRank with a per-clause prior), or by its position in the document"
					>
						CLAUSE
						<span className="font-normal">
							{' · '}
							{SORT_LABELS[sortBy]}
						</span>
					</button>
					{/* The rows' gap, so each name stays over its column. */}
					<div className="flex flex-1 items-center justify-center gap-3.5">
						{(['a', 'b'] as const).map((lane) => (
							<Fragment key={lane}>
								{/* The rows put a rule between the two columns; the header keeps its width. */}
								{lane === 'b' &&
									(bothLane ? (
										<label
											className="flex shrink-0 cursor-pointer items-center justify-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300"
											style={{ width: bothWidth(columns.both) }}
											title="Statements written once per party with the same words: they bind or entitle both alike, so they count for neither. Tick to paint them in the document"
										>
											<Checkbox
												checked={paintLanes.shared}
												onCheckedChange={(value) => onPaintLane('shared', value === true)}
												className="size-3.5 shrink-0 border-current"
												style={{ backgroundColor: paintLanes.shared ? '#64748b' : undefined }}
												aria-label="Paint the statements both parties share"
											/>
											Both
										</label>
									) : (
										<span className="w-px shrink-0" />
									))}
								<label
									className={`flex min-w-0 shrink-0 cursor-pointer items-center gap-1.5 font-semibold ${
										lane === 'a' ? 'justify-end' : 'justify-start'
									}`}
									style={{
										width: laneWidth(columns[lane]),
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
										{pairShort({ a: laneName('a'), b: laneName('b') })[lane]}
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
						laneColumns={columns}
						bothColumns={columns.both}
						lead={leads.get(row)}
						labelWidth={NAME_WIDTH}
						boldStripes
						conditionalIds={conditionalIds}
						flaggedIds={flaggedIds}
						spotlightIds={spotlightIds}
						bothLane={bothLane}
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
