// Pure builders for the assistant chat messages (no React/state). The hook
// just generates the id and calls `setMessages(prev => [...prev, build(...)])`.

import type {
	AssistantChatMessage,
	ContradictionParagraphResult,
	FixContradictionSuggestion,
} from '@/types/document';

export function buildUserMessage(id: string, content: string): AssistantChatMessage {
	return { id, role: 'user', content };
}

export function buildAssistantMessage(id: string, content: string): AssistantChatMessage {
	return { id, role: 'assistant', content };
}

/** Assistant message from a quick-action, with optional citation to the paragraph. */
export function buildQuickActionMessage(
	id: string,
	content: string,
	citationId?: string
): AssistantChatMessage {
	return {
		id,
		role: 'assistant',
		content,
		citations: citationId ? [{ id: citationId, excerpt: '(selected paragraph)' }] : undefined,
	};
}

/** Message with the structured fix card. */
export function buildFixSuggestionMessage(
	id: string,
	suggestion: FixContradictionSuggestion
): AssistantChatMessage {
	return {
		id,
		role: 'assistant',
		content: `Structured contradiction-fix suggestion for paragraph ${suggestion.paragraphId}.`,
		citations: [{ id: suggestion.paragraphId, excerpt: '(selected paragraph)' }],
		fixContradictionSuggestion: suggestion,
	};
}

/** Text of the "free" explanation (no LLM cost) of a contradiction. */
export function buildFreeContradictionText(
	paragraphId: string,
	contradiction: ContradictionParagraphResult
): string {
	const reason = (contradiction.brief_reason || 'No brief reason is available.').trim();
	const confidence = Number.isFinite(contradiction.confidence) ? contradiction.confidence : 0;
	const evidence = contradiction.evidence;
	const footerMessage =
		'Use "Why is it a contradiction? (AI cost)" for deeper evidence with richer legal reasoning.';
	const evidenceLines =
		evidence?.snippet_a?.trim() && evidence?.snippet_b?.trim()
			? [
					`Snippet A (${evidence.source_a?.trim() || 'paragraph'}): "${evidence.snippet_a.trim()}"`,
					`Snippet B (${evidence.source_b?.trim() || 'paragraph'}): "${evidence.snippet_b.trim()}"`,
				]
			: ['No structured evidence snippets were returned by the classifier.'];
	return [
		`Free explanation for paragraph ${paragraphId}:`,
		reason,
		`Confidence: ${confidence}%`,
		...evidenceLines,
		footerMessage,
	].join('\n\n');
}

/** Entities from the latest assistant message that has them (for the document). */
export function selectLatestEntityHighlights(
	messages: AssistantChatMessage[]
): NonNullable<AssistantChatMessage['entityHighlights']> {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const highlights = messages[index].entityHighlights;
		if (highlights && highlights.length > 0) return highlights;
	}
	return [];
}
