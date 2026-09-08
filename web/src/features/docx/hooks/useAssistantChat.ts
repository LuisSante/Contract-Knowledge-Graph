'use client';

import { useEffect, useRef, useState } from 'react';
import { useDocumentStore } from '@/stores/document';
import { useKnowledgeGraphStore } from '@/stores/knowledgeGraph';
import { fetchAssistantResponse } from '@/services/assistant';
import { getAxiosErrorMessage } from '@/features/docx/utils/docx-engine/http-error';
import {
	buildAssistantHistoryPayload,
	buildAssistantNodeSnapshot,
	resolveAssistantSuggestedQuestions,
} from '@/features/docx/utils/assistant/assistant';
import { buildUserMessage } from '@/features/docx/utils/assistant/message-builders';
import type {
	AssistantChatMessage,
	AssistantChatRequest,
	ParagraphEditState,
} from '@/types/document';

/** Gate in front of a billable call: resolves false when the user declines the cost. */
export type ConfirmLlmEstimate = (
	callType: 'assistant_chat',
	payload: AssistantChatRequest
) => Promise<boolean>;

/** The panel has one entry point, so the provider is fixed rather than state. */
const PROVIDER = 'openai' as const;

interface UseAssistantChatParams {
	docId: string;
	nodeEditStateById: Map<string, ParagraphEditState>;
	/** Global analysis model (optional, forwarded to the backend). */
	model?: string;
	/** LLM cost confirmation before each call (if omitted, none is requested). */
	confirmLlmEstimate?: ConfirmLlmEstimate;
}

/**
 * Chat about the focused party. Holds the thread state and one submit path; the
 * message builders live in `utils/assistant`.
 */
export function useAssistantChat({
	docId,
	nodeEditStateById,
	model,
	confirmLlmEstimate,
}: UseAssistantChatParams) {
	const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
	const [input, setInput] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

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

	/** Question about the focused party. */
	const submitKgNodeQuestion = async (questionOverride?: string) => {
		if (loading) return;
		const question = (questionOverride ?? input).trim();
		if (!question) return;
		if (!docId) {
			setError('No document is loaded.');
			return;
		}

		const { paragraphs, selectedParagraph } = useDocumentStore.getState();
		const paragraphNodes = buildAssistantNodeSnapshot(paragraphs, nodeEditStateById);
		if (paragraphNodes.length === 0) {
			setError('The contract is still loading.');
			return;
		}
		// Gated on the focus, not on the ledger: the ledger is only built by the
		// single-party bridge, and the panel seats a pair, so requiring it turned every
		// question into "focus a party" even with one focused.
		const kgState = useKnowledgeGraphStore.getState();
		if (!kgState.focusNodeId) {
			setError('Focus a party in the Knowledge Graph before asking about it.');
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

		const ledger = kgState.ledger;
		const payload: AssistantChatRequest = {
			documentId: docId,
			question,
			provider: PROVIDER,
			model: model?.trim() || undefined,
			selectedParagraphId: selectedParagraph?.id ?? null,
			paragraphNodes,
			history: buildAssistantHistoryPayload(historyBeforeAnswer),
			focusNodeId: kgState.focusNodeId,
			focusNodeLabel: kgState.focusMeta?.label ?? null,
			focusNodeKind: 'party',
			focusParagraphIds: kgState.paragraphIds,
			// Optional on the backend, which falls back to "no impact facts were provided".
			...(ledger
				? {
						kgLedger: {
							obligations: ledger.obligations,
							rights: ledger.rights,
							prohibitions: ledger.prohibitions,
							burdenWeight: ledger.burdenWeight,
							benefitWeight: ledger.benefitWeight,
							burdenCount: ledger.burdenCount,
							benefitCount: ledger.benefitCount,
							usePageRank: kgState.usePageRank,
							topClauses: ledger.topClauses,
						},
					}
				: {}),
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
					suggestedQuestions: resolveAssistantSuggestedQuestions(response.suggestedQuestions),
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

	/** Enter sends the question about the focused party. */
	const handleKgNodeKeydown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void submitKgNodeQuestion();
		}
	};

	return {
		messages,
		input,
		loading,
		error,
		setInput,
		submitKgNodeQuestion,
		handleKgNodeKeydown,
	};
}
