import type { Node as ParagraphNode, ParagraphEditState } from '@/types/document';

// `ensureNodeEditState` now lives in the engine (model helper). It is re-exported
// here to avoid breaking the app's consumers.
export { ensureNodeEditState } from '@/features/docx/utils/docx-engine/edit-state';

export function getNodeCurrentText(
	nodeEditStateById: Map<string, ParagraphEditState>,
	node: ParagraphNode
): string {
	return nodeEditStateById.get(node.id)?.current ?? node.text;
}

export function updateSelectionHighlight(
	paragraphElementById: Map<string, HTMLElement>,
	nextNodeId: string | null
) {
	for (const [nodeId, element] of paragraphElementById.entries()) {
		const isSelected = Boolean(nextNodeId && nodeId === nextNodeId);
		element.classList.toggle('z-10', isSelected);
		element.classList.toggle('bg-blue-50/50', isSelected);
		element.classList.toggle('ring-2', isSelected);
		element.classList.toggle('ring-blue-700', isSelected);
	}
}
