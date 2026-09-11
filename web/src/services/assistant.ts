import { api } from '@/lib/api';
import type { AssistantChatRequest, AssistantChatResponse } from '@/types/document';

export async function fetchAssistantResponse(
	payload: AssistantChatRequest
): Promise<AssistantChatResponse> {
	const response = await api.post<AssistantChatResponse>('/assistant/chat', payload);
	return response.data;
}
