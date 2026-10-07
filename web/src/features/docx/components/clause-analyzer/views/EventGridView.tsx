'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import { AskBox } from '@/features/docx/components/clause-analyzer/views/AskBox';
import {
	Hatch,
	Kind,
	SIDE_COLOR,
	short,
} from '@/features/docx/components/clause-analyzer/views/bits';
import {
	KindSquare,
	ViewHeader,
} from '@/features/docx/components/clause-analyzer/views/favour-bits';
import {
	byImportance,
	clauseTitle,
	sectionOf,
} from '@/features/docx/utils/knowledge/clause-favour';
import { buildScenarios, type Step } from '@/features/docx/utils/knowledge/scenarios';
import {
	DEONTIC_MARK_KINDS,
	type GridRow,
	type MarkKind,
	type Side,
} from '@/features/docx/utils/knowledge/statement-grid';
import type { DocNote } from '@/features/docx/hooks/useDocNotes';
import {
	MarkTooltip,
	useMarkHover,
} from '@/features/docx/components/clause-analyzer/grid/MarkTooltip';
import type { ViewProps } from '@/features/docx/components/clause-analyzer/views/types';

const LANE = 176;
const ROWS = 10;
const STEPS = 8;
const SHOWN: MarkKind[] = [...DEONTIC_MARK_KINDS, 'condition'];

const trim = (text: string, max: number) =>
	text.length > max ? `${text.slice(0, max).trim()}…` : text;

