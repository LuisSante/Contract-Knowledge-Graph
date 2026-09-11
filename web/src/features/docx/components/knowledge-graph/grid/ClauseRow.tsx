'use client';

import { Fragment, type MouseEvent as ReactMouseEvent } from 'react';
import type {
	GridLane,
	GridMark,
	GridRow,
	MarkKind,
} from '@/features/docx/utils/knowledge/statement-grid';
import { Mark } from '@/features/docx/components/knowledge-graph/grid/Mark';
import { ShareBar } from '@/features/docx/components/knowledge-graph/grid/ShareBar';
import {
	LABEL_WIDTH,
	LANE_COLUMNS,
	LANE_WIDTH,
	MARK_GAP,
	MARK_SIZE,
} from '@/features/docx/components/knowledge-graph/constants';

interface ClauseRowProps {
	row: GridRow;
	/** Zebra striping; the row does not know its own position otherwise. */
	striped: boolean;
	active: boolean;
	/** A clause is selected and it is not this one: everything here goes quiet. */
	dimmed: boolean;
	lanes: GridLane[];
	visibleKinds: Set<MarkKind>;
	paintLanes: Record<GridLane, boolean>;
	share: { a: number; b: number } | null;
	laneName: (lane: GridLane) => string;
	onSelect: (clauseId: string) => void;
	onOpenMark: (nodeId: string) => void;
	onFocusMark: (nodeId: string) => void;
	onHoverMark: (event: ReactMouseEvent, mark: GridMark) => void;
	onLeaveMark: () => void;
}

export function ClauseRow({
	row,
	striped,
	active,
	dimmed,
	lanes,
	visibleKinds,
	paintLanes,
	share,
	laneName,
	onSelect,
	onOpenMark,
	onFocusMark,
	onHoverMark,
	onLeaveMark,
}: ClauseRowProps) {
	const unfiled = row.clauseId === null;
	const pctA = share ? Math.round(share.a * 100) : 0;
	const background = active
		? 'bg-primary/10 ring-1 ring-inset ring-primary/30'
		: unfiled
			? 'bg-destructive/5'
			: striped
				? 'bg-muted/30'
				: '';

	return (
		<div className={`flex items-start gap-2 px-3 py-1.5 ${background}`}>
			<button
				type="button"
				onClick={() => row.clauseId && onSelect(row.clauseId)}
				disabled={unfiled}
				className={`mt-0.5 shrink-0 text-left text-2xs disabled:cursor-default ${
					unfiled ? 'font-medium text-destructive/80' : 'text-foreground/80 hover:underline'
				}`}
				style={{ width: LABEL_WIDTH }}
				title={
					share
						? `${row.heading} — del beneficio que reparte, ${pctA}% va a ${laneName('a')} y ${100 - pctA}% a ${laneName('b')}`
						: row.heading
				}
			>
				<span className="block truncate">{row.heading}</span>
				{share && !unfiled && <ShareBar share={share} />}
			</button>

			{/* Lane A fills right-to-left so it grows outward from the axis. */}
			{lanes.map((lane) => (
				<Fragment key={lane}>
					{lane === 'b' && <span className="w-px shrink-0 self-stretch bg-border" />}
					<div
						dir={lane === 'a' ? 'rtl' : 'ltr'}
						className="grid shrink-0 content-start"
						style={{
							width: LANE_WIDTH,
							gap: MARK_GAP,
							gridTemplateColumns: `repeat(${LANE_COLUMNS}, ${MARK_SIZE}px)`,
						}}
					>
						{row.marks[lane]
							.filter((mark) => visibleKinds.has(mark.kind))
							.map((mark) => (
								<Mark
									key={mark.id}
									mark={mark}
									muted={dimmed || !paintLanes[lane]}
									onHover={onHoverMark}
									onLeave={onLeaveMark}
									onOpen={onOpenMark}
									onFocus={onFocusMark}
								/>
							))}
					</div>
				</Fragment>
			))}
		</div>
	);
}
