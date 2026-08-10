'use client';

import { useCallback, useMemo, useState } from 'react';
import { useDocumentStore } from '@/stores/document';
import { fetchContradictionAnalysis, fetchSavedContradictions } from '@/services/contradiction';
import { getAxiosErrorMessage } from '@/features/docx/utils/docx-engine/http-error';
import { getNodeCurrentText } from '@/features/docx/utils/edit/edit';
import {
	buildContradictionCandidateKey,
	buildContradictionSourceLookups,
	hasUsableContradictionEvidence,
	normalizeContradictionCandidates,
	repairEvidenceForParagraph,
} from '@/features/docx/utils/contradiction/contradiction';
import { CONTRADICTION_TAXONOMY_COLORS } from '@/constants/docx-viewer';
import type {
	ContradictionAnalysisRequest,
	ContradictionFinding,
	ContradictionGraphMode,
	ContradictionParagraphResult,
	ContradictionTaxonomyType,
	Edge as GraphEdge,
	ParagraphEditState,
} from '@/types/document';

type ConfirmContradictionEstimate = (
	callType: 'contradictions_analyze',
	payload: ContradictionAnalysisRequest
) => Promise<boolean>;

export interface ContradictionSummaryItem {
	paragraphId: string;
	label: string;
	contradictionType: ContradictionTaxonomyType;
	/** Model confidence for the primary contradiction candidate (0-100). */
	confidence: number;
}

interface UseContradictionAnalysisParams {
	docId: string;
	nodeEditStateById: Map<string, ParagraphEditState>;
	/** Edges of the relations graph (for the real-time search). */
	backendEdges?: GraphEdge[];
	/** Analysis model (optional). */
	model?: string;
	/** LLM cost confirmation before the LLM search. */
	confirmLlmEstimate?: ConfirmContradictionEstimate;
}

/**
 * State and loading of the contradiction analysis. Ingests the backend results
 * (normalizes candidates, repairs evidence, dedups, ranks) and derives the
 * result/evidence of the selected paragraph and the summary list.
 *
 * Current slice: loading of **saved** contradictions. The LLM run (+cost) and
 * the graph are deferred.
 */
