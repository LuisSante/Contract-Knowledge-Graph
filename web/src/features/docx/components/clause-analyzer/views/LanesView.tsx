'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { KIND_COLORS } from '@/features/docx/components/clause-analyzer/constants';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import {
	FavourPill,
	KIND_PLURAL,
	KindSquare,
	ReciprocalToggle,
	ViewHeader,
} from '@/features/docx/components/clause-analyzer/views/favour-bits';
import {
	DEONTIC_KINDS,
	byImportance,
	countOf,
	favourOf,
	tallyClauses,
	totalOf,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind } from '@/types/knowledge';
import {
	MarkTooltip,
	useMarkHover,
} from '@/features/docx/components/clause-analyzer/grid/MarkTooltip';
import type { ViewProps } from '@/features/docx/components/clause-analyzer/views/types';

const PAGE = 10;

/** Propuesta 1: the Table turned round — each mark sits with the party it serves. */
export function LanesView({
	kg,
	grid,
	names,
	importance,
	lanes,
	showShared,
	onShowShared,
	onOpen,
}: ViewProps) {
	const [kinds, setKinds] = useState<DeonticKind[]>(DEONTIC_KINDS);
	const [limit, setLimit] = useState(PAGE);
	const { containerRef, hover, show, hide } = useMarkHover(kg, grid);

	const tallies = useMemo(
		() => byImportance(tallyClauses(grid, kg, lanes), importance),
		[grid, kg, lanes, importance]
	);
	const total = useMemo(() => totalOf(tallies), [tallies]);
	const rows = tallies
		.map((t) => ({ t, count: countOf(t.count, kinds) }))
		.filter(({ count }) => count.a + count.b > 0);
	const favours = { a: 0, b: 0, tie: 0 };
	for (const { count } of rows) favours[favourOf(count)] += 1;

	const filter = (label: string, value: DeonticKind[], color?: string) => {
		const on = value.length === kinds.length && value.every((k) => kinds.includes(k));
		const count = countOf(total, value);
		return (
			<button
				type="button"
				key={label}
				onClick={() => setKinds(value)}
				className={cn(
					'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs',
					on ? 'border border-border bg-card font-semibold shadow-sm' : 'text-muted-foreground'
				)}
			>
				{color && <span className="size-2.5 rounded-[2px]" style={{ backgroundColor: color }} />}
				{label}
				<span className="tabular-nums" style={{ color: SIDE_COLOR.a }}>
					{count.a}
				</span>
				<span className="opacity-40">·</span>
				<span className="tabular-nums" style={{ color: SIDE_COLOR.b }}>
					{count.b}
				</span>
			</button>
		);
	};

	const lane = (row: (typeof rows)[number], side: Side) => (
		<div
			className={cn('flex flex-wrap content-start gap-1', side === 'a' && 'flex-row-reverse')}
			style={{ width: 196 }}
		>
			{row.t.served
				.filter((s) => kinds.includes(s.kind) && (s.to === side || s.to === 'both'))
				.map((s) => (
					<KindSquare
						key={`${s.mark.id}-${side}`}
						kind={s.kind}
						onClick={() => onOpen(s.mark.id)}
						onEnter={(event) => show(event, s.mark)}
						onLeave={hide}
					/>
				))}
		</div>
	);

	return (
		<div ref={containerRef} className="relative min-h-0 flex-1 overflow-auto">
			<div className="min-w-[680px] space-y-3 p-4">
				<ViewHeader
					title="Who does each clause favour?"
					lead="Each mark sits with the party it serves: its rights, what it is owed and what protects it. Who has to honour it shows on hover. No weights: every statement counts once."
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="inline-flex rounded-lg border border-border bg-secondary p-[3px]">
							{filter('All', DEONTIC_KINDS)}
							{DEONTIC_KINDS.map((kind) => filter(KIND_PLURAL[kind], [kind], KIND_COLORS[kind]))}
						</div>
						<ReciprocalToggle on={showShared} onChange={onShowShared} />
					</div>
				</ViewHeader>

				<div className="overflow-hidden rounded-xl border border-border bg-card">
					<div className="flex items-center gap-3 bg-secondary px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase">
						<span className="flex-1 text-muted-foreground">
							Clause <span className="font-normal normal-case">· most important first ↓</span>
						</span>
						<span className="text-right" style={{ width: 196, color: SIDE_COLOR.a }}>
							What {short(names.a)} gains
						</span>
						<span className="w-px self-stretch bg-border" />
						<span style={{ width: 196, color: SIDE_COLOR.b }}>What {short(names.b)} gains</span>
						<span className="w-28 text-muted-foreground">Favours</span>
					</div>
					{rows.slice(0, limit).map((row) => {
						const favour = favourOf(row.count);
						return (
							<div
								key={row.t.clauseId}
								className="flex items-start gap-3 border-b border-border/60 border-l-[3px] px-3 py-2"
								style={{
									borderLeftColor: favour === 'tie' ? 'transparent' : SIDE_COLOR[favour],
								}}
							>
								<button
									type="button"
									onClick={() => onOpen(row.t.clauseId)}
									className="min-w-0 flex-1 text-left hover:underline"
								>
									<span className="block truncate text-xs font-medium">{row.t.heading}</span>
									{row.t.section && (
										<span className="text-2xs text-muted-foreground">{row.t.section}</span>
									)}
								</button>
								{lane(row, 'a')}
								<span className="w-px self-stretch bg-border" />
								{lane(row, 'b')}
								<span className="w-28">
									<FavourPill favour={favour} count={row.count} names={names} />
								</span>
							</div>
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
					Across the contract: {favours.a} clauses favour {short(names.a)}, {favours.tie} tie and{' '}
					{favours.b} favour {short(names.b)}.
				</p>
			</div>
			<MarkTooltip hover={hover} />
		</div>
	);
}
