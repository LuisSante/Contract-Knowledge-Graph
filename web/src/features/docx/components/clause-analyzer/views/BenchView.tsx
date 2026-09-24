'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import { useBench } from '@/features/docx/hooks/useBench';
import { shapeBench, type BenchRow, type Group } from '@/features/docx/utils/knowledge/benchmark';
import type { DocNote } from '@/features/docx/hooks/useDocNotes';
import { AskBox } from '@/features/docx/components/clause-analyzer/views/AskBox';
import { MiniGrid } from '@/features/docx/components/clause-analyzer/views/MiniGrid';
import {
	Caps,
	Card,
	Frame,
	Head,
	PartyTag,
	Pill,
	Quote,
	SIDE_COLOR,
	short,
	Stat,
} from '@/features/docx/components/clause-analyzer/views/bits';
import type { ViewProps } from '@/features/docx/components/clause-analyzer/views/types';

const SECTIONS: Array<{ label: string; groups: Group[] }> = [
	{ label: 'Differs from the usual', groups: ['rare', 'missing'] },
	{ label: 'Usual', groups: ['usual'] },
];

function Dots({ hits, total, size = 4 }: { hits: number; total: number; size?: number }) {
	return (
		<span className="flex flex-wrap gap-[2px]">
			{Array.from({ length: total }, (_, i) => (
				<span
					key={i}
					className={cn('rounded-[1px]', i < hits ? 'bg-primary' : 'bg-border')}
					style={{ width: size, height: size }}
				/>
			))}
		</span>
	);
}

export function BenchView(props: ViewProps) {
	const { docId, kg, aId, bId, names, row, onRow, onOpen, onOpenParas } = props;
	const setNotes = useClauseAnalyzerStore((s) => s.setNotes);
	const { bench, loading } = useBench(docId, true);
	const rows = useMemo(() => (bench ? shapeBench(bench, kg, aId, bId) : []), [bench, kg, aId, bId]);
	const [showAbsent, setShowAbsent] = useState(false);

	const picked =
		rows.find((r) => r.key === row) ?? rows.find((r) => r.group === 'rare') ?? rows[0] ?? null;
	const type = bench?.contractType ?? '';
	const peers = bench?.peers ?? 0;

	useEffect(() => {
		const notes: DocNote[] = [];
		for (const r of rows) {
			const pid = r.paragraphIds[0];
			if (!pid) continue;
			if (r.ids.length === 0)
				notes.push({
					pid,
					text: `CUAD marks “${r.label}” here — not extracted into the graph`,
					tone: 'warn',
					at: 'after',
				});
			else if (r.group === 'rare')
				notes.push({
					pid,
					text: `${r.label} · only ${r.hits} of ${peers} ${type} contracts have it`,
					tone: 'step',
					at: 'before',
				});
		}
		setNotes(notes);
		return () => setNotes([]);
	}, [rows, peers, type, setNotes]);

	if (loading)
		return <p className="p-6 text-sm text-muted-foreground">Loading the CUAD reference…</p>;
	if (!bench)
		return (
			<p className="p-6 text-sm text-muted-foreground">
				This contract is not in CUAD, so there is nothing to compare it with.
			</p>
		);

	const count = (g: Group) => rows.filter((r) => r.group === g).length;
	const unmapped = rows.filter((r) => r.present && r.ids.length === 0).length;
	const absent = rows.filter((r) => r.group === 'absent');

	const serves = (r: BenchRow) =>
		!r.present ? (
			<span className="text-2xs text-muted-foreground">—</span>
		) : r.ids.length === 0 ? (
			<Pill tone="warn">not extracted</Pill>
		) : r.sides.length === 0 ? (
			<span className="text-2xs text-muted-foreground">no party named</span>
		) : (
			<span className="flex flex-wrap gap-2">
				{r.sides.map((s) => (
					<PartyTag key={s} side={s} name={short(names[s])} />
				))}
			</span>
		);

	const line = (r: BenchRow) => {
		const on = picked?.key === r.key;
		return (
			<button
				type="button"
				key={r.key}
				onClick={() => {
					onRow(r.key);
					if (r.ids[0]) onOpen(r.ids[0]);
					else if (r.paragraphIds.length) onOpenParas(r.paragraphIds);
				}}
				className={cn(
					'grid w-full grid-cols-[minmax(0,1.3fr)_4rem_minmax(0,1fr)_9rem] items-center gap-2 border-b border-border/60 px-3 py-2 text-left hover:bg-muted/40',
					on && 'border-l-[3px] border-l-primary bg-accent'
				)}
			>
				<span className="min-w-0">
					<span className={cn('block text-xs', on ? 'font-semibold' : 'font-medium')}>
						{r.label}
					</span>
					{r.refs.length > 0 && (
						<span className="text-2xs font-medium text-primary">
							{r.refs.slice(0, 2).join(' · ')}
						</span>
					)}
				</span>
				<span>{r.present ? <Pill>here</Pill> : <Pill dashed>missing</Pill>}</span>
				<span>{serves(r)}</span>
				<span className="space-y-1">
					<span className="block text-2xs font-semibold">
						{r.hits}/{peers}
					</span>
					<Dots hits={r.hits} total={peers} size={3} />
				</span>
			</button>
		);
	};

	const main = (
		<>
			<Head
				title="What does this contract have that others don’t — and what is missing?"
				lead={`Reference: the ${peers} ${type} agreements in CUAD, labelled by lawyers. Each row is a topic reviewers always check; when it is missing, the row stays.`}
			/>
			<div className="flex flex-wrap gap-1.5">
				<Stat n={count('rare')} label="present and uncommon" />
				<Stat n={count('missing')} label="missing, common elsewhere" />
				<Stat n={unmapped} label="marked by CUAD, not extracted" color="var(--warning)" />
			</div>
			<div className="overflow-hidden rounded-xl border border-border bg-card">
				<div className="grid grid-cols-[minmax(0,1.3fr)_4rem_minmax(0,1fr)_9rem] gap-2 border-b border-border bg-secondary px-3 py-2 text-2xs font-semibold text-muted-foreground">
					<span>Topic</span>
					<span>Here</span>
					<span>Serves</span>
					<span>
						In {peers} {type}
					</span>
				</div>
				{SECTIONS.map((sec) => {
					const list = rows.filter((r) => sec.groups.includes(r.group));
					if (list.length === 0) return null;
					return (
						<Fragment key={sec.label}>
							<p className="px-3 pt-3 pb-1 text-[10px] font-bold tracking-wider text-muted-foreground/80 uppercase">
								{sec.label}
							</p>
							{list.map(line)}
						</Fragment>
					);
				})}
				{absent.length > 0 && (
					<>
						<button
							type="button"
							onClick={() => setShowAbsent((v) => !v)}
							className="flex w-full items-center justify-between bg-background px-3 py-2 text-left text-2xs text-muted-foreground"
						>
							<span>
								ABSENT AND RARE ·{' '}
								{absent
									.slice(0, 3)
									.map((r) => `${r.label.toLowerCase()} ${r.hits}/${peers}`)
									.join(' · ')}
								{absent.length > 3 && ` · and ${absent.length - 3} more`}
							</span>
							<span className="font-semibold text-primary">{showAbsent ? 'Hide' : 'Show'}</span>
						</button>
						{showAbsent && absent.map(line)}
					</>
				)}
			</div>
			<p className="text-2xs leading-relaxed text-muted-foreground">
				Order: what departs from the usual first — present and rare, or absent and common. The dots
				count contracts, they do not score: {`${rows[0]?.hits ?? 0}/${peers}`} means{' '}
				{rows[0]?.hits ?? 0} contracts.
			</p>
		</>
	);

	return (
		<Frame
			main={main}
			side={picked && <BenchDetail {...props} r={picked} type={type} peers={peers} />}
		/>
	);
}