/** Camino 3: pick an event; the Table lights what the contract sets off and dims the rest. */
export function EventGridView({
	kg,
	aId,
	bId,
	grid,
	names,
	reader,
	row,
	onRow,
	importance,
	onOpen,
	onAsk,
}: ViewProps) {
	const setNotes = useClauseAnalyzerStore((s) => s.setNotes);
	const [rowLimit, setRowLimit] = useState(ROWS);
	const { containerRef, hover, show, hide } = useMarkHover(kg, grid);
	const [allSteps, setAllSteps] = useState(false);

	const events = useMemo(() => buildScenarios(kg, aId, bId, reader), [kg, aId, bId, reader]);
	const picked = events.find((e) => e.id === row) ?? events[0] ?? null;
	const clauseOf = useMemo(() => new Map(kg.clauses.map((c) => [c.id, c] as const)), [kg]);

	const active = useMemo(
		() => new Set(picked?.steps.flatMap((st) => [st.s.id, st.cond.id]) ?? []),
		[picked]
	);

	const rows = useMemo(() => {
		const withMarks = grid.rows.filter(
			(r): r is GridRow & { clauseId: string } =>
				r.clauseId !== null && [...r.marks.a, ...r.marks.b].some((m) => SHOWN.includes(m.kind))
		);
		const ordered = byImportance(withMarks, importance);
		const lit = (r: GridRow) => [...r.marks.a, ...r.marks.b].some((m) => active.has(m.id));
		return [...ordered.filter(lit), ...ordered.filter((r) => !lit(r))].map((r) => ({
			row: r,
			lit: lit(r),
		}));
	}, [grid, importance, active]);

	useEffect(() => {
		if (!picked) return;
		const notes: DocNote[] = picked.steps.map((st, i) => ({
			pid: st.s.paragraphIds[0],
			text: `${picked.title} · step ${i + 1}${st.side ? ` · ${short(names[st.side])}` : ''}`,
			tone: 'step',
			at: 'before',
		}));
		setNotes(notes.filter((n) => n.pid));
		return () => setNotes([]);
	}, [picked, names, setNotes]);

	if (!picked)
		return (
			<p className="p-6 text-sm text-muted-foreground">
				No condition in this contract waits for a recognisable event yet.
			</p>
		);

	const bySide = (side: Side) => picked.steps.filter((st) => st.side === side);
	const unnamed = picked.steps.filter((st) => st.side === null).length;

	const lane = (r: GridRow, side: Side) => (
		<div
			className={cn('flex flex-wrap content-start gap-1', side === 'a' && 'flex-row-reverse')}
			style={{ width: LANE }}
		>
			{r.marks[side]
				.filter((m) => SHOWN.includes(m.kind))
				.map((m) => (
					<KindSquare
						key={m.id}
						kind={m.kind}
						dim={!active.has(m.id)}
						ring={active.has(m.id)}
						onEnter={(event) => show(event, m)}
						onLeave={hide}
						onClick={() => onOpen(m.id)}
					/>
				))}
		</div>
	);

	const inEvent = (r: GridRow) =>
		(['a', 'b'] as const).map((side) => {
			const n = r.marks[side].filter(
				(m) => active.has(m.id) && DEONTIC_MARK_KINDS.includes(m.kind)
			).length;
			return n > 0 ? (
				<span
					key={side}
					className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 text-2xs font-semibold"
				>
					<span className="size-2 rounded-[2px]" style={{ backgroundColor: SIDE_COLOR[side] }} />
					{n}
				</span>
			) : null;
		});

	const column = (side: Side) => {
		const steps = bySide(side);
		const other = bySide(side === 'a' ? 'b' : 'a');
		const length = Math.max(steps.length, other.length);
		const shown = allSteps ? length : Math.min(length, STEPS);
		const slot = (st: Step | undefined, i: number) =>
			st ? (
				<div key={st.s.id} className="flex items-start gap-3 border-b border-border/60 py-2">
					<span className="w-20 shrink-0 rounded bg-secondary px-1.5 py-0.5 text-center text-2xs font-semibold">
						{st.term ? trim(st.term, 18) : '—'}
					</span>
					<span className="min-w-0 flex-1 space-y-0.5">
						<span className="block text-2xs text-muted-foreground italic">
							{st.cond.operator === 'UNLESS' ? 'Unless' : 'If'} {trim(st.cond.trigger, 90)}
						</span>
						<span className="flex items-start gap-1.5 text-xs">
							<Kind kind={st.s.kind} />
							<span>{st.s.summary || st.s.action}</span>
						</span>
						<button
							type="button"
							onClick={() => onOpen(st.s.id)}
							className="text-2xs font-medium text-primary underline-offset-2 hover:underline"
						>
							{sectionOf(st.ref) ?? 'open'}
						</button>
					</span>
				</div>
			) : (
				<div key={`gap-${i}`} className="flex items-start gap-3 border-b border-border/60 py-2">
					<span className="w-20 shrink-0 text-center text-2xs text-muted-foreground">—</span>
					<Hatch className="flex-1 text-center">No matching step for {short(names[side])}</Hatch>
				</div>
			);
		return (
			<div className="min-w-0">
				<div
					className="border-l-[3px] px-3 py-2"
					style={{ borderLeftColor: SIDE_COLOR[side], backgroundColor: `${SIDE_COLOR[side]}14` }}
				>
					<p className="text-sm font-bold">{short(names[side])}</p>
					<p className="text-2xs" style={{ color: SIDE_COLOR[side] }}>
						what it may and must do in this event · {steps.length} steps
					</p>
				</div>
				{Array.from({ length: shown }, (_, i) => slot(steps[i], i))}
			</div>
		);
	};

	const summaryOf = (side: Side) => {
		const steps = bySide(side);
		const rights = steps.filter((st) => st.s.kind === 'right').length;
		const first = steps.find((st) => st.term)?.term;
		return `${short(names[side])} has ${steps.length} steps (${rights} of them rights)${
			first ? ` and its first stated term is “${trim(first, 30)}”` : ' and no stated term'
		}`;
	};

	return (
		<div ref={containerRef} className="relative min-h-0 flex-1 overflow-auto">
			<div className="min-w-[680px] space-y-3 p-4">
				<ViewHeader
					tag="Scenarios"
					title="What happens if…?"
					lead="Pick something that can happen. The table lights what the contract sets off and dims the rest; below, the same steps in order, one column per party."
				>
					<div className="flex flex-wrap gap-1.5">
						{events.map((e) => (
							<button
								type="button"
								key={e.id}
								onClick={() => onRow(e.id)}
								className={cn(
									'rounded-full border px-3 py-1 text-xs',
									e.id === picked.id
										? 'border-primary bg-primary font-semibold text-primary-foreground'
										: 'border-border bg-card hover:bg-muted/40'
								)}
							>
								{e.title}
							</button>
						))}
					</div>
				</ViewHeader>

				<div className="overflow-hidden rounded-xl border border-border bg-card">
					<div className="flex items-center gap-3 bg-secondary px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase">
						<span className="flex-1 text-muted-foreground">
							Clause <span className="font-normal normal-case">· in the event first ↓</span>
						</span>
						<span className="text-right" style={{ width: LANE, color: SIDE_COLOR.a }}>
							{short(names.a)}
						</span>
						<span className="w-px self-stretch bg-border" />
						<span style={{ width: LANE, color: SIDE_COLOR.b }}>{short(names.b)}</span>
						<span className="w-20 text-muted-foreground">In the event</span>
					</div>
					{rows.slice(0, rowLimit).map(({ row: r, lit }) => (
						<div
							key={r.clauseId}
							className={cn(
								'flex items-start gap-3 border-b border-border/60 px-3 py-2',
								!lit && 'opacity-50'
							)}
						>
							<button
								type="button"
								onClick={() => r.clauseId && onOpen(r.clauseId)}
								className="min-w-0 flex-1 text-left hover:underline"
							>
								<span className="block truncate text-xs font-medium">
									{clauseTitle(clauseOf.get(r.clauseId), r.heading).heading}
								</span>
								<span className="text-2xs text-muted-foreground">
									{clauseTitle(clauseOf.get(r.clauseId), r.heading).section}
								</span>
							</button>
							{lane(r, 'a')}
							<span className="w-px self-stretch bg-border" />
							{lane(r, 'b')}
							<span className="flex w-20 flex-wrap gap-1">{inEvent(r)}</span>
						</div>
					))}
				</div>
				<p className="flex flex-wrap items-center gap-3 text-2xs text-muted-foreground">
					{rows.length > rowLimit && (
						<button
							type="button"
							onClick={() => setRowLimit((n) => n + ROWS)}
							className="font-medium text-primary hover:underline"
						>
							↓ {rows.length - rowLimit} more clauses
						</button>
					)}
					<span className="inline-flex items-center gap-1">
						<KindSquare kind="right" ring size={10} /> set off by the event
					</span>
					<span className="inline-flex items-center gap-1">
						<KindSquare kind="right" dim size={10} /> not involved
					</span>
				</p>

				<h4 className="pt-2 text-sm font-bold">{picked.title} — in order</h4>
				<div className="grid grid-cols-2 gap-4">
					{column('a')}
					{column('b')}
				</div>
				{Math.max(bySide('a').length, bySide('b').length) > STEPS && (
					<button
						type="button"
						onClick={() => setAllSteps((on) => !on)}
						className="text-2xs font-medium text-primary hover:underline"
					>
						{allSteps ? '↑ fewer steps' : '↓ all steps'}
					</button>
				)}
				<p className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-foreground">
					Faced with the same event, {summaryOf('a')}; {summaryOf('b')}.
					{unnamed > 0 && ` ${unnamed} more steps name neither party.`}
				</p>
				<AskBox
					onAsk={onAsk}
					placeholder="Ask anything not shown here: “what if it happens twice in a row?”"
					question={`If “${picked.title.toLowerCase()}”, what happens step by step, citing each section?`}
				/>
				<p className="text-2xs text-muted-foreground italic">
					Long chains (notice → deadline → termination → after) are told by the chat, citing each
					section: the graph links an event only to what it directly sets off.
				</p>
			</div>
			<MarkTooltip hover={hover} />
		</div>
	);
}
