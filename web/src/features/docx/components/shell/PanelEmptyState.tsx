import type { ReactNode } from 'react';

interface PanelEmptyStateProps {
	/** Leading glyph; rendered inside a soft muted disc at ~20px. */
	icon: ReactNode;
	/** One short line: what belongs here or what just happened. */
	title: string;
	/** One or two sentences: why it matters and how to get the first result. */
	description: ReactNode;
	/** Optional call-to-action row (button/link). */
	action?: ReactNode;
}

/**
 * Shared empty/first-run state for the right-side analysis panels. Turns a blank
 * void into onboarding: it names what appears here and points at the first action.
 * Calm and token-driven, per the product register — an instrument at rest, not a
 * decorated placeholder.
 */
export function PanelEmptyState({ icon, title, description, action }: PanelEmptyStateProps) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
			<span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">
				{icon}
			</span>
			<div className="space-y-1.5">
				<p className="text-foreground text-sm font-semibold">{title}</p>
				<p className="text-muted-foreground mx-auto max-w-[36ch] text-xs leading-relaxed text-pretty">
					{description}
				</p>
			</div>
			{action ? <div className="pt-1">{action}</div> : null}
		</div>
	);
}

/** Emphasis for an on-screen control named inside a description (e.g. a button). */
export function EmptyStateKey({ children }: { children: ReactNode }) {
	return <span className="text-foreground font-medium">{children}</span>;
}
