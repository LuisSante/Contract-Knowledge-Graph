import { EMPTY_CHANGE_LOG } from '@/constants/graph';
import type {
	ChangeLogState,
	Edge as GraphEdge,
	Node as ParagraphNode,
	ParagraphEditState,
	RelatedParagraph
} from '@/types/document';
import {
	buildChangeLog,
	buildRelatedParagraphs,
	ensureNodeEditState,
	updateSelectionHighlight
} from '@/features/docx/utils/edit/edit';

function getEditableRootElement(element: HTMLElement): HTMLElement {
	if (element.matches('[data-docx-editable-root="true"]')) return element;
	return element.querySelector<HTMLElement>('[data-docx-editable-root="true"]') ?? element;
}

export type DocxInspectorState = {
	selectedNodeId: string | null;
	selectedChangeLog: ChangeLogState;
	selectedRelatedParagraphs: RelatedParagraph[];
};

export function createEmptyChangeLogState(): ChangeLogState {
	return { ...EMPTY_CHANGE_LOG, oldSegments: [], newSegments: [] };
}

export function createEmptyInspectorState(): DocxInspectorState {
	return {
		selectedNodeId: null,
		selectedChangeLog: createEmptyChangeLogState(),
		selectedRelatedParagraphs: []
	};
}

export function toSelectedParagraphNode(
	selectedNode: ParagraphNode | null,
	nodeEditStateById: Map<string, ParagraphEditState>
): ParagraphNode | null {
	if (!selectedNode) return null;

	const state = ensureNodeEditState(nodeEditStateById, selectedNode.id, selectedNode.text);
	return { ...selectedNode, text: state.current };
}

export function buildInspectorState(options: {
	selectedNode: ParagraphNode | null;
	paragraphNodes: ParagraphNode[];
	backendEdges: GraphEdge[];
	paragraphElementById: Map<string, HTMLElement>;
	nodeEditStateById: Map<string, ParagraphEditState>;
}): DocxInspectorState {
	const { selectedNode, paragraphNodes, backendEdges, paragraphElementById, nodeEditStateById } =
		options;
	const selectedNodeId = selectedNode?.id ?? null;
	updateSelectionHighlight(paragraphElementById, selectedNodeId);

	if (!selectedNode) return createEmptyInspectorState();

	const state = ensureNodeEditState(nodeEditStateById, selectedNode.id, selectedNode.text);
	return {
		selectedNodeId,
		selectedChangeLog: buildChangeLog(state.committed, state.current),
		selectedRelatedParagraphs: buildRelatedParagraphs(selectedNode, {
			nodes: paragraphNodes,
			edges: backendEdges
		})
	};
}

export function focusNodeFromPanel(options: {
	nodeId: string;
	paragraphNodes: ParagraphNode[];
	paragraphElementById: Map<string, HTMLElement>;
	onFallbackFocus: (node: ParagraphNode) => void;
}) {
	const { nodeId, paragraphNodes, paragraphElementById, onFallbackFocus } = options;
	const target = paragraphNodes.find((node) => node.id === nodeId);
	if (!target) return;

	const nodeElement = paragraphElementById.get(nodeId);
	if (nodeElement) {
		nodeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
		getEditableRootElement(nodeElement).focus();
		return;
	}

	onFallbackFocus(target);
}
