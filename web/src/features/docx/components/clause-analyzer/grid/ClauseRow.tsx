'use client';

import {
	Fragment,
	memo,
	useEffect,
	useRef,
	useState,
	type KeyboardEvent,
	type ReactNode,
} from 'react';
import {
	BookOpen,
	ChevronDownIcon,
	CornerDownRight,
	Forward,
	Link2,
	PenLine,
} from 'lucide-react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import type {
	GridLane,
	GridMark,
	GridRow,
	MarkKind,
} from '@/features/docx/utils/knowledge/statement-grid';
import { Mark, type HoverPoint } from '@/features/docx/components/clause-analyzer/grid/Mark';
import {
	AxisMark,
	GraphLink,
	KIND_LABEL as TAB_NAME,
	RankBadge,
	SectionTag,
} from '@/features/docx/components/clause-analyzer/parts/table-bits';
import { favourOf } from '@/features/docx/utils/knowledge/clause-favour';
import type { DeonticKind } from '@/types/knowledge';
import {
	KIND_TEXT_COLORS,
	LABEL_MIN_WIDTH,
	LABEL_WIDTH,
	LANE_COLUMNS,
	laneWidth,
	LINKED_WIDTH,
	MARK_GAP,
	MARK_SIZE,
} from '@/features/docx/components/clause-analyzer/constants';

/** A row named by its importance rank, number and heading. */
export interface ClauseRowLead {
	rank: number | undefined;
	section: string | null;
	heading: string;
	/** The clauses that modify this one (the graph's `modifies`): their number, and the type
	 *  of the sentence that does it, for its colour; null when the graph gives none. */
	modifiedBy?: Array<{ clauseId: string; label: string; kind: DeonticKind | null }>;
	/** The clauses this one depends on (the graph's `depends_on`): their number. The edge
	 *  points to a whole clause, so there is no sentence type to colour it by. */
	dependsOn?: Array<{ clauseId: string; label: string }>;
	/** The clauses this one refers to (the graph's `references`): their number. */
	refersTo?: Array<{ clauseId: string; label: string }>;
	/** The clauses that define words this one uses (`uses` → `defines`): their number, and
	 *  the words, said in the title of its button in the «Linked» list. */
	usesFrom?: Array<{ clauseId: string; label: string; note: string }>;
	/** The terms this clause defines (the graph's `defines`), in the graph's order. */
	defines?: string[];
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
	/** Centres the parties' columns in the room the clause name leaves. */
	centerLanes?: boolean;
	/** How many marks a lane holds before it wraps to a new line. */
	laneColumns?: number;
	/** Names the row by rank, number and heading, with the graph icon right after it, instead
	 *  of the plain heading and arrow. */
	lead?: ClauseRowLead;
	labelWidth?: number;
	/** Every other row in solid grey, as the table paints them, instead of a faint tint. */
	boldStripes?: boolean;
	/** Statements a condition gates; their squares are drawn as outlines. */
	conditionalIds?: ReadonlySet<string>;
	/** A mark on the rule between the parties' columns points to the one with more squares
	 *  in this row, or says «=» when both have as many. Needs `centerLanes`. */
	axisMark?: boolean;
	/** The clause goes against the reader («You are») in the type shown. */
	against?: boolean;
	laneName: (lane: GridLane) => string;
	onSelect: (clauseId: string) => void;
	/** Opens the clause in the knowledge graph tab; absent where there is no such tab. */
	onOpenGraph?: (clauseId: string) => void;
	/** The row can unfold its detail under it: «Details» with a chevron ends the row and opens
	 *  or closes it. Picking the row itself does not. */
	expandable?: boolean;
	/** The detail is unfolded under the row. */
	detailOpen?: boolean;
	onToggleDetail?: (clauseId: string) => void;
	/** What unfolds under the row while it is the picked one and «Details» is open. */
	detail?: ReactNode;
	/** Goes to a clause that modifies this one, in the tab of its changing sentence's type, or
	 *  to one it depends on or refers to (no type: the tab stays). */
	onGoToModifier?: (clauseId: string, kind: DeonticKind | null) => void;
	onOpenMark: (nodeId: string) => void;
	onFocusMark: (nodeId: string) => void;
	onHoverMark: (point: HoverPoint, mark: GridMark) => void;
	onLeaveMark: () => void;
}

