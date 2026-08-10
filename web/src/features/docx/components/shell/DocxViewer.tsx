'use client';

import { use, useEffect, useRef } from 'react';
import { DocxPageHeader } from '@/features/docx/components/shell/DocxPageHeader';
import { DocumentViewer } from '@/features/docx/components/shell/DocumentViewer';
import { RightPanel } from '@/features/docx/components/shell/RightPanel';
import { ToolRail } from '@/features/docx/components/shell/ToolRail';
import { RightPanelHeaderActions } from '@/features/docx/components/shell/RightPanelHeaderActions';
import { RightPanelContent } from '@/features/docx/components/shell/RightPanelContent';
import { useRightDrawer } from '@/features/docx/hooks/useRightDrawer';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useRelatedBadges } from '@/features/docx/hooks/useRelatedBadges';
import { useDocumentViewer } from '@/features/docx/hooks/useDocumentViewer';
import { useRelatedGraph } from '@/features/docx/hooks/useRelatedGraph';
import { useDocumentStore } from '@/stores/document';
import { RIGHT_DRAWER_KEYBOARD_STEP } from '@/constants/docx-viewer';

interface DocxViewerProps {
	searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * Docx viewer orchestrator (client): document render and related paragraphs.
 * Layout faithful to the original: content + sliding panel + icon rail.
 */
export function DocxViewer({ searchParams }: DocxViewerProps) {
	const params = use(searchParams);
	const id = typeof params.id === 'string' ? params.id : null;
	const docId = id ?? '';

	const drawer = useRightDrawer();
	// Below the `lg` breakpoint the three-zone layout collapses: the panel becomes
	// an overlay sheet over the full-width document instead of shrinking it.
	const isDesktop = useIsDesktop();
	const { open: openDrawer, close: closeDrawer } = drawer;
	const wasDesktopRef = useRef(isDesktop);
	useEffect(() => {
		if (wasDesktopRef.current && !isDesktop) {
			// Desktop → narrow: hide the overlay so the document leads on small screens.
			closeDrawer();
		} else if (!wasDesktopRef.current && isDesktop) {
			// Narrow → desktop: restore the side-by-side panel.
			openDrawer();
		}
		wasDesktopRef.current = isDesktop;
	}, [isDesktop, openDrawer, closeDrawer]);
	// Confirming (Ctrl/Cmd+Enter) a paragraph edit recomputes the graph.
	const onParagraphCommitRef = useRef<(() => void) | null>(null);
	const viewer = useDocumentViewer(id, { onParagraphCommitRef });
	const { paragraphElementById, nodeEditStateById } = viewer.maps;

	const selectedParagraph = useDocumentStore((s) => s.selectedParagraph);
	const setSelectedParagraph = useDocumentStore((s) => s.setSelectedParagraph);

	const related = useRelatedGraph({ docId, maps: viewer.maps });

	const relatedActive = drawer.isOpen && drawer.activeTab === 'related';

	// Related bridge: active in the Related tab, feeding all of the paragraph's
	// related ones into the connector/overlay.
	const relatedBridgeActive = relatedActive;
	const relatedBridgeParagraphs = relatedActive ? related.selectedRelatedParagraphs : [];

	// Relation badges: emphasis + direction (reference/similarity) when selecting
	// in the Related tab.
	const relatedFocusOn = relatedActive && selectedParagraph != null;
	useRelatedBadges({
		active: relatedFocusOn,
		paragraphRelationHostById: viewer.maps.paragraphRelationHostById.current,
		selectedParagraphId: selectedParagraph?.id ?? null,
		related: related.selectedRelatedParagraphs,
	});

	// The relations graph is built as soon as the document finishes rendering
	// (not when opening Related). While it builds, navigation is blocked (below).
	const { computed: relatedComputed, loading: relatedLoading, recompute: recomputeRelated } = related;
	useEffect(() => {
		if (id && viewer.renderEpoch > 0 && !relatedComputed && !relatedLoading) {
			void recomputeRelated();
		}
	}, [id, viewer.renderEpoch, relatedComputed, relatedLoading, recomputeRelated]);

	// Confirming a paragraph edit (Ctrl/Cmd+Enter) recomputes the graph.
	useEffect(() => {
		onParagraphCommitRef.current = () => void recomputeRelated();
		return () => {
			onParagraphCommitRef.current = null;
		};
	}, [recomputeRelated]);

	// Global block while the graph builds/recomputes: dimmed document + no
	// navigation + step animation in the panel. (Released if the render fails.)
	const graphBlocking =
		id != null && (!relatedComputed || relatedLoading) && viewer.status !== 'error';

	// Resize of the right drawer by dragging the vertical separator.
	const startDrawerResize = (event: React.MouseEvent) => {
		if (window.innerWidth < 1024 || !drawer.isOpen) return;
		event.preventDefault();
		document.body.style.userSelect = 'none';
		const sidebarWidth = drawer.sidebarWidth;
		const onMove = (moveEvent: MouseEvent) => {
			drawer.setWidth(window.innerWidth - sidebarWidth - moveEvent.clientX);
		};
		const onUp = () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
			document.body.style.userSelect = '';
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	};

	const handleDrawerResizeKeydown = (event: React.KeyboardEvent) => {
		if (!drawer.isOpen) return;
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			drawer.setWidth(drawer.width + RIGHT_DRAWER_KEYBOARD_STEP);
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault();
			drawer.setWidth(drawer.width - RIGHT_DRAWER_KEYBOARD_STEP);
		}
	};

