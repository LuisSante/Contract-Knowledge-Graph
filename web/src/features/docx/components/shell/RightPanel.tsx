'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RIGHT_PANEL_TOOLS } from '@/constants/docx-viewer';
import type { RightPanelTab } from '@/types/document';
import {
	ChatIcon,
	CloseIcon,
	ContradictionAnalysisIcon,
	ParagraphExplanationIcon,
	RelatedParagraphsIcon,
} from '@/components/common/icons';

const HEADER_ICONS: Record<RightPanelTab, React.ComponentType<{ className?: string }>> = {
	analysis: ContradictionAnalysisIcon,
	related: RelatedParagraphsIcon,
	paragraph_explanation: ParagraphExplanationIcon,
	assistant: ChatIcon,
	redundancy: ContradictionAnalysisIcon,
	summarize: ParagraphExplanationIcon,
	ambiguity: ContradictionAnalysisIcon,
	revisions: ParagraphExplanationIcon,
};

interface RightPanelProps {
	activeTab: RightPanelTab;
	isOpen: boolean;
	width: number;
	sidebarWidth: number;
	headerActions?: ReactNode;
	children: ReactNode;
	onClose: () => void;
	closeDisabled?: boolean;
}

/**
 * Sliding right panel: header with icon + tool name + specific actions + close,
 * and the content of the active panel. Positioned to the left of the icon rail
 * (`right: sidebarWidth`).
 */
export function RightPanel({
	activeTab,
	isOpen,
	width,
	sidebarWidth,
	headerActions,
	children,
	onClose,
	closeDisabled,
}: RightPanelProps) {
	const Icon = HEADER_ICONS[activeTab];
	const label = RIGHT_PANEL_TOOLS.find((tool) => tool.id === activeTab)?.label ?? '';

	return (
		<aside
			className={cn(
				'absolute top-0 bottom-0 z-40 flex min-h-0 flex-col overflow-hidden border-l border-border bg-card transition-[transform,opacity,box-shadow] duration-300',
				isOpen
					? 'pointer-events-auto visible opacity-100 shadow-2xl'
					: 'pointer-events-none invisible opacity-0 shadow-none'
			)}
			style={{
				right: sidebarWidth,
				// Never exceed the viewport: on narrow screens the panel becomes an
				// overlay sheet sized to fit beside the tool rail, so it can't push
				// the document off-screen or cause horizontal overflow.
				width: `min(${width}px, calc(100vw - ${sidebarWidth + 8}px))`,
				transform: isOpen ? 'translateX(0)' : `translateX(calc(100% + ${sidebarWidth + 20}px))`,
			}}
		>
			<header className="flex items-center justify-between border-b border-border bg-header px-4 py-2.5">
				<div className="flex min-w-0 flex-1 items-center gap-2">
					<h2 className="inline-flex min-w-0 flex-1 items-center gap-2 truncate text-sm font-semibold text-primary">
						<span className="shrink-0 text-primary">
							<Icon className="h-4 w-4" />
						</span>
						<span className="truncate">{label}</span>
					</h2>
					{headerActions}
				</div>

				<Button
					variant="outline"
					size="icon-sm"
					className="ml-2 h-7 w-7 shrink-0 border-transparent bg-card text-primary shadow-sm hover:bg-card/90 hover:text-primary"
					onClick={onClose}
					disabled={closeDisabled}
					aria-label="Close"
					title="Close"
				>
					<CloseIcon className="h-4 w-4" />
				</Button>
			</header>

			<div className="flex min-h-0 flex-1 flex-col">{children}</div>
		</aside>
	);
}
