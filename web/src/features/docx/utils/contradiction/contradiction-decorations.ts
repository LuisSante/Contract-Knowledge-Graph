import type {
	ContradictionParagraphResult,
	ContradictionTaxonomyType
} from '@/types/document';
import { CONTRADICTION_TAXONOMY_COLORS } from '@/constants/docx-viewer';
import { findSnippetRangeWithNormalization, normalizeSnippetForSearch } from '@/features/docx/utils/contradiction/snippet-search';
import {
	hasUsableContradictionEvidence,
	hexToRgba,
	normalizeContradictionCandidates,
	resolveContradictionConfidenceBand
} from '@/features/docx/utils/contradiction/contradiction';

interface DecorationContext {
	resultsByParagraphId: Map<string, ContradictionParagraphResult>;
	paragraphElementById: Map<string, HTMLElement>;
	selectedParagraphId: string | null;
}

interface SnippetMeta {
	ownerParagraphId?: string;
	role?: 'a' | 'b';
	contradictionType?: ContradictionTaxonomyType | null;
}

function clearSnippetMarks(element: HTMLElement): void {
	const marks = element.querySelectorAll('mark.docx-contradiction-snippet');
	for (const mark of marks) {
		const parent = mark.parentNode;
		if (!parent) continue;
		while (mark.firstChild) {
			parent.insertBefore(mark.firstChild, mark);
		}
		parent.removeChild(mark);
	}
}

function getContradictionSnippetMarks(): HTMLElement[] {
	if (typeof document === 'undefined') return [];
	return Array.from(document.querySelectorAll<HTMLElement>('mark.docx-contradiction-snippet'));
}

function findTextNodePosition(
	segments: Array<{ node: Text; start: number; end: number }>,
	index: number
): { node: Text; offset: number } | null {
	for (const segment of segments) {
		if (index >= segment.start && index <= segment.end) {
			return { node: segment.node, offset: index - segment.start };
		}
	}
	return null;
}

function highlightSnippetInElement(
	element: HTMLElement,
	rawSnippet: string,
	meta?: SnippetMeta
): boolean {
	const snippet = rawSnippet.trim();
	if (!snippet) return false;

	const textContent = element.textContent ?? '';
	if (!textContent) return false;

	let matchStart = textContent.toLocaleLowerCase().indexOf(snippet.toLocaleLowerCase());
	let matchEnd = matchStart >= 0 ? matchStart + snippet.length : -1;
	if (matchStart === -1) {
		const normalizedMatch = findSnippetRangeWithNormalization(textContent, snippet);
		if (!normalizedMatch) return false;
		matchStart = normalizedMatch.start;
		matchEnd = normalizedMatch.end;
	}
	// Trim leading/trailing whitespace from matched boundaries to avoid empty highlighted
	// lines created by indentation/newline layout nodes in DOCX rendering.
	while (matchStart < matchEnd && /\s/.test(textContent[matchStart] ?? '')) {
		matchStart += 1;
	}
	while (matchEnd > matchStart && /\s/.test(textContent[matchEnd - 1] ?? '')) {
		matchEnd -= 1;
	}
	if (matchEnd <= matchStart) return false;

	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
	const segments: Array<{ node: Text; start: number; end: number }> = [];
	let cursor = 0;
	let current = walker.nextNode();
	while (current) {
		const textNode = current as Text;
		const length = textNode.nodeValue?.length ?? 0;
		if (length > 0) {
			segments.push({ node: textNode, start: cursor, end: cursor + length });
			cursor += length;
		}
		current = walker.nextNode();
	}

	const startPos = findTextNodePosition(segments, matchStart);
	const endPos = findTextNodePosition(segments, matchEnd);
	if (!startPos || !endPos) return false;

	const range = document.createRange();
	range.setStart(startPos.node, startPos.offset);
	range.setEnd(endPos.node, endPos.offset);
	if (range.collapsed) return false;
	const rangeText = range.toString();
	if (!/\S/.test(rangeText)) return false;
	// Guard against over-expanded matches spanning large invisible layout gaps.
	const normalizedSnippetLength = normalizeSnippetForSearch(snippet).length;
	const normalizedRangeLength = normalizeSnippetForSearch(rangeText).length;
	if (
		normalizedSnippetLength > 0 &&
		normalizedRangeLength > Math.max(normalizedSnippetLength * 1.8, normalizedSnippetLength + 80)
	) {
		return false;
	}
	if (/[\s\u200B-\u200D\uFEFF]{20,}/.test(rangeText)) return false;

	const mark = document.createElement('mark');
	mark.className = 'docx-contradiction-snippet';
	if (meta?.ownerParagraphId) {
		mark.dataset.contradictionOwner = meta.ownerParagraphId;
	}
	if (meta?.role) {
		mark.dataset.contradictionRole = meta.role;
	}
	if (meta?.contradictionType) {
		mark.dataset.contradictionType = meta.contradictionType;
	}
	if (meta?.contradictionType) {
		const categoryColor = meta.contradictionType
			? (CONTRADICTION_TAXONOMY_COLORS[meta.contradictionType] ??
				CONTRADICTION_TAXONOMY_COLORS.specificity)
			: CONTRADICTION_TAXONOMY_COLORS.specificity;
		mark.style.setProperty('--contradiction-bg', hexToRgba(categoryColor, 0.18));
		mark.style.setProperty('--contradiction-bg-active', hexToRgba(categoryColor, 0.28));
		mark.style.setProperty('--contradiction-ring', categoryColor);
	}
	try {
		range.surroundContents(mark);
	} catch {
		const extracted = range.extractContents();
		mark.appendChild(extracted);
		range.insertNode(mark);
	}

	return true;
}

