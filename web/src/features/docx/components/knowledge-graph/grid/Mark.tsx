'use client';

import type { MouseEvent as ReactMouseEvent } from 'react';
import type { GridMark } from '@/features/docx/utils/knowledge/statement-grid';
import {
	KIND_COLORS,
	KIND_LABEL,
	MARK_SIZE,
	MUTED_LANE_OPACITY,
} from '@/features/docx/components/knowledge-graph/constants';

interface MarkProps {
	mark: GridMark;
	muted: boolean;
	onHover: (event: ReactMouseEvent, mark: GridMark) => void;
	onLeave: () => void;
	onOpen: (nodeId: string) => void;
	onFocus: (nodeId: string) => void;
}

export function Mark({ mark, muted, onHover, onLeave, onOpen, onFocus }: MarkProps) {
	const owner = mark.ownerName ?? (mark.lane === 'shared' ? 'both parties' : '');
	return (
		<button
			type="button"
			className="shrink-0 rounded-[3px] transition-opacity hover:ring-2 hover:ring-foreground/30"
			style={{
				width: MARK_SIZE,
				height: MARK_SIZE,
				backgroundColor: KIND_COLORS[mark.kind],
				opacity: muted ? MUTED_LANE_OPACITY : 1,
			}}
			title={`${KIND_LABEL[mark.kind]} — ${owner}`}
			onMouseEnter={(event) => onHover(event, mark)}
			onMouseMove={(event) => onHover(event, mark)}
			onMouseLeave={onLeave}
			onClick={() => onOpen(mark.id)}
			onDoubleClick={() => onFocus(mark.id)}
		/>
	);
}