export function useContradictionAnalysis({
	docId,
	nodeEditStateById,
	backendEdges = [],
	model,
	confirmLlmEstimate,
}: UseContradictionAnalysisParams) {
	const nodes = useDocumentStore((s) => s.paragraphs);
	const selectedParagraph = useDocumentStore((s) => s.selectedParagraph);

	const [resultsByParagraphId, setResultsByParagraphId] = useState<
		Map<string, ContradictionParagraphResult>
	>(new Map());
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [hasTriggered, setHasTriggered] = useState(false);
	const [graphMode] = useState<ContradictionGraphMode>('without_kg');

	const ingestResults = useCallback(
		(results: ContradictionParagraphResult[]) => {
			const next = new Map<string, ContradictionParagraphResult>();
			const seenGlobalKeys = new Set<string>();
			const sourceLookups = buildContradictionSourceLookups({
				nodes,
				nodeEditStateById,
				backendEdges,
			});

			for (const row of results) {
				const rowId = String(row.paragraph_id);
				const candidates = normalizeContradictionCandidates(row).map((candidate) => {
					if (!hasUsableContradictionEvidence(candidate.evidence)) return candidate;
					return {
						...candidate,
						evidence: repairEvidenceForParagraph(rowId, candidate.evidence, sourceLookups),
					};
				});

				const uniqueCandidates: ContradictionFinding[] = [];
				for (const candidate of candidates) {
					const key = buildContradictionCandidateKey(candidate);
					if (!key || seenGlobalKeys.has(key)) continue;
					seenGlobalKeys.add(key);
					uniqueCandidates.push(candidate);
				}

				const primary = uniqueCandidates[0];
				if (!primary) {
					next.set(rowId, {
						...row,
						contradiction: false,
						confidence: 0,
						brief_reason: '',
						contradiction_type: null,
						evidence: null,
						contradictions: [],
					});
					continue;
				}

				next.set(rowId, {
					...row,
					contradiction: true,
					confidence: Math.min(100, Math.max(0, Number(primary.confidence || 0))),
					brief_reason: (primary.brief_reason || '').trim(),
					contradiction_type: primary.contradiction_type ?? 'specificity',
					evidence: primary.evidence ?? null,
					contradictions: uniqueCandidates,
				});
			}

			setResultsByParagraphId(next);
		},
		[nodes, nodeEditStateById, backendEdges]
	);

	const loadSavedContradictions = useCallback(async () => {
		setHasTriggered(true);
		setLoading(true);
		setError(null);
		try {
			const response = await fetchSavedContradictions(docId, graphMode);
			ingestResults(response.paragraphResults ?? []);
		} catch (err) {
			setError(getAxiosErrorMessage(err, 'Could not load contradictions.'));
		} finally {
			setLoading(false);
		}
	}, [docId, graphMode, ingestResults]);

	// Real-time contradiction search with LLM (with cost confirmation).
	const searchContradictions = useCallback(async () => {
		setHasTriggered(true);
		if (!docId) {
			setError('No document is loaded.');
			return;
		}
		const graphNodes = nodes.map((node) => ({
			...node,
			text: getNodeCurrentText(nodeEditStateById, node),
		}));
		if (graphNodes.length === 0) {
			setError('No paragraph context is available yet.');
			return;
		}
		const payload: ContradictionAnalysisRequest = {
			documentId: docId,
			provider: 'openai',
			temperature: 0.3,
			model: model?.trim() || undefined,
			mode: graphMode,
			graph: { nodes: graphNodes, edges: backendEdges },
		};

		setLoading(true);
		setError(null);
		try {
			if (confirmLlmEstimate) {
				const approved = await confirmLlmEstimate('contradictions_analyze', payload);
				if (!approved) return;
			}
			const response = await fetchContradictionAnalysis(payload);
			ingestResults(response.paragraphResults ?? []);
		} catch (err) {
			setError(getAxiosErrorMessage(err, 'Failed to search contradictions with LLM.'));
		} finally {
			setLoading(false);
		}
	}, [docId, nodes, nodeEditStateById, backendEdges, model, graphMode, confirmLlmEstimate, ingestResults]);

	const summaryItems = useMemo<ContradictionSummaryItem[]>(() => {
		const items: Array<ContradictionSummaryItem & { paragraphEnum: number }> = [];
		for (const [paragraphId, row] of resultsByParagraphId.entries()) {
			if (!row.contradiction) continue;
			const match = paragraphId.match(/-p-(\d+)$/);
			const paragraphEnum = match ? Number(match[1]) : Number.POSITIVE_INFINITY;
			const label = match ? `p-${match[1]}` : paragraphId;
			items.push({
				paragraphId,
				label,
				paragraphEnum,
				contradictionType: row.contradiction_type ?? 'specificity',
				confidence: row.confidence,
			});
		}
		items.sort(
			(left, right) =>
				left.paragraphEnum - right.paragraphEnum ||
				left.paragraphId.localeCompare(right.paragraphId)
		);
		return items.map(({ paragraphId, label, contradictionType, confidence }) => ({
			paragraphId,
			label,
			contradictionType,
			confidence,
		}));
	}, [resultsByParagraphId]);

	const selectedContradictionResult = useMemo<ContradictionParagraphResult | null>(
		() => (selectedParagraph ? (resultsByParagraphId.get(selectedParagraph.id) ?? null) : null),
		[selectedParagraph, resultsByParagraphId]
	);

	const selectedContradictionEvidence =
		selectedContradictionResult?.contradiction && selectedContradictionResult.evidence
			? selectedContradictionResult.evidence
			: null;

	const selectedContradictionCategoryColor =
		selectedContradictionResult?.contradiction_type &&
		CONTRADICTION_TAXONOMY_COLORS[selectedContradictionResult.contradiction_type]
			? CONTRADICTION_TAXONOMY_COLORS[selectedContradictionResult.contradiction_type]
			: CONTRADICTION_TAXONOMY_COLORS.specificity;

	return {
		resultsByParagraphId,
		loading,
		error,
		hasTriggered,
		graphMode,
		summaryItems,
		contradictionCount: summaryItems.length,
		selectedContradictionResult,
		selectedContradictionEvidence,
		selectedContradictionCategoryColor,
		loadSavedContradictions,
		searchContradictions,
	};
}
