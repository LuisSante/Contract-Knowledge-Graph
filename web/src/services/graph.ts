import { api } from '@/lib/api';
import type {
	Edge as GraphEdge,
	Node as ParagraphNode,
	ParagraphEditState,
	ProcessDocumentResponse,
} from '@/types/document';
import { getNodeCurrentText } from '@/features/docx/utils/edit/edit';

function buildProcessPages(
	nodes: ParagraphNode[],
	nodeEditStateById: Map<string, ParagraphEditState>
) {
	const pagesByNumber = new Map<number, Array<{ id: string; text: string }>>();

	for (const node of [...nodes].sort((a, b) => a.paragraph_enum - b.paragraph_enum)) {
		const pageNumber = Number.isFinite(node.page) && node.page > 0 ? node.page : 1;
		const pageElements = pagesByNumber.get(pageNumber) ?? [];
		pageElements.push({
			id: node.id,
			text: getNodeCurrentText(nodeEditStateById, node),
		});
		pagesByNumber.set(pageNumber, pageElements);
	}

	return Array.from(pagesByNumber.entries())
		.sort((left, right) => left[0] - right[0])
		.map(([pageNumber, elements]) => ({ pageNumber, elements }));
}

function buildDirectionalRelationsByNodeId(
	nodes: ParagraphNode[],
	edges: GraphEdge[]
): Map<string, number> {
	const neighborsByNodeId = new Map<string, Set<string>>();

	for (const node of nodes) {
		neighborsByNodeId.set(node.id, new Set<string>());
	}

	for (const edge of edges) {
		if (edge.type === 'reference') {
			// Keep references directional: source -> target
			const sourceNeighbors = neighborsByNodeId.get(edge.source);
			if (sourceNeighbors) sourceNeighbors.add(edge.target);
			continue;
		}

		if (edge.type === 'semantic_similarity') {
			// Semantic similarity is symmetric.
			const sourceNeighbors = neighborsByNodeId.get(edge.source);
			if (sourceNeighbors) sourceNeighbors.add(edge.target);

			const targetNeighbors = neighborsByNodeId.get(edge.target);
			if (targetNeighbors) targetNeighbors.add(edge.source);
		}
	}

	return new Map(
		Array.from(neighborsByNodeId.entries()).map(
			([nodeId, neighbors]) => [nodeId, neighbors.size] as const
		)
	);
}

export async function fetchBackendGraph(
	docId: string,
	nodesSnapshot: ParagraphNode[],
	nodeEditStateById: Map<string, ParagraphEditState>
): Promise<{ edges: GraphEdge[]; relationsByNodeId: Map<string, number> }> {
	const response = await api.post<ProcessDocumentResponse>('/process', {
		documentId: docId,
		pages: buildProcessPages(nodesSnapshot, nodeEditStateById),
	});

	const edges = response.data.graph.edges ?? [];
	const relationsByNodeId = buildDirectionalRelationsByNodeId(nodesSnapshot, edges);

	return { edges, relationsByNodeId };
}
