'use client';

import { useEffect } from 'react';
import {
	clearEntityMarks,
	highlightEntitiesInElement,
	syncHoveredEntityKey,
	type DocumentEntityHighlight,
} from '@/features/docx/utils/assistant/entity-marks';

interface UseDocumentEntityHighlightsParams {
	active: boolean;
	renderEpoch: number;
	paragraphElementById: Map<string, HTMLElement>;
	/** Paragraphs where the entities are highlighted. */
	targetIds: string[];
	entities: DocumentEntityHighlight[];
}

/**
 * Highlights the active knowledge-graph entities inside the target paragraphs.
 */
export function useDocumentEntityHighlights({
	active,
	renderEpoch,
	paragraphElementById,
	targetIds,
	entities,
}: UseDocumentEntityHighlightsParams) {
	const targetKey = targetIds.join('|');
	const entityKey = entities.map((entity) => entity.key).join('|');

	useEffect(() => {
		const clearAll = () => {
			for (const element of paragraphElementById.values()) clearEntityMarks(element);
		};
		clearAll();

		if (!active || renderEpoch === 0 || entities.length === 0 || targetIds.length === 0) {
			syncHoveredEntityKey(null);
			return;
		}

		for (const id of targetIds) {
			const element = paragraphElementById.get(id);
			if (element) highlightEntitiesInElement(element, entities);
		}

		const handleOver = (event: Event) => {
			const target = event.target as HTMLElement | null;
			const node = target?.closest<HTMLElement>('[data-entity-key]') ?? null;
			syncHoveredEntityKey(node?.dataset.entityKey ?? null);
		};
		const handleOut = (event: Event) => {
			const related = (event as MouseEvent).relatedTarget as HTMLElement | null;
			if (related?.closest('[data-entity-key]')) return;
			syncHoveredEntityKey(null);
		};
		document.addEventListener('mouseover', handleOver);
		document.addEventListener('mouseout', handleOut);

		return () => {
			document.removeEventListener('mouseover', handleOver);
			document.removeEventListener('mouseout', handleOut);
			clearAll();
			syncHoveredEntityKey(null);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [active, renderEpoch, targetKey, entityKey, paragraphElementById]);
}
