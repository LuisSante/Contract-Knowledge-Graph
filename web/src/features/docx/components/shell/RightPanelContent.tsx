'use client';

import { ProcessingIndicator, type ProcessingStep } from '@/components/common/ProcessingIndicator';
import {
	QUICK_ACTIONS,
	QUICK_ACTION_CONTRADICTION_RISKS,
	QUICK_ACTION_WHY_CONTRADICTION_AI,
	QUICK_ACTION_WHY_CONTRADICTION_FREE,
} from '@/constants/docx-viewer';
import type { useAssistantChat } from '@/features/docx/hooks/useAssistantChat';
import type { useContradictionAnalysis } from '@/features/docx/hooks/useContradictionAnalysis';
import type { useParagraphExplanation } from '@/features/docx/hooks/useParagraphExplanation';
import type { useRelatedGraph } from '@/features/docx/hooks/useRelatedGraph';
import type { Node as ParagraphNode, ParagraphEditState, RightPanelTab } from '@/types/document';

import { RightPanelAnalysis } from '@/features/docx/components/contradiction/RightPanelAnalysis';
import { ContradictionChatPanel } from '@/features/docx/components/contradiction/ContradictionChatPanel';
import { RightPanelAssistant } from '@/features/docx/components/assistant/RightPanelAssistant';
import { RightPanelParagraphExplanation } from '@/features/docx/components/paragraph-explanation/RightPanelParagraphExplanation';
import { RightPanelRelated } from '@/features/docx/components/related/RightPanelRelated';

// Steps shown while the relations graph builds/recomputes.
const GRAPH_PROCESSING_STEPS: ProcessingStep[] = [
	{ label: 'Scanning document structure', active: true },
	{ label: 'Analyzing paragraph relations', active: false },
	{ label: 'Searching linked context', active: false },
];

// Initial quick questions for the Contract Chat Assistant (without the contradiction ones).
const ASSISTANT_CHAT_SUGGESTIONS = QUICK_ACTIONS.filter(
	(action) =>
		action !== QUICK_ACTION_WHY_CONTRADICTION_FREE && action !== QUICK_ACTION_WHY_CONTRADICTION_AI
);

interface RightPanelContentProps {
	activeTab: RightPanelTab;
	graphBlocking: boolean;
	selectedParagraph: ParagraphNode | null;
	nodeEditStateById: Map<string, ParagraphEditState>;
	contradiction: ReturnType<typeof useContradictionAnalysis>;
	assistant: ReturnType<typeof useAssistantChat>;
	explanation: ReturnType<typeof useParagraphExplanation>;
	related: ReturnType<typeof useRelatedGraph>;
	onFocusNodeFromPanel: (nodeId: string, emphasize?: boolean) => void;
	onFocusEvidenceSnippet: (paragraphId: string, role: 'a' | 'b') => void;
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
	contradiction,
	assistant,
	explanation,
	related,
	onFocusNodeFromPanel,
	onFocusEvidenceSnippet,
}: RightPanelContentProps) {
	if (graphBlocking) {
		return (
			<div className="p-3">
				<ProcessingIndicator steps={GRAPH_PROCESSING_STEPS} />
			</div>
		);
	}

	if (activeTab === 'analysis') {
		return (
			<RightPanelAnalysis
				selectedParagraph={selectedParagraph}
				contradictionLoading={contradiction.loading}
				hasTriggeredContradictionCheck={contradiction.hasTriggered}
				contradictionError={contradiction.error}
				contradictionCount={contradiction.contradictionCount}
				contradictionSummaryItems={contradiction.summaryItems}
				selectedContradictionResult={contradiction.selectedContradictionResult}
				selectedContradictionEvidence={contradiction.selectedContradictionEvidence}
				onFocusEvidenceSnippet={onFocusEvidenceSnippet}
				onFocusNodeFromPanel={onFocusNodeFromPanel}
				chatSlot={
					<ContradictionChatPanel
						messages={assistant.messages}
						input={assistant.input}
						loading={assistant.loading}
						error={assistant.error}
						rewriteBusy={assistant.rewriteBusy}
						entityHighlightsEnabled={assistant.entityHighlightsEnabled}
						onInputChange={assistant.setInput}
						onSubmit={() => void assistant.submitContradictionQuestion()}
						onKeydown={assistant.handleContradictionKeydown}
						onWhy={() => void assistant.askQuickAction(QUICK_ACTION_WHY_CONTRADICTION_AI)}
						onRisks={() => void assistant.askQuickAction(QUICK_ACTION_CONTRADICTION_RISKS)}
						onSuggestFix={() => void assistant.suggestContradictionFix()}
						onToggleEntityHighlights={assistant.toggleEntityHighlights}
						onAcceptFixSuggestion={assistant.acceptFixSuggestion}
						onSuggestedQuestionClick={(question) => void assistant.askQuickAction(question)}
						onFocusNodeFromPanel={onFocusNodeFromPanel}
					/>
				}
			/>
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
				rewriteBusy={assistant.rewriteBusy}
				onInputChange={assistant.setInput}
				onSubmit={() => void assistant.submit()}
				onKeydown={assistant.handleKeydown}
				onSuggestedQuestionClick={(question) => void assistant.submit(question)}
				onFocusNodeFromPanel={onFocusNodeFromPanel}
				onToggleEntityHighlights={assistant.toggleEntityHighlights}
				onAcceptFixSuggestion={assistant.acceptFixSuggestion}
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
