import { create } from 'zustand';
import type { EvidenceParagraph } from '@/types/document';
import type { KgNodeKind } from '@/types/knowledge';
import type { EntityHighlight } from '@/features/docx/utils/assistant/entity-marks';
import type {
	DeonticSeverity,
	DeonticTone,
	KgLedger,
} from '@/features/docx/utils/knowledge/party-ledger';
import { DEFAULT_SEVERITY } from '@/features/docx/utils/knowledge/party-ledger';
import type { MergeGroup } from '@/features/docx/utils/knowledge/party-view';
import type { DocumentTarget } from '@/features/docx/utils/knowledge/graph-payload';

export function mergeGroupId(members: Iterable<string>): string {
	return `merge:${[...members].sort().join('+')}`;
}

export const DEFAULT_TOP_K = 10;

export interface GraphPayload {
	anchorParagraphId: string | null;
	relatedParagraphs: EvidenceParagraph[];
	entities: EntityHighlight[];
	paragraphIds: string[];
	focusNodeIds: string[];
	nodeScores: Record<string, number>;
	scoreByParagraph: Record<string, number>;
	toneByParagraph: Record<string, DeonticTone>;
	ledger: KgLedger | null;
}

const EMPTY_PAYLOAD: GraphPayload = {
	anchorParagraphId: null,
	relatedParagraphs: [],
	entities: [],
	paragraphIds: [],
	focusNodeIds: [],
	nodeScores: {},
	scoreByParagraph: {},
	toneByParagraph: {},
	ledger: null,
};

export interface FocusMeta {
	label: string;
	kind: KgNodeKind;
}

const CLEARED_FOCUS = { focusNodeId: null, focusMeta: null, ...EMPTY_PAYLOAD };

interface ClauseAnalyzerState extends GraphPayload {
	focusNodeId: string | null;
	focusMeta: FocusMeta | null;
	hops: number;
	topK: number;
	severity: DeonticSeverity;
	mergeGroups: MergeGroup[];
	hiddenParties: string[];
	secondPartyId: string | null;
	/** Counts every jump to the contract, so asking for the same place again still lands there. */
	documentTargetSeq: number;
	/** The clause picked in the table or in the graph; both tabs show the same one. Keyed
	 *  by document, since every contract has a clause-1. */
	selectedClause: { docId: string; clauseId: string } | null;

	focusNode: (nodeId: string) => void;
	setFocusMeta: (meta: FocusMeta | null) => void;
	mergeParties: (ids: string[]) => void;
	splitGroup: (groupId: string) => void;
	hideParty: (id: string) => void;
	unhideParty: (id: string) => void;
	clearPartyView: () => void;
	clearFocus: () => void;
	setPayload: (payload: GraphPayload) => void;
	setDocumentTarget: (target: DocumentTarget) => void;
	focusPair: (anchorId: string, secondId: string) => void;
	selectClause: (docId: string, clauseId: string | null) => void;
}

export const useClauseAnalyzerStore = create<ClauseAnalyzerState>((set) => ({
	focusNodeId: null,
	focusMeta: null,
	hops: 1,
	topK: DEFAULT_TOP_K,
	severity: DEFAULT_SEVERITY,
	mergeGroups: [],
	hiddenParties: [],
	secondPartyId: null,
	documentTargetSeq: 0,
	selectedClause: null,
	...EMPTY_PAYLOAD,

	focusNode: (focusNodeId) => set({ focusNodeId, hops: 1, secondPartyId: null }),
	setFocusMeta: (focusMeta) => set({ focusMeta }),
	mergeParties: (ids) =>
		set((state) => {
			const groupById = new Map(state.mergeGroups.map((g) => [g.id, g]));
			const members = new Set<string>();
			for (const id of ids) {
				const group = groupById.get(id);
				if (group) group.members.forEach((m) => members.add(m));
				else members.add(id);
			}
			if (members.size < 2) return {};
			const sorted = [...members].sort();
			const newGroup: MergeGroup = { id: mergeGroupId(sorted), members: sorted };
			const kept = state.mergeGroups.filter((g) => !g.members.some((m) => members.has(m)));
			const focusNodeId =
				state.focusNodeId && members.has(state.focusNodeId) ? newGroup.id : state.focusNodeId;
			const secondPartyId =
				state.secondPartyId && members.has(state.secondPartyId) ? newGroup.id : state.secondPartyId;
			return {
				mergeGroups: [...kept, newGroup],
				focusNodeId,
				secondPartyId: secondPartyId === focusNodeId ? null : secondPartyId,
			};
		}),
	splitGroup: (groupId) =>
		set((state) => ({
			mergeGroups: state.mergeGroups.filter((g) => g.id !== groupId),
			...(state.secondPartyId === groupId ? { secondPartyId: null } : {}),
			...(state.focusNodeId === groupId ? CLEARED_FOCUS : {}),
		})),
	hideParty: (id) =>
		set((state) => {
			const group = state.mergeGroups.find((g) => g.id === id);
			const toHide = group ? group.members : [id];
			const clears = state.focusNodeId === id || toHide.includes(state.focusNodeId ?? '');
			const strandsSecond =
				state.secondPartyId === id || toHide.includes(state.secondPartyId ?? '');
			return {
				...(strandsSecond ? { secondPartyId: null } : {}),
				hiddenParties: Array.from(new Set([...state.hiddenParties, ...toHide])),
				mergeGroups: group ? state.mergeGroups.filter((g) => g.id !== id) : state.mergeGroups,
				...(clears ? CLEARED_FOCUS : {}),
			};
		}),
	unhideParty: (id) =>
		set((state) => ({ hiddenParties: state.hiddenParties.filter((h) => h !== id) })),
	clearPartyView: () =>
		set((state) => {
			// Dissolving the groups strands a focus that points at a group id.
			const stranded = state.mergeGroups.some((g) => g.id === state.focusNodeId);
			return {
				mergeGroups: [],
				hiddenParties: [],
				secondPartyId: null,
				...(stranded ? CLEARED_FOCUS : {}),
			};
		}),
	clearFocus: () => set({ ...CLEARED_FOCUS, hops: 1, secondPartyId: null }),
	setPayload: (payload) => set(payload),
	setDocumentTarget: (target) =>
		set((state) => ({ ...target, documentTargetSeq: state.documentTargetSeq + 1 })),
	focusPair: (focusNodeId, secondPartyId) => set({ focusNodeId, secondPartyId, hops: 1 }),
	selectClause: (docId, clauseId) => set({ selectedClause: clauseId ? { docId, clauseId } : null }),
}));
