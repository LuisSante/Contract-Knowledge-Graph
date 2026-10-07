'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AskBox } from '@/features/docx/components/clause-analyzer/views/AskBox';
import { Hatch, SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import {
	GhostSquare,
	KindSquare,
	ViewHeader,
} from '@/features/docx/components/clause-analyzer/views/favour-bits';
import {
	byImportance,
	clauseTitle,
	sectionOf,
} from '@/features/docx/utils/knowledge/clause-favour';
import {
	buildPartyDiff,
	missingSide,
	type DiffRow,
	type Hold,
} from '@/features/docx/utils/knowledge/party-diff';
import {
	DEONTIC_MARK_KINDS,
	type GridRow,
	type Side,
} from '@/features/docx/utils/knowledge/statement-grid';
import {
	MarkTooltip,
	useMarkHover,
} from '@/features/docx/components/clause-analyzer/grid/MarkTooltip';
import type { ViewProps } from '@/features/docx/components/clause-analyzer/views/types';

const PAGE = 12;
const LANE = 176;

/** Camino 2: the Table with one mark more — the gap, in the lane of whoever lacks it. */
export function DiffGridView({ kg, aId, bId, grid, names, importance, onOpen, onAsk }: ViewProps) {
	const [openId, setOpenId] = useState<string | null>(null);
	const { containerRef, hover, show, hide } = useMarkHover(kg, grid);
	const [showSame, setShowSame] = useState(false);
	const [limit, setLimit] = useState(PAGE);

	const diff = useMemo(() => buildPartyDiff(kg, aId, bId), [kg, aId, bId]);
	const clauseOf = useMemo(() => new Map(kg.clauses.map((c) => [c.id, c] as const)), [kg]);
	const rows = useMemo(
		() =>
			byImportance(
				grid.rows.filter(
					(r): r is GridRow & { clauseId: string } =>
						r.clauseId !== null &&
						[...r.marks.a, ...r.marks.b].some((m) => DEONTIC_MARK_KINDS.includes(m.kind))
				),
				importance
			),
		[grid, importance]
	);

	const A = short(names.a);
	const B = short(names.b);
	const firstGap = diff.rows.find((r) => r.status === 'onlyB' || r.status === 'onlyA');

	const lane = (row: GridRow & { clauseId: string }, side: Side) => {
		const ghosts = (diff.byClause.get(row.clauseId) ?? []).filter((d) => missingSide(d) === side);
		return (
			<div
				className={cn('flex flex-wrap content-start gap-1', side === 'a' && 'flex-row-reverse')}
				style={{ width: LANE }}
			>
				{row.marks[side]
					.filter((m) => DEONTIC_MARK_KINDS.includes(m.kind))
					.map((m) => (
						<KindSquare
							key={m.id}
							kind={m.kind}
							onEnter={(event) => show(event, m)}
							onLeave={hide}
							onClick={() => onOpen(m.id)}
						/>
					))}
				{ghosts.map((d) => (
					<GhostSquare
						key={d.id}
						title={`Gap: ${side === 'a' ? A : B} has no equivalent of “${(d.a ?? d.b)?.s.action}”`}
					/>
				))}
			</div>
		);
	};

	const mirrorCell = (clauseId: string) => {
		const list = diff.byClause.get(clauseId) ?? [];
		if (list.length === 0)
			return <span className="text-2xs text-muted-foreground italic">not compared</span>;
		const fine = list.filter((d) => d.status === 'fine').length;
		const gaps = list.filter((d) => missingSide(d)).length;
		const same = list.filter((d) => d.status === 'same').length;
		return (
			<span className="flex flex-wrap items-center gap-1">
				{fine > 0 && (
					<span className="rounded bg-secondary px-1.5 text-2xs font-semibold">≠ {fine}</span>
				)}
				{gaps > 0 && (
					<span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 text-2xs font-semibold">
						<GhostSquare size={9} /> {gaps}
					</span>
				)}
				{same > 0 && <span className="px-1 text-2xs text-muted-foreground">= {same}</span>}
			</span>
		);
	};

	const card = (h: Hold, side: Side, other: Hold | null) => (
		<div
			className="rounded-lg border px-3 py-2"
			style={{ borderColor: `${SIDE_COLOR[side]}66`, backgroundColor: `${SIDE_COLOR[side]}0f` }}
		>
			<p className="text-xs">{h.s.summary || h.s.action}</p>
			<div className="mt-1 flex flex-wrap items-center gap-1.5">
				<button
					type="button"
					onClick={() => onOpen(h.s.id)}
					className="text-2xs font-medium text-primary underline-offset-2 hover:underline"
				>
					{sectionOf(clauseOf.get(h.s.clauseId ?? '')?.ref) ?? 'open'}
				</button>
				{[...(h.term ? [h.term] : []), ...h.marks].map((mark) => {
					const differs =
						!other || (mark === h.term ? other.term !== h.term : !other.marks.includes(mark));
					return (
						<span
							key={mark}
							className={cn(
								'rounded px-1.5 text-2xs',
								differs ? 'font-semibold' : 'bg-secondary text-muted-foreground'
							)}
							style={
								differs
									? {
											backgroundColor: `${SIDE_COLOR[side]}1f`,
											color: SIDE_COLOR[side],
											boxShadow: `inset 0 0 0 1px ${SIDE_COLOR[side]}`,
										}
									: undefined
							}
						>
							{mark}
						</span>
					);
				})}
			</div>
		</div>
	);

	const pair = (d: DiffRow) => {
		const lacks = missingSide(d);
		const held = (d.a ?? d.b) as Hold;
		const ask =
			lacks && onAsk ? (
				<button
					type="button"
					onClick={() =>
						onAsk(
							`How could ${lacks === 'a' ? A : B} get the equivalent of “${held.s.action}”, which only ${lacks === 'a' ? B : A} has?`
						)
					}
					className="mt-1 text-2xs font-medium text-primary hover:underline"
				>
					Ask the chat how to rebalance it ›
				</button>
			) : null;
		return (
			<div key={d.id} className="grid grid-cols-[1fr_20px_1fr] items-center gap-2">
				{d.a ? (
					card(d.a, 'a', d.b)
				) : (
					<Hatch className="text-center">
						{A} has no equivalent of “{held.s.action}”
					</Hatch>
				)}
				<span className="text-center text-sm text-muted-foreground">
					{d.status === 'fine' ? '≠' : d.status === 'same' ? '=' : lacks === 'a' ? '←' : '→'}
				</span>
				{d.b ? (
					card(d.b, 'b', d.a)
				) : (
					<Hatch className="text-center">
						{B} has no equivalent of “{held.s.action}”
					</Hatch>
				)}
				{ask && <span className={cn('col-span-3', lacks === 'b' && 'text-right')}>{ask}</span>}
			</div>
		);
	};

	const expanded = (row: GridRow & { clauseId: string }) => {
		const list = diff.byClause.get(row.clauseId) ?? [];
		const shownList = list.filter((d) => d.status !== 'same');
		const same = list.filter((d) => d.status === 'same');
		const fine = list.filter((d) => d.status === 'fine').length;
		return (
			<div className="space-y-2 border-b border-primary/30 bg-primary/5 px-4 py-3">
				<p className="text-xs font-bold">
					{clauseTitle(clauseOf.get(row.clauseId), row.heading).heading}, side by side{' '}
					<span className="font-normal text-muted-foreground">
						· {fine} different · {shownList.length - fine} without equivalent · {same.length} same
					</span>
				</p>
				{list.length === 0 && (
					<p className="text-2xs text-muted-foreground italic">
						Nothing here belongs to a topic both parties could hold — renewal, leaving, assignment,
						audits, liability — so there is no mirror to draw.
					</p>
				)}
				{shownList.map(pair)}
				{same.length > 0 && (
					<div className="rounded-md border border-dashed border-border px-3 py-1.5 text-center text-2xs text-muted-foreground">
						··· {same.length} same for both: {same.map((d) => d.a?.s.action).join(' · ')}{' '}
						<button
							type="button"
							onClick={() => setShowSame((on) => !on)}
							className="font-medium text-primary hover:underline"
						>
							{showSame ? 'hide' : 'show'}
						</button>
					</div>
				)}
				{showSame && same.map(pair)}
			</div>
		);
	};

	const tile = (value: string, label: string, note: ReactNode) => (
		<div className="rounded-xl border border-border bg-card px-3 py-2">
			<p className="text-sm font-bold">
				{value} <span className="font-semibold">{label}</span>
			</p>
			<div className="text-2xs text-muted-foreground">{note}</div>
		</div>
	);

	return (
		<div ref={containerRef} className="relative min-h-0 flex-1 overflow-auto">
			<div className="min-w-[680px] space-y-3 p-4">
				<ViewHeader
					tag="Mirror"
					title="What each party has that the other does not"
					lead="Only topics where it would make sense for both to hold the same are compared. Delivering the product or paying for it is not: that is each party’s role."
				>
					<div className="grid grid-cols-3 gap-2">
						{tile(String(diff.counts.same), 'same', 'folded, like the unchanged lines of a diff')}
						{tile(String(diff.counts.fine), 'different', 'same power, different fine print')}
						{tile(
							String(diff.counts.onlyA + diff.counts.onlyB),
							'without equivalent',
							<>
								one party has it and the other does not ·{' '}
								<span style={{ color: SIDE_COLOR.a }}>
									{diff.counts.onlyB} missing for {A}
								</span>{' '}
								·{' '}
								<span style={{ color: SIDE_COLOR.b }}>
									{diff.counts.onlyA} missing for {B}
								</span>
							</>
						)}
					</div>
					<p className="flex items-center gap-3 text-2xs text-muted-foreground">
						<span className="inline-flex items-center gap-1">
							<GhostSquare size={10} /> gap: the other party has it and this one does not
						</span>
						<span>≠ same power, different fine print</span>
					</p>
				</ViewHeader>

				<div className="overflow-hidden rounded-xl border border-border bg-card">
					<div className="flex items-center gap-3 bg-secondary px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase">
						<span className="flex-1 text-muted-foreground">
							Clause <span className="font-normal normal-case">· most important first ↓</span>
						</span>
						<span className="text-right" style={{ width: LANE, color: SIDE_COLOR.a }}>
							{A}
						</span>
						<span className="w-px self-stretch bg-border" />
						<span style={{ width: LANE, color: SIDE_COLOR.b }}>{B}</span>
						<span className="w-24 text-muted-foreground">Mirror</span>
					</div>
					{rows.slice(0, limit).map((row) => {
						const isOpen = openId === row.clauseId;
						const compared = diff.byClause.has(row.clauseId);
						const title = clauseTitle(clauseOf.get(row.clauseId), row.heading);
						return (
							<Fragment key={row.clauseId}>
								{/* A div, not a button: the marks inside are buttons of their own. */}
								<div
									role="button"
									tabIndex={0}
									onClick={() => setOpenId(isOpen ? null : row.clauseId)}
									onKeyDown={(event) => {
										if (event.key === 'Enter') setOpenId(isOpen ? null : row.clauseId);
									}}
									className={cn(
										'flex w-full cursor-pointer items-start gap-3 border-b border-border/60 px-3 py-2 text-left hover:bg-muted/30',
										isOpen && 'bg-primary/10 ring-1 ring-primary/30 ring-inset',
										!compared && 'opacity-70'
									)}
								>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-xs font-medium">{title.heading}</span>
										<span className="text-2xs text-muted-foreground">{title.section}</span>
									</span>
									<span className="contents" onClick={(event) => event.stopPropagation()}>
										{lane(row, 'a')}
										<span className="w-px self-stretch bg-border" />
										{lane(row, 'b')}
									</span>
									<span className="w-24">{mirrorCell(row.clauseId)}</span>
								</div>
								{isOpen && expanded(row)}
							</Fragment>
						);
					})}
				</div>
				<p className="text-2xs text-muted-foreground">
					{rows.length > limit && (
						<button
							type="button"
							onClick={() => setLimit((n) => n + PAGE)}
							className="mr-3 font-medium text-primary hover:underline"
						>
							↓ {rows.length - limit} more clauses
						</button>
					)}
					“Not compared”: rows where each party plays its own role and a mirror would make no sense.
					Pairs are found by shared words in the action, within each topic.
				</p>
				{firstGap && (
					<AskBox
						onAsk={onAsk}
						placeholder="Ask about any gap: “how do I ask for the cap to apply to both?”"
						question={`How could ${firstGap.status === 'onlyB' ? A : B} get the equivalent of “${(firstGap.a ?? firstGap.b)?.s.action}”?`}
					/>
				)}
			</div>
			<MarkTooltip hover={hover} />
		</div>
	);
}
