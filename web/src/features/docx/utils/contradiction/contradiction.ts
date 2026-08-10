import type {
	ContradictionParagraphResult,
	ContradictionFinding,
	ContradictionEvidence,
	ContradictionGraphMode,
	Node as ParagraphNode,
	ParagraphEditState,
	Edge as GraphEdge
} from '@/types/document';
import { getNodeCurrentText } from '@/features/docx/utils/edit/edit';
import { resolveSnippetAgainstSources } from '@/features/docx/utils/contradiction/snippet-search';

export function hexToRgba(hex: string, alpha: number): string {
	const normalized = hex.replace('#', '').trim();
	if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(132, 204, 22, ${alpha})`;
	const r = Number.parseInt(normalized.slice(0, 2), 16);
	const g = Number.parseInt(normalized.slice(2, 4), 16);
	const b = Number.parseInt(normalized.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function resolveContradictionConfidenceBand(
	confidence: number
): 'low' | 'medium' | 'high' {
	let confidenceBand: 'low' | 'medium' | 'high' = 'low';
	if (confidence >= 80) confidenceBand = 'high';
	else if (confidence >= 50) confidenceBand = 'medium';
	return confidenceBand;
}

export function normalizeContradictionSnippetForKey(value: string | null | undefined): string {
	return (value ?? '')
		.normalize('NFKC')
		.toLocaleLowerCase()
		.replace(/[\u200B-\u200D\uFEFF]/g, '')
		.replace(/["'`“”‘’]+/g, '')
		.replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function hasUsableContradictionEvidence(
	evidence: ContradictionEvidence | null | undefined
): evidence is ContradictionEvidence {
	const snippetA = evidence?.snippet_a?.trim() ?? '';
	const snippetB = evidence?.snippet_b?.trim() ?? '';
	return Boolean(snippetA && snippetB);
}

export function buildContradictionSourceLookups(params: {
	nodes: ParagraphNode[];
	nodeEditStateById: Map<string, ParagraphEditState>;
	backendEdges: GraphEdge[];
}): {
	textByNodeId: Map<string, string>;
	relatedByNodeId: Map<string, Set<string>>;
} {
	const { nodes, nodeEditStateById, backendEdges } = params;
	const textByNodeId = new Map<string, string>();
	for (const node of nodes) {
		textByNodeId.set(node.id, getNodeCurrentText(nodeEditStateById, node));
	}

	const relatedByNodeId = new Map<string, Set<string>>();
	for (const edge of backendEdges) {
		const sourceId = String(edge.source);
		const targetId = String(edge.target);
		if (!textByNodeId.has(sourceId) || !textByNodeId.has(targetId)) continue;
		const sourceSet = relatedByNodeId.get(sourceId) ?? new Set<string>();
		sourceSet.add(targetId);
		relatedByNodeId.set(sourceId, sourceSet);
		const targetSet = relatedByNodeId.get(targetId) ?? new Set<string>();
		targetSet.add(sourceId);
		relatedByNodeId.set(targetId, targetSet);
	}

	return { textByNodeId, relatedByNodeId };
}

export function repairEvidenceForParagraph(
	rowId: string,
	evidence: ContradictionEvidence,
	lookups: {
		textByNodeId: Map<string, string>;
		relatedByNodeId: Map<string, Set<string>>;
	}
): ContradictionEvidence {
	const paragraphText = lookups.textByNodeId.get(rowId) ?? '';
	const relatedIds = lookups.relatedByNodeId.get(rowId) ?? new Set<string>();
	const relatedTexts = Array.from(relatedIds)
		.map((id) => lookups.textByNodeId.get(id) ?? '')
		.filter((text) => text.trim().length > 0);
	const allTexts = [paragraphText, ...relatedTexts].filter((text) => text.trim().length > 0);

	const sourcesFor = (sourceLabel: ContradictionEvidence['source_a']): string[] => {
		if (sourceLabel === 'paragraph') return paragraphText ? [paragraphText] : [];
		if (sourceLabel === 'context') return relatedTexts;
		return allTexts;
	};

	const repairedA = resolveSnippetAgainstSources(
		evidence.snippet_a,
		sourcesFor(evidence.source_a)
	);
	const repairedB = resolveSnippetAgainstSources(
		evidence.snippet_b,
		sourcesFor(evidence.source_b)
	);

	const nextEvidence: ContradictionEvidence = {
		...evidence,
		snippet_a: repairedA,
		snippet_b: repairedB
	};
	if (nextEvidence.snippet_a && nextEvidence.snippet_b) {
		nextEvidence.evidence_status = 'exact';
	}
	return nextEvidence;
}

export function buildContradictionCandidateKey(candidate: ContradictionFinding): string | null {
	const evidence = candidate.evidence;
	if (!hasUsableContradictionEvidence(evidence)) return null;
	const snippetA = normalizeContradictionSnippetForKey(evidence?.snippet_a);
	const snippetB = normalizeContradictionSnippetForKey(evidence?.snippet_b);
	if (!snippetA || !snippetB) return null;
	const left = snippetA <= snippetB ? snippetA : snippetB;
	const right = snippetA <= snippetB ? snippetB : snippetA;
	const contradictionType = candidate.contradiction_type ?? 'specificity';
	return `${contradictionType}|${left}<>${right}`;
}

export function normalizeContradictionCandidates(
	row: ContradictionParagraphResult
): ContradictionFinding[] {
	const candidates: ContradictionFinding[] = [];
	if (Array.isArray(row.contradictions)) {
		for (const finding of row.contradictions) {
			if (!finding || !hasUsableContradictionEvidence(finding.evidence)) continue;
			candidates.push({
				confidence: Math.min(100, Math.max(0, Number(finding.confidence || 0))),
				brief_reason: (finding.brief_reason || '').trim(),
				contradiction_type: finding.contradiction_type ?? 'specificity',
				evidence: finding.evidence
			});
		}
	}
	if (candidates.length === 0 && row.contradiction && hasUsableContradictionEvidence(row.evidence)) {
		candidates.push({
			confidence: Math.min(100, Math.max(0, Number(row.confidence || 0))),
			brief_reason: (row.brief_reason || '').trim(),
			contradiction_type: row.contradiction_type ?? 'specificity',
			evidence: row.evidence
		});
	}

	const byKey = new Map<string, ContradictionFinding>();
	for (const candidate of candidates) {
		const key = buildContradictionCandidateKey(candidate);
		if (!key) continue;
		const current = byKey.get(key);
		if (!current || Number(candidate.confidence || 0) > Number(current.confidence || 0)) {
			byKey.set(key, candidate);
		}
	}

	const normalized = Array.from(byKey.values());
	normalized.sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0));
	return normalized;
}

export function contradictionModeLabel(mode: ContradictionGraphMode): string {
	return mode === 'with_kg' ? 'KG' : 'No KG';
}
