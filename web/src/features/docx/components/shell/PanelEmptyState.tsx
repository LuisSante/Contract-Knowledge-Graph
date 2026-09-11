import type { ReactNode } from 'react';

interface PanelEmptyStateProps {
	icon: ReactNode;
	title: string;
	description: ReactNode;
	action?: ReactNode;
}

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

export function EmptyStateKey({ children }: { children: ReactNode }) {
	return <span className="text-foreground font-medium">{children}</span>;
}
