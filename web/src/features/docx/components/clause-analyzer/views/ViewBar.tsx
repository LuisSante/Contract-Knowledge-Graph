'use client';

import { cn } from '@/lib/utils';
import { VIEWS, useAnalyzerView } from '@/features/docx/hooks/useAnalyzerView';

/** Switches the Clause Analyzer between its tables. It sits in the panel's header, beside the
 *  title, and shows once a pair of parties is chosen: before that there is no table to switch. */
export function ViewBar() {
	const { view, pair, setView } = useAnalyzerView();
	if (!pair) return null;
	return (
		<div
			role="tablist"
			aria-label="Clause Analyzer views"
			className="inline-flex shrink-0 rounded-lg border border-border bg-secondary p-[3px]"
		>
			{VIEWS.map((v) => (
				<button
					key={v.id}
					type="button"
					role="tab"
					aria-selected={view === v.id}
					onClick={() => setView(v.id)}
					className={cn(
						'rounded-md px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
						view === v.id
							? 'border border-border bg-card font-semibold text-primary shadow-sm'
							: 'text-muted-foreground hover:text-foreground'
					)}
				>
					{v.label}
				</button>
			))}
		</div>
	);
}
