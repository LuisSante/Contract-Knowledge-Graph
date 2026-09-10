import { create } from 'zustand';
import type { EvidenceParagraph } from '@/types/document';
import type { DeonticKind, KgNodeKind } from '@/types/knowledge';
import type { EntityHighlight } from '@/features/docx/utils/assistant/entity-marks';
import type {
	DeonticSeverity,
	DeonticTone,
	KgLedger,
} from '@/features/docx/utils/knowledge/party-pagerank';
import { DEFAULT_SEVERITY } from '@/features/docx/utils/knowledge/party-pagerank';
import type { MergeGroup } from '@/features/docx/utils/knowledge/party-view';
import type { DocumentTarget } from '@/features/docx/utils/knowledge/graph-payload';

/**
 * The deterministic id a merge of these members gets. Exported so the entry view
 * can predict where a seated party lands when it is merged, and keep its seat.
 */
export function mergeGroupId(members: Iterable<string>): string {
	return `merge:${[...members].sort().join('+')}`;
}

export const MAX_HOPS = 5;
export const DEFAULT_TOP_K = 10;
export const MIN_TOP_K = 5;
export const MAX_TOP_K = 50;
const TOP_K_STEP = 5;

export interface GraphPayload {
	/** First paragraph where the top match appears — we scroll here. */
	anchorParagraphId: string | null;
	/** Paragraphs of the focus set, brought closer to the anchor. */
	relatedParagraphs: EvidenceParagraph[];
	/** Entity fragments (party names, statement spans, clause refs) to underline. */
	entities: EntityHighlight[];
	/** Every paragraph the focus touches, for entity marks. */
	paragraphIds: string[];
	/** KG node ids in focus (party + top statements + clauses, or the neighborhood). */
	focusNodeIds: string[];
	/** Per-node normalized score (0..1) for node sizing (party focus only). */
	nodeScores: Record<string, number>;
	/** Per-paragraph normalized score (0..1) for the deontic rail opacity. */
	scoreByParagraph: Record<string, number>;
	/** Per-paragraph burden/benefit tone for the deontic rail color. */
	toneByParagraph: Record<string, DeonticTone>;
	/** Impact ledger for the focused party (null for clause/statement focus). */
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

/** Label + kind of the focused node, so the header can render its chip without the graph. */
export interface FocusMeta {
	label: string;
	kind: KgNodeKind;
}

/** Everything that must reset when the focused node goes away. */
const CLEARED_FOCUS = { focusNodeId: null, focusMeta: null, ...EMPTY_PAYLOAD };

interface GraphState extends GraphPayload {
	focusNodeId: string | null;
	focusMeta: FocusMeta | null;
	/** Neighborhood radius for clause/statement focus. */
	hops: number;
	/** Number of top-scoring statements shown for a party focus. */
	topK: number;
	/**
	 * Importance weight per deontic kind. The defaults are the calibrated reading
	 * (prohibition > obligation > right), but the weights are the analyst's own
	 * judgement call, so the legend exposes them as sliders.
	 */
	severity: DeonticSeverity;
	/** Always on: the impact is weighted by Personalized PageRank, not raw severity. */
	usePageRank: boolean;
	/** User-driven party canonicalization (persists across focus). */
	mergeGroups: MergeGroup[];
	hiddenParties: string[];
	/** Parties Ctrl/Cmd-clicked in the graph, the target of the header actions. */
	selectedPartyIds: string[];
	/**
	 * Second party of the pair view, added from the header picker. The first is the
	 * focused party, so this alone flips the ring from one ego view to the union.
	 */
	secondPartyId: string | null;

