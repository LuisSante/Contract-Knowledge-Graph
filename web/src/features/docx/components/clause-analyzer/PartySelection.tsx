'use client';

import { useState, type DragEvent } from 'react';
import { EyeOff, Merge, Split as SplitIcon, X, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface PartyCardData {
	id: string;
	name: string;
	role: string;
	does: string;
	total: number;
}

interface PartySelectionProps {
	parties: PartyCardData[];
	slots: [string | null, string | null];
	slotColors: [string, string];
	onAssign: (partyId: string, side?: 0 | 1) => void;
	onRelease: (side: 0 | 1) => void;
	groupIds: string[];
	onMerge: (ids: string[]) => void;
	onSplit: (groupId: string) => void;
	onDelete: (partyId: string) => void;
	onContinue: () => void;
}

export function PartySelection({
	parties,
	slots,
	slotColors,
	onAssign,
	onRelease,
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
	const splitBadge = (partyId: string, size = 'size-3.5') => (
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
			<SplitIcon className={size} />
		</span>
	);

	/** A seated card's own action. The card is itself a button that frees the seat, so the
	    icon's click stops there. */
	const cardAction = (label: string, Icon: LucideIcon, run: () => void) => (
		<button
			type="button"
			title={label}
			aria-label={label}
			onClick={(event) => {
				event.stopPropagation();
				run();
			}}
			className="shrink-0 rounded p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
		>
			<Icon className="size-4" />
		</button>
	);

	const card = (side: 0 | 1) => {
		const id = slots[side];
		const party = id ? byId.get(id) : null;
		const color = slotColors[side];

		if (!party) {
			const zone = `seat-${side}`;
			return (
				<div
					className={`flex min-h-[140px] min-w-0 flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed px-3 text-center text-sm transition ${
						dropZone === zone
							? 'border-primary bg-primary/5 text-primary'
							: 'border-border text-muted-foreground'
					}`}
					onDragOver={acceptOver(zone)}
					onDragLeave={leaveZone(zone)}
					onDrop={(event) => finishDrop(event, (dragged) => onAssign(dragged, side))}
				>
					{draggingId ? 'Drop to seat it' : 'Pick a party below'}
				</div>
			);
		}

		const otherId = slots[side === 0 ? 1 : 0];
		const other = otherId ? byId.get(otherId) : null;

		const targeted = draggingId !== null && draggingId !== party.id;
		return (
			<div className="relative flex min-w-0 flex-1">
				<div
					role="button"
					tabIndex={0}
					{...dragProps(party.id)}
					onClick={() => onRelease(side)}
					title="Click to choose another party; drag it onto the other card to merge them"
					className="flex w-full min-w-0 cursor-grab flex-col gap-2.5 rounded-xl border-2 bg-card px-5 py-4 text-left transition hover:bg-muted/40 active:cursor-grabbing"
					style={{
						borderColor: color,
						opacity: draggingId === party.id ? 0.4 : undefined,
					}}
				>
					<span className="flex items-start gap-2">
						<span
							className="mt-[7px] inline-block size-2.5 shrink-0 rounded-full"
							style={{ backgroundColor: color }}
						/>
						<span className="min-w-0 text-base leading-snug font-semibold text-foreground">
							{party.name}
						</span>
						<span className="ml-auto flex shrink-0 items-center gap-0.5">
							{other &&
								cardAction(`Merge with ${other.name}`, Merge, () => onMerge([party.id, other.id]))}
							{groups.has(party.id) && splitBadge(party.id, 'size-4')}
							{cardAction('Hide from the view (restorable below)', EyeOff, () =>
								onDelete(party.id)
							)}
						</span>
					</span>
					{party.role && (
						<span
							className="w-fit rounded-full px-2 py-0.5 text-xs font-medium"
							style={{ color, backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)` }}
						>
							{party.role}
						</span>
					)}
					{party.does && (
						<span className="text-[15px] leading-6 text-foreground/80">{party.does}</span>
					)}
				</div>
				{/* Two intents land on one card, so the drop is asked to choose: the top
				    half swaps the seat, the bottom half fuses the two into one entity. */}
				{targeted && (
					<div className="absolute inset-0 z-10 flex flex-col overflow-hidden rounded-xl border-2 border-transparent">
						<div
							className={`flex flex-1 items-center justify-center text-xs font-medium transition ${
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
							className={`flex flex-1 items-center justify-center gap-1 text-xs font-medium transition ${
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
		<section className="flex flex-col gap-4">
			<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<h3 className="text-lg font-semibold text-foreground">The two parties</h3>
			</div>

			<div className="flex w-full items-stretch gap-3">
				{card(0)}
				<div className="flex w-8 shrink-0 flex-col items-center justify-center">
					<span className="h-full w-px border-l border-dashed border-border" />
					<span className="my-1 text-xs tracking-wide text-muted-foreground">vs</span>
					<span className="h-full w-px border-l border-dashed border-border" />
				</div>
				{card(1)}
			</div>

			{pool.length > 0 && (
				<div className="w-full">
					<div className="mb-1.5 text-xs text-muted-foreground">
						Other parties in the document — click one to seat it, or drag it onto a card to swap or
						merge
					</div>
					<div className="flex flex-wrap gap-1.5">
						{pool.map((party) => {
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
										full
											? 'Drag onto a seat to swap it in; drop another card here to merge'
											: 'Click to seat it; drag onto a card to merge'
									}
									className={`group flex max-w-full cursor-grab items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition active:cursor-grabbing ${
										targeted
											? 'border-emerald-500 bg-emerald-500/10 text-foreground ring-1 ring-emerald-400'
											: 'border-border text-muted-foreground hover:bg-muted/60'
									}`}
									style={{ opacity: draggingId === party.id ? 0.4 : undefined }}
								>
									<span className="truncate">{party.name}</span>
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

			<div className="mt-1 flex items-center gap-4">
				<Button size="lg" disabled={!full} onClick={onContinue} className="text-[15px]">
					Compare the pair
				</Button>
			</div>
		</section>
	);
}
