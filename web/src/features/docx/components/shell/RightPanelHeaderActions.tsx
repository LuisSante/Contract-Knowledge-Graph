'use client';

import { Button } from '@/components/ui/button';
import { useKnowledgeGraphStore } from '@/stores/knowledgeGraph';
import type { RightPanelTab } from '@/types/document';

const ACTION_BTN =
	'h-7 border-transparent bg-card px-2 text-2xs text-primary shadow-sm hover:bg-card/90 hover:text-primary disabled:opacity-50';

interface RightPanelHeaderActionsProps {
	activeTab: RightPanelTab;
	// analysis
	contradictionLoading: boolean;
	relatedLoading: boolean;
	onLoadSaved: () => void;
	onSearch: () => void;
	// paragraph_explanation
	explanationDisabled: boolean;
	onExplain: () => void;
}

/**
 * Right-panel header actions, specific per tab: Saved/Search in analysis,
 * Explain/Simplify in explanation, and the focused-party chip in the chat.
 * Extracted from `DocxViewer` to slim it down.
 */
export function RightPanelHeaderActions({
	activeTab,
	contradictionLoading,
	relatedLoading,
	onLoadSaved,
	onSearch,
	explanationDisabled,
	onExplain,
}: RightPanelHeaderActionsProps) {
	const focusedPartyName = useKnowledgeGraphStore((state) => state.ledger?.partyName ?? null);
	if (activeTab === 'analysis') {
		return (
			<div className="flex shrink-0 items-center gap-1.5">
				<Button
					variant="outline"
					size="sm"
					className={ACTION_BTN}
					disabled={contradictionLoading}
					onClick={onLoadSaved}
				>
					Saved
				</Button>
				<Button
					variant="outline"
					size="sm"
					className={ACTION_BTN}
					disabled={contradictionLoading || relatedLoading}
					title="Search contradictions with LLM"
					onClick={onSearch}
				>
					Search
				</Button>
			</div>
		);
	}

	if (activeTab === 'paragraph_explanation') {
		return (
			<div className="flex shrink-0 items-center gap-1.5">
				<Button
					variant="outline"
					size="sm"
					className={ACTION_BTN}
					disabled={explanationDisabled}
					onClick={onExplain}
				>
					Explain paragraph
				</Button>
				<Button variant="outline" size="sm" className={ACTION_BTN} disabled title="Simplify — coming soon">
					Simplify
				</Button>
			</div>
		);
	}

	if (activeTab === 'assistant') {
		return (
			<div
				className="flex h-7 min-w-0 shrink-0 items-center gap-1.5 rounded-md border border-header-foreground/15 bg-header-foreground/5 px-2"
				title={focusedPartyName ? `Chatting about ${focusedPartyName}` : 'Focus a party in the Knowledge Graph'}
			>
				<span className="text-2xs font-medium text-header-foreground/50">Party</span>
				<span className="truncate text-2xs font-medium text-header-foreground/80">
					{focusedPartyName ?? 'none focused'}
				</span>
			</div>
		);
	}

	return null;
}
