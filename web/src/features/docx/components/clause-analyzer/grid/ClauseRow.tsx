'use client';

import { Fragment, type MouseEvent as ReactMouseEvent } from 'react';
import { Forward } from 'lucide-react';
import type {
	GridLane,
	GridMark,
	GridRow,
	MarkKind,
} from '@/features/docx/utils/knowledge/statement-grid';
import { Mark } from '@/features/docx/components/clause-analyzer/grid/Mark';
import { ShareBar } from '@/features/docx/components/clause-analyzer/grid/ShareBar';
import {
	GraphLink,
	RankBadge,
	SectionTag,
} from '@/features/docx/components/clause-analyzer/views/favour-bits';
import {
	LABEL_WIDTH,
	LANE_COLUMNS,
	laneWidth,
	MARK_GAP,
	MARK_SIZE,
} from '@/features/docx/components/clause-analyzer/constants';

/** A row named the way Table v2 names it: importance rank, number and heading. */
export interface ClauseRowLead {
	rank: number | undefined;
	section: string | null;
	heading: string;
}

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
	/** Centres the parties' columns in the room the clause name leaves. */
	centerLanes?: boolean;
	/** How many marks a lane holds before it wraps to a new line. */
	laneColumns?: number;
	/** Names the row as Table v2 does, with the graph icon right after the heading, instead
	 *  of the plain heading and arrow. */
	lead?: ClauseRowLead;
	labelWidth?: number;
	/** Every other row in solid grey, as Table v1.1 paints them, instead of a faint tint. */
	boldStripes?: boolean;
	laneName: (lane: GridLane) => string;
	onSelect: (clauseId: string) => void;
	/** Opens the clause in the knowledge graph tab; absent where there is no such tab. */
	onOpenGraph?: (clauseId: string) => void;
	/** Opens the clause in Table v2, for what each party gets in it; absent, no link. */
	onDetails?: (clauseId: string) => void;
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
	centerLanes = false,
	laneColumns = LANE_COLUMNS,
	lead,
	labelWidth = LABEL_WIDTH,
	boldStripes = false,
	laneName,
	onSelect,
	onOpenGraph,
	onDetails,
	onOpenMark,
	onFocusMark,
	onHoverMark,
	onLeaveMark,
}: ClauseRowProps) {
	const clauseId = row.clauseId;
	const unfiled = clauseId === null;
	const pctA = share ? Math.round(share.a * 100) : 0;
	const background = active
		? 'bg-primary/10 ring-1 ring-inset ring-primary/30'
		: unfiled
			? 'bg-destructive/5'
			: striped
				? boldStripes
					? 'bg-muted'
					: 'bg-muted/30'
				: '';

	const title = share
		? `${row.heading} — del beneficio que reparte, ${pctA}% va a ${laneName('a')} y ${100 - pctA}% a ${laneName('b')}`
		: row.heading;

	return (
		<div className={`flex items-start gap-2 px-3 py-1.5 ${background}`}>
			{lead ? (
				<div className="flex shrink-0 items-start gap-2" style={{ width: labelWidth }}>
					<RankBadge rank={lead.rank} />
					{/* The heading is inline text, not a button box, so the icon follows its last
					    word when it wraps instead of dropping to a line of its own. */}
					<div className="min-w-0 flex-1 text-sm leading-snug">
						<span
							role="button"
							tabIndex={unfiled ? -1 : 0}
							aria-disabled={unfiled}
							onClick={() => clauseId && onSelect(clauseId)}
							onKeyDown={(event) => {
								if (!clauseId || (event.key !== 'Enter' && event.key !== ' ')) return;
								event.preventDefault();
								onSelect(clauseId);
							}}
							className={`font-semibold text-foreground ${unfiled ? '' : 'cursor-pointer hover:underline'}`}
						>
							{lead.section && <SectionTag section={lead.section} />}
							{lead.heading}
						</span>
						{clauseId && onOpenGraph && (
							<GraphLink onClick={() => onOpenGraph(clauseId)} heading={lead.heading} />
						)}
					</div>
				</div>
			) : (
				/* The name and the bar select the row; the arrow beside the name is its own
			   button, so the two are siblings rather than one inside the other. */
				<div className="mt-0.5 shrink-0 text-2xs" style={{ width: labelWidth }}>
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={() => clauseId && onSelect(clauseId)}
							disabled={unfiled}
							className={`min-w-0 truncate text-left disabled:cursor-default ${
								unfiled ? 'font-medium text-destructive/80' : 'text-foreground/80 hover:underline'
							}`}
							title={title}
						>
							{row.heading}
						</button>
						{clauseId && onOpenGraph && (
							<button
								type="button"
								onClick={() => onOpenGraph(clauseId)}
								className="shrink-0 rounded p-0.5 text-muted-foreground/60 hover:bg-muted hover:text-primary"
								title="See this clause in the knowledge graph"
								aria-label={`See ${row.heading} in the knowledge graph`}
							>
								<Forward className="size-3" />
							</button>
						)}
					</div>
					{share && clauseId && (
						<button
							type="button"
							tabIndex={-1}
							onClick={() => onSelect(clauseId)}
							className="block w-full text-left"
							title={title}
						>
							<ShareBar share={share} />
						</button>
					)}
				</div>
			)}

			{/* Lane A fills right-to-left so it grows outward from the axis. */}
			<div className={centerLanes ? 'flex flex-1 items-start justify-center gap-2' : 'contents'}>
				{lanes.map((lane) => (
					<Fragment key={lane}>
						{lane === 'b' && <span className="w-px shrink-0 self-stretch bg-border" />}
						<div
							dir={lane === 'a' ? 'rtl' : 'ltr'}
							className="grid shrink-0 content-start"
							style={{
								width: laneWidth(laneColumns),
								gap: MARK_GAP,
								gridTemplateColumns: `repeat(${laneColumns}, ${MARK_SIZE}px)`,
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

			{clauseId && onDetails && (
				<button
					type="button"
					onClick={() => onDetails(clauseId)}
					className="mt-0.5 w-16 shrink-0 text-right text-xs font-medium text-muted-foreground hover:text-primary"
					title="What each party gets in this clause, in Table v2"
				>
					Details ›
				</button>
			)}
		</div>
	);
}
