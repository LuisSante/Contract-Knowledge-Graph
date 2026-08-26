import type { RelationKind } from './graph';
import type {
	FixContradictionSuggestion,
	FreeContradictionExplanation,
	StructuredContradictionAnalysis,
} from './contradiction';

export type AssistantMode = 'explain' | 'suggest_questions';
export type AssistantScope = 'selected' | 'full_contract' | 'kg_node';
export type AssistantProvider = 'openai' | 'gemini';

export type KgChatClause = {
	id: string;
	label: string;
	burden: number;
	benefit: number;
};

export type KgChatLedger = {
	obligations: number;
	rights: number;
	prohibitions: number;
	burdenWeight: number;
	benefitWeight: number;
	burdenCount: number;
	benefitCount: number;
	usePageRank: boolean;
	topClauses: KgChatClause[];
};

export type AssistantCitation = {
	id: string;
	excerpt: string;
	page?: number;
	paragraph_enum?: number;
};

export type AssistantMessageRole = 'user' | 'assistant';

export type AssistantChatMessage = {
	id: string;
	role: AssistantMessageRole;
	content: string;
	citations?: AssistantCitation[];
	suggestedQuestions?: string[];
	entityHighlights?: Array<{
		label: string;
		key: string;
		color: string;
		softColor: string;
	}>;
	structuredContradiction?: StructuredContradictionAnalysis;
	freeContradictionExplanation?: FreeContradictionExplanation;
	fixContradictionSuggestion?: FixContradictionSuggestion;
};

export type AssistantContextNode = {
	id: string;
	text: string;
	paragraph_enum: number;
	page: number;
};

export type AssistantContextRelation = {
	id: string;
	relationTypes: RelationKind[];
	semanticScore?: number;
	references?: string[];
};

export type AssistantHistoryMessage = {
	role: AssistantMessageRole;
	content: string;
};

export type AssistantChatRequest = {
	documentId: string;
	question: string;
	mode: AssistantMode;
	scope: AssistantScope;
	provider: AssistantProvider;
	model?: string;
	selectedParagraphId?: string | null;
	relatedParagraphs: AssistantContextRelation[];
	paragraphNodes: AssistantContextNode[];
	history: AssistantHistoryMessage[];
	focusNodeId?: string | null;
	focusNodeLabel?: string | null;
	focusNodeKind?: string | null;
	focusParagraphIds?: string[];
	kgLedger?: KgChatLedger | null;
};

export type AssistantChatResponse = {
	answer: string;
	citations: AssistantCitation[];
	suggestedQuestions: string[];
	mode: AssistantMode;
	scope: AssistantScope;
	provider: AssistantProvider;
};
