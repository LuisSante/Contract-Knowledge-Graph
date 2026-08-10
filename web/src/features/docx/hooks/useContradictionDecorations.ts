'use client';

import { useEffect } from 'react';
import {
	applyContradictionHighlights,
	clearContradictionHighlights,
} from '@/features/docx/utils/contradiction/contradiction-decorations';
import type { ContradictionParagraphResult } from '@/types/document';

interface UseContradictionDecorationsParams {
	/** The analysis panel is visible (the 'analysis' tab is open). */
	active: boolean;
	/** Incremented on completion of each document render. */
	renderEpoch: number;
	resultsByParagraphId: Map<string, ContradictionParagraphResult>;
	paragraphElementById: Map<string, HTMLElement>;
	selectedParagraphId: string | null;
}

/**
 * Applies/clears the contradiction decorations over the rendered DOM
 * (highlight classes on paragraphs + `<mark>` snippets). Re-runs when the
 * render, the results, the selection or the panel visibility change.
 *
 * Deferred: side marker rail, compression animation and SVG link.
 */
export function useContradictionDecorations({
	active,
	renderEpoch,
	resultsByParagraphId,
	paragraphElementById,
	selectedParagraphId,
}: UseContradictionDecorationsParams) {
	useEffect(() => {
		if (!active || renderEpoch === 0) {
			clearContradictionHighlights(paragraphElementById);
			return;
		}

		applyContradictionHighlights({
			resultsByParagraphId,
			paragraphElementById,
			selectedParagraphId,
		});

		return () => {
			clearContradictionHighlights(paragraphElementById);
		};
	}, [active, renderEpoch, resultsByParagraphId, selectedParagraphId, paragraphElementById]);
}
