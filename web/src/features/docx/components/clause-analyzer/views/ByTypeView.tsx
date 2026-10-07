'use client';

import { Fragment, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { KIND_COLORS } from '@/features/docx/components/clause-analyzer/constants';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import {
	FavourPill,
	KIND_PLURAL,
	ReciprocalToggle,
	ViewHeader,
	relationOf,
} from '@/features/docx/components/clause-analyzer/views/favour-bits';
import {
	DEONTIC_KINDS,
	byImportance,
	tallyClauses,
	totalOf,
	typeVerdict,
	type ClauseTally,
	type Favour,
	type TypeVerdict,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind } from '@/types/knowledge';
import type { ViewProps } from '@/features/docx/components/clause-analyzer/views/types';

const PAGE = 10;
const BAR = 64;

const trim = (text: string, max = 180) =>
	text.length > max ? `${text.slice(0, max).trim()}…` : text;

/** Propuesta 2: obligations, rights and prohibitions never added together. */
export function ByTypeView({
	kg,
	grid,
	names,
	importance,
	lanes,
	showShared,
	onShowShared,
	onOpen,
}: ViewProps) {
	const [limit, setLimit] = useState(PAGE);
	const [open, setOpen] = useState<{ clauseId: string; kind: DeonticKind } | null>(null);

	const tallies = useMemo(
		() => byImportance(tallyClauses(grid, kg, lanes), importance),
		[grid, kg, lanes, importance]
	);
	const total = useMemo(() => totalOf(tallies), [tallies]);
	const peak = useMemo(
		() =>
			Object.fromEntries(
				DEONTIC_KINDS.map((kind) => [
					kind,
					Math.max(1, ...tallies.map((t) => Math.max(t.count[kind].a, t.count[kind].b))),
				])
			) as Record<DeonticKind, number>,
		[tallies]
	);

	const note = (verdict: TypeVerdict, byKind: Record<DeonticKind, Favour>) => {
		if (verdict === 'tie') return 'equal in every type';
		if (verdict !== 'mixed') return 'loses in no type';
		return DEONTIC_KINDS.filter((kind) => byKind[kind] !== 'tie')
			.map((kind) => `${KIND_PLURAL[kind].toLowerCase()} → ${short(names[byKind[kind] as Side])}`)
			.join(' · ');
	};

	const cell = (t: ClauseTally, kind: DeonticKind) => {
		const { a, b } = t.count[kind];
		const isOpen = open?.clauseId === t.clauseId && open.kind === kind;
		if (a + b === 0)
			return (
				<span className="flex w-[132px] justify-center text-2xs text-muted-foreground/60">—</span>
			);
		const tone = (side: Side) =>
			(side === 'a' ? a > b : b > a) ? { color: SIDE_COLOR[side], fontWeight: 700 } : undefined;
		return (
			<button
				type="button"
				onClick={() => setOpen(isOpen ? null : { clauseId: t.clauseId, kind })}
				className={cn(
					'flex w-[132px] items-center justify-center gap-1.5 rounded-md py-1 text-2xs tabular-nums hover:bg-muted/50',
					isOpen && 'bg-accent'
				)}
				title={`${KIND_PLURAL[kind]}: ${a} serve ${short(names.a)}, ${b} serve ${short(names.b)} — click to list them`}
			>
				<span className="w-5 text-right text-muted-foreground" style={tone('a')}>
					{a}
				</span>
				<span className="relative h-1.5" style={{ width: BAR }}>
					<span className="absolute inset-y-0 left-1/2 w-px bg-border" />
					<span
						className="absolute inset-y-0 right-1/2 rounded-l-full"
						style={{ width: (a / peak[kind]) * (BAR / 2), backgroundColor: SIDE_COLOR.a }}
					/>
					<span
						className="absolute inset-y-0 left-1/2 rounded-r-full"
						style={{ width: (b / peak[kind]) * (BAR / 2), backgroundColor: SIDE_COLOR.b }}
					/>
				</span>
				<span className="w-5 text-left text-muted-foreground" style={tone('b')}>
					{b}
				</span>
			</button>
		);
	};

	const contract = typeVerdict(total);
	const wins = DEONTIC_KINDS.filter((kind) => contract.byKind[kind] === contract.verdict).length;
	const contractLine =
		contract.verdict === 'tie'
			? 'the two parties are even in every type.'
			: contract.verdict === 'mixed'
				? `it depends on the type (${note(contract.verdict, contract.byKind)}).`
				: `${short(names[contract.verdict])} wins in ${wins === 3 ? 'all three types' : `${wins} types and loses in none`}.`;

	return (
		<div className="min-h-0 flex-1 overflow-auto">
			<div className="min-w-[760px] space-y-3 p-4">
				<ViewHeader
					title="One type at a time, side by side"
					lead="Obligations, rights and prohibitions are never added together: each type has its own column and, in each, how many statements serve each party."
				>
					<div className="flex items-start gap-3 rounded-lg bg-secondary px-3 py-2">
						<span className="shrink-0 text-xs font-bold">Weight-free rule</span>
						<p className="text-2xs leading-relaxed text-muted-foreground">
							A party wins the clause if it loses in no type and wins in at least one. If it wins
							one and loses another, the view says “depends on the type”: choosing between them
							would mean putting weights on them.
						</p>
					</div>
					<ReciprocalToggle on={showShared} onChange={onShowShared} />
				</ViewHeader>

				<div className="overflow-hidden rounded-xl border border-border bg-card">
					<div className="flex items-center gap-2 bg-secondary px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase">
						<span className="flex-1 text-muted-foreground">
							Clause <span className="font-normal normal-case">· most important first ↓</span>
						</span>
						{DEONTIC_KINDS.map((kind) => (
							<span key={kind} className="flex w-[132px] flex-col items-center">
								<span className="flex items-center gap-1">
									<span
										className="size-2 rounded-[2px]"
										style={{ backgroundColor: KIND_COLORS[kind] }}
									/>
									{KIND_PLURAL[kind]}
								</span>
								<span className="text-[9px] font-medium normal-case">
									<span style={{ color: SIDE_COLOR.a }}>{short(names.a)}</span>
									<span className="text-muted-foreground"> · </span>
									<span style={{ color: SIDE_COLOR.b }}>{short(names.b)}</span>
								</span>
							</span>
						))}
						<span className="w-40 text-muted-foreground">Weight-free verdict</span>
					</div>
					{tallies.slice(0, limit).map((t) => {
						const { verdict, byKind } = typeVerdict(t.count);
						const side = verdict === 'a' || verdict === 'b' ? verdict : null;
						const listed =
							open?.clauseId === t.clauseId ? t.served.filter((s) => s.kind === open.kind) : [];
						return (
							<Fragment key={t.clauseId}>
								<div
									className={cn(
										'flex items-center gap-2 border-b border-border/60 border-l-[3px] px-3 py-2',
										verdict === 'mixed' && 'bg-warning/10'
									)}
									style={{
										borderLeftColor: side
											? SIDE_COLOR[side]
											: verdict === 'mixed'
												? 'var(--warning)'
												: 'transparent',
									}}
								>
									<button
										type="button"
										onClick={() => onOpen(t.clauseId)}
										className="min-w-0 flex-1 text-left hover:underline"
									>
										<span className="block truncate text-xs font-medium">{t.heading}</span>
										{t.section && (
											<span className="text-2xs text-muted-foreground">{t.section}</span>
										)}
									</button>
									{DEONTIC_KINDS.map((kind) => (
										<Fragment key={kind}>{cell(t, kind)}</Fragment>
									))}
									<span className="w-40 space-y-0.5">
										<FavourPill favour={verdict} names={names} />
										<span className="block text-[10px] leading-snug text-muted-foreground">
											{note(verdict, byKind)}
										</span>
									</span>
								</div>
								{listed.length > 0 && (
									<div className="space-y-1.5 border-b border-border/60 bg-muted/30 px-6 py-2">
										{listed.map((s) => (
											<button
												type="button"
												key={s.mark.id}
												onClick={() => onOpen(s.mark.id)}
												className="block w-full text-left hover:opacity-80"
											>
												<span className="text-2xs font-semibold">{relationOf(s, names)}</span>
												<span className="block text-2xs text-muted-foreground italic">
													«{trim(s.text)}»
												</span>
											</button>
										))}
									</div>
								)}
							</Fragment>
						);
					})}
				</div>

				<p className="text-2xs text-muted-foreground">
					{tallies.length > limit && (
						<button
							type="button"
							onClick={() => setLimit((n) => n + PAGE)}
							className="mr-3 font-medium text-primary hover:underline"
						>
							↓ {tallies.length - limit} more clauses
						</button>
					)}
					Across the contract:{' '}
					{DEONTIC_KINDS.map(
						(kind) => `${KIND_PLURAL[kind].toLowerCase()} ${total[kind].a}·${total[kind].b}`
					).join(', ')}{' '}
					— {contractLine}
				</p>
			</div>
		</div>
	);
}
