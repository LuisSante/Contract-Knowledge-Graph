import type { Graph } from './graph';
import type { AssistantProvider } from './assistant';
import type { SimplifyResultState } from './simplify';

export type ContradictionTaxonomyType =
	| 'temporal'
	| 'numerical'
	| 'authority'
	| 'process'
	| 'policy_reversal'
	| 'specificity';

export type StructuredContradictionClaim = {
	text: string;
	source: 'paragraph' | 'context' | 'unknown';
	paragraph_id?: string;
	subject?: string;
	relation?: string;
	object?: string;
	polarity?: 'affirmed' | 'negated' | 'unknown';
};

export type StructuredContradictionItem = {
	id: string;
	contradiction_type: ContradictionTaxonomyType;
	why: string;
	claim_a: StructuredContradictionClaim;
	claim_b: StructuredContradictionClaim;
	conflicting_fields: string[];
	confidence: number;
};

export type StructuredContradictionHighlight = {
	phrase: string;
	category: ContradictionTaxonomyType;
	claim_id?: string;
	claim_side?: 'a' | 'b' | 'both' | 'unknown';
	source: 'paragraph' | 'context' | 'unknown';
};

export type StructuredContradictionAnalysis = {
	version?: string;
	paragraph_id: string;
	overall_summary: string;
	contradiction_count: number;
	contradictions: StructuredContradictionItem[];
	highlights: StructuredContradictionHighlight[];
	notes?: string[];
	highlight_source_text?: string;
};

export type FreeContradictionSnippet = {
	source: string;
	text: string;
};

export type FreeContradictionExplanation = {
	paragraphId: string;
	reason: string;
	confidence: number;
	snippetA?: FreeContradictionSnippet;
	snippetB?: FreeContradictionSnippet;
	fallbackEvidenceMessage?: string;
	footerMessage: string;
};

export type FixContradictionSuggestion = {
	paragraphId: string;
	reason?: string;
	changeNotes: string[];
	rewriteResult: SimplifyResultState;
	status?: 'pending' | 'applied';
};

export type ContradictionParagraphResult = {
	paragraph_id: string;
	contradiction: boolean;
	confidence: number;
	brief_reason: string;
	contradiction_type?: ContradictionTaxonomyType | null;
	evidence?: ContradictionEvidence | null;
	contradictions?: ContradictionFinding[];
};

export type ContradictionEvidence = {
	snippet_a: string;
	snippet_b: string;
	source_a: 'paragraph' | 'context' | 'unknown';
	source_b: 'paragraph' | 'context' | 'unknown';
	evidence_status?: 'exact' | 'missing' | 'approximate';
	evidence_note?: string;
};

export type ContradictionFinding = {
	confidence: number;
	brief_reason: string;
	contradiction_type?: ContradictionTaxonomyType | null;
	evidence?: ContradictionEvidence | null;
};

export type ContradictionGraphMode = 'with_kg' | 'without_kg';

export type ContradictionAnalysisRequest = {
	documentId: string;
	provider: AssistantProvider;
	temperature: number;
	model?: string;
	mode: ContradictionGraphMode;
	graph: Graph;
};

export type ContradictionAnalysisResponse = {
	documentId: string;
	provider: AssistantProvider;
	temperature: number;
	model?: string;
	mode: ContradictionGraphMode;
	paragraphResults: ContradictionParagraphResult[];
	rawResponse: string;
};

export type SavedContradictionsResponse = {
	documentId: string;
	sourceFile: string;
	mode: ContradictionGraphMode;
	paragraphResults: ContradictionParagraphResult[];
};

export type ContradictionScrollMarker = {
	paragraphId: string;
	topPercent: number;
	confidenceBand: 'high' | 'medium' | 'low';
};

export type ChatHighlightSegment = {
	text: string;
	category: ContradictionTaxonomyType | null;
	claimId?: string;
	claimSide?: 'a' | 'b';
	contradictionType?: ContradictionTaxonomyType;
	contradictionWhy?: string;
	interactive?: boolean;
};

export type ChatPreviewHoverState = {
	messageId: string;
	segmentKey: string;
	contradictionId: string;
	claimSide: 'a' | 'b' | null;
	kind: 'claim' | 'highlight';
};
