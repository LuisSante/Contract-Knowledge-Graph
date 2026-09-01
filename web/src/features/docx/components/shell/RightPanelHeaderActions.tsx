'use client';

import { Coins, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { GLOBAL_ANALYSIS_MODEL_OPTIONS } from '@/constants/docx-viewer';
import {
	KG_TOP_K_STEP_SIZE,
	MAX_KG_HOPS,
	MAX_KG_TOP_K,
	MIN_KG_TOP_K,
	useKnowledgeGraphStore,
} from '@/stores/knowledgeGraph';
import type { RightPanelTab } from '@/types/document';


interface RightPanelHeaderActionsProps {
	activeTab: RightPanelTab;
	/** Accumulated LLM spend, null until the first call. */
	costLabel: string | null;
	model: string;
	onModelChange: (value: string) => void;
}

/**
 * Right-panel header actions, specific per tab: the focus chip and party actions in
 * the knowledge graph, and the focused party plus the LLM cost and model in the chat.
 * Cost and model are global, but the chat is where they are read and changed.
 */
export function RightPanelHeaderActions({
	activeTab,
	costLabel,
	model,
	onModelChange,
}: RightPanelHeaderActionsProps) {
	const focusedPartyName = useKnowledgeGraphStore((state) => state.ledger?.partyName ?? null);
	const selectedPartyIds = useKnowledgeGraphStore((state) => state.selectedPartyIds);
	const mergeGroups = useKnowledgeGraphStore((state) => state.mergeGroups);
	const mergeParties = useKnowledgeGraphStore((state) => state.mergeParties);
	const splitGroup = useKnowledgeGraphStore((state) => state.splitGroup);
	const hideParty = useKnowledgeGraphStore((state) => state.hideParty);
	const focusMeta = useKnowledgeGraphStore((state) => state.focusMeta);
	const hops = useKnowledgeGraphStore((state) => state.hops);
	const topK = useKnowledgeGraphStore((state) => state.topK);
	const setHops = useKnowledgeGraphStore((state) => state.setHops);
	const setTopK = useKnowledgeGraphStore((state) => state.setTopK);
	const clearFocus = useKnowledgeGraphStore((state) => state.clearFocus);

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
		// A party focus tunes how many statements are shown; anything else tunes the
		// neighbourhood radius. Same two buttons, different quantity.
		const partyFocus = focusMeta?.kind === 'party';
		const step = (delta: number) =>
			partyFocus ? setTopK((k) => k + delta * KG_TOP_K_STEP_SIZE) : setHops((h) => h + delta);
		const atMin = partyFocus ? topK <= MIN_KG_TOP_K : hops <= 0;
		const atMax = partyFocus ? topK >= MAX_KG_TOP_K : hops >= MAX_KG_HOPS;
		const stepUnit = partyFocus ? 'statements' : 'hops';

		return (
			<div className="flex shrink-0 items-center gap-1.5">
				{focusMeta && (
					<div className="flex h-7 items-center rounded-md bg-card pl-2 pr-1 shadow-sm">
						<span
							className="max-w-[130px] truncate text-2xs font-medium text-primary"
							title={focusMeta.label}
						>
							{focusMeta.label}
						</span>
						<Separator orientation="vertical" className="mx-1.5 h-3.5! bg-primary/20" />
						<span className="whitespace-nowrap text-2xs tabular-nums text-primary/60">
							{partyFocus ? `top ${topK}` : `${hops}-hop`}
						</span>
						<Button
							variant="ghost"
							size="icon-xs"
							className="ml-0.5 size-5 text-primary hover:bg-primary/10 hover:text-primary"
							aria-label={`Fewer ${stepUnit}`}
							disabled={atMin}
							onClick={() => step(-1)}
						>
							<Minus />
						</Button>
						<Button
							variant="ghost"
							size="icon-xs"
							className="size-5 text-primary hover:bg-primary/10 hover:text-primary"
							aria-label={`More ${stepUnit}`}
							disabled={atMax}
							onClick={() => step(1)}
						>
							<Plus />
						</Button>
						<Separator orientation="vertical" className="mx-1.5 h-3.5! bg-primary/20" />
						<Button
							variant="ghost"
							size="xs"
							className="h-5 px-1.5 text-2xs text-primary hover:bg-primary/10 hover:text-primary"
							onClick={clearFocus}
						>
							Clear
						</Button>
					</div>
				)}
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

	if (activeTab === 'assistant') {
		return (
			<div className="flex min-w-0 shrink-0 items-center gap-1.5">
				<div
					className="flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-header-foreground/15 bg-header-foreground/5 px-2"
					title={
						focusedPartyName
							? `Chatting about ${focusedPartyName}`
							: 'Focus a party in the Knowledge Graph'
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
						{GLOBAL_ANALYSIS_MODEL_OPTIONS.map((option) => (
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
