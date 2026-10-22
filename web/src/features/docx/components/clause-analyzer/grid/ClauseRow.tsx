'use client';

import {
	Fragment,
	useEffect,
	useRef,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
} from 'react';
import { ChevronDownIcon, Forward } from 'lucide-react';
import type {
	GridLane,
	GridMark,
	GridRow,
	MarkKind,
} from '@/features/docx/utils/knowledge/statement-grid';
import { Mark } from '@/features/docx/components/clause-analyzer/grid/Mark';
import { ShareBar } from '@/features/docx/components/clause-analyzer/grid/ShareBar';
import {
	AxisMark,
	GraphLink,
	KIND_LABEL as TAB_NAME,
	RankBadge,
	SectionTag,
} from '@/features/docx/components/clause-analyzer/views/favour-bits';
import { favourOf } from '@/features/docx/utils/knowledge/clause-favour';
import type { DeonticKind } from '@/types/knowledge';
import {
	KIND_COLORS,
	LABEL_MIN_WIDTH,
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
	/** The clauses that modify this one (the graph's `modifies`): their number, and the type
	 *  of the sentence that does it, for its colour; null when the graph gives none. */
	modifiedBy?: Array<{ clauseId: string; label: string; kind: DeonticKind | null }>;
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
	/** Statements a condition gates; their squares are drawn as outlines. */
	conditionalIds?: ReadonlySet<string>;
	/** A mark on the rule between the parties' columns points to the one with more squares
	 *  in this row, or says «=» when both have as many. Needs `centerLanes`. */
	favourAxis?: boolean;
	laneName: (lane: GridLane) => string;
	onSelect: (clauseId: string) => void;
	/** Opens the clause in the knowledge graph tab; absent where there is no such tab. */
	onOpenGraph?: (clauseId: string) => void;
	/** Opens the clause in Table v2, for what each party gets in it; absent, no link. */
	onDetails?: (clauseId: string) => void;
	/** The row unfolds its detail under it (Table v1.2): «Details» with a chevron ends the row,
	 *  and picking the row opens or closes it. */
	expandable?: boolean;
	/** What unfolds under the row while it is the picked one. */
	detail?: ReactNode;
	/** Goes to a clause that modifies this one, in the tab of its changing sentence's type. */
	onGoToModifier?: (clauseId: string, kind: DeonticKind | null) => void;
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
	conditionalIds,
	favourAxis = false,
	laneName,
	onSelect,
	onOpenGraph,
	onDetails,
	expandable = false,
	detail,
	onGoToModifier,
	onOpenMark,
	onFocusMark,
	onHoverMark,
	onLeaveMark,
}: ClauseRowProps) {
	const clauseId = row.clauseId;
	// A row picked from elsewhere (another row's «modified by») comes into view.
	const rowRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (active) rowRef.current?.scrollIntoView({ block: 'nearest' });
	}, [active]);
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

	// The squares shown on each side, so the mark on the rule says what the row shows.
	const shownIn = (lane: 'a' | 'b') =>
		row.marks[lane].filter((mark) => visibleKinds.has(mark.kind)).length;
	const axis = (() => {
		if (!favourAxis || !centerLanes || unfiled) return null;
		const count = { a: shownIn('a'), b: shownIn('b') };
		const favour = favourOf(count);
		if (favour === 'tie') return { favour, title: `Balanced: ${count.a} on each side` };
		const other = favour === 'a' ? 'b' : 'a';
		return {
			favour,
			title: `Favours ${laneName(favour)}: ${count[favour]} against ${count[other]}`,
		};
	})();

	return (
		// The table's header row is sticky: a row brought into view stops below it.
		<div ref={rowRef} className="scroll-mt-14">
			<div className={`flex items-start gap-2 px-3 py-1.5 ${background}`}>
				{lead ? (
					// It narrows before the row overflows: a tight panel wraps the heading rather than
					// pushing the row's end past the edge.
					<div
						className="flex items-start gap-2"
						style={{ flexBasis: labelWidth, minWidth: LABEL_MIN_WIDTH }}
					>
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
							{lead.modifiedBy?.length ? (
								<span className="mt-0.5 block text-2xs text-muted-foreground">
									modified by{' '}
									{lead.modifiedBy.map((m, index) => (
										<Fragment key={m.clauseId}>
											{index > 0 && ', '}
											<button
												type="button"
												onClick={() => onGoToModifier?.(m.clauseId, m.kind)}
												disabled={!onGoToModifier}
												className="font-semibold hover:underline disabled:cursor-default"
												style={{ color: m.kind ? KIND_COLORS[m.kind] : undefined }}
												title={
													m.kind
														? `Go to ${m.label}, in ${TAB_NAME[m.kind]}: the ${m.kind} there modifies this clause`
														: `Go to ${m.label}: it modifies this clause`
												}
											>
												{m.label}
											</button>
										</Fragment>
									))}
								</span>
							) : null}
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
				<div
					className={
						centerLanes
							? `flex flex-1 items-start justify-center ${favourAxis ? 'gap-3.5' : 'gap-2'}`
							: 'contents'
					}
				>
					{lanes.map((lane) => (
						<Fragment key={lane}>
							{lane === 'b' && (
								<span className="relative w-px shrink-0 self-stretch bg-border">
									{axis && (
										<AxisMark
											favour={axis.favour}
											title={axis.title}
											muted={dimmed}
											className="absolute top-[-1px] left-1/2 -translate-x-1/2"
										/>
									)}
								</span>
							)}
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
											conditional={conditionalIds?.has(mark.id)}
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

				{clauseId && expandable && (
					<button
						type="button"
						onClick={() => onSelect(clauseId)}
						aria-expanded={active}
						aria-label={`Details of ${lead?.heading ?? row.heading}`}
						title={active ? 'Hide the detail' : 'What each party gets in this clause'}
						className={`mt-0.5 flex w-16 shrink-0 items-center justify-end gap-0.5 text-xs font-medium hover:text-primary ${
							active ? 'text-primary' : 'text-muted-foreground'
						}`}
					>
						Details
						<ChevronDownIcon
							className={`size-3.5 transition-transform ${active ? 'rotate-180' : ''}`}
						/>
					</button>
				)}
			</div>

			{detail && (
				<div className="border-y border-primary/20 bg-primary/5 px-12 pt-3 pb-4">{detail}</div>
			)}
		</div>
	);
}
