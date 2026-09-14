'use client';

import { useState, type DragEvent } from 'react';
import { Split as SplitIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
	/** With a side, the drop was aimed; without one, the first open seat takes it. */
	onAssign: (partyId: string, side?: 0 | 1) => void;
	onRelease: (side: 0 | 1) => void;
	/** Parties the resolver thinks may be the same entity, keyed by party id. */
	mergeHints: Record<string, string[]>;
	/** Ids that are merge groups, so their cards can offer Split. */
	groupIds: string[];
	onMerge: (ids: string[]) => void;
	onSplit: (groupId: string) => void;
	onDelete: (partyId: string) => void;
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
	mergeHints,
	groupIds,
	onMerge,
	onSplit,
	onDelete,
	onContinue,
}: PartySelectionProps) {
	const byId = new Map(parties.map((p) => [p.id, p] as const));
	const seated = new Set(slots.filter((id): id is string => Boolean(id)));
	const pool = parties.filter((p) => !seated.has(p.id));
	const full = slots[0] !== null && slots[1] !== null;
	const groups = new Set(groupIds);

	/**
	 * Everything is draggable and most things are drop targets, so the id travels in
	 * component state rather than only in dataTransfer — dragover can't read the data,
	 * and the overlays need to know who is flying to light the right zones.
	 */
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [dropZone, setDropZone] = useState<string | null>(null);

	const dragProps = (id: string) => ({
		draggable: true,
		onDragStart: (event: DragEvent) => {
			event.dataTransfer.setData('text/plain', id);
			event.dataTransfer.effectAllowed = 'move';
			setDraggingId(id);
		},
		onDragEnd: () => {
			setDraggingId(null);
			setDropZone(null);
		},
	});

	const acceptOver = (zone: string) => (event: DragEvent) => {
		if (!draggingId) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		if (dropZone !== zone) setDropZone(zone);
	};

	/** dragleave fires after the next dragover, so only clear a zone we still own. */
	const leaveZone = (zone: string) => () =>
		setDropZone((current) => (current === zone ? null : current));

	const finishDrop = (event: DragEvent, run: (dragged: string) => void) => {
		event.preventDefault();
		const dragged = draggingId ?? event.dataTransfer.getData('text/plain');
		setDraggingId(null);
		setDropZone(null);
		if (dragged) run(dragged);
	};

	/** Amber, deliberately outside every other palette in the view: split is the one
	    action that undoes instead of composing, so its handle should never blend in. */
	const splitBadge = (partyId: string) => (
		<span
			role="button"
			tabIndex={0}
			title="Split this merged entity back into its members"
			onClick={(event) => {
				event.stopPropagation();
				onSplit(partyId);
			}}
			className="shrink-0 cursor-pointer rounded p-0.5 text-amber-600 hover:bg-amber-500/15 hover:text-amber-700"
		>
			<SplitIcon className="size-3" />
		</span>
	);

	const card = (side: 0 | 1) => {
		const id = slots[side];
		const party = id ? byId.get(id) : null;
		const color = slotColors[side];

		if (!party) {
			const zone = `seat-${side}`;
			return (
				<div
					className={`flex min-h-[92px] min-w-0 flex-1 flex-col items-center justify-center rounded-lg border-2 border-dashed px-3 text-center text-2xs transition ${
						dropZone === zone
							? 'border-primary bg-primary/5 text-primary'
							: 'border-border text-muted-foreground'
					}`}
					onDragOver={acceptOver(zone)}
					onDragLeave={leaveZone(zone)}
					onDrop={(event) => finishDrop(event, (dragged) => onAssign(dragged, side))}
				>
					{draggingId ? 'Drop to seat it' : 'Pick a party'}
				</div>
			);
		}

		const targeted = draggingId !== null && draggingId !== party.id;
		return (
			<div className="relative flex min-h-[92px] min-w-0 flex-1">
				<div
					role="button"
					tabIndex={0}
					{...dragProps(party.id)}
					onClick={() => onRelease(side)}
					title="Click to release it · Drag onto the other card to merge"
					className="flex w-full min-w-0 cursor-grab flex-col justify-between rounded-lg border-2 bg-card px-3 py-2 text-left transition hover:bg-muted/50 active:cursor-grabbing"
					style={{
						borderColor: color,
						opacity: draggingId === party.id ? 0.4 : undefined,
					}}
				>
					<span className="flex items-center gap-1.5">
						<span
							className="inline-block size-2.5 shrink-0 rounded-full"
							style={{ backgroundColor: color }}
						/>
						<span className="truncate text-xs font-medium text-foreground">{party.name}</span>
						{groups.has(party.id) && splitBadge(party.id)}
					</span>
					{party.role && <span className="truncate text-2xs opacity-60">{party.role}</span>}
					<Load party={party} />
				</div>
				{/* Two intents land on one card, so the drop is asked to choose: the top
				    half swaps the seat, the bottom half fuses the two into one entity. */}
				{targeted && (
					<div className="absolute inset-0 z-10 flex flex-col overflow-hidden rounded-lg border-2 border-transparent">
						<div
							className={`flex flex-1 items-center justify-center text-2xs font-medium transition ${
								dropZone === `swap-${side}`
									? 'bg-primary/20 text-primary'
									: 'bg-background/75 text-muted-foreground'
							}`}
							onDragOver={acceptOver(`swap-${side}`)}
							onDragLeave={leaveZone(`swap-${side}`)}
							onDrop={(event) => finishDrop(event, (dragged) => onAssign(dragged, side))}
						>
							Swap in
						</div>
						<div
							className={`flex flex-1 items-center justify-center gap-1 text-2xs font-medium transition ${
								dropZone === `merge-${side}`
									? 'bg-emerald-500/20 text-emerald-700'
									: 'bg-background/75 text-muted-foreground'
							}`}
							onDragOver={acceptOver(`merge-${side}`)}
							onDragLeave={leaveZone(`merge-${side}`)}
							onDrop={(event) => finishDrop(event, (dragged) => onMerge([dragged, party.id]))}
						>
							Merge into one entity
						</div>
					</div>
				)}
			</div>
		);
	};

	return (
		<div className="flex h-full flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-6">
			<div className="w-full max-w-xl text-center">
				<div className="text-sm font-medium text-foreground">
					Pick the two parties of the contract
				</div>
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
						Other parties in the document — drag one onto a seat to swap it, onto another card to
						merge them
					</div>
					<div className="flex flex-wrap gap-1.5">
						{pool.map((party) => {
							const suggested = (mergeHints[party.id] ?? []).some((other) => seated.has(other));
							const zone = `pool-${party.id}`;
							const targeted = dropZone === zone;
							return (
								<div
									key={party.id}
									role="button"
									tabIndex={0}
									{...dragProps(party.id)}
									onClick={() => {
										if (!full) onAssign(party.id);
									}}
									onDragOver={draggingId && draggingId !== party.id ? acceptOver(zone) : undefined}
									onDragLeave={leaveZone(zone)}
									onDrop={(event) =>
										finishDrop(event, (dragged) => {
											if (dragged !== party.id) onMerge([dragged, party.id]);
										})
									}
									title={
										suggested
											? 'The resolver thinks this may be the same entity as one of the seated parties — drop it on that card to merge'
											: full
												? 'Drag onto a seat to swap it in · drop another card here to merge'
												: 'Click to seat it · drag onto a card to merge'
									}
									className={`group flex max-w-full cursor-grab items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs transition active:cursor-grabbing ${
										targeted
											? 'border-emerald-500 bg-emerald-500/10 text-foreground ring-1 ring-emerald-400'
											: 'border-border text-muted-foreground hover:bg-muted/60'
									}`}
									style={{ opacity: draggingId === party.id ? 0.4 : undefined }}
								>
									{suggested && (
										<span
											className="inline-block size-1.5 shrink-0 rounded-full bg-emerald-500"
											aria-label="possible duplicate"
										/>
									)}
									<span className="truncate">{party.name}</span>
									<span className="shrink-0 tabular-nums opacity-60">{party.total}</span>
									{groups.has(party.id) && splitBadge(party.id)}
									<span
										role="button"
										tabIndex={0}
										title="Remove this party from the view (restorable below)"
										onClick={(event) => {
											event.stopPropagation();
											onDelete(party.id);
										}}
										className="shrink-0 cursor-pointer rounded p-0.5 opacity-0 transition-opacity hover:bg-muted hover:text-destructive group-hover:opacity-100"
									>
										<X className="size-3" />
									</span>
								</div>
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