	focusNode: (nodeId: string) => void;
	setFocusMeta: (meta: FocusMeta | null) => void;
	setHops: (updater: number | ((prev: number) => number)) => void;
	setTopK: (updater: number | ((prev: number) => number)) => void;
	setSeverity: (kind: DeonticKind, value: number) => void;
	resetSeverity: () => void;
	mergeParties: (ids: string[]) => void;
	splitGroup: (groupId: string) => void;
	hideParty: (id: string) => void;
	unhideParty: (id: string) => void;
	clearPartyView: () => void;
	toggleSelectedParty: (id: string) => void;
	clearSelectedParties: () => void;
	clearFocus: () => void;
	setPayload: (payload: GraphPayload) => void;
	/** Move the document without touching the focus, so the ring stays where it is. */
	setDocumentTarget: (target: DocumentTarget) => void;
	setSecondParty: (id: string | null) => void;
	/** Enter the pair view in one step — `focusNode` alone would clear the second party. */
	focusPair: (anchorId: string, secondId: string) => void;
}

export const useGraphStore = create<GraphState>((set) => ({
	focusNodeId: null,
	focusMeta: null,
	hops: 1,
	topK: DEFAULT_TOP_K,
	severity: DEFAULT_SEVERITY,
	usePageRank: true,
	mergeGroups: [],
	hiddenParties: [],
	selectedPartyIds: [],
	secondPartyId: null,
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
				state.secondPartyId && members.has(state.secondPartyId)
					? newGroup.id
					: state.secondPartyId;
			return {
				mergeGroups: [...kept, newGroup],
				focusNodeId,
				selectedPartyIds: [],
				secondPartyId: secondPartyId === focusNodeId ? null : secondPartyId,
			};
		}),
	splitGroup: (groupId) =>
		set((state) => ({
			mergeGroups: state.mergeGroups.filter((g) => g.id !== groupId),
			selectedPartyIds: [],
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
				selectedPartyIds: state.selectedPartyIds.filter((s) => s !== id && !toHide.includes(s)),
				...(clears ? CLEARED_FOCUS : {}),
			};
		}),
	unhideParty: (id) =>
		set((state) => ({ hiddenParties: state.hiddenParties.filter((h) => h !== id) })),
	toggleSelectedParty: (id) =>
		set((state) => ({
			selectedPartyIds: state.selectedPartyIds.includes(id)
				? state.selectedPartyIds.filter((x) => x !== id)
				: [...state.selectedPartyIds, id],
		})),
	clearSelectedParties: () => set({ selectedPartyIds: [] }),
	clearPartyView: () =>
		set((state) => {
			// Dissolving the groups strands a focus that points at a group id.
			const stranded = state.mergeGroups.some((g) => g.id === state.focusNodeId);
			return {
				mergeGroups: [],
				hiddenParties: [],
				selectedPartyIds: [],
				secondPartyId: null,
				...(stranded ? CLEARED_FOCUS : {}),
			};
		}),
	setHops: (updater) =>
		set((state) => {
			const next = typeof updater === 'function' ? updater(state.hops) : updater;
			return { hops: Math.min(MAX_HOPS, Math.max(0, next)) };
		}),
	setTopK: (updater) =>
		set((state) => {
			const raw = typeof updater === 'function' ? updater(state.topK) : updater;
			const snapped = Math.round(raw / TOP_K_STEP) * TOP_K_STEP;
			return { topK: Math.min(MAX_TOP_K, Math.max(MIN_TOP_K, snapped)) };
		}),
	setSeverity: (kind, value) =>
		set((state) => ({
			severity: { ...state.severity, [kind]: Math.min(1, Math.max(0, value)) },
		})),
	resetSeverity: () => set({ severity: DEFAULT_SEVERITY }),
	clearFocus: () => set({ ...CLEARED_FOCUS, hops: 1, secondPartyId: null }),
	setPayload: (payload) => set(payload),
	setDocumentTarget: (target) => set(target),
	setSecondParty: (secondPartyId) => set({ secondPartyId }),
	focusPair: (focusNodeId, secondPartyId) =>
		set({ focusNodeId, secondPartyId, hops: 1 }),
}));

export const KG_TOP_K_STEP_SIZE = TOP_K_STEP;
