import type { RelationKind } from './graph';
import type { AssistantProvider } from './assistant';

export type SimplifyEvidence = {
	paragraph_id: string;
	selection_start: number;
	selection_end: number;
};

export type SimplifyAudit = {
	system_prompt: string;
	user_prompt: string;
	model_response: string;
};

export type SimplifyRelatedParagraph = {
	id: string;
	text: string;
	paragraph_enum?: number;
	page?: number;
	relationTypes: RelationKind[];
	semanticScore?: number;
	references?: string[];
};

export type SimplifySelectionRequest = {
	documentId: string;
	provider: AssistantProvider;
	paragraphId: string;
	paragraphText: string;
	selectionStart: number;
	selectionEnd: number;
	contradictionReason?: string;
	relatedParagraphs?: SimplifyRelatedParagraph[];
};

export type SimplifySelectionResponse = {
	paragraphId: string;
	provider: AssistantProvider;
	originalSnippet: string;
	simplifiedSnippet: string;
	evidence: SimplifyEvidence;
	audit: SimplifyAudit;
};

export type SimplifyResultState = {
	payload: SimplifySelectionResponse;
	paragraphTextSnapshot: string;
	createdAt: string;
};

export type SimplifyAuditRecord = {
	documentId: string;
	provider: AssistantProvider;
	paragraphId: string;
	selectionStart: number;
	selectionEnd: number;
	originalSnippet: string;
	simplifiedSnippet: string;
	systemPrompt: string;
	userPrompt: string;
	modelResponse: string;
	timestamp: string;
};
