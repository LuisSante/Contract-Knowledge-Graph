import type {
	AssistantChatMessage,
	AssistantContextNode,
	AssistantContextRelation,
	AssistantHistoryMessage,
	AssistantMode,
	AssistantScope,
	ContradictionParagraphResult,
	ContradictionTaxonomyType,
	Node as ParagraphNode,
	ParagraphEditState,
	RelatedParagraph,
	SimplifyRelatedParagraph,
	StructuredContradictionAnalysis
} from '@/types/document';
import { getNodeCurrentText } from '@/features/docx/utils/edit/edit';

type ResolveSuggestedQuestionsOptions = {
	mode?: AssistantMode;
	scope?: AssistantScope;
	contradiction?: boolean;
};

function toNonEmptyString(raw: unknown): string {
	return typeof raw === 'string' ? raw.trim() : '';
}

function clampConfidence(raw: unknown): number {
	if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
	return Math.max(0, Math.min(100, Math.round(raw)));
}

function normalizeClaimSource(raw: unknown): 'paragraph' | 'context' | 'unknown' {
	const value = toNonEmptyString(raw);
	if (value === 'paragraph' || value === 'context') return value;
	return 'unknown';
}

function normalizeClaimPolarity(raw: unknown): 'affirmed' | 'negated' | 'unknown' {
	const value = toNonEmptyString(raw);
	if (value === 'affirmed' || value === 'negated') return value;
	return 'unknown';
}

function normalizeHighlightClaimSide(raw: unknown): 'a' | 'b' | 'both' | 'unknown' | undefined {
	const value = toNonEmptyString(raw)
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
	if (!value) return undefined;
	if (value === 'a' || value === 'claim_a') return 'a';
	if (value === 'b' || value === 'claim_b') return 'b';
	if (value === 'both') return 'both';
	return 'unknown';
}

function normalizeContradictionType(raw: unknown): ContradictionTaxonomyType {
	const value = toNonEmptyString(raw)
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
	if (!value) return 'specificity';

	if (value === 'temporal' || value === 'time' || value === 'date') return 'temporal';
	if (
		value === 'numerical' ||
		value === 'numeric' ||
		value === 'amount' ||
		value === 'amounts' ||
		value === 'value' ||
		value === 'values' ||
		value === 'percentage' ||
		value === 'percentages'
	) {
		return 'numerical';
	}
	if (value === 'authority' || value === 'issuer' || value === 'source') return 'authority';
	if (value === 'process' || value === 'procedure' || value === 'workflow') return 'process';
	if (
		value === 'policy_reversal' ||
		value === 'negation' ||
		value === 'direct_negation' ||
		value === 'reversal'
	) {
		return 'policy_reversal';
	}
	if (
		value === 'specificity' ||
		value === 'scope' ||
		value === 'general_vs_specific' ||
		value === 'specific'
	) {
		return 'specificity';
	}
	return 'specificity';
}

function normalizeHighlightCategory(raw: unknown): ContradictionTaxonomyType {
	const normalized = toNonEmptyString(raw)
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
	const direct = normalizeContradictionType(normalized);
	if (direct !== 'specificity') return direct;

	// Backward compatibility for old highlight categories
	if (
		normalized === 'party' ||
		normalized === 'parties' ||
		normalized === 'role' ||
		normalized === 'roles' ||
		normalized === 'parties_and_roles' ||
		normalized === 'fundamental_entities'
	) {
		return 'authority';
	}
	if (
		normalized === 'obligation' ||
		normalized === 'obligations' ||
		normalized === 'prohibition' ||
		normalized === 'prohibitions' ||
		normalized === 'duty' ||
		normalized === 'duties' ||
		normalized === 'obligations_and_prohibitions' ||
		normalized === 'rights_and_permissions' ||
		normalized === 'individual_behaviors' ||
		normalized === 'motion_descriptors'
	) {
		return 'policy_reversal';
	}
	if (
		normalized === 'condition' ||
		normalized === 'conditions' ||
		normalized === 'exception' ||
		normalized === 'exceptions' ||
		normalized === 'conditions_and_exceptions' ||
		normalized === 'safety_situations'
	) {
		return 'specificity';
	}
	if (
		normalized === 'amount' ||
		normalized === 'amounts' ||
		normalized === 'amounts_and_timing' ||
		normalized === 'environment_entities'
	) {
		return 'numerical';
	}
	return 'specificity';
}

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

