import type {
	AssistantChatMessage,
	AssistantContextNode,
	AssistantHistoryMessage,
	Node as ParagraphNode,
	ParagraphEditState,
} from '@/types/document';
import { getNodeCurrentText } from '@/features/docx/utils/edit/edit';

export function buildAssistantNodeSnapshot(
	paragraphNodes: ParagraphNode[],
	nodeEditStateById: Map<string, ParagraphEditState>
): AssistantContextNode[] {
	return paragraphNodes.map((node) => ({
		id: node.id,
		text: getNodeCurrentText(nodeEditStateById, node),
		paragraph_enum: node.paragraph_enum,
		page: node.page
	}));
}

export function buildAssistantHistoryPayload(
	assistantMessages: AssistantChatMessage[],
	limit = 8
): AssistantHistoryMessage[] {
	return assistantMessages.slice(-limit).map((message) => ({
		role: message.role,
		content: message.content
	}));
}

function sanitizeSuggestedQuestions(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const cleaned = value
		.map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
		.filter((entry) => entry.length > 0);
	return Array.from(new Set(cleaned)).slice(0, 4);
}

/** Shown when the model returns none; the chat is always about the focused party. */
const FALLBACK_QUESTIONS = [
	'Which clauses put the most weight on this party?',
	'What does this party get in return?',
	'Which obligations are conditional?',
];

export function resolveAssistantSuggestedQuestions(value: unknown): string[] {
	const normalized = sanitizeSuggestedQuestions(value);
	return normalized.length > 0 ? normalized : FALLBACK_QUESTIONS;
}
