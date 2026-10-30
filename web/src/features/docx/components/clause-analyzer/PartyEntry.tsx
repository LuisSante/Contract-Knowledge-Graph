'use client';

import { useCallback, useMemo, useState } from 'react';
import type { KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';
import { defaultPair } from '@/features/docx/utils/knowledge/pair';
import { mergeGroupId } from '@/stores/clause-analyzer';
import type { MergeGroup } from '@/features/docx/utils/knowledge/party-view';
import { useContractSummary } from '@/features/docx/hooks/useContractSummary';
import { ContractAbstract } from '@/features/docx/components/clause-analyzer/ContractAbstract';
import {
	PartySelection,
	type PartyCardData,
} from '@/features/docx/components/clause-analyzer/PartySelection';
import {
	PAIR_SECOND_COLOR,
	PARTY_COLOR,
} from '@/features/docx/components/clause-analyzer/constants';

/** A name with case, accents, punctuation and spacing set aside. */
const loose = (name: string) =>
	name
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();

/** Two names for one party: equal once loosened, or one the start of the other. */
function sameName(x: string, y: string): boolean {
	const a = loose(x);
	const b = loose(y);
	return a !== '' && b !== '' && (a.startsWith(b) || b.startsWith(a));
}

interface PartyEntryProps {
	docId: string;
	kg: KnowledgeGraph;
	mergeGroups: MergeGroup[];
	onMerge: (ids: string[]) => void;
	onSplit: (groupId: string) => void;
	onDelete: (partyId: string) => void;
	onContinue: (partyAId: string, partyBId: string) => void;
}

export function PartyEntry({
	docId,
	kg,
	mergeGroups,
	onMerge,
	onSplit,
	onDelete,
	onContinue,
}: PartyEntryProps) {
	const [slotOverride, setSlotOverride] = useState<[string | null, string | null] | null>(null);
	const { summary, status, generate } = useContractSummary(docId);

	const parties = useMemo<PartyCardData[]>(() => {
		// The abstract says what each party does; its role, when it gives one, reads better than
		// the graph's. Its party ids come from the run that wrote it, so a line speaks for a party
		// only when the names agree: by id first, else by name. A party no line names, such as a
		// merged entity, keeps the graph's role and says nothing more.
		const lines = summary?.parties ?? [];
		const merged = new Set(mergeGroups.map((group) => group.id));
		const lineFor = (party: { id: string; name: string }) => {
			// «A + B» starts with A's name, yet A's line does not speak for the pair.
			if (merged.has(party.id)) return null;
			const byId = lines.find((line) => line.partyId === party.id);
			if (byId && sameName(byId.name, party.name)) return byId;
			return lines.find((line) => sameName(line.name, party.name)) ?? null;
		};
		const tally = new Map<string, PartyCardData>(
			kg.parties.map((p) => {
				const line = lineFor(p);
				return [
					p.id,
					{ id: p.id, name: p.name, role: line?.role || p.role, does: line?.does ?? '', total: 0 },
				];
			})
		);
		for (const v of deonticNodes(kg)) {
			for (const partyId of new Set([v.burdenPartyId, v.benefitPartyId])) {
				const row = partyId ? tally.get(partyId) : undefined;
				if (row) row.total += 1;
			}
		}
		return [...tally.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
	}, [kg, summary, mergeGroups]);

	const slots = useMemo<[string | null, string | null]>(() => {
		const known = new Set(kg.parties.map((p) => p.id));
		const prune = (seat: string | null) => (seat && known.has(seat) ? seat : null);
		if (slotOverride) return [prune(slotOverride[0]), prune(slotOverride[1])];
		const suggested = defaultPair(kg);
		return suggested ? [suggested[0], suggested[1]] : [null, null];
	}, [kg, slotOverride]);

	const assign = useCallback(
		(id: string, side?: 0 | 1) =>
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
			}),
		[slots]
	);

	/** The abstract's own ids are raw party ids; a seat may hold a merge group instead. */
	const colorByPartyId = useMemo(() => {
		const byId = new Map<string, string>();
		const groupById = new Map(mergeGroups.map((g) => [g.id, g] as const));
		([0, 1] as const).forEach((side) => {
			const seat = slots[side];
			if (!seat) return;
			const color = side === 0 ? PARTY_COLOR : PAIR_SECOND_COLOR;
			const group = groupById.get(seat);
			for (const member of group ? group.members : [seat]) byId.set(member, color);
		});
		return byId;
	}, [slots, mergeGroups]);

	/** The party an abstract's mention means: its own id, unless the abstract names someone
	 *  else under that id, and then the party with that name. */
	const mentionedParty = useCallback(
		(partyId: string) => {
			const line = summary?.parties.find((p) => p.partyId === partyId);
			const party = kg.parties.find((p) => p.id === partyId);
			if (!line || !party || sameName(line.name, party.name)) return partyId;
			return kg.parties.find((p) => sameName(line.name, p.name))?.id ?? null;
		},
		[summary, kg]
	);

	const colorOf = useCallback(
		(partyId: string | null) => {
			const id = partyId ? mentionedParty(partyId) : null;
			return id ? (colorByPartyId.get(id) ?? null) : null;
		},
		[colorByPartyId, mentionedParty]
	);

	return (
		// Centred in the panel's height at a reading width: the space left over reads as a
		// margin around one block, not as an empty half under it. A tall block scrolls.
		<div className="flex h-full min-h-0 flex-col overflow-y-auto">
			<div className="mx-auto my-auto w-full max-w-[56rem] space-y-12 px-12 pt-8 pb-14">
				<ContractAbstract
					status={status}
					summary={summary}
					onGenerate={generate}
					colorOf={colorOf}
				/>
				<PartySelection
					parties={parties}
					slots={slots}
					slotColors={[PARTY_COLOR, PAIR_SECOND_COLOR]}
					onAssign={assign}
					onRelease={(side) => {
						const next: [string | null, string | null] = [...slots];
						next[side] = null;
						setSlotOverride(next);
					}}
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
			</div>
		</div>
	);
}
