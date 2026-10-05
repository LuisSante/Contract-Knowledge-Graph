'use client';

import { useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import { buildScenarios, type Scenario } from '@/features/docx/utils/knowledge/scenarios';
import type { DocNote } from '@/features/docx/hooks/useDocNotes';
import { AskBox } from '@/features/docx/components/clause-analyzer/views/AskBox';
import { MiniGrid } from '@/features/docx/components/clause-analyzer/views/MiniGrid';
import {
	Caps,
	Card,
	Frame,
	Hatch,
	Head,
	Kind,
	PartyTag,
	Pill,
	short,
} from '@/features/docx/components/clause-analyzer/views/bits';
import type { ViewProps } from '@/features/docx/components/clause-analyzer/views/types';

const GAP = { noParty: 'no party assigned', noTerm: 'no deadline found' } as const;

const trim = (text: string, max = 140) =>
	text.length > max ? `${text.slice(0, max).trim()}…` : text;

export function CasesView(props: ViewProps) {
	const { kg, aId, bId, names, reader, row, onRow, onOpen, grid, shareOf, onAsk, onTable } = props;
	const setNotes = useClauseAnalyzerStore((s) => s.setNotes);
	const cases = useMemo(() => buildScenarios(kg, aId, bId, reader), [kg, aId, bId, reader]);
	const picked = cases.find((c) => c.id === row) ?? cases[0] ?? null;
	const me = short(names[reader]);
	const them = short(names[reader === 'a' ? 'b' : 'a']);

	useEffect(() => {
		if (!picked) return;
		const notes: DocNote[] = picked.steps.map((st, i) => ({
			pid: st.s.paragraphIds[0],
			text: st.risk ? `Step ${i + 1} · risk for ${me}` : `Step ${i + 1}`,
			tone: st.risk ? 'warn' : 'step',
			at: 'before',
		}));
		for (const gap of picked.gaps)
			if (gap.paragraphId)
				notes.push({
					pid: gap.paragraphId,
					text: `Not found: ${GAP[gap.kind]} — ${gap.action}`,
					tone: 'gap',
					at: 'after',
				});
		setNotes(notes.filter((n) => n.pid));
		return () => setNotes([]);
	}, [picked, me, setNotes]);

	if (!picked)
		return (
			<p className="p-6 text-sm text-muted-foreground">
				No condition in this contract waits for a recognisable event yet.
			</p>
		);

	const mine = picked.steps.filter((st) => st.side === reader && st.s.kind === 'right');
	const firstTerm = picked.steps.find((st) => st.term)?.term;
	const risks = picked.steps.filter((st) => st.risk).length;

	const tile = (label: string, value: string, note: string, warn = false) => (
		<div className="rounded-xl border border-border bg-card px-3 py-2">
			<Caps>{label}</Caps>
			<p className={cn('mt-0.5 text-sm font-bold', warn && 'text-warning-foreground')}>{value}</p>
			<p className="text-2xs text-muted-foreground">{note}</p>
		</div>
	);

	const top = (
		<div className="space-y-1.5">
			<Caps>Situations · built from the contract’s conditions: “if…”, “unless…”, “upon…”</Caps>
			<div className="flex flex-wrap gap-1.5">
				{cases.map((c) => (
					<button
						type="button"
						key={c.id}
						onClick={() => onRow(c.id)}
						className={cn(
							'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
							c.id === picked.id
								? 'border-primary bg-accent font-semibold text-accent-foreground'
								: 'border-border bg-card text-foreground hover:bg-muted/40'
						)}
					>
						What if {c.title.charAt(0).toLowerCase() + c.title.slice(1)}?
						<span className="text-2xs font-normal text-muted-foreground">{c.steps.length}</span>
					</button>
				))}
			</div>
		</div>
	);

	const main = (
		<>
			<Head
				title={picked.title}
				lead={`Read as ${me}. The steps follow the order things happen in the contract, not a score.`}
			/>
			<div className="grid grid-cols-3 gap-2">
				{tile(
					'You can',
					`${mine.length} ${mine.length === 1 ? 'right' : 'rights'}`,
					mine[0] ? trim(mine[0].s.action, 48) : 'none found'
				)}
				{tile(
					'Deadline',
					firstTerm ? trim(firstTerm, 40) : 'none found',
					firstTerm ? 'first one in these steps' : 'no step carries one',
					Boolean(firstTerm)
				)}
				{tile('Risks', `${risks} for ${me}`, risks ? `${them} gains a power` : 'none flagged')}
			</div>
			<div className="overflow-hidden rounded-xl border border-border bg-card">
				{picked.steps.map((st, i) => (
					<button
						type="button"
						key={st.s.id}
						onClick={() => onOpen(st.s.id)}
						className="flex w-full items-start gap-3 border-b border-border/60 px-3 py-2.5 text-left hover:bg-muted/40"
					>
						<span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-2xs font-bold text-accent-foreground">
							{i + 1}
						</span>
						<span className="min-w-0 flex-1 space-y-1">
							<span className="block text-2xs text-muted-foreground italic">
								{st.cond.operator === 'UNLESS' ? 'Unless' : 'If'} {trim(st.cond.trigger)}
							</span>
							<span className="block text-xs font-medium">{st.s.action}</span>
							<span className="flex flex-wrap items-center gap-2">
								{st.side ? (
									<PartyTag side={st.side} name={short(names[st.side])} />
								) : (
									<Pill tone="warn">no party assigned</Pill>
								)}
								<Kind kind={st.s.kind} />
								{st.term && (
									<span className="text-2xs text-muted-foreground">{trim(st.term, 50)}</span>
								)}
							</span>
							{st.risk && (
								<span className="block border-l-[3px] border-warning bg-warning/15 px-2 py-1.5 text-2xs text-warning-foreground">
									<span className="font-bold tracking-wider">RISK FOR {me.toUpperCase()}</span> —{' '}
									{them} may {st.s.action.charAt(0).toLowerCase() + st.s.action.slice(1)}.
								</span>
							)}
						</span>
						{st.ref && <span className="shrink-0 text-2xs font-medium text-primary">{st.ref}</span>}
					</button>
				))}
			</div>
			<p className="text-2xs leading-relaxed text-muted-foreground">
				Each step opens its paragraph in the document, where it is numbered too.
			</p>
		</>
	);

	return (
		<Frame
			top={top}
			main={main}
			side={
				<>
					<Limits c={picked} names={names} onOpen={onOpen} />
					<AskBox
						onAsk={onAsk}
						placeholder="Ask about this situation…"
						question={`In “${picked.title.toLowerCase()}”, what should ${me} negotiate to be better protected?`}
					/>
					<MiniGrid
						grid={grid}
						clauseIds={picked.clauseIds}
						shareOf={shareOf}
						names={names}
						extra={stepMarks(picked)}
						caption="The table as it is today, cut to the clauses of this situation, in step order."
						onOpen={onOpen}
						onExpand={onTable}
					/>
				</>
			}
		/>
	);
}

/** The first step each clause takes part in, as the number the document shows too. */
function stepMarks(c: Scenario) {
	const first = new Map<string, number>();
	c.steps.forEach((st, i) => {
		if (st.s.clauseId && !first.has(st.s.clauseId)) first.set(st.s.clauseId, i + 1);
	});
	return Object.fromEntries(
		[...first].map(([id, n]) => [
			id,
			<span
				key={id}
				className="flex size-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground"
			>
				{n}
			</span>,
		])
	);
}

function Limits({
	c,
	names,
	onOpen,
}: {
	c: Scenario;
	names: ViewProps['names'];
	onOpen: (id: string) => void;
}) {
	return (
		<Card className="space-y-3">
			<h4 className="text-sm font-bold">How far it goes</h4>
			{c.limits.length === 0 && (
				<p className="text-2xs text-muted-foreground">
					No cap or exclusion found near these clauses.
				</p>
			)}
			{c.limits.slice(0, 5).map((l) => (
				<button
					type="button"
					key={l.s.id}
					onClick={() => onOpen(l.s.id)}
					className="block w-full space-y-0.5 text-left hover:opacity-80"
				>
					<PartyTag side={l.side} name={l.side ? short(names[l.side]) : 'Both / unnamed'} />
					<p className="text-xs">{l.s.action}</p>
					{l.ref && <p className="text-2xs font-medium text-primary">{l.ref}</p>}
				</button>
			))}
			<div className="h-px bg-border" />
			<h4 className="text-sm font-bold">What does not appear</h4>
			<p className="text-2xs text-muted-foreground">
				Two different things that should not look the same: what the contract does not say, and what
				the graph did not extract.
			</p>
			{c.gaps.length === 0 && <p className="text-2xs text-muted-foreground">Nothing flagged.</p>}
			{c.gaps.slice(0, 4).map((g) => (
				<Hatch key={`${g.kind}-${g.action}`} className="not-italic">
					<p className="text-xs text-foreground">{g.action}</p>
					<Pill tone="warn" className="mt-1">
						{GAP[g.kind]}
					</Pill>
				</Hatch>
			))}
		</Card>
	);
}
