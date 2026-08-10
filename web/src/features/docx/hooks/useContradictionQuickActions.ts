'use client';

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useDocumentStore } from '@/stores/document';
import { fetchAssistantResponse } from '@/services/assistant';
import { getAxiosErrorMessage } from '@/features/docx/utils/docx-engine/http-error';
import {
	buildAssistantHistoryPayload,
	buildAssistantNodeSnapshot,
	buildAssistantRelatedContext,
	buildContradictionAiCostQuestion,
	buildContradictionRiskQuestion,
	resolveAssistantSuggestedQuestions,
} from '@/features/docx/utils/assistant/assistant';
import { getNodeCurrentText } from '@/features/docx/utils/edit/edit';
import { buildParagraphExplanationEntityHighlights } from '@/features/docx/utils/assistant/paragraph-explanation';
import {
	buildFallbackContradictionEntities,
	buildFixSuggestionChangeNotes,
	extractAnswerEntities,
} from '@/features/docx/utils/contradiction/contradiction-chat';
import {
	buildFreeContradictionText,
	buildFixSuggestionMessage,
	buildQuickActionMessage,
	buildUserMessage,
	selectLatestEntityHighlights,
} from '@/features/docx/utils/assistant/message-builders';
import {
	applyRewriteToParagraph,
	executeFixContradictionRewrite,
} from '@/features/docx/utils/edit/rewrite';
import {
	FIX_CONTRADICTION_TOP_RELATED,
	QUICK_ACTION_CONTRADICTION_RISKS,
	QUICK_ACTION_WHY_CONTRADICTION_AI,
	QUICK_ACTION_WHY_CONTRADICTION_FREE,
} from '@/constants/docx-viewer';
import type {
	AssistantChatMessage,
	AssistantChatRequest,
	AssistantProvider,
	ContradictionAnalysisRequest,
	ContradictionParagraphResult,
	Node as ParagraphNode,
	ParagraphEditState,
	RelatedParagraph,
	SimplifySelectionRequest,
} from '@/types/document';

export type ConfirmLlmEstimate = (
	callType:
		| 'assistant_chat'
		| 'assistant_simplify'
		| 'assistant_fix_contradiction'
		| 'contradictions_analyze',
	payload: AssistantChatRequest | SimplifySelectionRequest | ContradictionAnalysisRequest
) => Promise<boolean>;

interface UseContradictionQuickActionsParams {
	docId: string;
	nodeEditStateById: Map<string, ParagraphEditState>;
	provider: AssistantProvider;
	model?: string;
	selectedRelatedParagraphs: RelatedParagraph[];
	contradictionResultsByParagraphId?: Map<string, ContradictionParagraphResult>;
	paragraphElementById?: Map<string, HTMLElement>;
	getViewerElement?: () => HTMLElement | null;
	confirmLlmEstimate?: ConfirmLlmEstimate;
	// Shared chat thread state (owned by the core useAssistantChat).
	messages: AssistantChatMessage[];
	messagesRef: { current: AssistantChatMessage[] };
	setMessages: Dispatch<SetStateAction<AssistantChatMessage[]>>;
	loading: boolean;
	setLoading: (value: boolean) => void;
	setError: (value: string | null) => void;
	nextMessageId: () => string;
	submitContradictionQuestion: (questionOverride?: string) => Promise<void> | void;
}

/**
 * Contradiction quick-actions that share the chat thread: structured why
 * (with entities), risk assessment, "free" explanation, the structured fix
 * suggestion (+ accept) and the entity toggle/derivation. Composed from
 * `useAssistantChat`, which passes it the thread state (messages/setMessages/…).
 */
