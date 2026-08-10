'use client';

import {
	useRef,
	type CSSProperties,
	type MouseEvent as ReactMouseEvent,
	type RefObject,
} from 'react';

/** Scrub multiplier when dragging the rail (1px of mouse → N px of scroll). */
const MANUAL_SCROLL_DRAG_SPEED = 100;
import type { DocumentViewerStatus } from '@/features/docx/hooks/useDocumentViewer';
import { useContradictionScrollMarkers } from '@/features/docx/hooks/useContradictionScrollMarkers';
import { useRelatedBridge } from '@/features/docx/hooks/useRelatedBridge';
import { RelatedBridgeOverlay } from '@/features/docx/components/related/RelatedBridgeOverlay';
import type {
	ContradictionParagraphResult,
	Node as ParagraphNode,
	RelatedParagraph,
} from '@/types/document';

interface DocumentViewerProps {
	containerRef: RefObject<HTMLDivElement | null>;
	status: DocumentViewerStatus;
	/** Dims and disables the document while the graph is being built. */
	dimmed?: boolean;
	/** Contradiction visualization (rail + A↔B link). */
	contradictionActive: boolean;
	renderEpoch: number;
	resultsByParagraphId: Map<string, ContradictionParagraphResult>;
	paragraphElementById: Map<string, HTMLElement>;
	selectedParagraphId: string | null;
	categoryColor: string;
	onMarkerClick: (paragraphId: string) => void;
	/** Related-paragraphs bridge (connector + Shift+Scroll + labels). */
	relatedBridgeActive: boolean;
	selectedParagraph: ParagraphNode | null;
	relatedBridgeParagraphs: RelatedParagraph[];
}

/**
 * Central viewer area: scroll-host with the DOM rendered by docx4js
 * (managed by ref) + the absolute contradiction-visualization layers
 * (marker rail and A↔B evidence link).
 */
export function DocumentViewer({
	containerRef,
	status,
	dimmed,
	contradictionActive,
	renderEpoch,
	resultsByParagraphId,
	paragraphElementById,
	selectedParagraphId,
	categoryColor,
	onMarkerClick,
	relatedBridgeActive,
	selectedParagraph,
	relatedBridgeParagraphs,
}: DocumentViewerProps) {
	const scrollHostRef = useRef<HTMLElement>(null);

	const { markers, link, collapsedCards } = useContradictionScrollMarkers({
		active: contradictionActive,
		renderEpoch,
		scrollHostRef,
		paragraphElementById,
		resultsByParagraphId,
		selectedParagraphId,
	});

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

	const handleMarkerClick = (paragraphId: string) => {
		if (suppressMarkerClickRef.current) return;
		onMarkerClick(paragraphId);
	};

	const linkVars = {
		'--contradiction-a-color': categoryColor,
		'--contradiction-b-color': categoryColor,
	} as CSSProperties;

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

			{contradictionActive && markers.length > 0 && (
				<div className="absolute top-2 right-1 bottom-2 z-20 w-2" onMouseDown={startRailScrub}>
					{markers.map((marker) => (
						<span
							key={marker.paragraphId}
							className={`docx-contradiction-scroll-marker docx-contradiction-scroll-marker--${marker.confidenceBand}`}
							style={{ top: `${marker.topPercent}%` }}
							role="button"
							tabIndex={0}
							aria-label={`Go to contradiction in paragraph ${marker.paragraphId}`}
							onClick={() => handleMarkerClick(marker.paragraphId)}
							onKeyDown={(event) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									handleMarkerClick(marker.paragraphId);
								}
							}}
						/>
					))}
				</div>
			)}

			{contradictionActive && link && (
				<div
					className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
					style={linkVars}
				>
					<span
						className="docx-contradiction-evidence-bracket"
						style={{
							left: link.leftPx,
							top: link.topPx,
							height: Math.max(6, link.bottomPx - link.topPx),
						}}
					/>
					{link.showA && (
						<>
							<span
								className="docx-contradiction-evidence-cap"
								style={{ left: link.leftPx, top: link.aCenterPx }}
							/>
							<span
								className="docx-contradiction-evidence-dot docx-contradiction-evidence-dot--a"
								style={{ left: link.leftPx, top: link.aCenterPx }}
							/>
							<span
								className="docx-contradiction-evidence-label docx-contradiction-evidence-label--a"
								style={{ left: link.leftPx, top: link.aCenterPx }}
							>
								A
							</span>
						</>
					)}
					{link.showB && (
						<>
							<span
								className="docx-contradiction-evidence-cap"
								style={{ left: link.leftPx, top: link.bCenterPx }}
							/>
							<span
								className="docx-contradiction-evidence-dot docx-contradiction-evidence-dot--b"
								style={{ left: link.leftPx, top: link.bCenterPx }}
							/>
							<span
								className="docx-contradiction-evidence-label docx-contradiction-evidence-label--b"
								style={{ left: link.leftPx, top: link.bCenterPx }}
							>
								B
							</span>
						</>
					)}
					{collapsedCards.map((card, index) => (
						<div
							key={`contradiction-collapsed-${index}`}
							className="docx-paragraph-explanation-collapsed-card"
							style={{ left: card.leftPx, top: card.topPx, width: card.widthPx }}
							// HTML cloned from the document itself (static).
							dangerouslySetInnerHTML={{ __html: card.html }}
						/>
					))}
				</div>
			)}
		</div>
	);
}
