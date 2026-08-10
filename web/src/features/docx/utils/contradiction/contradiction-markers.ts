import type {
	ContradictionParagraphResult,
	ContradictionScrollMarker
} from '@/types/document';
import { resolveContradictionConfidenceBand } from '@/features/docx/utils/contradiction/contradiction';
import { cloneParagraphForCard } from '@/features/docx/utils/docx-engine/clone-paragraph';

const CONTRADICTION_EVIDENCE_MARKER_MIN_GAP_PX = 18;
const CONTRADICTION_EVIDENCE_COMPRESS_TARGET_GAP_PX = 55;

export interface ContradictionEvidenceLink {
	topPx: number;
	bottomPx: number;
	leftPx: number;
	showA: boolean;
	showB: boolean;
	aCenterPx: number;
	bCenterPx: number;
}

export interface ContradictionEvidenceCollapsedCard {
	topPx: number;
	leftPx: number;
	widthPx: number;
	html: string;
}

export interface ContradictionMarkersResult {
	markers: ContradictionScrollMarker[];
	link: ContradictionEvidenceLink | null;
	/** True if the A/B evidence lives in different paragraphs (compressible). */
	interParagraph: boolean;
	/** Floating card(s) with the clone of the B paragraphs when compressing. */
	collapsedCards: ContradictionEvidenceCollapsedCard[];
	/** Ids (data-node-id) of the B paragraphs to hide while compressing. */
	hiddenParagraphIds: string[];
}

