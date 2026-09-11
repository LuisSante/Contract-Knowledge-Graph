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
import { MODEL_OPTIONS } from '@/constants/docx-viewer';
import {
	KG_TOP_K_STEP_SIZE,
	MAX_HOPS,
	MAX_TOP_K,
	MIN_TOP_K,
	useGraphStore,
} from '@/stores/knowledge-graph';
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
	const focusMeta = useGraphStore((state) => state.focusMeta);
	const hops = useGraphStore((state) => state.hops);
	const topK = useGraphStore((state) => state.topK);
	const setHops = useGraphStore((state) => state.setHops);
	const setTopK = useGraphStore((state) => state.setTopK);
	const clearFocus = useGraphStore((state) => state.clearFocus);
	const focusedPartyName = focusMeta?.kind === 'party' ? focusMeta.label : null;

	if (activeTab === 'knowledge_graph') {
		const partyFocus = focusMeta?.kind === 'party';
		const step = (delta: number) =>
			partyFocus ? setTopK((k) => k + delta * KG_TOP_K_STEP_SIZE) : setHops((h) => h + delta);
		const atMin = partyFocus ? topK <= MIN_TOP_K : hops <= 0;
		const atMax = partyFocus ? topK >= MAX_TOP_K : hops >= MAX_HOPS;
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
