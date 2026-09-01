'use client';

import { Button } from '@/components/ui/button';

/** A party as the entry view needs it: identity plus the load it actually carries. */
export interface PartyCardData {
	id: string;
	name: string;
	role: string;
	obligations: number;
	rights: number;
	prohibitions: number;
	total: number;
}

interface PartySelectionProps {
	parties: PartyCardData[];
	/** The chosen pair, by side. Null means the slot is open. */
	slots: [string | null, string | null];
	slotColors: [string, string];
	onAssign: (partyId: string) => void;
	onRelease: (side: 0 | 1) => void;
	/** Ctrl/Cmd-click keeps feeding the header's merge/split/delete actions. */
	selectedPartyIds: string[];
	onToggleSelect: (partyId: string) => void;
	/** Parties the resolver thinks may be the same entity, keyed by party id. */
	mergeHints: Record<string, string[]>;
	onContinue: () => void;
}

function Load({ party }: { party: PartyCardData }) {
	if (party.total === 0) return <span className="text-2xs opacity-50">No provisions</span>;
	return (
		<span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-2xs opacity-70">
			<span className="font-medium">{party.total} provisions</span>
			<span>
				{party.obligations}o · {party.rights}r · {party.prohibitions}p
			</span>
		</span>
	);
}

export function PartySelection({
	parties,
	slots,
	slotColors,
	onAssign,
	onRelease,
	selectedPartyIds,
	onToggleSelect,
	mergeHints,
	onContinue,
}: PartySelectionProps) {
	const byId = new Map(parties.map((p) => [p.id, p] as const));
	const seated = new Set(slots.filter((id): id is string => Boolean(id)));
	const pool = parties.filter((p) => !seated.has(p.id));
	const full = slots[0] !== null && slots[1] !== null;

	const card = (side: 0 | 1) => {
		const id = slots[side];
		const party = id ? byId.get(id) : null;
		const color = slotColors[side];
		if (!party) {
			return (
				<div className="flex min-h-[92px] min-w-0 flex-1 flex-col items-center justify-center rounded-lg border-2 border-dashed border-border px-3 text-center text-2xs text-muted-foreground">
					Pick a party
				</div>
			);
		}
		return (
			<button
				type="button"
				onClick={(event) => {
					if (event.metaKey || event.ctrlKey) onToggleSelect(party.id);
					else onRelease(side);
				}}
				title="Click to release it · Ctrl-click to select it for Actions"
				className="flex min-h-[92px] min-w-0 flex-1 flex-col justify-between rounded-lg border-2 bg-card px-3 py-2 text-left transition hover:bg-muted/50"
				style={{
					borderColor: color,
					boxShadow: selectedPartyIds.includes(party.id) ? `0 0 0 2px ${color}40` : undefined,
				}}
			>
				<span className="flex items-center gap-1.5">
					<span
						className="inline-block size-2.5 shrink-0 rounded-full"
						style={{ backgroundColor: color }}
					/>
					<span className="truncate text-xs font-medium text-foreground">{party.name}</span>
				</span>
				{party.role && <span className="truncate text-2xs opacity-60">{party.role}</span>}
				<Load party={party} />
			</button>
		);
	};

	return (
		<div className="flex h-full flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-6">
			<div className="w-full max-w-xl text-center">
				<div className="text-sm font-medium text-foreground">Pick the two parties of the contract</div>
			</div>

			<div className="flex w-full max-w-xl items-stretch gap-3">
				{card(0)}
				<div className="flex w-8 shrink-0 flex-col items-center justify-center">
					<span className="h-full w-px border-l border-dashed border-border" />
					<span className="my-1 text-2xs uppercase tracking-wide text-muted-foreground">vs</span>
					<span className="h-full w-px border-l border-dashed border-border" />
				</div>
				{card(1)}
			</div>

			{pool.length > 0 && (
				<div className="w-full max-w-xl">
					<div className="mb-1.5 text-2xs text-muted-foreground">
						Other parties in the document
						{full && ' — release a card to swap it'}
					</div>
					<div className="flex flex-wrap gap-1.5">
						{pool.map((party) => {
							const suggested = (mergeHints[party.id] ?? []).some((other) => seated.has(other));
							return (
								<button
									key={party.id}
									type="button"
									disabled={full}
									onClick={(event) => {
										if (event.metaKey || event.ctrlKey) onToggleSelect(party.id);
										else onAssign(party.id);
									}}
									title={
										suggested
											? 'The resolver thinks this may be the same entity as one of the seated parties — Ctrl-click it and use Actions to merge'
											: 'Click to seat it · Ctrl-click to select it for Actions'
									}
									className={`flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs transition ${
										full
											? 'cursor-not-allowed opacity-40'
											: 'cursor-pointer hover:bg-muted/60'
									} ${
										selectedPartyIds.includes(party.id)
											? 'border-primary text-foreground'
											: 'border-border text-muted-foreground'
									}`}
								>
									{suggested && (
										<span
											className="inline-block size-1.5 shrink-0 rounded-full bg-emerald-500"
											aria-label="possible duplicate"
										/>
									)}
									<span className="truncate">{party.name}</span>
									<span className="shrink-0 tabular-nums opacity-60">{party.total}</span>
								</button>
							);
						})}
					</div>
				</div>
			)}

			<Button size="sm" disabled={!full} onClick={onContinue} className="mt-1">
				Compare the pair
			</Button>
		</div>
	);
}
