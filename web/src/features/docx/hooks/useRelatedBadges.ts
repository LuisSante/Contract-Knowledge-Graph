'use client';

import { useEffect } from 'react';
import { resolveRelatedVisualKind } from '@/features/docx/utils/related/related-bridge';
import type { RelatedParagraph } from '@/types/document';

const BADGE_EMPHASIS_CLASSES = [
	'docx-related-badge-emphasis',
	'docx-related-badge--reference',
	'docx-related-badge--similarity',
];

interface UseRelatedBadgesParams {
	active: boolean;
	paragraphRelationHostById: Map<string, HTMLElement>;
	selectedParagraphId: string | null;
	related: RelatedParagraph[];
}

/**
 * Highlights the relation badges on selection in the Related tab: emphasizes the
 * one of the selected paragraph and those of its related ones, coloring them by
 * direction (blue reference / green similarity). The dimming of the rest is done
 * by CSS via the container's `related-focus-on` class. Port of the badges part of
 * `applyRelatedSelectionHighlight` / `clearRelatedSelectionHighlight` from the Svelte.
 */
export function useRelatedBadges({
	active,
	paragraphRelationHostById,
	selectedParagraphId,
	related,
}: UseRelatedBadgesParams) {
	useEffect(() => {
		const clear = () => {
			for (const host of paragraphRelationHostById.values()) {
				host.classList.remove(...BADGE_EMPHASIS_CLASSES);
			}
		};
		clear();

		if (!active || !selectedParagraphId) return clear;

		paragraphRelationHostById.get(selectedParagraphId)?.classList.add('docx-related-badge-emphasis');
		for (const item of related) {
			const directionClass =
				resolveRelatedVisualKind(item) === 'reference'
					? 'docx-related-badge--reference'
					: 'docx-related-badge--similarity';
			paragraphRelationHostById
				.get(item.node.id)
				?.classList.add('docx-related-badge-emphasis', directionClass);
		}

		return clear;
	}, [active, selectedParagraphId, related, paragraphRelationHostById]);
}
