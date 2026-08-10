'use client';

import type { ReactNode } from 'react';
import { ProcessingIndicator } from '@/components/common/ProcessingIndicator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
	CONTRADICTION_TAXONOMY_COLORS,
	CONTRADICTION_TAXONOMY_LABELS,
	CONTRADICTION_TAXONOMY_ORDER,
} from '@/constants/docx-viewer';
import type {
	ContradictionParagraphResult,
	ContradictionTaxonomyType,
	Node as ParagraphNode,
} from '@/types/document';

import { ContradictionSummary } from '@/features/docx/components/contradiction/ContradictionSummary';
import { PanelEmptyState, EmptyStateKey } from '@/features/docx/components/shell/PanelEmptyState';
import { ContradictionAnalysisIcon } from '@/components/common/icons';

interface RightPanelAnalysisProps {
	selectedParagraph: ParagraphNode | null;
	contradictionLoading: boolean;
	hasTriggeredContradictionCheck: boolean;
	contradictionError: string | null;
	contradictionCount: number;
	contradictionSummaryItems: {
		paragraphId: string;
		label: string;
		contradictionType: ContradictionTaxonomyType;
		confidence: number;
	}[];
	selectedContradictionResult: ContradictionParagraphResult | null;
	selectedContradictionEvidence: ContradictionParagraphResult['evidence'];
	onFocusEvidenceSnippet: (paragraphId: string, role: 'a' | 'b') => void;
	onFocusNodeFromPanel: (nodeId: string, emphasize?: boolean) => void;
	/** Assistant chat panel, anchored at the bottom. */
	chatSlot?: ReactNode;
}

const CONTRADICTION_PROCESSING_STEPS = [
	{ label: 'Reading the selected paragraph', active: true },
	{ label: 'Comparing against related clauses', active: false },
	{ label: 'Detecting contradictions', active: false },
];

/**
 * Right-side analysis panel: inspects contradictions, confidence, and evidence
 * for the selected paragraph. Ported from the contradiction-display half of the
 * Svelte `RightPanelAnalysis` component. The chat/assistant half is stubbed.
 */
export function RightPanelAnalysis({
	selectedParagraph,
	contradictionLoading,
	hasTriggeredContradictionCheck,
	contradictionError,
	contradictionCount,
	contradictionSummaryItems,
	selectedContradictionResult,
	selectedContradictionEvidence,
	onFocusEvidenceSnippet,
	onFocusNodeFromPanel,
	chatSlot,
}: RightPanelAnalysisProps) {
	return (
		<section className="flex min-h-0 flex-1 flex-col">
			<header className="border-b border-border bg-muted px-4 py-2">
				<p className="text-muted-foreground text-2xs">
					Inspect contradictions, confidence, and evidence for the selected paragraph.
				</p>
			</header>

			{!contradictionLoading && !hasTriggeredContradictionCheck ? (
				<PanelEmptyState
					icon={<ContradictionAnalysisIcon />}
					title="Start a contradiction review"
					description={
						<>
							Run <EmptyStateKey>Search</EmptyStateKey> to detect contradictions across the
							contract, or <EmptyStateKey>Saved</EmptyStateKey> to load a previous analysis.
							{selectedParagraph ? '' : ' Select a paragraph to focus its evidence.'}
						</>
					}
				/>
			) : hasTriggeredContradictionCheck &&
			  !contradictionLoading &&
			  !contradictionError &&
			  contradictionSummaryItems.length === 0 ? (
				<PanelEmptyState
					icon={<ContradictionAnalysisIcon />}
					title="No contradictions found"
					description="This paragraph has no detected contradictions against the rest of the contract."
				/>
			) : (
				<ScrollArea className="min-h-0 flex-1">
					<div className="flex min-h-full flex-col gap-1 p-3">
						{contradictionLoading ? (
							<ProcessingIndicator steps={CONTRADICTION_PROCESSING_STEPS} />
						) : null}

						{hasTriggeredContradictionCheck ? (
							contradictionError ? (
								<p className="text-2xs text-destructive">{contradictionError}</p>
							) : (
								<div className="flex flex-col gap-1">
									<p className="text-2xs text-blue-600">
										{contradictionCount} paragraph(s) with highlighted contradiction(s)
									</p>
									<div className="flex flex-wrap items-center gap-1.5">
										{CONTRADICTION_TAXONOMY_ORDER.map((category) => (
											<span
												key={category}
												className="inline-flex items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 text-2xs text-muted-foreground"
												title={CONTRADICTION_TAXONOMY_LABELS[category]}
											>
												<span
													className="inline-block h-1.5 w-1.5 rounded-full"
													style={{ background: CONTRADICTION_TAXONOMY_COLORS[category] }}
												/>
												{CONTRADICTION_TAXONOMY_LABELS[category]}
											</span>
										))}
									</div>
								</div>
							)
						) : null}

						{contradictionSummaryItems.length > 0 ? (
							<ContradictionSummary
								selectedParagraph={selectedParagraph}
								contradictionSummaryItems={contradictionSummaryItems}
								selectedContradictionResult={selectedContradictionResult}
								selectedContradictionEvidence={selectedContradictionEvidence}
								onFocusEvidenceSnippet={onFocusEvidenceSnippet}
								onFocusNodeFromPanel={onFocusNodeFromPanel}
							/>
						) : null}
					</div>
				</ScrollArea>
			)}

			{/* Chat/assistant panel anchored at the bottom (controls its own height). */}
			{chatSlot}
		</section>
	);
}