/** The keys that move between a row's marks once one has focus. */
const MARK_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

/**
 * Moves focus among a row's marks as they are drawn: left and right in reading order (a
 * line of both columns, then the next), up and down to the nearest mark on the line above
 * or below. Read from the layout, since the first party's column fills right to left.
 */
function moveAmongMarks(event: KeyboardEvent<HTMLElement>) {
	if (!MARK_KEYS.has(event.key)) return;
	const marks = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-mark]')];
	const at = marks.indexOf(document.activeElement as HTMLElement);
	if (at < 0) return;
	event.preventDefault();
	const placed = marks.map((element) => ({ element, rect: element.getBoundingClientRect() }));
	const current = placed[at];
	let target: HTMLElement | undefined;
	if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
		const below = event.key === 'ArrowDown';
		const x = current.rect.left;
		target = placed
			.filter(({ rect }) =>
				below ? rect.top > current.rect.top + 1 : rect.top < current.rect.top - 1
			)
			.sort(
				(p, q) =>
					Math.abs(p.rect.top - current.rect.top) - Math.abs(q.rect.top - current.rect.top) ||
					Math.abs(p.rect.left - x) - Math.abs(q.rect.left - x)
			)[0]?.element;
	} else {
		const order = placed
			.slice()
			.sort((p, q) => Math.round(p.rect.top - q.rect.top) || p.rect.left - q.rect.left)
			.map(({ element }) => element);
		const index = order.indexOf(current.element);
		target =
			event.key === 'Home'
				? order[0]
				: event.key === 'End'
					? order[order.length - 1]
					: order[index + (event.key === 'ArrowRight' ? 1 : -1)];
	}
	target?.focus();
}

export const ClauseRow = memo(function ClauseRow({
	row,
	striped,
	active,
	dimmed,
	lanes,
	visibleKinds,
	paintLanes,
	centerLanes = false,
	laneColumns = LANE_COLUMNS,
	lead,
	labelWidth = LABEL_WIDTH,
	boldStripes = false,
	conditionalIds,
	axisMark = false,
	against = false,
	laneName,
	onSelect,
	onOpenGraph,
	expandable = false,
	detailOpen = false,
	onToggleDetail,
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
	// One tab stop for the row's marks: the last one focused, else the first drawn.
	const [roverId, setRoverId] = useState<string | null>(null);
	const shownMarks = (lane: GridLane) =>
		row.marks[lane].filter((mark) => visibleKinds.has(mark.kind));
	const tabStop = lanes.some((lane) => shownMarks(lane).some((mark) => mark.id === roverId))
		? roverId
		: (lanes.flatMap(shownMarks)[0]?.id ?? null);
	const unfiled = clauseId === null;
	const background = active
		? 'bg-primary/10 ring-1 ring-inset ring-primary/30'
		: unfiled
			? 'bg-destructive/5'
			: striped
				? boldStripes
					? 'bg-muted'
					: 'bg-muted/30'
				: '';

	const title = row.heading;

	// The squares shown on each side, so the mark on the rule says what the row shows.
	const shownIn = (lane: 'a' | 'b') => shownMarks(lane).length;
	const axis = (() => {
		if (!axisMark || !centerLanes || unfiled) return null;
		const count = { a: shownIn('a'), b: shownIn('b') };
		const favour = favourOf(count);
		if (favour === 'tie') return { favour, title: `As many on each side: ${count.a} each` };
		const other = favour === 'a' ? 'b' : 'a';
		return {
			favour,
			title: `${laneName(favour)} has more: ${count[favour]} against ${count[other]}`,
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
							{against && (
								<span
									className="ml-1.5 inline-block rounded-full bg-destructive/10 px-2 py-px align-[1px] text-2xs font-semibold whitespace-nowrap text-[#b90009] dark:text-destructive"
									title="Against you in this type: you carry more obligations or prohibitions here, or the other party holds more rights"
								>
									Against you
								</span>
							)}
						</div>
					</div>
				) : (
					/* The name selects the row; the arrow beside it is its own button, so the two are
			   siblings rather than one inside the other. */
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
					</div>
				)}

				{/* Lane A fills right-to-left so it grows outward from the axis. */}
				{/* Tab reaches the row's marks once; the arrows move among them. */}
				<div
					className={
						centerLanes
							? `flex flex-1 items-start justify-center ${axisMark ? 'gap-3.5' : 'gap-2'}`
							: 'contents'
					}
					onKeyDown={moveAmongMarks}
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
								{shownMarks(lane).map((mark) => (
									<Mark
										key={mark.id}
										mark={mark}
										muted={dimmed || !paintLanes[lane]}
										conditional={conditionalIds?.has(mark.id)}
										tabbable={mark.id === tabStop}
										onHover={onHoverMark}
										onLeave={onLeaveMark}
										onOpen={onOpenMark}
										onFocusNode={onFocusMark}
										onRove={setRoverId}
									/>
								))}
							</div>
						</Fragment>
					))}
				</div>

				{lead && <LinkedCell lead={lead} onGo={onGoToModifier} />}

				{clauseId && expandable && (
					<button
						type="button"
						onClick={() => (onToggleDetail ? onToggleDetail(clauseId) : onSelect(clauseId))}
						aria-expanded={detailOpen}
						aria-label={`Details of ${lead?.heading ?? row.heading}`}
						title={detailOpen ? 'Hide the detail' : 'Each party’s statements in this clause'}
						className={`mt-0.5 flex w-16 shrink-0 items-center justify-end gap-0.5 text-xs font-medium hover:text-primary ${
							detailOpen ? 'text-primary' : 'text-muted-foreground'
						}`}
					>
						Details
						<ChevronDownIcon
							className={`size-3.5 transition-transform ${detailOpen ? 'rotate-180' : ''}`}
						/>
					</button>
				)}
			</div>

			{detail && (
				<div className="border-y border-primary/20 bg-primary/5 px-12 pt-3 pb-4">{detail}</div>
			)}
		</div>
	);
});

