'use client';

import { useEffect, useState, type RefObject } from 'react';
import {
	computeRelatedBridge,
	EMPTY_RELATED_BRIDGE,
	type RelatedBridge,
} from '@/features/docx/utils/related/related-bridge';
import { attachShiftWheelCompression } from '@/features/docx/utils/docx-engine/shift-wheel-compression';
import type { Node as ParagraphNode, RelatedParagraph } from '@/types/document';

const COMPRESS_DURATION_MS = 560;

const NODE_CLASSES = [
	'docx-paragraph-explanation-selected',
	'docx-paragraph-explanation-related',
	'docx-paragraph-explanation-source-hidden',
	'docx-paragraph-explanation-muted',
];

interface UseRelatedBridgeParams {
	active: boolean;
	renderEpoch: number;
	scrollHostRef: RefObject<HTMLElement | null>;
	paragraphElementById: Map<string, HTMLElement>;
	selectedParagraph: ParagraphNode | null;
	related: RelatedParagraph[];
}

/**
 * Maintains the "bridge" of related paragraphs: the line/connector with the
 * selected paragraph, the reference/similarity labels and the **Shift + Scroll**
 * compression that brings the related ones closer (with their collapsed card).
 * Recomputes with RAF on scroll/resize and applies the state classes to the nodes.
 * Port of the `paragraphExplanationConnectors` system from the Svelte `+page.svelte`.
 */
export function useRelatedBridge({
	active,
	renderEpoch,
	scrollHostRef,
	paragraphElementById,
	selectedParagraph,
	related,
}: UseRelatedBridgeParams) {
	const [bridge, setBridge] = useState<RelatedBridge>(EMPTY_RELATED_BRIDGE);

	const clearNodeClasses = () => {
		for (const element of paragraphElementById.values()) {
			element.classList.remove(...NODE_CLASSES);
		}
	};

	const applyNodeClasses = (movedNodeIds: Set<string>, compression: number) => {
		clearNodeClasses();
		if (!selectedParagraph?.id) return;
		const shouldMute = compression > 0.02 && movedNodeIds.size > 0;
		if (shouldMute) {
			for (const element of paragraphElementById.values()) {
				element.classList.add('docx-paragraph-explanation-muted');
			}
		}

		const selectedElement = paragraphElementById.get(selectedParagraph.id);
		selectedElement?.classList.remove('docx-paragraph-explanation-muted');
		selectedElement?.classList.add('docx-paragraph-explanation-selected');

		for (const item of related) {
			const relatedElement = paragraphElementById.get(item.node.id);
			relatedElement?.classList.remove('docx-paragraph-explanation-muted');
			relatedElement?.classList.add('docx-paragraph-explanation-related');
			if (compression > 0.02 && movedNodeIds.has(item.node.id)) {
				relatedElement?.classList.add('docx-paragraph-explanation-source-hidden');
			}
		}
	};

	useEffect(() => {
		const host = scrollHostRef.current;
		if (!active || !host || renderEpoch === 0 || !selectedParagraph) {
			setBridge(EMPTY_RELATED_BRIDGE);
			clearNodeClasses();
			return;
		}

		const refresh = (compression: number) => {
			const currentHost = scrollHostRef.current;
			if (!currentHost || !selectedParagraph) return;
			const result = computeRelatedBridge({
				scrollHost: currentHost,
				paragraphElementById,
				selectedParagraph,
				related,
				compression,
			});
			applyNodeClasses(result.movedNodeIds, compression);
			setBridge(result);
		};

		const cleanup = attachShiftWheelCompression({
			host,
			durationMs: COMPRESS_DURATION_MS,
			refresh,
		});

		return () => {
			cleanup();
			clearNodeClasses();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [active, renderEpoch, scrollHostRef, paragraphElementById, selectedParagraph, related]);

	return bridge;
}
