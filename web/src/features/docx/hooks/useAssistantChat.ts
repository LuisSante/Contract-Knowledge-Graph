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
import {
	useContradictionQuickActions,
	type ConfirmLlmEstimate,
} from '@/features/docx/hooks/useContradictionQuickActions';
import type {
	AssistantChatMessage,
	AssistantChatRequest,
	AssistantMode,
	AssistantProvider,
	AssistantScope,
	ContradictionParagraphResult,
	ParagraphEditState,
	RelatedParagraph,
} from '@/types/document';

interface UseAssistantChatParams {
	docId: string;
	nodeEditStateById: Map<string, ParagraphEditState>;
	/** Returns the container of the rendered document (fix target). */
	getViewerElement?: () => HTMLElement | null;
	/** Map of paragraph id → DOM element (used to apply the rewrite). */
	paragraphElementById?: Map<string, HTMLElement>;
	/** Contradiction results per paragraph (feed the quick-actions). */
	contradictionResultsByParagraphId?: Map<string, ContradictionParagraphResult>;
	/** Related paragraphs of the selected one (fix context). */
	selectedRelatedParagraphs?: RelatedParagraph[];
	/** Global analysis model (optional, forwarded to the backend). */
	model?: string;
	/** LLM cost confirmation before each call (if omitted, none is requested). */
	confirmLlmEstimate?: ConfirmLlmEstimate;
}

/**
 * Assistant chat over the contract. A single `messages` array feeds both the
 * Contract Chat Assistant and the chat embedded in Contradiction Analysis, so
 * whatever is typed in one appears in the other (parity with the Svelte version).
 *
 * This hook is the **core** (free-text question + thread state) and composes
 * `useContradictionQuickActions` (why/risks/fix/entities) over the same thread,
 * exposing a single API. The message builders live in `utils/assistant`.
 */
export function useAssistantChat({
	docId,
	nodeEditStateById,
	getViewerElement,
	paragraphElementById,
	contradictionResultsByParagraphId,
	selectedRelatedParagraphs = [],
	model,
	confirmLlmEstimate,
}: UseAssistantChatParams) {
	const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
	const [input, setInput] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [mode] = useState<AssistantMode>('explain');
	const [scope, setScope] = useState<AssistantScope>('full_contract');
	const [provider, setProvider] = useState<AssistantProvider>('openai');

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
			if (confirmLlmEstimate) {
				const approved = await confirmLlmEstimate('assistant_chat', payload);
				if (!approved) return;
			}
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

	/** Free question inside the contradiction chat (always selected scope). */
	const submitContradictionQuestion = (questionOverride?: string) =>
		submitAssistantQuestion(questionOverride, { scope: 'selected' });

	// Contradiction quick-actions (why/risks/fix/entities) over the same thread.
	const quickActions = useContradictionQuickActions({
		docId,
		nodeEditStateById,
		provider,
		model,
		selectedRelatedParagraphs,
		contradictionResultsByParagraphId,
		paragraphElementById,
		getViewerElement,
		confirmLlmEstimate,
		messages,
		messagesRef,
		setMessages,
		loading,
		setLoading,
		setError,
		nextMessageId,
		submitContradictionQuestion,
	});

	const handleKeydown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void submit();
		}
	};

	/** Cmd/Ctrl+Enter sends in the contradiction chat (selected scope). */
	const handleContradictionKeydown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			void submitContradictionQuestion();
		}
	};

	return {
		messages,
		input,
		loading,
		error,
		scope,
		provider,
		entityHighlightsEnabled: quickActions.entityHighlightsEnabled,
		contradictionEntities: quickActions.contradictionEntities,
		rewriteBusy: quickActions.rewriteBusy,
		setScope,
		setProvider,
		setInput,
		submit,
		handleKeydown,
		// Contradiction chat (shared):
		askQuickAction: quickActions.askQuickAction,
		suggestContradictionFix: quickActions.suggestContradictionFix,
		acceptFixSuggestion: quickActions.acceptFixSuggestion,
		toggleEntityHighlights: quickActions.toggleEntityHighlights,
		submitContradictionQuestion,
		handleContradictionKeydown,
	};
}
