'use client';

import type { ContradictionParagraphResult } from '@/types/document';

import { ContradictionItem } from '@/features/docx/components/contradiction/ContradictionItem';

interface ContradictionItemsListProps {
	/** Taxonomy color of the owning summary item. */
	typeColor: string;
	selectedContradictionResult: ContradictionParagraphResult | null;
	selectedContradictionEvidence: ContradictionParagraphResult['evidence'];
	onFocusEvidenceSnippet: (paragraphId: string, role: 'a' | 'b') => void;
}

/**
 * Renders the evidence card(s) for the selected paragraph's contradiction.
 *
 * The source only ever exposes a single contradiction result per selected
 * paragraph, so this currently delegates to one `ContradictionItem`. Kept as a
 * dedicated list component so additional findings can be mapped here later.
 */
export function ContradictionItemsList({
	typeColor,
	selectedContradictionResult,
	selectedContradictionEvidence,
	onFocusEvidenceSnippet,
}: ContradictionItemsListProps) {
	return (
		<ContradictionItem
			typeColor={typeColor}
			selectedContradictionResult={selectedContradictionResult}
			selectedContradictionEvidence={selectedContradictionEvidence}
			onFocusEvidenceSnippet={onFocusEvidenceSnippet}
		/>
	);
}
