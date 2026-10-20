'use client';

import { Coins } from 'lucide-react';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { MODEL_OPTIONS } from '@/constants/docx-viewer';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import type { RightPanelTab } from '@/types/document';

interface RightPanelHeaderActionsProps {
	activeTab: RightPanelTab;
	costLabel: string | null;
	model: string;
	onModelChange: (value: string) => void;
}

export function RightPanelHeaderActions({
	activeTab,
	costLabel,
	model,
	onModelChange,
}: RightPanelHeaderActionsProps) {
	// The Clause Analyzer tab has no header actions: its columns already name both parties.
	const focusMeta = useClauseAnalyzerStore((state) => state.focusMeta);
	const focusedPartyName = focusMeta?.kind === 'party' ? focusMeta.label : null;

	if (activeTab === 'assistant') {
		return (
			<div className="flex min-w-0 shrink-0 items-center gap-1.5">
				<div
					className="flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-header-foreground/15 bg-header-foreground/5 px-2"
					title={
						focusedPartyName
							? `Chatting about ${focusedPartyName}`
							: 'Focus a party in the Clause Analyzer'
					}
				>
					<span className="text-2xs font-medium text-header-foreground/50">Party</span>
					<span className="truncate text-2xs font-medium text-header-foreground/80">
						{focusedPartyName ?? 'none focused'}
					</span>
				</div>
				{costLabel && (
					<div
						className="flex h-7 shrink-0 items-center gap-1 rounded-md bg-card px-2 text-2xs font-medium text-primary shadow-sm"
						title="Total accumulated real LLM usage cost"
					>
						<Coins className="size-3 text-primary" />
						{costLabel}
					</div>
				)}
				<Select value={model} onValueChange={onModelChange}>
					<SelectTrigger
						size="sm"
						className="h-7 w-[88px] shrink-0 border-transparent bg-card px-2 text-2xs text-primary shadow-sm hover:bg-card/90 focus-visible:ring-header-foreground/40 [&_svg]:text-primary"
						title="Global model for the assistant and knowledge-graph extraction"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent className="min-w-0">
						{MODEL_OPTIONS.map((option) => (
							<SelectItem
								key={option.value}
								value={option.value}
								className="text-2xs whitespace-nowrap"
							>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		);
	}

	return null;
}
