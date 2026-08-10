import { MAX_RELATED_PARAGRAPHS } from '@/constants/graph';
import type {
	BuildRelatedOptions,
	Node as ParagraphNode,
	ReferenceMatch,
	RelatedParagraph
} from '@/types/document';

function upsertReference(references: ReferenceMatch[], label?: string, value?: string) {
	if (!label || !value) return;

	const normalizedLabel = label.trim();
	const normalizedValue = value.trim();
	if (!normalizedLabel || !normalizedValue) return;

	const exists = references.some(
		(reference) =>
			reference.label.toLowerCase() === normalizedLabel.toLowerCase() &&
			reference.value.toLowerCase() === normalizedValue.toLowerCase()
	);
	if (exists) return;

	references.push({ label: normalizedLabel, value: normalizedValue });
}

export function buildRelatedParagraphs(
	selectedNode: ParagraphNode,
	options: BuildRelatedOptions
): RelatedParagraph[] {
	const { nodes, edges, maxRelatedParagraphs = MAX_RELATED_PARAGRAPHS } = options;
	if (nodes.length <= 1) return [];
	if (edges.length === 0) return [];

	const nodesById = new Map(nodes.map((node) => [node.id, node] as const));
	const relatedById = new Map<string, RelatedParagraph>();

	for (const edge of edges) {
		const isSource = edge.source === selectedNode.id;
		const isTarget = edge.target === selectedNode.id;
		if (!isSource && !isTarget) continue;

		// References are directional: only show outgoing references from selected paragraph.
		if (edge.type === 'reference' && !isSource) continue;

		const candidateId = isSource ? edge.target : edge.source;
		const candidateNode = nodesById.get(candidateId);
		if (!candidateNode) continue;

		const existing: RelatedParagraph = relatedById.get(candidateId) ?? {
			node: candidateNode,
			relationTypes: [],
			references: []
		};

		if (!existing.relationTypes.includes(edge.type)) {
			existing.relationTypes.push(edge.type);
		}

		if (edge.type === 'semantic_similarity' && typeof edge.score === 'number') {
			existing.semanticScore = Math.max(existing.semanticScore ?? 0, edge.score);
		}

		if (edge.type === 'reference') {
			upsertReference(existing.references, edge.ref_label, edge.ref_value);
		}

		relatedById.set(candidateId, existing);
	}

	const sortedRelated = Array.from(relatedById.values())
		.sort((left, right) => {
			const leftReference = left.relationTypes.includes('reference') ? 1 : 0;
			const rightReference = right.relationTypes.includes('reference') ? 1 : 0;
			if (rightReference !== leftReference) return rightReference - leftReference;

			const leftSemantic = left.semanticScore ?? 0;
			const rightSemantic = right.semanticScore ?? 0;
			if (rightSemantic !== leftSemantic) return rightSemantic - leftSemantic;

			return left.node.paragraph_enum - right.node.paragraph_enum;
		});

	if (maxRelatedParagraphs > 0) {
		return sortedRelated.slice(0, maxRelatedParagraphs);
	}

	return sortedRelated;
}

export function truncateText(text: string, maxLength = 420): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

export function formatReferenceSummary(references: ReferenceMatch[]): string {
	const uniqueRefs = Array.from(
		new Set(references.map((reference) => `${reference.label} ${reference.value}`))
	);
	return uniqueRefs.join(', ');
}
