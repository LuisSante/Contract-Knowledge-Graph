'use client';

import { ASSISTANT_CLAUSE_SUGGESTIONS } from '@/constants/docx-viewer';
import type { useAssistantChat } from '@/features/docx/hooks/useAssistantChat';
import type { RightPanelTab } from '@/types/document';

import { RightPanelAssistant } from '@/features/docx/components/assistant/RightPanelAssistant';
import { ClauseAnalyzerPanel } from '@/features/docx/components/clause-analyzer/ClauseAnalyzerPanel';
import { KgVisualizationPanel } from '@/features/docx/components/kg-visualization/KgVisualizationPanel';

interface RightPanelContentProps {
	activeTab: RightPanelTab;
	docId: string;
	assistant: ReturnType<typeof useAssistantChat>;
	onFocusNodeFromPanel: (nodeId: string, emphasize?: boolean) => void;
}

export function RightPanelContent({
	activeTab,
	docId,
	assistant,
	onFocusNodeFromPanel,
}: RightPanelContentProps) {
	if (activeTab === 'clause_analyzer') {
		return <ClauseAnalyzerPanel docId={docId} />;
	}

	if (activeTab === 'kg_visualization') {
		return <KgVisualizationPanel docId={docId} />;
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
				onSuggestionClick={(question) => void assistant.submitKgNodeQuestion(question)}
				onFocusNodeFromPanel={onFocusNodeFromPanel}
				initialSuggestions={ASSISTANT_CLAUSE_SUGGESTIONS}
				onInitialSuggestionClick={(question) => void assistant.submitKgNodeQuestion(question)}
			/>
		);
	}

	return null;
}
