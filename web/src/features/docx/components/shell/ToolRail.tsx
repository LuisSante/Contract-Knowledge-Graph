'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RIGHT_PANEL_TOOLS } from '@/constants/docx-viewer';
import type { RightPanelTab } from '@/types/document';
import {
	ChatIcon,
	ContradictionAnalysisIcon,
	ParagraphExplanationIcon,
	RelatedParagraphsIcon,
} from '@/components/common/icons';

const TOOL_BRAND_SHORT_NAME = 'ContraVis';

const TOOL_ICONS: Record<RightPanelTab, React.ComponentType<{ className?: string }>> = {
	analysis: ContradictionAnalysisIcon,
	related: RelatedParagraphsIcon,
	paragraph_explanation: ParagraphExplanationIcon,
	assistant: ChatIcon,
	redundancy: ContradictionAnalysisIcon,
	summarize: ParagraphExplanationIcon,
	ambiguity: ContradictionAnalysisIcon,
	revisions: ParagraphExplanationIcon,
};

interface ToolRailProps {
	width: number;
	labelsPinned: boolean;
	activeTab: RightPanelTab;
	isOpen: boolean;
	disabled?: boolean;
	onSelectTool: (tab: RightPanelTab) => void;
	onToggleLabels: () => void;
}

/** Rail vertical de herramientas (marca + toggle de labels + iconos de panel). */
export function ToolRail({
	width,
	labelsPinned,
	activeTab,
	isOpen,
	disabled,
	onSelectTool,
	onToggleLabels,
}: ToolRailProps) {
	return (
		<aside
			className="absolute top-0 right-0 bottom-0 z-50 flex items-stretch justify-end transition-[width] duration-200 ease-out"
			style={{ width }}
			aria-label="Tools sidebar"
		>
			<div
				className={cn(
					'relative flex h-full flex-col border-l border-header-foreground/10 bg-header py-2 transition-[width,padding] duration-200 ease-out',
					labelsPinned ? 'ml-auto w-[calc(100%-6px)] px-1.5' : 'w-9 items-center px-[2px]'
				)}
			>
				<div
					className={cn(
						'mb-3 flex w-full items-center',
						labelsPinned ? 'justify-between' : 'justify-center'
					)}
				>
					{labelsPinned && (
						<span className="ml-1 text-[17px] font-semibold tracking-wide text-header-foreground">
							{TOOL_BRAND_SHORT_NAME}
						</span>
					)}
					<Button
						variant="ghost"
						size="icon-sm"
						className="border border-transparent bg-transparent text-header-foreground/70 hover:bg-header-foreground/15 hover:text-header-foreground"
						onClick={onToggleLabels}
						aria-label={labelsPinned ? 'Collapse tool names' : 'Expand tool names'}
						title={labelsPinned ? 'Hide names' : 'Show names'}
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							className="h-4 w-4"
							stroke="currentColor"
							strokeWidth="2"
							aria-hidden="true"
						>
							<path
								d={labelsPinned ? 'M5 6v12M8 12h10m0 0-3-3m3 3-3 3' : 'M19 6v12M16 12H6m0 0 3-3m-3 3 3 3'}
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</Button>
				</div>

				<div className="mb-7 h-px w-full bg-header-foreground/15" aria-hidden="true" />

				<div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
					{RIGHT_PANEL_TOOLS.map((item) => {
						const Icon = TOOL_ICONS[item.id];
						const isActive = activeTab === item.id && isOpen;
						return (
							<Button
								key={item.id}
								variant="ghost"
								className={cn(
									labelsPinned
										? 'h-8 w-full justify-start gap-1.5 px-1.5 text-2xs font-semibold'
										: 'h-8 w-8 justify-center',
									labelsPinned
										? isActive
											? 'bg-card text-primary shadow-sm'
											: 'text-header-foreground/75 hover:bg-header-foreground/15 hover:text-header-foreground'
										: isActive
											? 'bg-card text-primary shadow-sm'
											: 'text-header-foreground/75 hover:bg-header-foreground/15 hover:text-header-foreground'
								)}
								onClick={() => onSelectTool(item.id)}
								disabled={disabled}
								aria-label={item.label}
								title={labelsPinned ? undefined : item.label}
							>
								<Icon className="h-[17px] w-[17px]" />
								{labelsPinned && <span className="truncate">{item.label}</span>}
							</Button>
						);
					})}
				</div>
			</div>
		</aside>
	);
}
