'use client';

import { ProcessingIndicator, type ProcessingStep } from '@/components/common/ProcessingIndicator';
import { QUICK_ACTIONS } from '@/constants/docx-viewer';
import type { useAssistantChat } from '@/features/docx/hooks/useAssistantChat';
import type { useParagraphExplanation } from '@/features/docx/hooks/useParagraphExplanation';
import type { useRelatedGraph } from '@/features/docx/hooks/useRelatedGraph';
import type { Node as ParagraphNode, ParagraphEditState, RightPanelTab } from '@/types/document';

import { RightPanelAssistant } from '@/features/docx/components/assistant/RightPanelAssistant';
import { RightPanelParagraphExplanation } from '@/features/docx/components/paragraph-explanation/RightPanelParagraphExplanation';
import { RightPanelRelated } from '@/features/docx/components/related/RightPanelRelated';

// Steps shown while the relations graph builds/recomputes.
const GRAPH_PROCESSING_STEPS: ProcessingStep[] = [
	{ label: 'Scanning document structure', active: true },
	{ label: 'Analyzing paragraph relations', active: false },
	{ label: 'Searching linked context', active: false },
];

// Initial quick questions for the Contract Chat Assistant.
const ASSISTANT_CHAT_SUGGESTIONS = QUICK_ACTIONS;

interface RightPanelContentProps {
	activeTab: RightPanelTab;
	graphBlocking: boolean;
	selectedParagraph: ParagraphNode | null;
	nodeEditStateById: Map<string, ParagraphEditState>;
	assistant: ReturnType<typeof useAssistantChat>;
	explanation: ReturnType<typeof useParagraphExplanation>;
	related: ReturnType<typeof useRelatedGraph>;
	onFocusNodeFromPanel: (nodeId: string, emphasize?: boolean) => void;
}

/**
 * Right-panel content based on the active tab (or the processing indicator
 * while the graph is being built). Extracted from `DocxViewer` to slim it down.
 */
export function RightPanelContent({
	activeTab,
	graphBlocking,
	selectedParagraph,
	nodeEditStateById,
	assistant,
	explanation,
	related,
	onFocusNodeFromPanel,
}: RightPanelContentProps) {
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
				entityHighlightsEnabled={assistant.entityHighlightsEnabled}
				onInputChange={assistant.setInput}
				onSubmit={() => void assistant.submit()}
				onKeydown={assistant.handleKeydown}
				onSuggestedQuestionClick={(question) => void assistant.submit(question)}
				onFocusNodeFromPanel={onFocusNodeFromPanel}
				onToggleEntityHighlights={assistant.toggleEntityHighlights}
				initialSuggestions={ASSISTANT_CHAT_SUGGESTIONS}
				onInitialSuggestionClick={(question) => void assistant.submit(question)}
			/>
		);
	}

	if (activeTab === 'paragraph_explanation') {
		return (
			<RightPanelParagraphExplanation
				selectedParagraph={selectedParagraph}
				loading={explanation.loading}
				error={explanation.error}
				explanationShort={explanation.short}
				explanationDetailed={explanation.detailed}
				explanationEntities={explanation.entities}
				onFocusParagraph={(paragraphId) => onFocusNodeFromPanel(paragraphId, true)}
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
