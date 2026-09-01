'use client';

import { ProcessingIndicator, type ProcessingStep } from '@/components/common/ProcessingIndicator';
import { ASSISTANT_KG_SUGGESTIONS } from '@/constants/docx-viewer';
import type { useAssistantChat } from '@/features/docx/hooks/useAssistantChat';
import type { useRelatedGraph } from '@/features/docx/hooks/useRelatedGraph';
import type { Node as ParagraphNode, ParagraphEditState, RightPanelTab } from '@/types/document';

import { RightPanelAssistant } from '@/features/docx/components/assistant/RightPanelAssistant';
import { RightPanelRelated } from '@/features/docx/components/related/RightPanelRelated';
import { KnowledgeGraphPanel } from '@/features/docx/components/knowledge-graph/KnowledgeGraphPanel';

// Steps shown while the relations graph builds/recomputes.
const GRAPH_PROCESSING_STEPS: ProcessingStep[] = [
	{ label: 'Scanning document structure', active: true },
	{ label: 'Analyzing paragraph relations', active: false },
	{ label: 'Searching linked context', active: false },
];

interface RightPanelContentProps {
	activeTab: RightPanelTab;
	docId: string;
	graphBlocking: boolean;
	selectedParagraph: ParagraphNode | null;
	nodeEditStateById: Map<string, ParagraphEditState>;
	assistant: ReturnType<typeof useAssistantChat>;
	related: ReturnType<typeof useRelatedGraph>;
	onFocusNodeFromPanel: (nodeId: string, emphasize?: boolean) => void;
}

/**
 * Right-panel content based on the active tab (or the processing indicator
 * while the graph is being built). Extracted from `DocxViewer` to slim it down.
 */
export function RightPanelContent({
	activeTab,
	docId,
	graphBlocking,
	selectedParagraph,
	nodeEditStateById,
	assistant,
	related,
	onFocusNodeFromPanel,
}: RightPanelContentProps) {
	// Independent layer: not gated by the paragraph-graph build.
	if (activeTab === 'knowledge_graph') {
		return <KnowledgeGraphPanel docId={docId} />;
	}

	if (graphBlocking) {
		return (
			<div className="p-3">
				<ProcessingIndicator steps={GRAPH_PROCESSING_STEPS} />
			</div>
		);
	}

	if (activeTab === 'assistant') {
		return (
			<RightPanelAssistant
				messages={assistant.messages}
				input={assistant.input}
				loading={assistant.loading}
				error={assistant.error}
				onInputChange={assistant.setInput}
				onSubmit={() => void assistant.submitKgNodeQuestion()}
				onKeydown={assistant.handleKgNodeKeydown}
				onSuggestedQuestionClick={(question) => void assistant.submitKgNodeQuestion(question)}
				onFocusNodeFromPanel={onFocusNodeFromPanel}
				initialSuggestions={ASSISTANT_KG_SUGGESTIONS}
				onInitialSuggestionClick={(question) => void assistant.submitKgNodeQuestion(question)}
			/>
		);
	}

	if (activeTab === 'related') {
		return (
			<RightPanelRelated
				selectedParagraph={selectedParagraph}
				loading={related.loading}
				selectedRelatedParagraphs={related.selectedRelatedParagraphs}
				nodeEditStateById={nodeEditStateById}
				onFocusNodeFromPanel={onFocusNodeFromPanel}
			/>
		);
	}

	return null;
}
