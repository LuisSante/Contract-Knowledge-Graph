'use client';

import { GitCompareArrows, Link2 } from 'lucide-react';

import { ProcessingIndicator, type ProcessingStep } from '@/components/common/ProcessingIndicator';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PanelEmptyState } from '@/features/docx/components/shell/PanelEmptyState';
import {
	formatReferenceSummary,
	getNodeCurrentText,
	truncateText,
} from '@/features/docx/utils/edit/edit';
import type {
	Node as ParagraphNode,
	ParagraphEditState,
	RelatedParagraph,
} from '@/types/document';

interface RightPanelRelatedProps {
	selectedParagraph: ParagraphNode | null;
	loading: boolean;
	selectedRelatedParagraphs: RelatedParagraph[];
	nodeEditStateById: Map<string, ParagraphEditState>;
	onFocusNodeFromPanel: (nodeId: string) => void;
}

const RELATED_PROCESSING_STEPS: ProcessingStep[] = [
	{ label: 'Scanning document structure', active: false },
	{ label: 'Analyzing paragraph relations', active: false },
	{ label: 'Searching linked context', active: false },
];

function hasSemanticRelation(related: RelatedParagraph): boolean {
	return (
		related.relationTypes.includes('semantic_similarity') ||
		typeof related.semanticScore === 'number'
	);
}

function hasReferenceRelation(related: RelatedParagraph): boolean {
	return (
		related.relationTypes.includes('reference') ||
		related.relationTypes.some((relationType) =>
			String(relationType).toLowerCase().includes('reference')
		) ||
		related.references.length > 0
	);
}

/**
 * "Related Paragraphs" panel: shows the paragraphs linked to the selected one
 * (cross-references + semantic similarity) coming from the backend graph.
 */
export function RightPanelRelated({
	selectedParagraph,
	loading,
	selectedRelatedParagraphs,
	nodeEditStateById,
	onFocusNodeFromPanel,
}: RightPanelRelatedProps) {
	return (
		<section className="flex min-h-0 flex-1 flex-col">
			<header className="border-b border-border bg-muted/40 px-4 py-2">
				<p className="text-2xs text-muted-foreground">
					View linked paragraphs, relation types, and semantic similarity context.
				</p>
			</header>

			{!loading && !selectedParagraph ? (
				<PanelEmptyState
					icon={<Link2 />}
					title="No paragraph selected"
					description="Select a paragraph in the document to see the clauses it references and the ones semantically related to it."
				/>
			) : !loading && selectedRelatedParagraphs.length === 0 ? (
				<PanelEmptyState
					icon={<GitCompareArrows />}
					title="No related paragraphs"
					description="This paragraph has no references or semantic relations to other clauses in the contract."
				/>
			) : (
				<ScrollArea className="min-h-0 flex-1">
					<div className="flex min-h-full flex-col space-y-2 p-2">
						<div className="rounded-lg border border-blue-100 bg-blue-50/60 px-2.5 py-1.5 text-2xs text-blue-800 dark:border-blue-950/50 dark:bg-blue-950/20 dark:text-blue-300">
							Tip: hold <span className="font-medium">Shift + Scroll</span> to bring related
							paragraphs closer.
						</div>

						{loading ? (
							<ProcessingIndicator steps={RELATED_PROCESSING_STEPS} />
						) : (
							selectedRelatedParagraphs.map((related) => (
							<Card
								key={related.node.id}
								role="button"
								tabIndex={0}
								onClick={() => onFocusNodeFromPanel(related.node.id)}
								onKeyDown={(event) => {
									if (event.key === 'Enter' || event.key === ' ') {
										event.preventDefault();
										onFocusNodeFromPanel(related.node.id);
									}
								}}
								className="cursor-pointer gap-2 rounded-lg p-3 shadow-none transition-colors hover:border-blue-300 hover:bg-accent dark:hover:border-blue-800"
							>
								<div className="flex flex-wrap items-center gap-1.5">
									{hasSemanticRelation(related) && (
										<Badge
											variant="secondary"
											className="gap-1 rounded-full bg-green-50 px-2 py-0.5 text-2xs font-medium text-green-700 dark:bg-green-950/40 dark:text-green-300"
										>
											<GitCompareArrows className="size-2.5" />
											Similarity
										</Badge>
									)}
									{hasReferenceRelation(related) && (
										<Badge
											variant="secondary"
											className="gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-2xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
										>
											<Link2 className="size-2.5" />
											Reference
										</Badge>
									)}
								</div>

								<p className="text-2xs leading-relaxed text-muted-foreground">
									{truncateText(getNodeCurrentText(nodeEditStateById, related.node))}
								</p>

								{related.references.length > 0 && (
									<p className="text-2xs text-muted-foreground/80">
										Refs: {formatReferenceSummary(related.references)}
									</p>
								)}
								</Card>
							))
						)}
					</div>
				</ScrollArea>
			)}
		</section>
	);
}