export function buildFixRelatedContext(
	selectedRelatedParagraphs: RelatedParagraph[],
	nodeEditStateById: Map<string, ParagraphEditState>,
	limit: number
): SimplifyRelatedParagraph[] {
	if (limit <= 0) return [];
	return selectedRelatedParagraphs
		.slice(0, limit)
		.map((related) => ({
			id: related.node.id,
			text: getNodeCurrentText(nodeEditStateById, related.node),
			paragraph_enum: related.node.paragraph_enum,
			page: related.node.page,
			relationTypes: related.relationTypes,
			semanticScore: related.semanticScore,
			references: related.references.map((reference) => `${reference.label} ${reference.value}`)
		}))
		.filter((related) => related.text.trim().length > 0);
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

export function extractObjectFromText(text: string): Record<string, unknown> | null {
	const raw = (text || '').trim();
	if (!raw) return null;

	const fenced = raw
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/\s*```$/i, '')
		.trim();

	const candidates = [raw, fenced];
	for (const candidate of candidates) {
		try {
			const parsed = JSON.parse(candidate);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
		} catch {
			// ignore parse errors and continue with fallback extraction
		}
	}

	const objectMatch = fenced.match(/\{[\s\S]*\}/);
	if (objectMatch) {
		try {
			const parsed = JSON.parse(objectMatch[0]);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
		} catch {
			return null;
		}
	}

	return null;
}

export function normalizeStructuredContradiction(
	raw: unknown,
	fallbackParagraphId: string,
	highlightSourceText: string
): StructuredContradictionAnalysis | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const source = raw as Record<string, unknown>;

	const rawContradictions = Array.isArray(source.contradictions) ? source.contradictions : [];
	const contradictions = rawContradictions
		.map((entry, index) => {
			if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
			const item = entry as Record<string, unknown>;
			const rawClaimA =
				item.claim_a && typeof item.claim_a === 'object' && !Array.isArray(item.claim_a)
					? (item.claim_a as Record<string, unknown>)
					: {};
			const rawClaimB =
				item.claim_b && typeof item.claim_b === 'object' && !Array.isArray(item.claim_b)
					? (item.claim_b as Record<string, unknown>)
					: {};

			const claimA = {
				text: toNonEmptyString(rawClaimA.text),
				source: normalizeClaimSource(rawClaimA.source),
				paragraph_id: toNonEmptyString(rawClaimA.paragraph_id) || undefined,
				subject: toNonEmptyString(rawClaimA.subject) || undefined,
				relation: toNonEmptyString(rawClaimA.relation) || undefined,
				object: toNonEmptyString(rawClaimA.object) || undefined,
				polarity: normalizeClaimPolarity(rawClaimA.polarity)
			};

			const claimB = {
				text: toNonEmptyString(rawClaimB.text),
				source: normalizeClaimSource(rawClaimB.source),
				paragraph_id: toNonEmptyString(rawClaimB.paragraph_id) || undefined,
				subject: toNonEmptyString(rawClaimB.subject) || undefined,
				relation: toNonEmptyString(rawClaimB.relation) || undefined,
				object: toNonEmptyString(rawClaimB.object) || undefined,
				polarity: normalizeClaimPolarity(rawClaimB.polarity)
			};

			return {
				id: toNonEmptyString(item.id) || `c${index + 1}`,
				contradiction_type: normalizeContradictionType(item.contradiction_type),
				why: toNonEmptyString(item.why) || 'Potential contradiction detected.',
				claim_a: claimA,
				claim_b: claimB,
				conflicting_fields: Array.isArray(item.conflicting_fields)
					? item.conflicting_fields
							.map((field) => (typeof field === 'string' ? field.trim() : ''))
							.filter((field) => field.length > 0)
					: [],
				confidence: clampConfidence(item.confidence)
			};
		})
		.filter((item): item is NonNullable<typeof item> => item !== null);

	const rawHighlights = Array.isArray(source.highlights) ? source.highlights : [];
	const highlights = rawHighlights
		.map((entry) => {
			if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
			const item = entry as Record<string, unknown>;
			const phrase = toNonEmptyString(item.phrase);
			if (!phrase) return null;
			return {
				phrase,
				category: normalizeHighlightCategory(item.category),
				claim_id: toNonEmptyString(item.claim_id) || undefined,
				claim_side: normalizeHighlightClaimSide(item.claim_side),
				source: normalizeClaimSource(item.source)
			};
		})
		.filter((item): item is NonNullable<typeof item> => item !== null);

	if (contradictions.length === 0 && highlights.length === 0) {
		return null;
	}

	const contradictionCount =
		typeof source.contradiction_count === 'number' && Number.isFinite(source.contradiction_count)
			? Math.max(contradictions.length, Math.round(source.contradiction_count))
			: contradictions.length;
	const notes = Array.isArray(source.notes)
		? source.notes
				.map((note) => (typeof note === 'string' ? note.trim() : ''))
				.filter((note) => note.length > 0)
		: undefined;

	return {
		version: toNonEmptyString(source.version) || undefined,
		paragraph_id: toNonEmptyString(source.paragraph_id) || fallbackParagraphId,
		overall_summary:
			toNonEmptyString(source.overall_summary) ||
			`Detected ${contradictionCount} contradiction candidate(s).`,
		contradiction_count: contradictionCount,
		contradictions,
		highlights,
		notes,
		highlight_source_text: highlightSourceText
	};
}

export function parseStructuredContradictionFromAnswer(
	answer: string,
	fallbackParagraphId: string,
	highlightSourceText: string
): StructuredContradictionAnalysis | null {
	const objectCandidate = extractObjectFromText(answer);
	if (!objectCandidate) return null;
	return normalizeStructuredContradiction(objectCandidate, fallbackParagraphId, highlightSourceText);
}

export function buildContradictionAiCostQuestion(
	paragraphId: string,
	paragraphText: string,
	contradiction: ContradictionParagraphResult
): string {
	const evidence = contradiction.evidence;
	const evidenceA = evidence?.snippet_a?.trim() || '(missing)';
	const evidenceB = evidence?.snippet_b?.trim() || '(missing)';
	const sourceA = evidence?.source_a || 'unknown';
	const sourceB = evidence?.source_b || 'unknown';

	return [
		`Explain why paragraph ${paragraphId} is classified as a contradiction.`,
		'Return plain text only.',
		'Do not return JSON.',
		'Do not use markdown, bullet lists, code fences, or labels.',
		'Write a concise explanation in natural language, directly addressing the conflict between evidence A and evidence B.',
		'If the paragraph is actually not contradictory, state that clearly and explain why.',
		'After the explanation, add a blank line and then an "ENTITIES:" block with 2 to 4 highly relevant entities only, one per line.',
		'Entities must prioritize contract parties/actors (e.g., company names, roles such as Licensor/Licensee/Affiliate/Customer).',
		'Do NOT include actions, obligations, verbs, processes, dates, amounts, legal consequences, or generic legal terms as entities.',
		`Known classifier signal: contradiction=true, confidence=${Math.round(contradiction.confidence || 0)}, reason="${(contradiction.brief_reason || '').trim()}".`,
		`Evidence A (${sourceA}): "${evidenceA}"`,
		`Evidence B (${sourceB}): "${evidenceB}"`,
		'Selected paragraph text:',
		`"""${paragraphText}"""`
	].join('\n');
}

export function buildContradictionRiskQuestion(
	paragraphId: string,
	paragraphText: string,
	contradiction: ContradictionParagraphResult
): string {
	const evidence = contradiction.evidence;
	const evidenceA = evidence?.snippet_a?.trim() || '(missing)';
	const evidenceB = evidence?.snippet_b?.trim() || '(missing)';
	const sourceA = evidence?.source_a || 'unknown';
	const sourceB = evidence?.source_b || 'unknown';

	return [
		`Assess the risks created by the contradiction identified in paragraph ${paragraphId}.`,
		'Provide a concise and clear explanation (approximately 4-7 sentences).',
		'Use this exact structure and labels (one section each, no markdown):',
		'Context: <briefly explain what this contract section is about>',
		'Contradiction: <describe the contradiction/inconsistency identified>',
		'Risks: <specific legal, financial, operational, or practical risks>',
		'Affected: <which party is most likely to be harmed and why>',
		'Consequences: <practical/legal consequences from this issue>',
		'Risk Highlight: <2-3 words that best summarize the single biggest risk; noun phrase only>',
		'Use clear and accessible language whenever possible, avoiding unnecessary legal jargon.',
		'Focus on real-world impact and contractual imbalance.',
		'After all sections, add a blank line and then an "ENTITIES:" block with 2 to 4 highly relevant entities only, one per line.',
		'Entities must prioritize contract parties/actors (e.g., company names, roles such as Licensor/Licensee/Affiliate/Customer).',
		'Do NOT include actions, obligations, verbs, processes, dates, amounts, legal consequences, or generic legal terms as entities.',
		`Known classifier signal: contradiction=true, confidence=${Math.round(contradiction.confidence || 0)}, reason="${(contradiction.brief_reason || '').trim()}".`,
		`Evidence A (${sourceA}): "${evidenceA}"`,
		`Evidence B (${sourceB}): "${evidenceB}"`,
		'Selected paragraph text:',
		`"""${paragraphText}"""`
	].join('\n');
}

function sanitizeSuggestedQuestions(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const cleaned = value
		.map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
		.filter((entry) => entry.length > 0);
	return Array.from(new Set(cleaned)).slice(0, 4);
}

function getFallbackSuggestedQuestions(options?: ResolveSuggestedQuestionsOptions): string[] {
	if (options?.contradiction) {
		return [
			'How can I rewrite this paragraph to remove the contradiction?',
			'Which snippet is riskier to keep and why?',
			'Show a safer clause version preserving business intent.'
		];
	}
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
