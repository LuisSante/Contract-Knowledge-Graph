'use client';

import { cn } from '@/lib/utils';
import { VIEWS, type View } from '@/features/docx/hooks/useAnalyzerView';

interface ViewBarProps {
	view: View;
	onView: (view: View) => void;
}

export function ViewBar({ view, onView }: ViewBarProps) {
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
		</div>
	);
}
