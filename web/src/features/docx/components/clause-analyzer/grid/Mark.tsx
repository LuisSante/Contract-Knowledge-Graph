'use client';

import { memo, type CSSProperties, type FocusEvent, type KeyboardEvent } from 'react';
import type { GridMark } from '@/features/docx/utils/knowledge/statement-grid';
import {
	KIND_COLORS,
	KIND_EDGE_COLORS,
	KIND_LABEL,
	MARK_SIZE,
	MUTED_LANE_OPACITY,
} from '@/features/docx/components/clause-analyzer/constants';

/** Where the mark's card opens: the pointer, or the mark's corner when it has keyboard focus. */
export interface HoverPoint {
	clientX: number;
	clientY: number;
}

interface MarkProps {
	mark: GridMark;
	muted: boolean;
	/** A condition gates the statement: only its outline is drawn, so firm and conditional
	 *  read apart at a glance. */
	conditional?: boolean;
	/** The row's one tab stop among its marks; the arrows move between the rest. */
	tabbable?: boolean;
	onHover: (point: HoverPoint, mark: GridMark) => void;
	onLeave: () => void;
	onOpen: (nodeId: string) => void;
	/** Double-click, or Shift+Enter from the keyboard. */
	onFocusNode: (nodeId: string) => void;
	/** The mark took focus, so it becomes its row's tab stop. */
	onRove?: (nodeId: string) => void;
}

export const Mark = memo(function Mark({
	mark,
	muted,
	conditional = false,
	tabbable = true,
	onHover,
	onLeave,
	onOpen,
	onFocusNode,
	onRove,
}: MarkProps) {
	const owner = mark.ownerName ?? (mark.lane === 'shared' ? 'both parties' : '');
	const color = KIND_COLORS[mark.kind];
	// A 1px edge keeps the lighter fills apart from the white; an outline is drawn in it too.
	// An inset ring, not an inline box-shadow, so the hover and focus rings still compose.
	const edge = KIND_EDGE_COLORS[mark.kind];
	const label = `${KIND_LABEL[mark.kind]} — ${owner}${conditional ? ' (conditional)' : ''}`;

	const showCard = (event: FocusEvent<HTMLButtonElement>) => {
		onRove?.(mark.id);
		// A click focuses the mark too; only the keyboard opens the card from here.
		if (!event.currentTarget.matches(':focus-visible')) return;
		const rect = event.currentTarget.getBoundingClientRect();
		onHover({ clientX: rect.right, clientY: rect.bottom }, mark);
	};

	const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === 'Escape') onLeave();
		else if (event.key === 'Enter' && event.shiftKey) {
			event.preventDefault();
			onFocusNode(mark.id);
		}
	};

	return (
		<button
			type="button"
			data-mark=""
			tabIndex={tabbable ? 0 : -1}
			// The ::before reaches 2px past each side, into the gap: an 18px target, the
			// square still 14px.
			className={`relative shrink-0 rounded-[3px] inset-ring-[color:var(--edge)] transition-opacity outline-none before:absolute before:-inset-0.5 before:content-[''] hover:ring-2 hover:ring-foreground/30 focus-visible:ring-2 focus-visible:ring-ring ${
				conditional ? 'inset-ring-2' : 'inset-ring-1'
			}`}
			style={
				{
					'--edge': edge,
					width: MARK_SIZE,
					height: MARK_SIZE,
					backgroundColor: conditional ? 'transparent' : color,
					opacity: muted ? MUTED_LANE_OPACITY : 1,
				} as CSSProperties
			}
			title={label}
			aria-label={`${label.replace(/\.$/, '')}. Enter shows it in the contract; Shift+Enter focuses on it.`}
			onMouseEnter={(event) => onHover(event, mark)}
			onMouseMove={(event) => onHover(event, mark)}
			onMouseLeave={onLeave}
			onFocus={showCard}
			onBlur={onLeave}
			onKeyDown={onKeyDown}
			onClick={() => onOpen(mark.id)}
			onDoubleClick={() => onFocusNode(mark.id)}
		/>
	);
});