export function computeContradictionMarkers(params: {
	scrollHost: HTMLElement;
	paragraphElementById: Map<string, HTMLElement>;
	resultsByParagraphId: Map<string, ContradictionParagraphResult>;
	selectedParagraphId: string | null;
	/** 0 = real positions, 1 = B fully moved next to A (inter-paragraph only). */
	compression?: number;
}): ContradictionMarkersResult {
	const {
		scrollHost,
		paragraphElementById,
		resultsByParagraphId,
		selectedParagraphId,
		compression = 0,
	} = params;

	const empty: ContradictionMarkersResult = {
		markers: [],
		link: null,
		interParagraph: false,
		collapsedCards: [],
		hiddenParagraphIds: [],
	};

	if (resultsByParagraphId.size === 0) return empty;

	const hostRect = scrollHost.getBoundingClientRect();
	const hostScrollHeight = scrollHost.scrollHeight;
	const hostScrollTop = scrollHost.scrollTop;
	if (!Number.isFinite(hostScrollHeight) || hostScrollHeight <= 0) return empty;

	const nextMarkers: ContradictionScrollMarker[] = [];

	for (const [paragraphId, result] of resultsByParagraphId.entries()) {
		if (!result.contradiction) continue;
		const element = paragraphElementById.get(paragraphId);
		if (!element) continue;

		const confidenceBand = resolveContradictionConfidenceBand(result.confidence);
		const elementRect = element.getBoundingClientRect();
		const centerOffset = elementRect.top - hostRect.top + hostScrollTop + elementRect.height / 2;
		const rawTopPercent = (centerOffset / hostScrollHeight) * 100;
		const topPercent = Math.min(99.6, Math.max(0.4, rawTopPercent));

		nextMarkers.push({ paragraphId, topPercent, confidenceBand });
	}

	nextMarkers.sort((left, right) => left.topPercent - right.topPercent);

	const selectedResult = selectedParagraphId
		? resultsByParagraphId.get(selectedParagraphId)
		: null;
	if (!selectedParagraphId || !selectedResult?.contradiction) {
		return { ...empty, markers: nextMarkers };
	}

	let markA: HTMLElement | null = null;
	let markB: HTMLElement | null = null;
	const bContainers = new Set<HTMLElement>();
	const allMarks = Array.from(
		document.querySelectorAll<HTMLElement>('mark.docx-contradiction-snippet')
	);
	for (const mark of allMarks) {
		if (mark.dataset.contradictionOwner !== selectedParagraphId) continue;
		if (!markA && mark.dataset.contradictionRole === 'a') markA = mark;
		if (mark.dataset.contradictionRole === 'b') {
			if (!markB) markB = mark;
			const container = mark.closest<HTMLElement>('[data-node-id]');
			if (container) bContainers.add(container);
		}
	}

	if (!markA || !markB) return { ...empty, markers: nextMarkers };

	const evidence = selectedResult.evidence;
	const interParagraph =
		(evidence?.source_a || '').trim().toLowerCase() === 'context' ||
		(evidence?.source_b || '').trim().toLowerCase() === 'context';

	const markARect = markA.getBoundingClientRect();
	const markBRect = markB.getBoundingClientRect();
	const aCenterPx = markARect.top - hostRect.top + markARect.height / 2;
	const bCenterPx = markBRect.top - hostRect.top + markBRect.height / 2;
	const showA = aCenterPx >= 0 && aCenterPx <= hostRect.height;
	const showB = bCenterPx >= 0 && bCenterPx <= hostRect.height;

	let displayACenterPx = Math.max(0, Math.min(hostRect.height, aCenterPx));
	let displayBCenterPx = Math.max(0, Math.min(hostRect.height, bCenterPx));
	let bTransformDeltaPx = 0;
	let bVisualCenterPx: number | null = null;
	{
		const currentGap = Math.abs(displayACenterPx - displayBCenterPx);
		if (showA && showB && currentGap < CONTRADICTION_EVIDENCE_MARKER_MIN_GAP_PX) {
			const aIsAbove = displayACenterPx <= displayBCenterPx;
			const center = (displayACenterPx + displayBCenterPx) / 2;
			let top = center - CONTRADICTION_EVIDENCE_MARKER_MIN_GAP_PX / 2;
			let bottom = center + CONTRADICTION_EVIDENCE_MARKER_MIN_GAP_PX / 2;
			if (hostRect.height >= CONTRADICTION_EVIDENCE_MARKER_MIN_GAP_PX) {
				if (top < 0) {
					bottom += -top;
					top = 0;
				}
				if (bottom > hostRect.height) {
					top -= bottom - hostRect.height;
					bottom = hostRect.height;
				}
			} else {
				top = 0;
				bottom = hostRect.height;
			}
			top = Math.max(0, top);
			bottom = Math.min(hostRect.height, bottom);
			if (aIsAbove) {
				displayACenterPx = top;
				displayBCenterPx = bottom;
			} else {
				displayACenterPx = bottom;
				displayBCenterPx = top;
			}
		}
		// Inter-paragraph: A stays fixed and only B moves toward A (Shift+Scroll).
		if (interParagraph && compression > 0) {
			const aFixed = displayACenterPx;
			const bStart = displayBCenterPx;
			const direction = bStart >= aFixed ? 1 : -1;
			const bTarget = aFixed + direction * CONTRADICTION_EVIDENCE_COMPRESS_TARGET_GAP_PX;
			displayBCenterPx = bStart * (1 - compression) + bTarget * compression;
			displayACenterPx = aFixed;
			// Unclamped centers so the floating copy can travel across pages.
			const rawDirection = bCenterPx >= aCenterPx ? 1 : -1;
			const rawTarget = aCenterPx + rawDirection * CONTRADICTION_EVIDENCE_COMPRESS_TARGET_GAP_PX;
			const rawCompressed = bCenterPx * (1 - compression) + rawTarget * compression;
			bTransformDeltaPx = rawCompressed - bCenterPx;
			bVisualCenterPx = rawCompressed;
		}
	}

	// Collapsed cards + ids to hide (only if B actually moved).
	const collapsedCards: ContradictionEvidenceCollapsedCard[] = [];
	const hiddenParagraphIds: string[] = [];
	if (interParagraph && Math.abs(bTransformDeltaPx) > 0.5) {
		for (const container of bContainers) {
			const rect = container.getBoundingClientRect();
			collapsedCards.push({
				topPx: rect.top - hostRect.top + bTransformDeltaPx,
				leftPx: rect.left - hostRect.left,
				widthPx: rect.width,
				html: cloneParagraphForCard(container),
			});
			const nodeId = container.dataset.nodeId;
			if (nodeId) hiddenParagraphIds.push(nodeId);
		}
	}

	const topPx = Math.min(displayACenterPx, displayBCenterPx);
	const bottomPx = Math.max(displayACenterPx, displayBCenterPx);
	if (bottomPx - topPx < 2) {
		return { ...empty, markers: nextMarkers, interParagraph };
	}
	const rightEdge = Math.max(markARect.right, markBRect.right);
	const leftPx = Math.max(8, rightEdge - hostRect.left + 16);

	const link: ContradictionEvidenceLink = {
		topPx,
		bottomPx,
		leftPx,
		showA,
		showB: showB || (interParagraph && compression > 0),
		aCenterPx: displayACenterPx,
		bCenterPx: bVisualCenterPx ?? displayBCenterPx,
	};

	return { markers: nextMarkers, link, interParagraph, collapsedCards, hiddenParagraphIds };
}
