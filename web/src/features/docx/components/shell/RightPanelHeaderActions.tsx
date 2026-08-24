'use client';

import { Button } from '@/components/ui/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
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
	const selectedPartyIds = useKnowledgeGraphStore((state) => state.selectedPartyIds);
	const mergeGroups = useKnowledgeGraphStore((state) => state.mergeGroups);
	const mergeParties = useKnowledgeGraphStore((state) => state.mergeParties);
	const splitGroup = useKnowledgeGraphStore((state) => state.splitGroup);
	const hideParty = useKnowledgeGraphStore((state) => state.hideParty);

	if (activeTab === 'knowledge_graph') {
		const n = selectedPartyIds.length;
		const singleGroup = n === 1 && mergeGroups.some((g) => g.id === selectedPartyIds[0]);
		const canMerge = n >= 2;
		const canSplit = singleGroup;
		const canDelete = n >= 1;
		const run = (action: string) => {
			const ids = [...selectedPartyIds];
			if (action === 'merge') mergeParties(ids);
			else if (action === 'split') splitGroup(ids[0]);
			else if (action === 'delete') ids.forEach((id) => hideParty(id));
		};
		return (
			<div className="flex shrink-0 items-center gap-1.5">
				<span className="text-2xs text-header-foreground/60">
					{n === 0 ? 'no selection' : `${n} selected`}
				</span>
				<Select value="" onValueChange={run}>
					<SelectTrigger
						size="sm"
						disabled={n === 0}
						className="h-7 w-[104px] shrink-0 border-transparent bg-card px-2 text-2xs text-primary shadow-sm hover:bg-card/90 focus-visible:ring-header-foreground/40 disabled:opacity-50 [&_svg]:text-primary"
						title="Merge, split or delete the selected parties"
					>
						<SelectValue placeholder="Actions" />
					</SelectTrigger>
					<SelectContent className="min-w-0">
						<SelectItem value="merge" disabled={!canMerge} className="text-2xs">
							Merge
						</SelectItem>
						<SelectItem value="split" disabled={!canSplit} className="text-2xs">
							Split
						</SelectItem>
						<SelectItem value="delete" disabled={!canDelete} className="text-2xs">
							Delete
						</SelectItem>
					</SelectContent>
				</Select>
			</div>
		);
	}

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
