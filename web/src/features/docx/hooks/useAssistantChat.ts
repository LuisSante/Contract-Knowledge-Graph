'use client';

import { useEffect, useRef, useState } from 'react';
import { useDocumentStore } from '@/stores/document';
import { fetchAssistantResponse } from '@/services/assistant';
import { getAxiosErrorMessage } from '@/features/docx/utils/docx-engine/http-error';
import {
	buildAssistantHistoryPayload,
	buildAssistantNodeSnapshot,
	buildAssistantRelatedContext,
	resolveAssistantSuggestedQuestions,
} from '@/features/docx/utils/assistant/assistant';
import { buildUserMessage } from '@/features/docx/utils/assistant/message-builders';
import type {
	AssistantChatMessage,
	AssistantChatRequest,
	AssistantMode,
	AssistantProvider,
	AssistantScope,
	ParagraphEditState,
	RelatedParagraph,
} from '@/types/document';

interface UseAssistantChatParams {
	docId: string;
	nodeEditStateById: Map<string, ParagraphEditState>;
	/** Related paragraphs of the selected one (context). */
	selectedRelatedParagraphs?: RelatedParagraph[];
	/** Global analysis model (optional, forwarded to the backend). */
	model?: string;
}

/**
 * Generic assistant chat over the contract: a single `messages` thread with
 * free-text questions, citations, suggested questions, and entity-highlight
 * toggling in the chat bubbles. The message builders live in `utils/assistant`.
 */
export function useAssistantChat({
	docId,
	nodeEditStateById,
	selectedRelatedParagraphs = [],
	model,
}: UseAssistantChatParams) {
	const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
	const [input, setInput] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [mode] = useState<AssistantMode>('explain');
	const [scope, setScope] = useState<AssistantScope>('full_contract');
	const [provider, setProvider] = useState<AssistantProvider>('openai');
	const [entityHighlightsEnabled, setEntityHighlightsEnabled] = useState(true);

	// Mirror of `messages` to build the history without depending on the re-render.
	const messagesRef = useRef<AssistantChatMessage[]>([]);
	useEffect(() => {
		messagesRef.current = messages;
	}, [messages]);

	const messageCounter = useRef(0);
	const nextMessageId = () => {
		messageCounter.current += 1;
		return `assistant-msg-${messageCounter.current}`;
	};

	/** Core of a chat question (free text or text quick-action). */
	const submitAssistantQuestion = async (
		questionOverride?: string,
		opts?: { scope?: AssistantScope }
	) => {
		if (loading) return;
		const question = (questionOverride ?? input).trim();
		if (!question) return;
		if (!docId) {
			setError('No document is loaded.');
			return;
		}

		const effectiveScope = opts?.scope ?? scope;
		const { paragraphs, selectedParagraph } = useDocumentStore.getState();
		const paragraphNodes = buildAssistantNodeSnapshot(paragraphs, nodeEditStateById);
		if (paragraphNodes.length === 0) {
			setError('The contract is still loading.');
			return;
		}
		if (effectiveScope === 'selected' && !selectedParagraph) {
			setError('Select a paragraph before asking in selected-paragraph mode.');
			return;
		}

		setError(null);
		const historyBeforeAnswer: AssistantChatMessage[] = [
			...messagesRef.current,
			buildUserMessage(nextMessageId(), question),
		];
		setMessages(historyBeforeAnswer);
		if (!questionOverride) setInput('');
		setLoading(true);

		const payload: AssistantChatRequest = {
			documentId: docId,
			question,
			mode,
			scope: effectiveScope,
			provider,
			model: model?.trim() || undefined,
			selectedParagraphId: selectedParagraph?.id ?? null,
			relatedParagraphs: buildAssistantRelatedContext(selectedRelatedParagraphs),
			paragraphNodes,
			history: buildAssistantHistoryPayload(historyBeforeAnswer),
		};

		try {
			const response = await fetchAssistantResponse(payload);
			setMessages((prev) => [
				...prev,
				{
					id: nextMessageId(),
					role: 'assistant',
					content: response.answer,
					citations: response.citations,
					suggestedQuestions: resolveAssistantSuggestedQuestions(response.suggestedQuestions, {
						mode,
						scope: effectiveScope,
					}),
				},
			]);
		} catch (err) {
			const message = getAxiosErrorMessage(err, 'Failed to generate a response.');
			setError(message);
			setMessages((prev) => [
				...prev,
				{ id: nextMessageId(), role: 'assistant', content: message },
			]);
		} finally {
			setLoading(false);
		}
	};

	const submit = (questionOverride?: string) => submitAssistantQuestion(questionOverride);

	const toggleEntityHighlights = () => setEntityHighlightsEnabled((prev) => !prev);

	const handleKeydown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void submit();
		}
	};

	return {
		messages,
		input,
		loading,
		error,
		scope,
		provider,
		entityHighlightsEnabled,
		setScope,
		setProvider,
		setInput,
		submit,
		handleKeydown,
		toggleEntityHighlights,
	};
}
