'use client';

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import {
	buildMirror,
	FAMILIES,
	MATCH,
	type Hold,
	type MirrorRow,
} from '@/features/docx/utils/knowledge/mirror';
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
	Pill,
	Quote,
	SIDE_COLOR,
	short,
	Stat,
} from '@/features/docx/components/clause-analyzer/views/bits';
import type { ViewProps } from '@/features/docx/components/clause-analyzer/views/types';

const lastPara = (h: Hold) => h.s.paragraphIds[h.s.paragraphIds.length - 1];

export function MirrorView(props: ViewProps) {
	const { kg, aId, bId, names, row, onRow, onOpen } = props;
	const setNotes = useClauseAnalyzerStore((s) => s.setNotes);
	const mirror = useMemo(() => buildMirror(kg, aId, bId), [kg, aId, bId]);
	const [diffOnly, setDiffOnly] = useState(false);
	const { a: nameA, b: nameB } = names;

	const rows = diffOnly ? mirror.rows.filter((r) => r.status !== 'same') : mirror.rows;
	const picked =
		mirror.rows.find((r) => r.id === row) ??
		mirror.rows.find((r) => r.status !== 'same') ??
		mirror.rows[0] ??
		null;

	useEffect(() => {
		const notes: DocNote[] = [];
		const label = { a: short(nameA), b: short(nameB) };
		for (const r of mirror.rows) {
			const h = r.a ?? r.b;
			if (!h || r.status === 'same') continue;
			const missing = r.status === 'onlyA' ? label.b : label.a;
			notes.push(
				r.status === 'fine'
					? {
							pid: lastPara(h),
							text: 'Same right for both, different fine print',
							tone: 'warn',
							at: 'after',
						}
					: {
							pid: lastPara(h),
							text: `No mirror: ${missing} has no equivalent — ${r.label}`,
							tone: 'gap',
							at: 'after',
						}
			);
		}
		setNotes(notes);
		return () => setNotes([]);
	}, [mirror, nameA, nameB, setNotes]);

	const status = (r: MirrorRow) =>
		r.status === 'same' ? (
			<Pill>same</Pill>
		) : r.status === 'fine' ? (
			<Pill tone="warn">fine print</Pill>
		) : (
			<Pill tone={r.status === 'onlyA' ? 'a' : 'b'}>
				only {short(r.status === 'onlyA' ? names.a : names.b)}
			</Pill>
		);

	const cell = (h: Hold | null, fine: boolean) =>
		h ? (
			<div
				className={cn('space-y-0.5', fine && 'border-l-2 border-warning bg-warning/10 px-1.5 py-1')}
			>
				<Kind kind="right" />
				{(h.term || h.marks.length > 0) && (
					<p className="text-2xs leading-snug text-muted-foreground">
						{[h.term, ...h.marks].filter(Boolean).join(' · ')}
					</p>
				)}
			</div>
		) : (
			<Hatch>no equivalent</Hatch>
		);

	const main = (
		<>
			<Head
				title="What one party holds — does the other hold it too?"
				lead="Each row is something either party could hold. A dashed slot is what the contract gives one side and not the other."
			/>
			<div className="flex flex-wrap items-center gap-1.5">
				<Stat n={mirror.counts.same} label="same" />
				<Stat n={mirror.counts.onlyA} label={`only ${short(names.a)}`} color={SIDE_COLOR.a} />
				<Stat n={mirror.counts.onlyB} label={`only ${short(names.b)}`} color={SIDE_COLOR.b} />
				<Stat n={mirror.counts.fine} label="different fine print" color="var(--warning)" />
				<span className="ml-auto inline-flex gap-1">
					{[false, true].map((on) => (
						<button
							key={String(on)}
							type="button"
							onClick={() => setDiffOnly(on)}
							className={cn(
								'rounded-full border px-2.5 py-0.5 text-2xs',
								diffOnly === on
									? 'border-primary bg-accent font-semibold text-accent-foreground'
									: 'border-border bg-card text-muted-foreground'
							)}
						>
							{on ? 'Differences' : 'All'}
						</button>
					))}
				</span>
			</div>
			<div className="overflow-hidden rounded-xl border border-border bg-card">
				<div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_7rem] gap-2 border-b border-border bg-secondary px-3 py-2 text-2xs font-semibold text-muted-foreground">
					<span>What can be done</span>
					<span style={{ color: SIDE_COLOR.a }}>{short(names.a)}</span>
					<span style={{ color: SIDE_COLOR.b }}>{short(names.b)}</span>
					<span>Reading</span>
				</div>
				{rows.length === 0 && (
					<p className="px-3 py-6 text-center text-xs text-muted-foreground">
						No right in these families names either party.
					</p>
				)}
				{FAMILIES.map((fam) => {
					const list = rows.filter((r) => r.family === fam.id);
					if (list.length === 0) return null;
					return (
						<Fragment key={fam.id}>
							<p className="px-3 pt-3 pb-1 text-[10px] font-bold tracking-wider text-muted-foreground/80 uppercase">
								{fam.label}
							</p>
							{list.map((r) => {
								const h = (r.a ?? r.b) as Hold;
								const ref = kg.clauses.find((c) => c.id === h.s.clauseId)?.ref;
								const on = picked?.id === r.id;
								return (
									<button
										type="button"
										key={r.id}
										onClick={() => {
											onRow(r.id);
											onOpen(h.s.id);
										}}
										className={cn(
											'grid w-full grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_7rem] items-center gap-2 border-b border-border/60 px-3 py-2 text-left hover:bg-muted/40',
											on && 'border-l-[3px] border-l-primary bg-accent'
										)}
									>
										<span className="min-w-0">
											<span className={cn('block text-xs', on ? 'font-semibold' : 'font-medium')}>
												{r.label}
											</span>
											{ref && <span className="text-2xs font-medium text-primary">{ref}</span>}
										</span>
										{cell(r.a, r.status === 'fine')}
										{cell(r.b, r.status === 'fine')}
										<span>{status(r)}</span>
									</button>
								);
							})}
						</Fragment>
					);
				})}
			</div>
			<p className="text-2xs leading-relaxed text-muted-foreground">
				Only families either party could hold are paired: leaving, assigning, auditing, liability.
				What belongs to a role — making, delivering, paying — is not compared, because there the
				difference is the contract itself.
			</p>
		</>
	);

	return (
		<Frame
			main={main}
			side={picked && <MirrorDetail {...props} r={picked} status={status(picked)} />}
		/>
	);
}