/** The relations the «Linked» column counts, in the order it shows them. Defined terms have
 *  «Aa» where the others have an icon. */
const LINKS = [
	{ key: 'modifiedBy', label: 'modified by', Icon: PenLine },
	{ key: 'dependsOn', label: 'depends on', Icon: CornerDownRight },
	{ key: 'refersTo', label: 'refers to', Icon: Link2 },
	{ key: 'defines', label: 'defines', Icon: null },
	{ key: 'usesFrom', label: 'uses terms from', Icon: BookOpen },
] as const;

type Link = (typeof LINKS)[number];

function LinkGlyph({ link }: { link: Link }) {
	return link.Icon ? (
		<link.Icon className="size-3 shrink-0 text-muted-foreground/70" aria-hidden />
	) : (
		<span
			className="text-[9px] leading-3 font-bold"
			style={{ color: KIND_TEXT_COLORS.definedTerm }}
			aria-hidden
		>
			Aa
		</span>
	);
}

/** The «Linked» column's name, with its icons as the legend, over the rows' cells. */
export function LinkedHeading() {
	return (
		<span
			className="flex shrink-0 flex-col gap-0.5 font-medium text-muted-foreground"
			style={{ width: LINKED_WIDTH }}
		>
			Linked
			<span className="flex items-center gap-1.5">
				{LINKS.map((link) => (
					<span key={link.key} title={link.label} className="flex">
						<LinkGlyph link={link} />
					</span>
				))}
			</span>
		</span>
	);
}

/** Wait before a hover-opened list closes, so the pointer can cross into it. */
const HOVER_CLOSE_MS = 150;

/**
 * A row's links to other clauses, counted per relation. Hovering the counts opens the list,
 * each clause a button that goes to it; a click or Enter pins it open until clicking away.
 */
