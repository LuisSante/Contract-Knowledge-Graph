'use client';

import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { hexToRgba } from '@/features/docx/utils/contradiction/contradiction';
import type { ContradictionParagraphResult } from '@/types/document';

import { buildEvidenceDiffSegments, resolveSnippetBStyle } from '@/features/docx/components/contradiction/contradiction-style';

interface EvidenceSnippetDisplayProps {
	snippetA: string;
	snippetB: string;
	/** Taxonomy color used for the Snippet A highlight / border. */
	typeColor: string;
	selectedContradictionResult: ContradictionParagraphResult | null;
	onFocusEvidenceSnippet: (paragraphId: string, role: 'a' | 'b') => void;
}

/**
 * Renders the two contradiction evidence snippets (A and B) with the
 * word-level diff highlight. Clicking a snippet focuses it in the document.
 */
export function EvidenceSnippetDisplay({
	snippetA,
	snippetB,
	typeColor,
	selectedContradictionResult,
	onFocusEvidenceSnippet,
}: EvidenceSnippetDisplayProps) {
	const snippetBStyle = useMemo(
		() => resolveSnippetBStyle(selectedContradictionResult),
		[selectedContradictionResult],
	);
	const evidenceDiff = useMemo(
		() => buildEvidenceDiffSegments(snippetA, snippetB),
		[snippetA, snippetB],
	);

	return (
		<>
			<Card
				className="mt-2 gap-0 rounded-md border py-0 shadow-none"
				style={{ borderColor: typeColor, background: hexToRgba(typeColor, 0.08) }}
			>
				<CardHeader className="gap-0 px-2.5 pt-2 pb-1">
					<Badge
						variant="outline"
						className="h-4 rounded-full bg-card/70 px-1.5 text-2xs font-semibold"
						style={{ borderColor: typeColor, color: typeColor }}
					>
						Snippet A
					</Badge>
				</CardHeader>
				<CardContent className="px-2.5 pb-2">
				<Button
					variant="ghost"
					className="h-auto w-full min-w-0 items-start justify-start px-0 py-0 text-left text-2xs leading-relaxed [overflow-wrap:anywhere] break-words whitespace-normal text-foreground hover:bg-transparent hover:text-foreground"
					onClick={() =>
						selectedContradictionResult &&
						onFocusEvidenceSnippet(selectedContradictionResult.paragraph_id, 'a')
					}
				>
					<span>
						{evidenceDiff.a.map((part, partIndex) =>
							part.changed ? (
								<span
									key={`a-${partIndex}`}
									className="rounded px-[1px]"
									style={{
										background: hexToRgba(typeColor, 0.36),
										boxShadow: `inset 0 0 0 1px ${hexToRgba(typeColor, 0.7)}`,
										color: 'var(--foreground)',
										fontWeight: 700,
									}}
								>
									{part.text}
								</span>
							) : (
								<span key={`a-${partIndex}`}>{part.text}</span>
							),
						)}
					</span>
				</Button>
				</CardContent>
			</Card>

			<Card
				className="mt-2 gap-0 rounded-md border py-0 shadow-none"
				style={{ borderColor: snippetBStyle.border, background: snippetBStyle.background }}
			>
				<CardHeader className="gap-0 px-2.5 pt-2 pb-1">
					<Badge
						variant="outline"
						className="h-4 rounded-full bg-card/70 px-1.5 text-2xs font-semibold"
						style={{ borderColor: snippetBStyle.color, color: snippetBStyle.color }}
					>
						Snippet B
					</Badge>
				</CardHeader>
				<CardContent className="px-2.5 pb-2">
				<Button
					variant="ghost"
					className="h-auto w-full min-w-0 items-start justify-start px-0 py-0 text-left text-2xs leading-relaxed [overflow-wrap:anywhere] break-words whitespace-normal text-foreground hover:bg-transparent hover:text-foreground"
					onClick={() =>
						selectedContradictionResult &&
						onFocusEvidenceSnippet(selectedContradictionResult.paragraph_id, 'b')
					}
				>
					<span>
						{evidenceDiff.b.map((part, partIndex) =>
							part.changed ? (
								<span
									key={`b-${partIndex}`}
									className="rounded px-[1px]"
									style={{
										background: hexToRgba(snippetBStyle.color, 0.36),
										boxShadow: `inset 0 0 0 1px ${hexToRgba(snippetBStyle.color, 0.7)}`,
										color: 'var(--foreground)',
										fontWeight: 700,
									}}
								>
									{part.text}
								</span>
							) : (
								<span key={`b-${partIndex}`}>{part.text}</span>
							),
						)}
					</span>
				</Button>
				</CardContent>
			</Card>
		</>
	);
}
