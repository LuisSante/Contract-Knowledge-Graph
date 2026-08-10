'use client';

import {
	useRef,
	type MouseEvent as ReactMouseEvent,
	type RefObject,
} from 'react';

/** Scrub multiplier when dragging the rail (1px of mouse → N px of scroll). */
const MANUAL_SCROLL_DRAG_SPEED = 100;
import type { DocumentViewerStatus } from '@/features/docx/hooks/useDocumentViewer';
import { useRelatedBridge } from '@/features/docx/hooks/useRelatedBridge';
import { RelatedBridgeOverlay } from '@/features/docx/components/related/RelatedBridgeOverlay';
import type { Node as ParagraphNode, RelatedParagraph } from '@/types/document';

interface DocumentViewerProps {
	containerRef: RefObject<HTMLDivElement | null>;
	status: DocumentViewerStatus;
	/** Dims and disables the document while the graph is being built. */
	dimmed?: boolean;
	renderEpoch: number;
	paragraphElementById: Map<string, HTMLElement>;
	/** Related-paragraphs bridge (connector + Shift+Scroll + labels). */
	relatedBridgeActive: boolean;
	selectedParagraph: ParagraphNode | null;
	relatedBridgeParagraphs: RelatedParagraph[];
}

/**
 * Central viewer area: scroll-host with the DOM rendered by docx4js
 * (managed by ref) + the absolute related-paragraphs bridge overlay.
 */
export function DocumentViewer({
	containerRef,
	status,
	dimmed,
	renderEpoch,
	paragraphElementById,
	relatedBridgeActive,
	selectedParagraph,
	relatedBridgeParagraphs,
}: DocumentViewerProps) {
	const scrollHostRef = useRef<HTMLElement>(null);

	const relatedBridge = useRelatedBridge({
		active: relatedBridgeActive,
		renderEpoch,
		scrollHostRef,
		paragraphElementById,
		selectedParagraph,
		related: relatedBridgeParagraphs,
	});

	// After dragging the rail, the click-jump is suppressed for a moment so the
	// drag doesn't trigger a jump on release.
	const suppressMarkerClickRef = useRef(false);

	// Dragging the marker rail scrolls the document (minimap-style scrub).
	const startRailScrub = (event: ReactMouseEvent) => {
		const host = scrollHostRef.current;
		if (!host || event.button !== 0) return;
		event.preventDefault();
		const startY = event.clientY;
		const startTop = host.scrollTop;
		let moved = false;
		document.body.style.userSelect = 'none';
		const onMove = (moveEvent: MouseEvent) => {
			const delta = (moveEvent.clientY - startY) * MANUAL_SCROLL_DRAG_SPEED;
			if (Math.abs(delta) > 2) moved = true;
			host.scrollTop = startTop + delta;
		};
		const onUp = () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
			document.body.style.userSelect = '';
			if (moved) {
				suppressMarkerClickRef.current = true;
				window.setTimeout(() => {
					suppressMarkerClickRef.current = false;
				}, 140);
			}
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	};

	// Jumps to a related paragraph (scroll + flash), without changing the selection.
	const jumpToParagraph = (paragraphId: string) => {
		if (suppressMarkerClickRef.current) return;
		const element = paragraphElementById.get(paragraphId);
		if (!element) return;
		element.scrollIntoView({ behavior: 'smooth', block: 'center' });
		element.classList.remove('docx-citation-flash');
		void element.offsetHeight;
		element.classList.add('docx-citation-flash');
		window.setTimeout(() => element.classList.remove('docx-citation-flash'), 1300);
	};

	return (
		<div className="relative flex min-h-0 flex-1">
			<section
				ref={scrollHostRef}
				inert={dimmed || undefined}
				className={`flex min-h-0 flex-1 flex-col items-start overflow-auto px-2 py-4 shadow-inner transition-opacity duration-300 lg:items-center ${
					dimmed ? 'pointer-events-none opacity-60 select-none' : ''
				}`}
			>
				{status === 'error' && (
					<p className="text-destructive py-4 text-center text-sm">
						Could not render the document.
					</p>
				)}
				{/* Container for the rendered document (imperative docx4js DOM). */}
				<div ref={containerRef} className="docx-viewer-root min-h-full w-full" />
			</section>

			{relatedBridgeActive && (
				<RelatedBridgeOverlay
						bridge={relatedBridge}
						onJumpToParagraph={jumpToParagraph}
						onRailMouseDown={startRailScrub}
					/>
			)}
		</div>
	);
}