function LinkedCell({
	lead,
	onGo,
}: {
	lead: ClauseRowLead;
	onGo?: (clauseId: string, kind: DeonticKind | null) => void;
}) {
	const [open, setOpen] = useState(false);
	// Opened by the pointer, not pinned: leaving closes it and focus stays on the table.
	const pinned = useRef(false);
	const closing = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(closing.current), []);

	const counts = LINKS.map((link) => ({ link, n: lead[link.key]?.length ?? 0 })).filter(
		({ n }) => n > 0
	);
	if (!counts.length)
		return (
			<span
				className="mt-0.5 shrink-0 text-2xs text-muted-foreground/40"
				style={{ width: LINKED_WIDTH }}
				title="No links to other clauses"
			>
				—
			</span>
		);

	const hoverOpen = () => {
		clearTimeout(closing.current);
		setOpen(true);
	};
	const hoverClose = () => {
		if (pinned.current) return;
		closing.current = setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
	};
	const go = (clauseId: string, kind: DeonticKind | null) => {
		pinned.current = false;
		setOpen(false);
		onGo?.(clauseId, kind);
	};
	const goButton = (clauseId: string, label: string, title: string, kind: DeonticKind | null) => (
		<button
			key={clauseId}
			type="button"
			onClick={() => go(clauseId, kind)}
			disabled={!onGo}
			className="font-semibold hover:underline disabled:cursor-default"
			style={{ color: kind ? KIND_TEXT_COLORS[kind] : undefined }}
			title={title}
		>
			{label}
		</button>
	);
	const listOf = (link: Link): ReactNode => {
		switch (link.key) {
			case 'modifiedBy':
				return lead.modifiedBy?.map((m) =>
					goButton(
						m.clauseId,
						m.label,
						m.kind
							? `Go to ${m.label}, in ${TAB_NAME[m.kind]}: the ${m.kind} there modifies this clause`
							: `Go to ${m.label}: it modifies this clause`,
						m.kind
					)
				);
			case 'dependsOn':
				return lead.dependsOn?.map((c) =>
					goButton(
						c.clauseId,
						c.label,
						`Go to ${c.label}: whether this clause applies is subject to it`,
						null
					)
				);
			case 'refersTo':
				return lead.refersTo?.map((c) =>
					goButton(c.clauseId, c.label, `Go to ${c.label}: this clause points to it`, null)
				);
			case 'defines':
				// Each term a pill in the defined-term colour, as in the Figma proposal 3.
				return lead.defines?.map((t) => (
					<span
						key={t}
						className="rounded-full px-1.5 font-semibold"
						style={{
							color: KIND_TEXT_COLORS.definedTerm,
							backgroundColor: `color-mix(in srgb, ${KIND_TEXT_COLORS.definedTerm} 12%, transparent)`,
						}}
					>
						{t}
					</span>
				));
			case 'usesFrom':
				return lead.usesFrom?.map((c) =>
					goButton(c.clauseId, c.label, `Go to ${c.label}: ${c.note}`, null)
				);
		}
	};

	return (
		<PopoverPrimitive.Root
			open={open}
			onOpenChange={(next) => {
				pinned.current = next;
				setOpen(next);
			}}
		>
			<PopoverPrimitive.Trigger asChild>
				<button
					type="button"
					onPointerEnter={hoverOpen}
					onPointerLeave={hoverClose}
					onClick={(event) => {
						// Already open from hovering: the click pins it rather than closing it.
						if (open && !pinned.current) {
							event.preventDefault();
							clearTimeout(closing.current);
							pinned.current = true;
						}
					}}
					className={`mt-0.5 flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 rounded text-2xs hover:bg-muted ${
						open ? 'bg-muted' : ''
					}`}
					style={{ width: LINKED_WIDTH }}
					aria-label={`Links of ${lead.heading}: ${counts.map(({ link, n }) => `${link.label} ${n}`).join(', ')}`}
				>
					{counts.map(({ link, n }) => (
						<span key={link.key} className="flex items-center gap-0.5">
							<LinkGlyph link={link} />
							<span className="font-semibold text-foreground tabular-nums">{n}</span>
						</span>
					))}
				</button>
			</PopoverPrimitive.Trigger>
			<PopoverPrimitive.Portal>
				<PopoverPrimitive.Content
					side="bottom"
					align="end"
					sideOffset={4}
					// Hovering opens it without taking focus from the table; a pinned one takes it.
					onOpenAutoFocus={(event) => {
						if (!pinned.current) event.preventDefault();
					}}
					onPointerEnter={hoverOpen}
					onPointerLeave={hoverClose}
					className="z-50 grid max-w-80 grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-md border border-border bg-popover p-2.5 text-2xs text-popover-foreground shadow-md"
				>
					{counts.map(({ link }) => (
						<Fragment key={link.key}>
							<span className="text-muted-foreground">{link.label}</span>
							<span className="flex flex-wrap gap-x-1.5 gap-y-1">{listOf(link)}</span>
						</Fragment>
					))}
				</PopoverPrimitive.Content>
			</PopoverPrimitive.Portal>
		</PopoverPrimitive.Root>
	);
}