function BenchDetail({
	names,
	grid,
	kg,
	shareOf,
	onOpen,
	onAsk,
	onTable,
	r,
	type,
	peers,
}: ViewProps & { r: BenchRow; type: string; peers: number }) {
	const others = r.present ? r.hits - 1 : r.hits;
	const pool = r.present ? peers - 1 : peers;
	const one = r.sides.length === 1 ? r.sides[0] : null;
	const clauseIds = [
		...new Set(
			[...kg.obligations, ...kg.rights, ...kg.prohibitions]
				.filter((s) => r.ids.includes(s.id))
				.map((s) => s.clauseId)
				.filter((id): id is string => Boolean(id))
		),
	];
	const side = one ?? (r.sides[0] || 'a');

	return (
		<>
			<Card className="space-y-3">
				<div className="space-y-1.5">
					<h4 className="text-sm font-bold">{r.label}</h4>
					<div className="flex flex-wrap gap-1.5">
						<Pill>
							{r.group === 'rare'
								? 'uncommon'
								: r.group === 'missing'
									? 'commonly included'
									: r.group === 'usual'
										? 'usual'
										: 'rare'}{' '}
							· {r.hits} of {peers}
						</Pill>
						{one && <Pill tone={one}>only {short(names[one])}</Pill>}
					</div>
				</div>
				<Caps>In this contract</Caps>
				{r.present ? (
					<Quote
						text={r.spans[0] ?? ''}
						color={SIDE_COLOR[side]}
						note={
							<p className="text-2xs text-muted-foreground">
								span marked by CUAD{r.refs[0] ? ` · ${r.refs[0]}` : ''}
							</p>
						}
					/>
				) : (
					<p className="text-xs text-muted-foreground">
						Not present. CUAD checked this topic and found no span.
					</p>
				)}
				<Caps>
					In the other {pool} {type} contracts
				</Caps>
				<Dots hits={others} total={pool} size={8} />
				<p className="text-2xs leading-relaxed text-muted-foreground">
					{others} of the other {pool} include it. Who it favours there: unknown — CUAD marks the
					topic, not the side.
				</p>
				{r.present && r.ids.length === 0 && (
					<p className="rounded-md bg-warning/15 px-2 py-1.5 text-2xs text-warning-foreground">
						The graph has no statement in these paragraphs: the extraction missed it.
					</p>
				)}
				<p className="flex items-start gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-2xs text-muted-foreground">
					<span className="mt-1 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
					Reference: CUAD labels (Hendrycks et al., 2021). The model does not produce them.
				</p>
			</Card>
			<AskBox
				onAsk={onAsk}
				question={
					one
						? `Is it normal that only ${short(names[one])} gets “${r.label.toLowerCase()}”? What could ${short(names[one === 'a' ? 'b' : 'a'])} ask in return?`
						: `How does “${r.label.toLowerCase()}” in this contract compare with similar ${type} agreements?`
				}
			/>
			<MiniGrid
				grid={grid}
				clauseIds={clauseIds}
				activeId={clauseIds[0]}
				shareOf={shareOf}
				names={names}
				caption={`The table as it is today, for the clauses CUAD marks as “${r.label.toLowerCase()}”.`}
				onOpen={onOpen}
				onExpand={onTable}
			/>
		</>
	);
}
