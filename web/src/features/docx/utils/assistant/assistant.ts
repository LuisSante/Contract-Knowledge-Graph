import type {
	AssistantChatMessage,
	AssistantContextNode,
	AssistantContextRelation,
	AssistantHistoryMessage,
	AssistantMode,
	AssistantScope,
	Node as ParagraphNode,
	ParagraphEditState,
	RelatedParagraph
} from '@/types/document';
import { getNodeCurrentText } from '@/features/docx/utils/edit/edit';

type ResolveSuggestedQuestionsOptions = {
	mode?: AssistantMode;
	scope?: AssistantScope;
};

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

export function buildAssistantRelatedContext(
	selectedRelatedParagraphs: RelatedParagraph[]
): AssistantContextRelation[] {
	return selectedRelatedParagraphs.map((related) => ({
		id: related.node.id,
		relationTypes: related.relationTypes,
		semanticScore: related.semanticScore,
		references: related.references.map((reference) => `${reference.label} ${reference.value}`)
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

function getFallbackSuggestedQuestions(options?: ResolveSuggestedQuestionsOptions): string[] {
	if (options?.scope === 'full_contract') {
		return [
			'What are the most important risks in this contract?',
			'Which clauses should we renegotiate first?',
			'Where do obligations conflict across sections?'
		];
	}
	return [
		'Can you simplify this paragraph in plain English?',
		'What happens if this clause is breached?',
		'Which related clause should I read next?'
	];
}

export function resolveAssistantSuggestedQuestions(
	value: unknown,
	options?: ResolveSuggestedQuestionsOptions
): string[] | undefined {
	const normalized = sanitizeSuggestedQuestions(value);
	if (normalized.length > 0) return normalized;
	const fallback = getFallbackSuggestedQuestions(options);
	return fallback.length > 0 ? fallback : undefined;
}
