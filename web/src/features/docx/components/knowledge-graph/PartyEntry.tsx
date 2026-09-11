'use client';

import { useMemo, useState } from 'react';
import type { KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';
import { defaultPair } from '@/features/docx/utils/knowledge/pair';
import { mergeGroupId } from '@/stores/knowledge-graph';
import type { MergeGroup } from '@/features/docx/utils/knowledge/party-view';
import {
	PartySelection,
	type PartyCardData,
} from '@/features/docx/components/knowledge-graph/PartySelection';
import {
	PAIR_SECOND_COLOR,
	PARTY_COLOR,
} from '@/features/docx/components/knowledge-graph/constants';

interface PartyEntryProps {
	kg: KnowledgeGraph;
	mergeHints: Record<string, string[]>;
	mergeGroups: MergeGroup[];
	onMerge: (ids: string[]) => void;
	onSplit: (groupId: string) => void;
	onDelete: (partyId: string) => void;
	onContinue: (partyAId: string, partyBId: string) => void;
}

export function PartyEntry({
	kg,
	mergeHints,
	mergeGroups,
	onMerge,
	onSplit,
	onDelete,
	onContinue,
}: PartyEntryProps) {
	const [slotOverride, setSlotOverride] = useState<[string | null, string | null] | null>(null);

	const parties = useMemo<PartyCardData[]>(() => {
		const tally = new Map<string, PartyCardData>(
			kg.parties.map((p) => [
				p.id,
				{
					id: p.id,
					name: p.name,
					role: p.role,
					obligations: 0,
					rights: 0,
					prohibitions: 0,
					total: 0,
				},
			])
		);
		for (const v of deonticNodes(kg)) {
			for (const partyId of new Set([v.burdenPartyId, v.benefitPartyId])) {
				const row = partyId ? tally.get(partyId) : undefined;
				if (!row) continue;
				if (v.kind === 'obligation') row.obligations += 1;
				else if (v.kind === 'right') row.rights += 1;
				else row.prohibitions += 1;
				row.total += 1;
			}
		}
		return [...tally.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
	}, [kg]);

	const slots = useMemo<[string | null, string | null]>(() => {
		const known = new Set(kg.parties.map((p) => p.id));
		const prune = (seat: string | null) => (seat && known.has(seat) ? seat : null);
		if (slotOverride) return [prune(slotOverride[0]), prune(slotOverride[1])];
		const suggested = defaultPair(kg);
		return suggested ? [suggested[0], suggested[1]] : [null, null];
	}, [kg, slotOverride]);

	return (
		<PartySelection
			parties={parties}
			slots={slots}
			slotColors={[PARTY_COLOR, PAIR_SECOND_COLOR]}
			onAssign={(id, side) =>
				setSlotOverride(() => {
					const next: [string | null, string | null] = [slots[0], slots[1]];
					if (side === undefined) {
						if (next[0] === null) next[0] = id;
						else if (next[1] === null) next[1] = id;
						return next;
					}
					// Seating one card on the other's chair exchanges them
					// instead of duplicating the id across both seats.
					const other = side === 0 ? 1 : 0;
					if (next[other] === id) next[other] = next[side];
					next[side] = id;
					return next;
				})
			}
			onRelease={(side) => {
				const next: [string | null, string | null] = [...slots];
				next[side] = null;
				setSlotOverride(next);
			}}
			mergeHints={mergeHints}
			groupIds={mergeGroups.map((group) => group.id)}
			onMerge={(ids) => {
				// Predict the group id so a seated party keeps its seat as
				// the merged entity, instead of being pruned to an empty chair.
				const groupById = new Map(mergeGroups.map((g) => [g.id, g]));
				const members = new Set<string>();
				for (const id of ids) {
					const group = groupById.get(id);
					if (group) group.members.forEach((m) => members.add(m));
					else members.add(id);
				}
				if (members.size < 2) return;
				const newId = mergeGroupId(members);
				onMerge(ids);
				setSlotOverride(() => {
					const remap = (seat: string | null) =>
						seat && (ids.includes(seat) || members.has(seat)) ? newId : seat;
					const a = remap(slots[0]);
					const b = remap(slots[1]);
					return a !== null && a === b ? [a, null] : [a, b];
				});
			}}
			onSplit={onSplit}
			onDelete={onDelete}
			onContinue={() => {
				if (slots[0] && slots[1]) onContinue(slots[0], slots[1]);
			}}
		/>
	);
}
