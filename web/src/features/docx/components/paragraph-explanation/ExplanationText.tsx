'use client';

import { Fragment } from 'react';

import {
	splitReferenceAndEntityText,
	type ReferenceTextSegment,
} from '@/features/docx/utils/text';
import type { ExplanationEntity } from '@/features/docx/utils/assistant/paragraph-explanation';

interface ExplanationTextProps {
	value: string;
	entities: ExplanationEntity[];
	keyPrefix: string;
}

function renderSegment(
	segment: ReferenceTextSegment,
	key: string,
): React.ReactNode {
	if (segment.isReference) {
		return (
			<span key={key} className="docx-reference-chip align-middle">
				{segment.text}
			</span>
		);
	}
	if (segment.isEntity) {
		return (
			<span
				key={key}
				className="docx-paragraph-explanation-entity-token"
				data-entity-key={segment.entityKey}
				style={
					{
						'--entity-color': segment.entityColor ?? '#2563eb',
						'--entity-color-soft': segment.entitySoftColor ?? 'rgba(37,99,235,0.16)',
					} as React.CSSProperties
				}
			>
				{segment.text}
			</span>
		);
	}
	return <Fragment key={key}>{segment.text}</Fragment>;
}

/**
 * Renders explanation text with inline reference chips (`*-p-*` paragraph
 * references) and highlighted entity tokens. Ported from the inline
 * `splitReferenceAndEntityText` rendering loop of the Svelte
 * `RightPanelParagraphExplanation` component.
 */
export function ExplanationText({ value, entities, keyPrefix }: ExplanationTextProps) {
	const segments = splitReferenceAndEntityText(value, entities);
	return (
		<p className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">
			{segments.map((segment, index) =>
				renderSegment(segment, `${keyPrefix}-${index}`),
			)}
		</p>
	);
}
