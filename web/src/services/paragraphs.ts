import { api } from '@/lib/api';
import type { ClauseTreeNode, Node as ParagraphNode, ParagraphEditState } from '@/types/document';
import { getNodeCurrentText } from '@/features/docx/utils/edit';

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

/** Persist the rendered paragraphs server-side; the KG build reads this dump.
 *  Returns the section tree the server derived from them, so navigation and the
 *  chunking that feeds extraction read the same structure. */
export async function extractParagraphs(
	docId: string,
	nodesSnapshot: ParagraphNode[],
	nodeEditStateById: Map<string, ParagraphEditState>
): Promise<ClauseTreeNode[]> {
	const response = await api.post('/extract_paragraphs', {
		documentId: docId,
		pages: buildProcessPages(nodesSnapshot, nodeEditStateById),
	});
	return response.data?.tree ?? [];
}
