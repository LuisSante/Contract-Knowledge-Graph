'use client';

import type { MouseEvent as ReactMouseEvent } from 'react';
import type { GridMark } from '@/features/docx/utils/knowledge/statement-grid';
import {
	KIND_COLORS,
	KIND_LABEL,
	MARK_SIZE,
	MUTED_LANE_OPACITY,
} from '@/features/docx/components/clause-analyzer/constants';

interface MarkProps {
	mark: GridMark;
	muted: boolean;
	/** A condition gates the statement: only its outline is drawn, so firm and conditional
	 *  read apart at a glance. */
	conditional?: boolean;
	onHover: (event: ReactMouseEvent, mark: GridMark) => void;
	onLeave: () => void;
	onOpen: (nodeId: string) => void;
	onFocus: (nodeId: string) => void;
}

export function Mark({
	mark,
	muted,
	conditional = false,
	onHover,
	onLeave,
	onOpen,
	onFocus,
}: MarkProps) {
	const owner = mark.ownerName ?? (mark.lane === 'shared' ? 'both parties' : '');
	const color = KIND_COLORS[mark.kind];
	return (
		<button
			type="button"
			className="shrink-0 rounded-[3px] transition-opacity hover:ring-2 hover:ring-foreground/30"
			style={{
				width: MARK_SIZE,
				height: MARK_SIZE,
				backgroundColor: conditional ? 'transparent' : color,
				boxShadow: conditional ? `inset 0 0 0 2px ${color}` : undefined,
				opacity: muted ? MUTED_LANE_OPACITY : 1,
			}}
			title={`${KIND_LABEL[mark.kind]} — ${owner}${conditional ? ' (conditional)' : ''}`}
			onMouseEnter={(event) => onHover(event, mark)}
			onMouseMove={(event) => onHover(event, mark)}
			onMouseLeave={onLeave}
			onClick={() => onOpen(mark.id)}
			onDoubleClick={() => onFocus(mark.id)}
		/>
	);
}
