'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import {
	computeContradictionMarkers,
	type ContradictionEvidenceCollapsedCard,
	type ContradictionEvidenceLink,
} from '@/features/docx/utils/contradiction/contradiction-markers';
import { attachShiftWheelCompression } from '@/features/docx/utils/docx-engine/shift-wheel-compression';
import type { ContradictionParagraphResult, ContradictionScrollMarker } from '@/types/document';

const COMPRESS_DURATION_MS = 420;
const SOURCE_HIDDEN_CLASS = 'docx-contradiction-source-hidden';

interface UseContradictionScrollMarkersParams {
	active: boolean;
	renderEpoch: number;
	scrollHostRef: RefObject<HTMLElement | null>;
	paragraphElementById: Map<string, HTMLElement>;
	resultsByParagraphId: Map<string, ContradictionParagraphResult>;
	selectedParagraphId: string | null;
}

function isInterParagraph(result: ContradictionParagraphResult | undefined): boolean {
	if (!result?.contradiction) return false;
	const evidence = result.evidence;
	return (
		(evidence?.source_a || '').trim().toLowerCase() === 'context' ||
		(evidence?.source_b || '').trim().toLowerCase() === 'context'
	);
}

export function useContradictionScrollMarkers({
	active,
	renderEpoch,
	scrollHostRef,
	paragraphElementById,
	resultsByParagraphId,
	selectedParagraphId,
}: UseContradictionScrollMarkersParams) {
	const [markers, setMarkers] = useState<ContradictionScrollMarker[]>([]);
	const [link, setLink] = useState<ContradictionEvidenceLink | null>(null);
	const [collapsedCards, setCollapsedCards] = useState<ContradictionEvidenceCollapsedCard[]>([]);

	const hiddenIdsRef = useRef<Set<string>>(new Set());

	const clearHidden = () => {
		for (const id of hiddenIdsRef.current) {
			paragraphElementById.get(id)?.classList.remove(SOURCE_HIDDEN_CLASS);
		}
		hiddenIdsRef.current = new Set();
	};

	useEffect(() => {
		const host = scrollHostRef.current;
		if (!active || !host || renderEpoch === 0) {
			setMarkers([]);
			setLink(null);
			setCollapsedCards([]);
			clearHidden();
			return;
		}

		const applyHidden = (nextHidden: string[]) => {
			const nextSet = new Set(nextHidden);
			for (const id of hiddenIdsRef.current) {
				if (!nextSet.has(id)) paragraphElementById.get(id)?.classList.remove(SOURCE_HIDDEN_CLASS);
			}
			for (const id of nextSet) {
				paragraphElementById.get(id)?.classList.add(SOURCE_HIDDEN_CLASS);
			}
			hiddenIdsRef.current = nextSet;
		};

		const refresh = (compression: number) => {
			const currentHost = scrollHostRef.current;
			if (!currentHost) return;
			const result = computeContradictionMarkers({
				scrollHost: currentHost,
				paragraphElementById,
				resultsByParagraphId,
				selectedParagraphId,
				compression,
			});
			applyHidden(result.hiddenParagraphIds);
			setMarkers(result.markers);
			setLink(result.link);
			setCollapsedCards(result.collapsedCards);
		};

		const cleanup = attachShiftWheelCompression({
			host,
			durationMs: COMPRESS_DURATION_MS,
			refresh,
			// Only compresses when the evidence lives in different paragraphs.
			canCompress: () =>
				isInterParagraph(
					selectedParagraphId ? resultsByParagraphId.get(selectedParagraphId) : undefined
				),
		});

		return () => {
			cleanup();
			clearHidden();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [active, renderEpoch, scrollHostRef, paragraphElementById, resultsByParagraphId, selectedParagraphId]);

	return { markers, link, collapsedCards };
}
