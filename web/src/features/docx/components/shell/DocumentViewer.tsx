'use client';

import {
	useRef,
	type PointerEvent as ReactPointerEvent,
	type ReactNode,
	type RefObject,
} from 'react';
import type { DocumentViewerStatus } from '@/features/docx/hooks/useDocumentViewer';
import { useEvidenceBridge } from '@/features/docx/hooks/useEvidenceBridge';
import {
	EvidenceBridgeOverlay,
	type LinkLabel,
} from '@/features/docx/components/evidence/EvidenceBridgeOverlay';
import type { Node as ParagraphNode, EvidenceParagraph } from '@/types/document';

interface DocumentViewerProps {
	containerRef: RefObject<HTMLDivElement | null>;
	status: DocumentViewerStatus;
	dimmed?: boolean;
	renderEpoch: number;
	paragraphElementById: Map<string, HTMLElement>;
	evidenceBridgeActive: boolean;
	selectedParagraph: ParagraphNode | null;
	evidenceParagraphs: EvidenceParagraph[];
	toneByParagraph?: Record<string, 'burden' | 'benefit'>;
	scoreByParagraph?: Record<string, number>;
	/** Why the linked paragraphs are linked, each halfway along its own link. */
	linkLabels?: LinkLabel[];
	/** Names the selected paragraph where the margin line leaves it. */
	anchorTag?: ReactNode;
	/** Why one linked paragraph is linked, beside the margin line where it reaches it. */
	connectorLabel?: (paragraphId: string) => ReactNode;
}

export function DocumentViewer({
	containerRef,
	status,
	dimmed,
	renderEpoch,
	paragraphElementById,
	evidenceBridgeActive,
	selectedParagraph,
	evidenceParagraphs,
	toneByParagraph,
	scoreByParagraph,
	linkLabels,
	anchorTag,
	connectorLabel,
}: DocumentViewerProps) {
	const scrollHostRef = useRef<HTMLElement>(null);

	const evidenceBridge = useEvidenceBridge({
		active: evidenceBridgeActive,
		renderEpoch,
		scrollHostRef,
		paragraphElementById,
		selectedParagraph,
		evidence: evidenceParagraphs,
	});

	const suppressMarkerClickRef = useRef(false);

	// The rail is the whole document in miniature, as a scrollbar is: dragging along it scrolls
	// the document by the same share of its height. The pointer is captured only once it moves,
	// so a plain click still lands on the marker under it.
	const startRailScrub = (event: ReactPointerEvent<HTMLElement>) => {
		const host = scrollHostRef.current;
		const rail = event.currentTarget;
		if (!host || !event.isPrimary || event.button !== 0) return;
		event.preventDefault();
		const pointerId = event.pointerId;
		const startY = event.clientY;
		const startTop = host.scrollTop;
		const scrollPerPx = host.scrollHeight / Math.max(1, rail.getBoundingClientRect().height);
		let moved = false;
		document.body.style.userSelect = 'none';
		const onMove = (moveEvent: PointerEvent) => {
			if (moveEvent.pointerId !== pointerId) return;
			const offset = moveEvent.clientY - startY;
			if (!moved && Math.abs(offset) > 2) {
				moved = true;
				if (rail.isConnected) rail.setPointerCapture(pointerId);
			}
			if (moved) host.scrollTop = startTop + offset * scrollPerPx;
		};
		const onEnd = (endEvent: PointerEvent) => {
			if (endEvent.pointerId !== pointerId) return;
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onEnd);
			window.removeEventListener('pointercancel', onEnd);
			rail.removeEventListener('lostpointercapture', onEnd);
			document.body.style.userSelect = '';
			if (moved) {
				suppressMarkerClickRef.current = true;
				window.setTimeout(() => {
					suppressMarkerClickRef.current = false;
				}, 140);
			}
		};
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onEnd);
		window.addEventListener('pointercancel', onEnd);
		rail.addEventListener('lostpointercapture', onEnd);
	};

	// What a reader is told a link or marker leads to: the clause number the graph gives the
	// linked paragraph, and its first words.
	const paragraphLabel = (paragraphId: string) => {
		const item = evidenceParagraphs.find((p) => p.node.id === paragraphId);
		if (!item) return 'paragraph';
		const relation = item.relation;
		const clause =
			relation?.kind === 'modifies'
				? relation.from
				: relation?.kind === 'depends_on' || relation?.kind === 'references'
					? relation.to
					: relation?.kind === 'uses'
						? relation.definedIn
						: relation?.kind === 'defines'
							? relation.usedIn
							: null;
		const words = item.node.text.trim().split(/\s+/).filter(Boolean);
		const opening =
			words.length > 0 ? `“${words.slice(0, 8).join(' ')}${words.length > 8 ? '…' : ''}”` : '';
		return [clause, opening].filter(Boolean).join(', ') || 'paragraph';
	};

	const jumpToParagraph = (paragraphId: string) => {
		if (suppressMarkerClickRef.current) return;
		const element = paragraphElementById.get(paragraphId);
		if (!element) return;
		element.scrollIntoView({
			behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
			block: 'center',
		});
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
				// Safe centring: centred while the page fits, from its left edge (scrollable) when not.
				className={`flex min-h-0 flex-1 flex-col items-center-safe overflow-auto px-2 py-4 shadow-inner transition-opacity duration-300 ${
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

			{evidenceBridgeActive && (
				<EvidenceBridgeOverlay
					bridge={evidenceBridge}
					onJumpToParagraph={jumpToParagraph}
					onRailPointerDown={startRailScrub}
					paragraphLabel={paragraphLabel}
					toneByParagraph={toneByParagraph}
					scoreByParagraph={scoreByParagraph}
					linkLabels={linkLabels}
					anchorTag={anchorTag}
					connectorLabel={connectorLabel}
				/>
			)}
		</div>
	);
}