function MirrorDetail({
	kg,
	aId,
	bId,
	names,
	grid,
	shareOf,
	onOpen,
	onAsk,
	onTable,
	r,
	status,
}: ViewProps & { r: MirrorRow; status: ReactNode }) {
	const h = (r.a ?? r.b) as Hold;
	const side = r.a ? 'a' : 'b';
	const holder = side === 'a' ? names.a : names.b;
	const other = side === 'a' ? names.b : names.a;
	const holderId = side === 'a' ? aId : bId;
	const ref = kg.clauses.find((c) => c.id === h.s.clauseId)?.ref;
	const carries = kg.obligations.filter(
		(o) => o.clauseId === h.s.clauseId && o.clauseId && o.burdenPartyId === holderId
	);
	const clauseIds = [...new Set([r.a?.s.clauseId, r.b?.s.clauseId, r.nearest?.s.clauseId])].filter(
		(id): id is string => Boolean(id)
	);
	const lonely = r.status === 'onlyA' || r.status === 'onlyB';

	return (
		<>
			<Card className="space-y-3">
				<div className="space-y-1.5">
					<h4 className="text-sm font-bold">{r.label}</h4>
					<div className="flex flex-wrap gap-1.5">
						{status}
						{ref && <Pill tone="accent">{ref}</Pill>}
					</div>
				</div>
				<Caps>What the contract says</Caps>
				<Quote
					text={h.s.text}
					color={SIDE_COLOR[side]}
					note={
						h.s.evidenceVerified && (
							<p className="text-2xs font-medium text-success">● verified against the text</p>
						)
					}
				/>
				{(h.marks.length > 0 || h.term) && (
					<>
						<Caps>Fine print</Caps>
						<div className="flex flex-wrap gap-1">
							{[h.term, ...h.marks].filter(Boolean).map((m) => (
								<Pill key={m} tone="warn">
									{m}
								</Pill>
							))}
						</div>
					</>
				)}
				{carries.length > 0 && (
					<>
						<Caps>What it carries for {short(holder)}</Caps>
						<ul className="space-y-1.5">
							{carries.slice(0, 3).map((o) => (
								<li key={o.id} className="text-xs">
									<button
										type="button"
										className="text-left hover:underline"
										onClick={() => onOpen(o.id)}
									>
										<Kind kind="obligation" /> {o.action}
									</button>
								</li>
							))}
						</ul>
					</>
				)}
				<Caps>On {short(other)}’s side</Caps>
				{lonely ? (
					<Hatch className="space-y-1 not-italic">
						<p className="text-xs font-semibold text-foreground">No equivalent right.</p>
						{r.nearest && (
							<p>
								Closest: {r.nearest.s.action} ({Math.round(r.nearest.score * 100)}% word overlap).
							</p>
						)}
					</Hatch>
				) : (
					<Quote
						text={(side === 'a' ? r.b : r.a)?.s.text ?? ''}
						color={SIDE_COLOR[side === 'a' ? 'b' : 'a']}
					/>
				)}
				{lonely && (
					<>
						<Caps>How the gap was decided</Caps>
						<p className="text-2xs leading-relaxed text-muted-foreground">
							Compared with the {r.pool} rights {short(other)} holds. None shares{' '}
							{Math.round(MATCH * 100)}% of its wording with this one. Human review: pending.
						</p>
					</>
				)}
			</Card>
			<AskBox
				onAsk={onAsk}
				question={
					lonely
						? `What risk does ${short(other)} run if only ${short(holder)} can “${r.label}”?`
						: `Is “${r.label}” really balanced between both parties?`
				}
			/>
			<MiniGrid
				grid={grid}
				clauseIds={clauseIds}
				activeId={h.s.clauseId}
				ghosts={lonely && h.s.clauseId ? { [h.s.clauseId]: side === 'a' ? 'b' : 'a' } : {}}
				shareOf={shareOf}
				names={names}
				caption={`The table as it is today. The dashed square is the missing mirror in ${short(other)}’s lane.`}
				onOpen={onOpen}
				onExpand={onTable}
			/>
		</>
	);
}
