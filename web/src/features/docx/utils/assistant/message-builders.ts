// Pure builders for the assistant chat messages (no React/state). The hook
// just generates the id and calls `setMessages(prev => [...prev, build(...)])`.

import type {
	AssistantChatMessage,
} from '@/types/document';

export function buildUserMessage(id: string, content: string): AssistantChatMessage {
	return { id, role: 'user', content };
}

export function buildAssistantMessage(id: string, content: string): AssistantChatMessage {
	return { id, role: 'assistant', content };
}




