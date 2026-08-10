'use client';

import { useState } from 'react';
import { useDocumentStore } from '@/stores/document';
import { fetchAssistantResponse } from '@/services/assistant';
import { getAxiosErrorMessage } from '@/features/docx/utils/docx-engine/http-error';
import { buildAssistantNodeSnapshot, buildAssistantRelatedContext } from '@/features/docx/utils/assistant/assistant';
import { getNodeCurrentText } from '@/features/docx/utils/edit/edit';
import {
	PARAGRAPH_EXPLANATION_PROMPT,
	buildParagraphExplanationEntityHighlights,
	parseParagraphExplanationVariants,
	type ExplanationEntity,
} from '@/features/docx/utils/assistant/paragraph-explanation';
import type { AssistantChatRequest, ParagraphEditState } from '@/types/document';

interface UseParagraphExplanationParams {
	docId: string;
	nodeEditStateById: Map<string, ParagraphEditState>;
}

/**
 * Plain-language explanation of the selected paragraph. Reuses `/assistant/chat`
 * with a special prompt and parses the response into short / detailed / entities.
 *
 * Deferred: LLM cost confirmation, related context (empty today) and the entity
 * highlighting inside the document.
 */
export function useParagraphExplanation({ docId, nodeEditStateById }: UseParagraphExplanationParams) {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [short, setShort] = useState('');
	const [detailed, setDetailed] = useState('');
	const [entities, setEntities] = useState<ExplanationEntity[]>([]);
	const [loadedForParagraphId, setLoadedForParagraphId] = useState<string | null>(null);

	const reset = () => {
		setShort('');
		setDetailed('');
		setEntities([]);
		setError(null);
		setLoadedForParagraphId(null);
	};

	const submit = async () => {
		if (loading) return;
		if (!docId) {
			setError('No document is loaded.');
			return;
		}

		const { paragraphs, selectedParagraph } = useDocumentStore.getState();
		if (!selectedParagraph) {
			setError('Select a paragraph before requesting an explanation.');
			return;
		}

		const paragraphNodes = buildAssistantNodeSnapshot(paragraphs, nodeEditStateById);
		if (paragraphNodes.length === 0) {
			setError('The contract is still loading.');
			return;
		}

		const selectedText = getNodeCurrentText(nodeEditStateById, selectedParagraph).trim();
		if (!selectedText) {
			setError('Selected paragraph has no text to explain.');
			return;
		}

		const targetId = selectedParagraph.id;
		setLoading(true);
		setError(null);

		const payload: AssistantChatRequest = {
			documentId: docId,
			question: PARAGRAPH_EXPLANATION_PROMPT,
			mode: 'explain',
			scope: 'selected',
			provider: 'openai',
			selectedParagraphId: targetId,
			relatedParagraphs: buildAssistantRelatedContext([]),
			paragraphNodes,
			history: [],
		};

		try {
			const response = await fetchAssistantResponse(payload);
			const parsed = parseParagraphExplanationVariants(response.answer);
			setShort(parsed.shortText);
			setDetailed(parsed.detailedText);
			setEntities(buildParagraphExplanationEntityHighlights(parsed.entities));
			setLoadedForParagraphId(targetId);
		} catch (err) {
			setError(getAxiosErrorMessage(err, 'Failed to explain the paragraph.'));
		} finally {
			setLoading(false);
		}
	};

	return {
		loading,
		error,
		short,
		detailed,
		entities,
		loadedForParagraphId,
		submit,
		reset,
	};
}
