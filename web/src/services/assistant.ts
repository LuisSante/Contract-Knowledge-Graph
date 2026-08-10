import { api } from '@/lib/api';
import type {
	AssistantChatRequest,
	AssistantChatResponse,
	SimplifySelectionRequest,
	SimplifySelectionResponse,
} from '@/types/document';

export async function fetchAssistantResponse(
	payload: AssistantChatRequest
): Promise<AssistantChatResponse> {
	const response = await api.post<AssistantChatResponse>('/assistant/chat', payload);
	return response.data;
}

export async function fetchSimplifySelection(
	payload: SimplifySelectionRequest
): Promise<SimplifySelectionResponse> {
	const response = await api.post<SimplifySelectionResponse>('/assistant/simplify', payload);
	return response.data;
}

export async function fetchFixContradictionSelection(
	payload: SimplifySelectionRequest
): Promise<SimplifySelectionResponse> {
	const response = await api.post<SimplifySelectionResponse>(
		'/assistant/fix_contradiction',
		payload
	);
	return response.data;
}