function highlightSnippetAcrossDocument(
	paragraphElementById: Map<string, HTMLElement>,
	snippet: string,
	preferredElement?: HTMLElement,
	excludedElement?: HTMLElement,
	meta?: SnippetMeta
): boolean {
	if (!snippet.trim()) return false;

	if (
		preferredElement &&
		preferredElement !== excludedElement &&
		highlightSnippetInElement(preferredElement, snippet, meta)
	) {
		return true;
	}

	for (const element of paragraphElementById.values()) {
		if (excludedElement && element === excludedElement) continue;
		if (preferredElement && element === preferredElement) continue;
		if (highlightSnippetInElement(element, snippet, meta)) {
			return true;
		}
	}

	return false;
}

export function updateActiveContradictionSnippetMarks(
	selectedParagraphId: string | null
): void {
	if (typeof document === 'undefined') return;
	const allMarks = getContradictionSnippetMarks();
	for (const mark of allMarks) {
		mark.classList.remove('docx-contradiction-snippet--active');
	}

	if (!selectedParagraphId) return;

	for (const mark of allMarks) {
		if (mark.dataset.contradictionOwner === selectedParagraphId) {
			mark.classList.add('docx-contradiction-snippet--active');
		}
	}
}

export function clearContradictionHighlights(
	paragraphElementById: Map<string, HTMLElement>
): void {
	for (const element of paragraphElementById.values()) {
		element.classList.remove('docx-contradiction-highlight', 'docx-contradiction-selected');
		element.style.removeProperty('--tw-ring-color');
		element.style.removeProperty('--tw-ring-offset-shadow');
		element.style.removeProperty('--tw-ring-shadow');
		element.style.removeProperty('outline');
		clearSnippetMarks(element);
		delete element.dataset.contradictionConfidenceBand;
		delete element.dataset.contradictionConfidence;
		delete element.dataset.contradictionReason;
	}

	if (typeof document !== 'undefined') {
		// Hard cleanup for any stale contradiction decorations outside tracked paragraph map
		for (const element of document.querySelectorAll<HTMLElement>(
			'.docx-contradiction-highlight, .docx-contradiction-selected'
		)) {
			element.classList.remove('docx-contradiction-highlight', 'docx-contradiction-selected');
			element.style.removeProperty('--tw-ring-color');
			element.style.removeProperty('--tw-ring-offset-shadow');
			element.style.removeProperty('--tw-ring-shadow');
			element.style.removeProperty('outline');
			delete element.dataset.contradictionConfidenceBand;
			delete element.dataset.contradictionConfidence;
			delete element.dataset.contradictionReason;
		}
		for (const mark of document.querySelectorAll<HTMLElement>('mark.docx-contradiction-snippet')) {
			const parent = mark.parentNode;
			if (!parent) continue;
			while (mark.firstChild) {
				parent.insertBefore(mark.firstChild, mark);
			}
			parent.removeChild(mark);
		}
	}
}

export function applyContradictionHighlights(ctx: DecorationContext): void {
	const { resultsByParagraphId, paragraphElementById, selectedParagraphId } = ctx;
	clearContradictionHighlights(paragraphElementById);

	for (const [paragraphId, result] of resultsByParagraphId.entries()) {
		if (!result.contradiction) continue;
		const element = paragraphElementById.get(paragraphId);
		if (!element) continue;

		const confidenceBand = resolveContradictionConfidenceBand(result.confidence);

		element.classList.add('docx-contradiction-highlight');
		element.style.setProperty('--tw-ring-color', 'transparent');
		element.style.setProperty('--tw-ring-offset-shadow', '0 0 #0000');
		element.style.setProperty('--tw-ring-shadow', '0 0 #0000');
		element.style.setProperty('outline', 'none');
		element.dataset.contradictionConfidenceBand = confidenceBand;
		element.dataset.contradictionConfidence = String(result.confidence);
		element.dataset.contradictionReason = result.brief_reason ?? '';

		const findings = normalizeContradictionCandidates(result);
		for (const [index, finding] of findings.entries()) {
			const evidence = finding.evidence;
			if (!hasUsableContradictionEvidence(evidence)) continue;
			const contradictionType = finding.contradiction_type ?? 'specificity';
			const roleA = index === 0 ? 'a' : undefined;
			const roleB = index === 0 ? 'b' : undefined;
			if (evidence.snippet_a.trim()) {
				if (evidence.source_a === 'context') {
					highlightSnippetAcrossDocument(paragraphElementById, evidence.snippet_a, undefined, element, {
						ownerParagraphId: paragraphId,
						role: roleA,
						contradictionType
					});
				} else {
					highlightSnippetInElement(element, evidence.snippet_a, {
						ownerParagraphId: paragraphId,
						role: roleA,
						contradictionType
					});
				}
			}
			if (evidence.snippet_b.trim()) {
				if (evidence.source_b === 'context') {
					highlightSnippetAcrossDocument(paragraphElementById, evidence.snippet_b, undefined, element, {
						ownerParagraphId: paragraphId,
						role: roleB,
						contradictionType
					});
				} else {
					highlightSnippetInElement(element, evidence.snippet_b, {
						ownerParagraphId: paragraphId,
						role: roleB,
						contradictionType
					});
				}
			}
		}
	}

	if (selectedParagraphId && resultsByParagraphId.get(selectedParagraphId)?.contradiction) {
		paragraphElementById.get(selectedParagraphId)?.classList.add('docx-contradiction-selected');
	}
	updateActiveContradictionSnippetMarks(selectedParagraphId);
}