export function useContradictionQuickActions({
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
}: UseContradictionQuickActionsParams) {
	const [entityHighlightsEnabled, setEntityHighlightsEnabled] = useState(true);
	const [rewriteBusy, setRewriteBusy] = useState(false);

	const appendQuickActionMessage = (content: string, citationId?: string) => {
		setMessages((prev) => [...prev, buildQuickActionMessage(nextMessageId(), content, citationId)]);
	};

	/**
	 * Structured why / risks: same mechanics, only the question builder changes.
	 * Responds with highlightable entities.
	 */
	const submitStructuredContradiction = async (
		selected: ParagraphNode,
		contradiction: ContradictionParagraphResult,
		baseMessages: AssistantChatMessage[],
		buildQuestion: (
			paragraphId: string,
			paragraphText: string,
			contradiction: ContradictionParagraphResult
		) => string
	) => {
		if (loading) return;
		if (!docId) {
			setError('No document is loaded.');
			return;
		}
		const { paragraphs } = useDocumentStore.getState();
		const paragraphNodes = buildAssistantNodeSnapshot(paragraphs, nodeEditStateById);
		if (paragraphNodes.length === 0) {
			setError('The contract is still loading.');
			return;
		}

		const selectedText = getNodeCurrentText(nodeEditStateById, selected);
		const question = buildQuestion(selected.id, selectedText, contradiction);

		setLoading(true);
		setError(null);

		const payload: AssistantChatRequest = {
			documentId: docId,
			question,
			mode: 'explain',
			scope: 'selected',
			provider,
			model: model?.trim() || undefined,
			selectedParagraphId: selected.id,
			relatedParagraphs: buildAssistantRelatedContext(selectedRelatedParagraphs),
			paragraphNodes,
			history: buildAssistantHistoryPayload(baseMessages),
		};

		try {
			if (confirmLlmEstimate) {
				const approved = await confirmLlmEstimate('assistant_chat', payload);
				if (!approved) return;
			}
			const response = await fetchAssistantResponse(payload);
			const parsed = extractAnswerEntities(response.answer);
			const fallbackEntities = buildFallbackContradictionEntities(selectedText, contradiction);
			const entityHighlights = buildParagraphExplanationEntityHighlights(
				parsed.entities.length > 0 ? parsed.entities : fallbackEntities
			);
			setEntityHighlightsEnabled(true);
			setMessages((prev) => [
				...prev,
				{
					id: nextMessageId(),
					role: 'assistant',
					content: parsed.content || response.answer,
					citations: response.citations,
					entityHighlights,
					suggestedQuestions: resolveAssistantSuggestedQuestions(response.suggestedQuestions, {
						mode: 'explain',
						scope: 'selected',
						contradiction: true,
					}),
				},
			]);
		} catch (err) {
			const message = getAxiosErrorMessage(err, 'Failed to generate a response.');
			setError(message);
			setMessages((prev) => [
				...prev,
				{ id: nextMessageId(), role: 'assistant', content: `I could not complete this request: ${message}` },
			]);
		} finally {
			setLoading(false);
		}
	};

	/** Dispatches a quick-action: why (free/AI), risks, or free text. */
	const askQuickAction = async (prompt: string) => {
		if (loading) return;
		const isContradictionQuickAction =
			prompt === QUICK_ACTION_WHY_CONTRADICTION_FREE ||
			prompt === QUICK_ACTION_WHY_CONTRADICTION_AI ||
			prompt === QUICK_ACTION_CONTRADICTION_RISKS;

		if (!isContradictionQuickAction) {
			await submitContradictionQuestion(prompt);
			return;
		}

		const { selectedParagraph } = useDocumentStore.getState();
		setError(null);
		const withUser: AssistantChatMessage[] = [
			...messagesRef.current,
			buildUserMessage(nextMessageId(), prompt),
		];
		setMessages(withUser);

		if (!selectedParagraph) {
			appendQuickActionMessage(
				'Select a highlighted paragraph first, then run this contradiction quick action.'
			);
			return;
		}

		const contradiction = contradictionResultsByParagraphId?.get(selectedParagraph.id);
		if (!contradiction) {
			appendQuickActionMessage(
				'No contradiction result is available for this paragraph yet. Run "Search contradictions" first.',
				selectedParagraph.id
			);
			return;
		}
		if (!contradiction.contradiction) {
			appendQuickActionMessage(
				'This paragraph is not currently classified as contradiction.',
				selectedParagraph.id
			);
			return;
		}

		if (prompt === QUICK_ACTION_WHY_CONTRADICTION_FREE) {
			appendQuickActionMessage(buildFreeContradictionText(selectedParagraph.id, contradiction), selectedParagraph.id);
			return;
		}

		if (prompt === QUICK_ACTION_CONTRADICTION_RISKS) {
			await submitStructuredContradiction(
				selectedParagraph,
				contradiction,
				withUser,
				buildContradictionRiskQuestion
			);
			return;
		}

		await submitStructuredContradiction(
			selectedParagraph,
			contradiction,
			withUser,
			buildContradictionAiCostQuestion
		);
	};

	/** Requests and shows a structured fix suggestion for the active contradiction. */
	const suggestContradictionFix = async () => {
		if (rewriteBusy || loading) return;
		setError(null);
		setMessages((prev) => [
			...prev,
			buildUserMessage(
				nextMessageId(),
				'Suggest a contradiction fix and structure the response with the key changes and a ready-to-apply rewrite.'
			),
		]);

		setRewriteBusy(true);
		try {
			const { selectedParagraph } = useDocumentStore.getState();
			const execution = await executeFixContradictionRewrite({
				activeDocumentId: docId || null,
				assistantProvider: provider,
				contradictionResultsByParagraphId: contradictionResultsByParagraphId ?? new Map(),
				selectedRelatedParagraphs,
				nodeEditStateById,
				fixRelatedLimit: FIX_CONTRADICTION_TOP_RELATED,
				viewer: getViewerElement?.() ?? null,
				selectedParagraphId: selectedParagraph?.id ?? null,
				paragraphElementById: paragraphElementById ?? new Map(),
				fallbackTarget: null,
				resolveErrorMessage: getAxiosErrorMessage,
				confirmLlmEstimate,
			});

			if (!execution.ok) {
				appendQuickActionMessage(
					`I could not generate a contradiction-fix suggestion: ${execution.error}`
				);
				return;
			}

			const contradiction = contradictionResultsByParagraphId?.get(execution.target.paragraphId);
			setMessages((prev) => [
				...prev,
				buildFixSuggestionMessage(nextMessageId(), {
					paragraphId: execution.target.paragraphId,
					reason: contradiction?.brief_reason?.trim() || undefined,
					changeNotes: buildFixSuggestionChangeNotes(
						execution.result.payload.originalSnippet,
						execution.result.payload.simplifiedSnippet
					),
					rewriteResult: execution.result,
					status: 'pending',
				}),
			]);
		} finally {
			setRewriteBusy(false);
		}
	};

	/** Applies a fix suggestion to the paragraph and marks the message as "applied". */
	const acceptFixSuggestion = async (messageId: string) => {
		const message = messagesRef.current.find((entry) => entry.id === messageId);
		const suggestion = message?.fixContradictionSuggestion;
		if (!suggestion || suggestion.status === 'applied') return;

		const applied = applyRewriteToParagraph({
			simplifyResult: suggestion.rewriteResult,
			paragraphElementById: paragraphElementById ?? new Map(),
		});
		if (!applied.ok) {
			const failureReason = applied.error ?? 'Failed to apply suggestion.';
			setMessages((prev) => [
				...prev,
				{
					id: nextMessageId(),
					role: 'assistant',
					content: `Could not apply the suggestion: ${failureReason}`,
				},
			]);
			setError(failureReason);
			return;
		}

		const appliedParagraphId = applied.paragraphId ?? suggestion.paragraphId;
		const selectedNode =
			useDocumentStore.getState().paragraphs.find((node) => node.id === appliedParagraphId) ?? null;
		if (selectedNode) useDocumentStore.getState().setSelectedParagraph(selectedNode);

		setMessages((prev) => [
			...prev.map((entry) =>
				entry.id === messageId && entry.fixContradictionSuggestion
					? {
							...entry,
							fixContradictionSuggestion: {
								...entry.fixContradictionSuggestion,
								status: 'applied' as const,
							},
						}
					: entry
			),
			{
				id: nextMessageId(),
				role: 'assistant',
				content: `Suggestion applied directly to paragraph ${appliedParagraphId}.`,
				citations: [{ id: appliedParagraphId, excerpt: '(updated paragraph)' }],
			},
		]);
		setError(null);
	};

	const toggleEntityHighlights = () => setEntityHighlightsEnabled((prev) => !prev);

	// Active entities of the contradiction chat (last message with highlights),
	// to highlight them in the document body too while the toggle is on.
	const contradictionEntities = useMemo(
		() => (entityHighlightsEnabled ? selectLatestEntityHighlights(messages) : []),
		[messages, entityHighlightsEnabled]
	);

	return {
		entityHighlightsEnabled,
		rewriteBusy,
		contradictionEntities,
		askQuickAction,
		suggestContradictionFix,
		acceptFixSuggestion,
		toggleEntityHighlights,
	};
}
