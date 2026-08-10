import type { Node as ParagraphNode, RelatedParagraph } from '@/types/document';
import { cloneParagraphForCard } from '@/features/docx/utils/docx-engine/clone-paragraph';

/**
 * Geometry of the related-paragraphs "bridge": the line/connector that joins the
 * selected paragraph with its related ones, the reference/similarity labels,
 * the folds, the collapsed cards (when moving them closer with Shift+Scroll) and
 * the scroll markers. Port of `refreshParagraphExplanationConnectorPaths` from
 * the Svelte `+page.svelte`, without React.
 */

export type RelatedVisualKind = 'reference' | 'similarity';

const PARAGRAPH_GAP_PX = 10;
const STACK_OFFSET_PX = 18;
const STACK_CARD_GAP_PX = 12;
const CONSECUTIVE_GAP_PX = 24;

export interface RelatedConnector {
	topPx: number;
	bottomPx: number;
	leftPx: number;
	selectedCapTopPx: number;
	selectedCapWidthPx: number;
	relatedCapTopPx: number;
	relatedCapWidthPx: number;
	paragraphId: string;
	relationKind: RelatedVisualKind;
	relationLabel: string;
	labelLeftPx: number;
}

export interface RelatedFold {
	topPx: number;
	leftPx: number;
}

export interface RelatedCollapsedCard {
	paragraphId: string;
	topPx: number;
	leftPx: number;
	widthPx: number;
	html: string;
}

export interface RelatedScrollMarker {
	paragraphId: string;
	topPercent: number;
	kind: RelatedVisualKind;
}

export interface RelatedBridge {
	connectors: RelatedConnector[];
	primaryConnector: RelatedConnector | null;
	folds: RelatedFold[];
	collapsedCards: RelatedCollapsedCard[];
	scrollMarkers: RelatedScrollMarker[];
	movedNodeIds: Set<string>;
}

export const EMPTY_RELATED_BRIDGE: RelatedBridge = {
	connectors: [],
	primaryConnector: null,
	folds: [],
	collapsedCards: [],
	scrollMarkers: [],
	movedNodeIds: new Set(),
};

/** Decides whether a related paragraph is shown as "similarity" or "reference". */
export function resolveRelatedVisualKind(related: RelatedParagraph): RelatedVisualKind {
	const hasSimilarityByType = related.relationTypes.some((relationType) =>
		String(relationType).toLowerCase().includes('semantic')
	);
	const hasSimilarityByScore =
		typeof related.semanticScore === 'number' && Number.isFinite(related.semanticScore);
	if (hasSimilarityByType || hasSimilarityByScore) return 'similarity';

	const isReference =
		related.relationTypes.some((relationType) =>
			String(relationType).toLowerCase().includes('reference')
		) || related.references.length > 0;
	return isReference ? 'reference' : 'reference';
}

/** Sorts the related paragraphs prioritizing reference > semantic score > ref count > order. */
export function sortRelatedParagraphs(related: RelatedParagraph[]): RelatedParagraph[] {
	return [...related].sort((left, right) => {
		const leftReference = left.relationTypes.includes('reference') ? 1 : 0;
		const rightReference = right.relationTypes.includes('reference') ? 1 : 0;
		if (rightReference !== leftReference) return rightReference - leftReference;

		const leftSemantic = left.semanticScore ?? 0;
		const rightSemantic = right.semanticScore ?? 0;
		if (rightSemantic !== leftSemantic) return rightSemantic - leftSemantic;

		const leftReferences = left.references.length;
		const rightReferences = right.references.length;
		if (rightReferences !== leftReferences) return rightReferences - leftReferences;

		return left.node.paragraph_enum - right.node.paragraph_enum;
	});
}

/**
 * List of related paragraphs that feeds the bridge depending on the active tab:
 * - `related`: all of the paragraph's related ones.
 * - `paragraph_explanation`: the tail (beyond the top 5), which is what is no
 *   longer shown in the explanation panel.
 */
export function buildBridgeRelatedParagraphs(
	related: RelatedParagraph[],
	tab: 'related' | 'paragraph_explanation'
): RelatedParagraph[] {
	if (tab === 'related') return related;
	return sortRelatedParagraphs(related).slice(5);
}

interface ComputeRelatedBridgeParams {
	scrollHost: HTMLElement;
	paragraphElementById: Map<string, HTMLElement>;
	selectedParagraph: ParagraphNode;
	related: RelatedParagraph[];
	/** 0 = real positions, 1 = fully moved next to the selected one. */
	compression: number;
}

function paragraphEnumOf(node: ParagraphNode): number {
	return typeof node.paragraph_enum === 'number'
		? node.paragraph_enum
		: Number(node.id.match(/-p-(\d+)$/)?.[1] ?? '0');
}

/**
 * Computes the entire bridge geometry for a given compression state. Measures
 * the real positions of the paragraphs relative to the scroll host and, based on
 * the compression, interpolates the "moved closer" positions.
 */
