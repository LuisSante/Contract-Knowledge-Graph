'use client';

import { ProcessingIndicator, type ProcessingStep } from '@/components/common/ProcessingIndicator';
import type { useRelatedGraph } from '@/features/docx/hooks/useRelatedGraph';
import type { Node as ParagraphNode, ParagraphEditState, RightPanelTab } from '@/types/document';

import { RightPanelRelated } from '@/features/docx/components/related/RightPanelRelated';

// Steps shown while the relations graph builds/recomputes.
const GRAPH_PROCESSING_STEPS: ProcessingStep[] = [
	{ label: 'Scanning document structure', active: true },
	{ label: 'Analyzing paragraph relations', active: false },
	{ label: 'Searching linked context', active: false },
];

interface RightPanelContentProps {
	activeTab: RightPanelTab;
	graphBlocking: boolean;
	selectedParagraph: ParagraphNode | null;
	nodeEditStateById: Map<string, ParagraphEditState>;
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
