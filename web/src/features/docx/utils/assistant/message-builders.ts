// Pure builders for the assistant chat messages (no React/state). The hook
// just generates the id and calls `setMessages(prev => [...prev, build(...)])`.

import type { AssistantChatMessage } from '@/types/document';

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
