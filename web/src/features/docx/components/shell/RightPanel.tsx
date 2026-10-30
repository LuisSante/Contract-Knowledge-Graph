'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RIGHT_PANEL_TOOLS } from '@/constants/docx-viewer';
import { TOP_HEADER_HEIGHT } from '@/constants/brand';
import type { RightPanelTab } from '@/types/document';
import {
	ChatIcon,
	CloseIcon,
	ClauseAnalyzerIcon,
	KnowledgeGraphIcon,
} from '@/components/common/icons';

const HEADER_ICONS: Record<RightPanelTab, React.ComponentType<{ className?: string }>> = {
	clause_analyzer: ClauseAnalyzerIcon,
	deadlines: Clock,
	knowledge_graph: KnowledgeGraphIcon,
	assistant: ChatIcon,
};

interface RightPanelProps {
	id?: string;
	/** Over the contract (small screens) the open panel is a modal dialog: focus moves in,
	 *  Escape closes it and focus goes back where it was. */
	modal?: boolean;
	activeTab: RightPanelTab;
	isOpen: boolean;
	width: number;
	sidebarWidth: number;
	/** Shown right after the title, such as the Clause Analyzer's view switch. */
	titleAddon?: ReactNode;
	headerActions?: ReactNode;
	children: ReactNode;
	onClose: () => void;
	closeDisabled?: boolean;
}

export function RightPanel({
	id,
	modal = false,
	activeTab,
	isOpen,
	width,
	sidebarWidth,
	titleAddon,
	headerActions,
	children,
	onClose,
	closeDisabled,
}: RightPanelProps) {
	const Icon = HEADER_ICONS[activeTab];
	const label = RIGHT_PANEL_TOOLS.find((tool) => tool.id === activeTab)?.label ?? '';
	const panelRef = useRef<HTMLElement>(null);
	const isDialog = modal && isOpen;
	const closeRef = useRef(onClose);
	const closeDisabledRef = useRef(closeDisabled);
	useEffect(() => {
		closeRef.current = onClose;
		closeDisabledRef.current = closeDisabled;
	});

	useEffect(() => {
		if (!isDialog) return;
		const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		panelRef.current?.focus({ preventScroll: true });
		const onKeyDown = (event: KeyboardEvent) => {
			// A menu inside the panel takes its own Escape first (it prevents the default).
			if (event.key !== 'Escape' || event.defaultPrevented || closeDisabledRef.current) return;
			event.preventDefault();
			closeRef.current();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
		};
	}, [isDialog]);

	return (
		<aside
			ref={panelRef}
			id={id}
			role={isDialog ? 'dialog' : undefined}
			aria-modal={isDialog || undefined}
			aria-label={isDialog ? label : undefined}
			tabIndex={isDialog ? -1 : undefined}
			className={cn(
				'absolute top-0 bottom-0 z-40 flex min-h-0 flex-col overflow-hidden border-l border-border bg-card transition-[transform,opacity,box-shadow] duration-300 outline-none motion-reduce:transition-opacity',
				isOpen
					? 'pointer-events-auto visible opacity-100 shadow-2xl'
					: 'pointer-events-none invisible opacity-0 shadow-none'
			)}
			style={{
				right: sidebarWidth,
				width: `min(${width}px, calc(100vw - ${sidebarWidth + 8}px))`,
				transform: isOpen ? 'translateX(0)' : `translateX(calc(100% + ${sidebarWidth + 20}px))`,
			}}
		>
			<header
				className={cn(
					'flex items-center justify-between border-b border-border bg-header px-4',
					TOP_HEADER_HEIGHT
				)}
			>
				<div className="flex min-w-0 flex-1 items-center gap-2">
					<h2 className="inline-flex min-w-0 items-center gap-2 truncate text-sm font-semibold text-primary">
						<span className="shrink-0 text-primary">
							<Icon className="h-4 w-4" />
						</span>
						<span className="truncate">{label}</span>
					</h2>
					{titleAddon}
					<div className="ml-auto flex shrink-0 items-center">{headerActions}</div>
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
