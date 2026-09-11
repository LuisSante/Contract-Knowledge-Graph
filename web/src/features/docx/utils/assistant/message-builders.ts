import type { AssistantChatMessage } from '@/types/document';

export function buildUserMessage(id: string, content: string): AssistantChatMessage {
	return { id, role: 'user', content };
}

export function buildAssistantMessage(id: string, content: string): AssistantChatMessage {
	return { id, role: 'assistant', content };
}