export function computeRelatedBridge({
	scrollHost,
	paragraphElementById,
	selectedParagraph,
	related,
	compression,
}: ComputeRelatedBridgeParams): RelatedBridge {
	const selectedElement = paragraphElementById.get(selectedParagraph.id);
	if (!selectedElement) return EMPTY_RELATED_BRIDGE;

	const hostRect = scrollHost.getBoundingClientRect();
	const selectedRect = selectedElement.getBoundingClientRect();
	const selectedY = selectedRect.top - hostRect.top + selectedRect.height / 2;
	const selectedEdgeX = selectedRect.left - hostRect.left;

	const anchors: Array<{
		y: number;
		height: number;
		edgeX: number;
		paragraphId: string;
		paragraphEnum: number;
		relationKind: RelatedVisualKind;
		relationLabel: string;
		top: number;
		width: number;
		html: string;
	}> = [];
	for (const item of related) {
		const relatedElement = paragraphElementById.get(item.node.id);
		if (!relatedElement) continue;
		const relatedRect = relatedElement.getBoundingClientRect();
		const relatedY = relatedRect.top - hostRect.top + relatedRect.height / 2;
		const relationKind = resolveRelatedVisualKind(item);
		anchors.push({
			y: relatedY,
			height: relatedRect.height,
			edgeX: relatedRect.left - hostRect.left,
			paragraphId: item.node.id,
			paragraphEnum: item.node.paragraph_enum,
			relationKind,
			relationLabel: relationKind === 'similarity' ? 'Similarity' : 'Reference',
			top: relatedRect.top - hostRect.top,
			width: relatedRect.width,
			html: cloneParagraphForCard(relatedElement),
		});
	}

	if (anchors.length === 0) return EMPTY_RELATED_BRIDGE;

	const sortedAnchors = [...anchors].sort(
		(left, right) => Math.abs(left.y - selectedY) - Math.abs(right.y - selectedY) || left.y - right.y
	);
	const selectedParagraphEnum = paragraphEnumOf(selectedParagraph);
	const selectedTop = selectedRect.top - hostRect.top;
	const selectedBottom = selectedTop + selectedRect.height;

	// Paragraphs that are consecutive and adjacent to the selected one don't move.
	const stationaryByParagraphId = new Map<string, boolean>();
	for (const anchor of anchors) {
		const isConsecutive = Math.abs(anchor.paragraphEnum - selectedParagraphEnum) === 1;
		const anchorBottom = anchor.top + anchor.height;
		const verticalGap =
			anchor.top >= selectedBottom ? anchor.top - selectedBottom : selectedTop - anchorBottom;
		const isSideBySide = verticalGap <= CONSECUTIVE_GAP_PX;
		stationaryByParagraphId.set(anchor.paragraphId, isConsecutive && isSideBySide);
	}

	const stationaryAnchors = anchors.filter((a) => stationaryByParagraphId.get(a.paragraphId) === true);
	const movableAnchors = anchors.filter((a) => stationaryByParagraphId.get(a.paragraphId) !== true);
	const beforeAnchors = movableAnchors
		.filter((a) => a.paragraphEnum < selectedParagraphEnum)
		.sort((left, right) => left.paragraphEnum - right.paragraphEnum);
	const afterAnchors = movableAnchors
		.filter((a) => a.paragraphEnum > selectedParagraphEnum)
		.sort((left, right) => left.paragraphEnum - right.paragraphEnum);
	const equalAnchors = movableAnchors
		.filter((a) => a.paragraphEnum === selectedParagraphEnum)
		.sort((left, right) => left.paragraphId.localeCompare(right.paragraphId));

	const compressedYByParagraphId = new Map<string, number>();
	const compressedTopByParagraphId = new Map<string, number>();
	for (const anchor of stationaryAnchors) {
		compressedYByParagraphId.set(anchor.paragraphId, anchor.y);
		compressedTopByParagraphId.set(anchor.paragraphId, anchor.top);
	}

	const stationaryAbove = stationaryAnchors.filter((a) => a.top < selectedTop);
	const stationaryBelow = stationaryAnchors.filter((a) => a.top >= selectedTop);

	let beforeCursor = selectedTop - STACK_OFFSET_PX;
	if (stationaryAbove.length > 0) {
		const nearestStationaryAboveTop = Math.max(...stationaryAbove.map((a) => a.top));
		beforeCursor = Math.min(beforeCursor, nearestStationaryAboveTop - STACK_CARD_GAP_PX);
	}
	for (const anchor of [...beforeAnchors].sort((left, right) => right.paragraphEnum - left.paragraphEnum)) {
		const stackedTop = beforeCursor - anchor.height;
		const stackedY = stackedTop + anchor.height / 2;
		compressedYByParagraphId.set(anchor.paragraphId, anchor.y * (1 - compression) + stackedY * compression);
		compressedTopByParagraphId.set(
			anchor.paragraphId,
			anchor.top * (1 - compression) + stackedTop * compression
		);
		beforeCursor = stackedTop - STACK_CARD_GAP_PX;
	}

	let afterCursor = selectedBottom + STACK_OFFSET_PX;
	if (stationaryBelow.length > 0) {
		const nearestStationaryBelowBottom = Math.min(...stationaryBelow.map((a) => a.top + a.height));
		afterCursor = Math.max(afterCursor, nearestStationaryBelowBottom + STACK_CARD_GAP_PX);
	}
	for (const anchor of [...equalAnchors, ...afterAnchors]) {
		const stackedTop = afterCursor;
		const stackedY = stackedTop + anchor.height / 2;
		compressedYByParagraphId.set(anchor.paragraphId, anchor.y * (1 - compression) + stackedY * compression);
		compressedTopByParagraphId.set(
			anchor.paragraphId,
			anchor.top * (1 - compression) + stackedTop * compression
		);
		afterCursor = stackedTop + anchor.height + STACK_CARD_GAP_PX;
	}

	const edgeBaseX = Math.min(selectedEdgeX, ...sortedAnchors.map((a) => a.edgeX));
	const baseLeft = Math.max(4, edgeBaseX - 20);
	const trunkTop = Math.min(
		selectedY,
		...sortedAnchors.map((a) => compressedYByParagraphId.get(a.paragraphId) ?? a.y)
	);
	const trunkBottom = Math.max(
		selectedY,
		...sortedAnchors.map((a) => compressedYByParagraphId.get(a.paragraphId) ?? a.y)
	);
	const selectedCapWidthPx = Math.max(8, selectedEdgeX - baseLeft - PARAGRAPH_GAP_PX);

	const connectors: RelatedConnector[] = sortedAnchors.map((anchor) => ({
		topPx: trunkTop,
		bottomPx: trunkBottom,
		leftPx: baseLeft,
		selectedCapTopPx: selectedY,
		selectedCapWidthPx,
		relatedCapTopPx: compressedYByParagraphId.get(anchor.paragraphId) ?? anchor.y,
		relatedCapWidthPx: Math.max(8, anchor.edgeX - baseLeft - PARAGRAPH_GAP_PX),
		paragraphId: anchor.paragraphId,
		relationKind: anchor.relationKind,
		relationLabel: anchor.relationLabel,
		labelLeftPx: baseLeft - 50,
	}));

	const movedNodeIds = new Set<string>();
	for (const anchor of anchors) {
		const movedTop = compressedTopByParagraphId.get(anchor.paragraphId) ?? anchor.top;
		if (Math.abs(movedTop - anchor.top) > 1.5) movedNodeIds.add(anchor.paragraphId);
	}

	let folds: RelatedFold[] = [];
	if (compression > 0.03 && movedNodeIds.size > 0) {
		const foldSourceY = [
			selectedY,
			...sortedAnchors.map((a) => compressedYByParagraphId.get(a.paragraphId) ?? a.y),
		]
			.sort((left, right) => left - right)
			.filter((value, index, list) => index === 0 || Math.abs(value - list[index - 1]) > 2);
		const nextFolds: RelatedFold[] = [];
		for (let index = 0; index < foldSourceY.length - 1; index += 1) {
			const upper = foldSourceY[index];
			const lower = foldSourceY[index + 1];
			if (lower - upper < 26) continue;
			nextFolds.push({ topPx: upper + (lower - upper) / 2, leftPx: baseLeft });
		}
		folds = nextFolds;
	}

	const cardsLeft = Math.max(14, selectedRect.left - hostRect.left);
	const collapsedCards: RelatedCollapsedCard[] =
		compression > 0.02 && movedNodeIds.size > 0
			? anchors
					.filter((anchor) => movedNodeIds.has(anchor.paragraphId))
					.map((anchor) => ({
						paragraphId: anchor.paragraphId,
						topPx: compressedTopByParagraphId.get(anchor.paragraphId) ?? anchor.top,
						leftPx: cardsLeft,
						widthPx: Math.min(anchor.width, hostRect.width - cardsLeft - 20),
						html: anchor.html,
					}))
					.sort((left, right) => left.topPx - right.topPx)
			: [];

	const scrollMarkers: RelatedScrollMarker[] = [];
	const hostScrollHeight = scrollHost.scrollHeight;
	if (Number.isFinite(hostScrollHeight) && hostScrollHeight > 0) {
		for (const item of related) {
			const relatedElement = paragraphElementById.get(item.node.id);
			if (!relatedElement) continue;
			const relatedRect = relatedElement.getBoundingClientRect();
			const centerOffset =
				relatedRect.top - hostRect.top + scrollHost.scrollTop + relatedRect.height / 2;
			const rawTopPercent = (centerOffset / hostScrollHeight) * 100;
			scrollMarkers.push({
				paragraphId: item.node.id,
				topPercent: Math.min(99.6, Math.max(0.4, rawTopPercent)),
				kind: resolveRelatedVisualKind(item),
			});
		}
		scrollMarkers.sort((left, right) => left.topPercent - right.topPercent);
	}

	return {
		connectors,
		primaryConnector: connectors[0] ?? null,
		folds,
		collapsedCards,
		scrollMarkers,
		movedNodeIds,
	};
}
