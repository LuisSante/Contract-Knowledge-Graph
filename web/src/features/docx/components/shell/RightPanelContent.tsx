'use client';

import { ASSISTANT_KG_SUGGESTIONS } from '@/constants/docx-viewer';
import type { useAssistantChat } from '@/features/docx/hooks/useAssistantChat';
import type { RightPanelTab } from '@/types/document';

import { RightPanelAssistant } from '@/features/docx/components/assistant/RightPanelAssistant';
import { KnowledgeGraphPanel } from '@/features/docx/components/knowledge-graph/KnowledgeGraphPanel';

interface RightPanelContentProps {
	activeTab: RightPanelTab;
	docId: string;
	assistant: ReturnType<typeof useAssistantChat>;
	onFocusNodeFromPanel: (nodeId: string, emphasize?: boolean) => void;
}

/** Right-panel content for the active tab. Extracted from `DocxViewer` to slim it down. */
export function RightPanelContent({
	activeTab,
	docId,
	assistant,
	onFocusNodeFromPanel,
}: RightPanelContentProps) {
	if (activeTab === 'knowledge_graph') {
		return <KnowledgeGraphPanel docId={docId} />;
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
				initialSuggestions={ASSISTANT_KG_SUGGESTIONS}
				onInitialSuggestionClick={(question) => void assistant.submitKgNodeQuestion(question)}
			/>
		);
	}

	return null;
}
