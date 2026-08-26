import { diffWordsWithSpace } from 'diff';

import {
	CONTRADICTION_TAXONOMY_COLORS,
	CONTRADICTION_TAXONOMY_LABELS,
} from '@/constants/docx-viewer';
import { hexToRgba } from '@/features/docx/utils/contradiction/contradiction';
import type {
	ContradictionParagraphResult,
	ContradictionTaxonomyType,
} from '@/types/document';

export type EvidenceDiffSegment = {
	text: string;
	changed: boolean;
};

export function resolveContradictionTypeStyle(
	contradictionType: ContradictionTaxonomyType | null | undefined,
) {
	const type = contradictionType ?? 'specificity';
	const color = CONTRADICTION_TAXONOMY_COLORS[type] ?? CONTRADICTION_TAXONOMY_COLORS.specificity;
	return {
		type,
		color,
		label: CONTRADICTION_TAXONOMY_LABELS[type] ?? CONTRADICTION_TAXONOMY_LABELS.specificity,
		borderSoft: hexToRgba(color, 0.48),
		backgroundSoft: hexToRgba(color, 0.06),
		backgroundStrong: hexToRgba(color, 0.13),
	};
}

function resolveContradictionTypeForSelected(
	selectedContradictionResult: ContradictionParagraphResult | null,
): ContradictionTaxonomyType {
	const nextType = selectedContradictionResult?.contradiction_type;
	if (!nextType) return 'specificity';
	return nextType;
}

export function resolveSnippetBStyle(
	selectedContradictionResult: ContradictionParagraphResult | null,
) {
	const contradictionType = resolveContradictionTypeForSelected(selectedContradictionResult);
	const color =
		CONTRADICTION_TAXONOMY_COLORS[contradictionType] ?? CONTRADICTION_TAXONOMY_COLORS.specificity;
	return {
		color,
		border: color,
		background: hexToRgba(color, 0.08),
		badgeBorder: color,
		badgeText: color,
		label:
			CONTRADICTION_TAXONOMY_LABELS[contradictionType] ?? CONTRADICTION_TAXONOMY_LABELS.specificity,
	};
}

export function buildEvidenceDiffSegments(
	snippetA: string,
	snippetB: string,
): { a: EvidenceDiffSegment[]; b: EvidenceDiffSegment[] } {
	const aSegments: EvidenceDiffSegment[] = [];
	const bSegments: EvidenceDiffSegment[] = [];
	for (const segment of diffWordsWithSpace(snippetA || '', snippetB || '')) {
		const value = segment.value ?? '';
		if (!value) continue;
		if (segment.removed) {
			aSegments.push({ text: value, changed: true });
			continue;
		}
		if (segment.added) {
			bSegments.push({ text: value, changed: true });
			continue;
		}
		aSegments.push({ text: value, changed: false });
		bSegments.push({ text: value, changed: false });
	}
	return { a: aSegments, b: bSegments };
}

export function resolveEvidenceScopeLabel(
	evidence: ContradictionParagraphResult['evidence'],
): string {
	const sourceA = (evidence?.source_a || '').trim().toLowerCase();
	const sourceB = (evidence?.source_b || '').trim().toLowerCase();
	if (sourceA === 'paragraph' && sourceB === 'paragraph') return 'intra paragraph';
	if (sourceA === 'context' || sourceB === 'context') return 'inter paragraph';
	return sourceA === 'paragraph' || sourceB === 'paragraph' ? 'intra paragraph' : 'inter paragraph';
}
