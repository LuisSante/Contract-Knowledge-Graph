'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { KIND_COLORS } from '@/features/docx/components/clause-analyzer/constants';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import {
	KIND_PLURAL,
	ReciprocalToggle,
	ViewHeader,
} from '@/features/docx/components/clause-analyzer/views/favour-bits';
import {
	DEONTIC_KINDS,
	byImportance,
	countOf,
	favourOf,
	tallyClauses,
	type Served,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind } from '@/types/knowledge';
import {
	MarkTooltip,
	useMarkHover,
} from '@/features/docx/components/clause-analyzer/grid/MarkTooltip';
import type { ViewProps } from '@/features/docx/components/clause-analyzer/views/types';

const PAGE = 12;
/** Room each arm of the balance has, in pixels. */
const ARM = 250;

/** Propuesta 3: one balance per clause, the name in the middle. */
export function BalanceView({
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
	const rows = tallies
		.map((t) => ({ t, count: countOf(t.count, kinds) }))
		.filter(({ count }) => count.a + count.b > 0);
	const everything = rows.flatMap(({ t }) => t.served);
	const contract = rows.reduce((sum, { count }) => ({ a: sum.a + count.a, b: sum.b + count.b }), {
		a: 0,
		b: 0,
	});
	const peak = Math.max(1, ...rows.map(({ count }) => Math.max(count.a, count.b)));

	/** One arm: a segment per kind, a cell per statement, growing away from the name. */
	const arm = (items: Served[], side: Side, unit: number, total: number) => {
		const mine = items.filter((s) => kinds.includes(s.kind) && (s.to === side || s.to === 'both'));
		return (
			<div
				className={cn('flex items-center gap-1.5', side === 'a' ? 'flex-row-reverse' : '')}
				style={{ width: ARM + 28 }}
			>
				<div className={cn('flex gap-[2px]', side === 'a' && 'flex-row-reverse')}>
					{DEONTIC_KINDS.filter((kind) => kinds.includes(kind)).map((kind) => {
						const cells = mine.filter((s) => s.kind === kind);
						if (cells.length === 0) return null;
						return (
							<div
								key={kind}
								className={cn('relative flex h-4 gap-px', side === 'a' && 'flex-row-reverse')}
							>
								{/* Below 3px a cell cannot be pointed at: the kind becomes one block. */}
								{unit >= 3 ? (
									cells.map((s) => (
										<button
											type="button"
											key={`${s.mark.id}-${side}`}
											onClick={() => onOpen(s.mark.id)}
											onMouseEnter={(event) => show(event, s.mark)}
											onMouseMove={(event) => show(event, s.mark)}
											onMouseLeave={hide}
											className="h-full hover:brightness-90"
											style={{ width: unit - 1, backgroundColor: KIND_COLORS[kind] }}
										/>
									))
								) : (
									<span
										className="h-full"
										style={{ width: cells.length * unit, backgroundColor: KIND_COLORS[kind] }}
									/>
								)}
								{cells.length * unit >= 14 && (
									<span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-white">
										{cells.length}
									</span>
								)}
							</div>
						);
					})}
				</div>
				<span
					className="text-2xs font-semibold tabular-nums"
					style={{ color: total ? SIDE_COLOR[side] : 'var(--muted-foreground)' }}
				>
					{total}
				</span>
			</div>
		);
	};

	const name = (label: string, favour: ReturnType<typeof favourOf>, onClick?: () => void) => {
		const side = favour === 'tie' ? null : favour;
		return (
			<button
				type="button"
				onClick={onClick}
				className="flex w-52 shrink-0 items-center justify-center gap-1.5 truncate rounded-md px-2 py-0.5 text-2xs font-medium hover:brightness-95"
				style={
					side
						? { backgroundColor: `${SIDE_COLOR[side]}1f`, color: SIDE_COLOR[side] }
						: { backgroundColor: 'var(--secondary)' }
				}
			>
				{side === 'a' && '◀'}
				{!side && '='}
				<span className="truncate">{label}</span>
				{side === 'b' && '▶'}
			</button>
		);
	};

	return (
		<div ref={containerRef} className="relative min-h-0 flex-1 overflow-auto">
			<div className="min-w-[780px] space-y-3 p-4">
				<ViewHeader
					title="Balance: where each clause leans"
					lead={`Left of the name, what ${short(names.a)} gains; right of it, what ${short(names.b)} gains. Each cell is one statement, coloured by its type. No weights.`}
				>
					<div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
						Show
						{DEONTIC_KINDS.map((kind) => {
							const on = kinds.includes(kind);
							return (
								<button
									type="button"
									key={kind}
									onClick={() =>
										setKinds((prev) =>
											on
												? prev.filter((k) => k !== kind)
												: DEONTIC_KINDS.filter((k) => k === kind || prev.includes(k))
										)
									}
									className={cn(
										'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs',
										on ? 'border-foreground/30 text-foreground' : 'border-border opacity-50'
									)}
								>
									<span
										className="size-2.5 rounded-[2px]"
										style={{ backgroundColor: KIND_COLORS[kind] }}
									/>
									{KIND_PLURAL[kind]}
									{on && <span className="text-2xs">✓</span>}
								</button>
							);
						})}
						<span className="ml-auto">
							<ReciprocalToggle on={showShared} onChange={onShowShared} />
						</span>
					</div>
				</ViewHeader>

				<div className="flex items-center justify-center gap-2 rounded-xl bg-secondary py-3">
					{arm(everything, 'a', ARM / Math.max(1, contract.a, contract.b), contract.a)}
					{name('The whole contract', favourOf(contract))}
					{arm(everything, 'b', ARM / Math.max(1, contract.a, contract.b), contract.b)}
				</div>

				<div className="flex items-center justify-center gap-2 text-[10px] font-bold tracking-wider uppercase">
					<span className="text-right" style={{ width: ARM + 28, color: SIDE_COLOR.a }}>
						◀ What {short(names.a)} gains
					</span>
					<span className="w-52 text-center text-muted-foreground">
						Clause <span className="font-normal normal-case">· most important first ↓</span>
					</span>
					<span style={{ width: ARM + 28, color: SIDE_COLOR.b }}>
						What {short(names.b)} gains ▶
					</span>
				</div>

				<div className="space-y-1.5">
					{rows.slice(0, limit).map(({ t, count }) => {
						const label = t.section ? `${t.heading} ${t.section}` : t.heading;
						return (
							<div key={t.clauseId} className="flex items-center justify-center gap-2">
								{arm(t.served, 'a', ARM / peak, count.a)}
								{name(label, favourOf(count), () => onOpen(t.clauseId))}
								{arm(t.served, 'b', ARM / peak, count.b)}
							</div>
						);
					})}
				</div>

				<p className="text-2xs text-muted-foreground">
					Length is the number of statements, not their value: a 25% surcharge and a written notice
					measure the same.
					{rows.length > limit && (
						<button
							type="button"
							onClick={() => setLimit((n) => n + PAGE)}
							className="ml-3 font-medium text-primary hover:underline"
						>
							↓ {rows.length - limit} more clauses
						</button>
					)}
				</p>
			</div>
			<MarkTooltip hover={hover} />
		</div>
	);
}
