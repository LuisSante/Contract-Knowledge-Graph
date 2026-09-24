'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { KIND_COLORS } from '@/features/docx/components/clause-analyzer/constants';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import type { GridMark, StatementGrid } from '@/features/docx/utils/knowledge/statement-grid';
import type { Side } from '@/features/docx/utils/knowledge/mirror';

interface MiniGridProps {
	grid: StatementGrid;
	clauseIds: string[];
	activeId?: string | null;
	/** Lane that is missing a mark in that clause, drawn as a dashed slot. */
	ghosts?: Record<string, Side>;
	extra?: Record<string, ReactNode>;
	shareOf: (clauseId: string | null) => { a: number; b: number } | null;
	names: Record<Side, string>;
	caption: string;
	onOpen: (clauseId: string) => void;
	onExpand: () => void;
}

const SHOWN = new Set(['obligation', 'right', 'prohibition', 'condition']);

function Lane({ marks, side, ghost }: { marks: GridMark[]; side: Side; ghost: boolean }) {
	const shown = marks.filter((m) => SHOWN.has(m.kind));
	return (
		<div className={cn('flex w-20 flex-wrap gap-[3px]', side === 'a' && 'flex-row-reverse')}>
			{shown.map((m) => (
				<span
					key={m.id}
					className="size-2.5 rounded-[2px]"
					style={{ backgroundColor: KIND_COLORS[m.kind] }}
				/>
			))}
			{ghost && (
				<span
					className="size-2.5 rounded-[2px] border border-dashed bg-card"
					style={{ borderColor: KIND_COLORS.right }}
				/>
			)}
		</div>
	);
}

/** The clause × party table as it is today, cut down to the rows the view is about. */
export function MiniGrid({
	grid,
	clauseIds,
	activeId,
	ghosts = {},
	extra = {},
	shareOf,
	names,
	caption,
	onOpen,
	onExpand,
}: MiniGridProps) {
	const rows = clauseIds
		.map((id) => grid.rows.find((r) => r.clauseId === id))
		.filter((r): r is NonNullable<typeof r> => Boolean(r));
	if (rows.length === 0) return null;

	return (
		<div className="overflow-hidden rounded-xl border border-border bg-card">
			<div className="flex items-center justify-between px-3 py-2">
				<p className="text-xs font-bold">Table · clauses × parties</p>
				<button
					type="button"
					onClick={onExpand}
					className="text-2xs font-medium text-primary hover:underline"
				>
					open ↗
				</button>
			</div>
			<div className="flex items-center gap-1.5 bg-secondary px-3 py-1 text-[9px] font-bold">
				<span className="flex-1 text-muted-foreground">CLAUSE</span>
				<span className="w-20 text-right" style={{ color: SIDE_COLOR.a }}>
					{short(names.a)}
				</span>
				<span className="w-px self-stretch bg-border" />
				<span className="w-20" style={{ color: SIDE_COLOR.b }}>
					{short(names.b)}
				</span>
				<span className="w-8" />
			</div>
			{rows.map((row) => {
				const id = row.clauseId as string;
				const share = shareOf(id);
				return (
					<button
						type="button"
						key={id}
						onClick={() => onOpen(id)}
						className={cn(
							'flex w-full items-start gap-1.5 border-b border-border/60 px-3 py-1.5 text-left hover:bg-muted/40',
							id === activeId && 'bg-accent ring-1 ring-primary/40 ring-inset'
						)}
					>
						<span className="min-w-0 flex-1">
							<span className="block truncate text-2xs">{row.heading}</span>
							{share && (
								<span className="relative mt-1 block h-[3px] w-14 rounded-full bg-border">
									<span
										className="absolute inset-y-0 right-1/2 rounded-l-full"
										style={{ width: `${share.a * 50}%`, backgroundColor: SIDE_COLOR.a }}
									/>
									<span
										className="absolute inset-y-0 left-1/2 rounded-r-full"
										style={{ width: `${share.b * 50}%`, backgroundColor: SIDE_COLOR.b }}
									/>
								</span>
							)}
						</span>
						<Lane marks={row.marks.a} side="a" ghost={ghosts[id] === 'a'} />
						<span className="w-px self-stretch bg-border" />
						<Lane marks={row.marks.b} side="b" ghost={ghosts[id] === 'b'} />
						<span className="flex w-8 justify-end">{extra[id]}</span>
					</button>
				);
			})}
			<p className="px-3 py-2 text-2xs leading-snug text-muted-foreground">{caption}</p>
		</div>
	);
}
