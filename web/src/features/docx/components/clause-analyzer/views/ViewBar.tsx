'use client';

import { cn } from '@/lib/utils';
import { VIEWS, type View } from '@/features/docx/hooks/useAnalyzerView';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import type { Side } from '@/features/docx/utils/knowledge/mirror';

interface ViewBarProps {
	view: View;
	onView: (view: View) => void;
	reader: Side;
	onReader: (side: Side) => void;
	names: Record<Side, string>;
}

export function ViewBar({ view, onView, reader, onReader, names }: ViewBarProps) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
			<div
				role="tablist"
				className="inline-flex rounded-lg border border-border bg-secondary p-[3px]"
			>
				{VIEWS.map((v) => (
					<button
						key={v.id}
						type="button"
						role="tab"
						aria-selected={view === v.id}
						onClick={() => onView(v.id)}
						className={cn(
							'rounded-md px-3 py-1 text-xs font-medium',
							view === v.id
								? 'border border-border bg-card font-semibold text-primary shadow-sm'
								: 'text-muted-foreground hover:text-foreground'
						)}
					>
						{v.label}
					</button>
				))}
			</div>
			<div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
				Read as
				{(['a', 'b'] as const).map((side) => (
					<button
						key={side}
						type="button"
						onClick={() => onReader(side)}
						className={cn(
							'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5',
							reader === side ? 'font-semibold text-foreground' : 'border-border bg-card'
						)}
						style={
							reader === side
								? { borderColor: SIDE_COLOR[side], backgroundColor: `${SIDE_COLOR[side]}1a` }
								: undefined
						}
					>
						<span className="size-1.5 rounded-full" style={{ backgroundColor: SIDE_COLOR[side] }} />
						{short(names[side])}
					</button>
				))}
			</div>
		</div>
	);
}
