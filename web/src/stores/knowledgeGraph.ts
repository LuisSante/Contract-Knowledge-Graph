import { create } from 'zustand';
import type { RelatedParagraph } from '@/types/document';
import type { DocumentEntityHighlight } from '@/features/docx/utils/assistant/entity-marks';
import type { DeonticTone, KgLedger } from '@/features/docx/utils/knowledge/attention';

export const MAX_KG_HOPS = 5;
export const DEFAULT_KG_TOP_K = 10;
export const MIN_KG_TOP_K = 5;
export const MAX_KG_TOP_K = 50;
const KG_TOP_K_STEP = 5;

export interface KnowledgeGraphBridgePayload {
	/** First paragraph where the top match appears — we scroll here. */
	anchorParagraphId: string | null;
	/** Paragraphs of the focus set, brought closer to the anchor. */
	relatedParagraphs: RelatedParagraph[];
	/** Entity fragments (party names, provision spans, clause refs) to underline. */
	entities: DocumentEntityHighlight[];
	/** Every paragraph touched by the focus (anchor + related), for entity marks. */
	paragraphIds: string[];
	/** KG node ids in focus (party + top provisions + clauses, or the neighborhood). */
	focusNodeIds: string[];
	/** Per-node normalized attention (0..1) for node sizing (party focus only). */
	nodeScores: Record<string, number>;
	/** Per-paragraph normalized attention (0..1) for the deontic rail opacity. */
	scoreByParagraphId: Record<string, number>;
	/** Per-paragraph burden/benefit tone for the deontic rail color. */
	toneByParagraphId: Record<string, DeonticTone>;
	/** Impact ledger for the focused party (null for clause/provision focus). */
	ledger: KgLedger | null;
}

const EMPTY_PAYLOAD: KnowledgeGraphBridgePayload = {
	anchorParagraphId: null,
	relatedParagraphs: [],
	entities: [],
	paragraphIds: [],
	focusNodeIds: [],
	nodeScores: {},
	scoreByParagraphId: {},
	toneByParagraphId: {},
	ledger: null,
};

interface KnowledgeGraphState extends KnowledgeGraphBridgePayload {
	focusNodeId: string | null;
	/** Neighborhood radius for clause/provision focus. */
	hops: number;
	/** Number of top-attention provisions shown for a party focus. */
	topK: number;

	focusNode: (nodeId: string) => void;
	setHops: (updater: number | ((prev: number) => number)) => void;
	setTopK: (updater: number | ((prev: number) => number)) => void;
	clearFocus: () => void;
	setBridgePayload: (payload: KnowledgeGraphBridgePayload) => void;
}

export const useKnowledgeGraphStore = create<KnowledgeGraphState>((set) => ({
	focusNodeId: null,
	hops: 1,
	topK: DEFAULT_KG_TOP_K,
	...EMPTY_PAYLOAD,

	focusNode: (focusNodeId) => set({ focusNodeId, hops: 1 }),
	setHops: (updater) =>
		set((state) => {
			const next = typeof updater === 'function' ? updater(state.hops) : updater;
			return { hops: Math.min(MAX_KG_HOPS, Math.max(0, next)) };
		}),
	setTopK: (updater) =>
		set((state) => {
			const raw = typeof updater === 'function' ? updater(state.topK) : updater;
			const snapped = Math.round(raw / KG_TOP_K_STEP) * KG_TOP_K_STEP;
			return { topK: Math.min(MAX_KG_TOP_K, Math.max(MIN_KG_TOP_K, snapped)) };
		}),
	clearFocus: () => set({ focusNodeId: null, hops: 1, ...EMPTY_PAYLOAD }),
	setBridgePayload: (payload) => set(payload),
}));

export const KG_TOP_K_STEP_SIZE = KG_TOP_K_STEP;
