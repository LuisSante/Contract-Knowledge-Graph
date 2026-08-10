import type {
	ChatHighlightSegment,
	ContradictionTaxonomyType,
	StructuredContradictionAnalysis
} from '@/types/document';

function toNonEmptyString(raw: unknown): string {
	if (typeof raw === 'string') return raw.trim();
	if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw).trim();
	return '';
}

function normalizeChatPreviewText(value: string): string {
	return value
		.replace(/\u00a0/g, ' ')
		.replace(/\r\n?/g, '\n')
		.replace(/[ \t]*\n+[ \t]*/g, ' ')
		.replace(/[ \t]{2,}/g, ' ')
		.trim();
}

export function buildChatHighlightSegments(
	analysis: StructuredContradictionAnalysis | null | undefined
): ChatHighlightSegment[] {
	if (!analysis) return [];

	const sourceText = normalizeChatPreviewText(analysis.highlight_source_text || '');
	if (!sourceText) return [];

	const textLower = sourceText.toLowerCase();
	const contradictionById = new Map<
		string,
		StructuredContradictionAnalysis['contradictions'][number]
	>();
	for (const contradiction of analysis.contradictions) {
		const key = toNonEmptyString(contradiction.id).toLowerCase();
		if (!key) continue;
		contradictionById.set(key, contradiction);
	}
	const singleContradiction =
		analysis.contradictions.length === 1 ? analysis.contradictions[0] : null;
	const singleContradictionId = singleContradiction
		? toNonEmptyString(singleContradiction.id) || null
		: null;

	type HighlightSpan = {
		start: number;
		end: number;
		length: number;
		category: ContradictionTaxonomyType;
		claimId?: string;
		claimSide?: 'a' | 'b';
		contradictionType?: ContradictionTaxonomyType;
		contradictionWhy?: string;
	};
	type SegmentMeta = Omit<ChatHighlightSegment, 'text'>;

	function findPhraseRanges(
		phrase: string,
		maxMatches: number
	): Array<{ start: number; end: number }> {
		if (!phrase) return [];
		const ranges: Array<{ start: number; end: number }> = [];
		const phraseLower = phrase.toLowerCase();
		let fromIndex = 0;
		while (fromIndex < textLower.length && ranges.length < maxMatches) {
			const start = textLower.indexOf(phraseLower, fromIndex);
			if (start < 0) break;
			ranges.push({ start, end: start + phrase.length });
			fromIndex = start + Math.max(1, phrase.length);
		}
		return ranges;
	}

	const claimIdByChar = new Array<string | null>(sourceText.length).fill(null);
	const claimSideByChar = new Array<'a' | 'b' | null>(sourceText.length).fill(null);
	const highlightCategoryByChar = new Array<ContradictionTaxonomyType | null>(
		sourceText.length
	).fill(null);
	const highlightTypeByChar = new Array<ContradictionTaxonomyType | null>(sourceText.length).fill(
		null
	);
	const highlightWhyByChar = new Array<string | null>(sourceText.length).fill(null);
	const highlightSpanLengthByChar = new Array<number>(sourceText.length).fill(
		Number.POSITIVE_INFINITY
	);
	const highlightClaimIdByChar = new Array<string | null>(sourceText.length).fill(null);
	const highlightClaimSideByChar = new Array<'a' | 'b' | null>(sourceText.length).fill(null);

	const assignClaimRange = (
		start: number,
		end: number,
		claimId: string,
		claimSide: 'a' | 'b'
	) => {
		const safeStart = Math.max(0, Math.min(sourceText.length, start));
		const safeEnd = Math.max(0, Math.min(sourceText.length, end));
		for (let index = safeStart; index < safeEnd; index += 1) {
			if (!claimIdByChar[index]) claimIdByChar[index] = claimId;
			if (!claimSideByChar[index]) claimSideByChar[index] = claimSide;
		}
	};

	const assignHighlightRange = (span: HighlightSpan) => {
		const safeStart = Math.max(0, Math.min(sourceText.length, span.start));
		const safeEnd = Math.max(0, Math.min(sourceText.length, span.end));
		for (let index = safeStart; index < safeEnd; index += 1) {
			const currentSpanLength = highlightSpanLengthByChar[index];
			const shouldReplace = span.length < currentSpanLength;
			if (shouldReplace) {
				highlightCategoryByChar[index] = span.category;
				highlightTypeByChar[index] = span.contradictionType || null;
				highlightWhyByChar[index] = span.contradictionWhy || null;
				highlightClaimIdByChar[index] = span.claimId || null;
				highlightClaimSideByChar[index] = span.claimSide || null;
				highlightSpanLengthByChar[index] = span.length;
			}
			if (span.claimId && !claimIdByChar[index]) claimIdByChar[index] = span.claimId;
			if (span.claimSide && !claimSideByChar[index]) claimSideByChar[index] = span.claimSide;
		}
	};

	const claimTextToRanges = (rawClaimText: string): Array<{ start: number; end: number }> => {
		const phrase = normalizeChatPreviewText(rawClaimText);
		if (phrase.length < 6) return [];
		const exact = findPhraseRanges(phrase, 2);
		if (exact.length > 0) return exact;

		const fragments = phrase
			.split(/[,:;()]/)
			.map((part) => part.trim())
			.filter((part) => part.length >= Math.max(12, Math.floor(phrase.length * 0.35)))
			.sort((left, right) => right.length - left.length);
		for (const fragment of fragments.slice(0, 3)) {
			const fragmentHits = findPhraseRanges(fragment, 2);
			if (fragmentHits.length > 0) return fragmentHits;
		}
		return [];
	};

	for (const contradiction of analysis.contradictions) {
		const claimId = toNonEmptyString(contradiction.id);
		if (!claimId) continue;
		for (const range of claimTextToRanges(contradiction.claim_a.text || '')) {
			assignClaimRange(range.start, range.end, claimId, 'a');
		}
		for (const range of claimTextToRanges(contradiction.claim_b.text || '')) {
			assignClaimRange(range.start, range.end, claimId, 'b');
		}
	}

	for (const highlight of analysis.highlights) {
		const phrase = normalizeChatPreviewText(highlight.phrase);
		if (phrase.length < 2) continue;
		const rawClaimId = toNonEmptyString(highlight.claim_id);
		const mappedContradiction = rawClaimId
			? contradictionById.get(rawClaimId.toLowerCase())
			: singleContradiction;
		const claimId = mappedContradiction?.id || rawClaimId || undefined;
		const claimSide =
			highlight.claim_side === 'a' || highlight.claim_side === 'b'
				? highlight.claim_side
				: undefined;
		const contradictionType = mappedContradiction?.contradiction_type;
		const contradictionWhy = mappedContradiction?.why;
		const phraseRanges = findPhraseRanges(phrase, 4);
		for (const range of phraseRanges) {
			assignHighlightRange({
				start: range.start,
				end: range.end,
				length: range.end - range.start,
				category: highlight.category,
				claimId,
				claimSide,
				contradictionType,
				contradictionWhy
			});
		}
	}

	for (let index = 0; index < sourceText.length; index += 1) {
		if (!claimIdByChar[index]) {
			if (claimSideByChar[index] && singleContradictionId) {
				claimIdByChar[index] = singleContradictionId;
			} else if (highlightClaimIdByChar[index]) {
				claimIdByChar[index] = highlightClaimIdByChar[index];
			} else if (highlightCategoryByChar[index] && singleContradictionId) {
				claimIdByChar[index] = singleContradictionId;
			}
		}
		if (!claimSideByChar[index] && highlightClaimSideByChar[index]) {
			claimSideByChar[index] = highlightClaimSideByChar[index];
		}
	}

	const hasMetadata = claimIdByChar.some(Boolean) || highlightCategoryByChar.some(Boolean);
	if (!hasMetadata) {
		return [{ text: sourceText, category: null, interactive: false }];
	}

	const getMetaForCharIndex = (index: number): SegmentMeta => {
		const claimId = claimIdByChar[index] || undefined;
		const claimSide = claimSideByChar[index] || undefined;
		const category = highlightCategoryByChar[index];
		const contradiction = claimId ? contradictionById.get(claimId.toLowerCase()) : undefined;
		const contradictionType =
			contradiction?.contradiction_type || highlightTypeByChar[index] || undefined;
		const contradictionWhy = contradiction?.why || highlightWhyByChar[index] || undefined;
		const interactive = Boolean(category || claimId || claimSide);
		return {
			category,
			claimId,
			claimSide,
			contradictionType,
			contradictionWhy,
			interactive
		};
	};

	const metaEquals = (left: SegmentMeta, right: SegmentMeta): boolean =>
		left.category === right.category &&
		left.claimId === right.claimId &&
		left.claimSide === right.claimSide &&
		left.contradictionType === right.contradictionType &&
		left.contradictionWhy === right.contradictionWhy &&
		left.interactive === right.interactive;

	const segments: ChatHighlightSegment[] = [];
	let segmentStart = 0;
	let segmentMeta = getMetaForCharIndex(0);
	for (let index = 1; index < sourceText.length; index += 1) {
		const nextMeta = getMetaForCharIndex(index);
		if (metaEquals(segmentMeta, nextMeta)) continue;
		segments.push({
			text: sourceText.slice(segmentStart, index),
			...segmentMeta
		});
		segmentStart = index;
		segmentMeta = nextMeta;
	}
	segments.push({
		text: sourceText.slice(segmentStart),
		...segmentMeta
	});

	return segments;
}