	const onFocusNodeFromPanel = (nodeId: string, emphasize = false) => {
		const node = useDocumentStore.getState().paragraphs.find((n) => n.id === nodeId) ?? null;
		setSelectedParagraph(node);
		const element = paragraphElementById.current.get(nodeId);
		element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		if (emphasize && element) flashElement(element);
	};

	if (!id) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<p className="text-muted-foreground text-sm">
					Missing document <code>id</code> parameter.
				</p>
			</div>
		);
	}

	// Desktop: the document shares the row with the open panel. Narrow: the panel
	// overlays, so the document keeps the full width (minus only the tool rail).
	const leftWidth = isDesktop
		? `calc(100% - ${drawer.sidebarWidth + (drawer.isOpen ? drawer.width : 0)}px)`
		: `calc(100% - ${drawer.sidebarWidth}px)`;
	const overlayPanel = !isDesktop;

	return (
		<main
			className={`relative flex h-screen w-screen overflow-hidden bg-[var(--canvas)] font-sans ${
				relatedActive ? 'related-badges-on' : 'related-badges-off'
			} ${relatedFocusOn ? 'related-focus-on' : ''}`}
		>
			<div className="relative flex min-w-0 flex-col border-r border-gray-300" style={{ width: leftWidth }}>
				<DocxPageHeader documentName={viewer.documentName} />
				<DocumentViewer
					containerRef={viewer.containerRef}
					status={viewer.status}
					dimmed={graphBlocking}
					renderEpoch={viewer.renderEpoch}
					paragraphElementById={paragraphElementById.current}
						relatedBridgeActive={relatedBridgeActive}
						selectedParagraph={selectedParagraph}
						relatedBridgeParagraphs={relatedBridgeParagraphs}
				/>
			</div>

			<RightPanel
				activeTab={drawer.activeTab}
				isOpen={drawer.isOpen}
				width={drawer.width}
				sidebarWidth={drawer.sidebarWidth}
				headerActions={
						graphBlocking ? null : <RightPanelHeaderActions activeTab={drawer.activeTab} />
					}
				onClose={drawer.close}
				closeDisabled={graphBlocking}
			>
				<RightPanelContent
					activeTab={drawer.activeTab}
					graphBlocking={graphBlocking}
					selectedParagraph={selectedParagraph}
					nodeEditStateById={nodeEditStateById.current}
					related={related}
					onFocusNodeFromPanel={onFocusNodeFromPanel}
				/>
			</RightPanel>

			{overlayPanel && drawer.isOpen && !graphBlocking && (
				<button
					type="button"
					aria-label="Close panel"
					className="absolute inset-0 z-30 bg-foreground/30 transition-opacity duration-300"
					onClick={drawer.close}
				/>
			)}

			{isDesktop && drawer.isOpen && !graphBlocking && (
				<div
					role="separator"
					aria-orientation="vertical"
					aria-label="Resize side panel"
					tabIndex={0}
					className="absolute top-0 bottom-0 z-50 w-1 cursor-col-resize bg-border transition hover:bg-primary/50 focus:bg-primary focus:outline-none"
					style={{ right: drawer.sidebarWidth + drawer.width }}
					onMouseDown={startDrawerResize}
					onKeyDown={handleDrawerResizeKeydown}
				>
					<span className="pointer-events-none absolute top-1/2 left-1/2 h-10 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/40" />
				</div>
			)}

			<ToolRail
				width={drawer.sidebarWidth}
				labelsPinned={drawer.labelsPinned}
				activeTab={drawer.activeTab}
				isOpen={drawer.isOpen}
				disabled={graphBlocking}
				onSelectTool={drawer.selectTool}
				onToggleLabels={drawer.toggleLabels}
			/>
		</main>
	);
}

/** Brief flash to draw attention to an element when navigating. */
function flashElement(element: HTMLElement) {
	element.classList.remove('docx-citation-flash');
	// Force reflow to restart the animation.
	void element.offsetWidth;
	element.classList.add('docx-citation-flash');
	window.setTimeout(() => element.classList.remove('docx-citation-flash'), 1300);
}
