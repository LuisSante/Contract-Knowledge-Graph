'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import { DocxPageHeader } from '@/features/docx/components/shell/DocxPageHeader';
import { DocumentViewer } from '@/features/docx/components/shell/DocumentViewer';
import { RightPanel } from '@/features/docx/components/shell/RightPanel';
import { ToolRail } from '@/features/docx/components/shell/ToolRail';
import { LlmEstimateDialog } from '@/features/docx/components/shell/LlmEstimateDialog';
import { RightPanelHeaderActions } from '@/features/docx/components/shell/RightPanelHeaderActions';
import { RightPanelContent } from '@/features/docx/components/shell/RightPanelContent';
import { useRightDrawer } from '@/features/docx/hooks/useRightDrawer';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useLlmEstimate } from '@/features/docx/hooks/useLlmEstimate';
import { useDocumentEntityHighlights } from '@/features/docx/hooks/useDocumentEntityHighlights';
import { useRelatedBadges } from '@/features/docx/hooks/useRelatedBadges';
import { useDocumentViewer } from '@/features/docx/hooks/useDocumentViewer';
import { useContradictionAnalysis } from '@/features/docx/hooks/useContradictionAnalysis';
import { useContradictionDecorations } from '@/features/docx/hooks/useContradictionDecorations';
import { useAssistantChat } from '@/features/docx/hooks/useAssistantChat';
import { useParagraphExplanation } from '@/features/docx/hooks/useParagraphExplanation';
import { useRelatedGraph } from '@/features/docx/hooks/useRelatedGraph';
import { useLlmTotalCost } from '@/features/docx/hooks/useLlmTotalCost';
import { useDocumentStore } from '@/stores/document';
import { RIGHT_DRAWER_KEYBOARD_STEP } from '@/constants/docx-viewer';
import { buildBridgeRelatedParagraphs } from '@/features/docx/utils/related/related-bridge';

interface DocxViewerProps {
	searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * Docx viewer orchestrator (client): document render, contradictions
 * (panel + decorations + rail/link), assistant chat, and paragraph explanation.
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
	const llmEstimate = useLlmEstimate();
	// Confirming (Ctrl/Cmd+Enter) a paragraph edit recomputes the graph.
	const onParagraphCommitRef = useRef<(() => void) | null>(null);
	const viewer = useDocumentViewer(id, { onParagraphCommitRef });
	const { paragraphElementById, nodeEditStateById } = viewer.maps;

	const selectedParagraph = useDocumentStore((s) => s.selectedParagraph);
	const setSelectedParagraph = useDocumentStore((s) => s.setSelectedParagraph);

	const [model, setModel] = useState('gpt-4.1');
	const { data: llmCost } = useLlmTotalCost();
	const costLabel = llmCost ? `Cost: ${llmCost.totalCostUsdFormatted} $` : null;

	const related = useRelatedGraph({ docId, maps: viewer.maps });

	const contradiction = useContradictionAnalysis({
		docId,
		nodeEditStateById: nodeEditStateById.current,
		backendEdges: related.edges,
		model,
		confirmLlmEstimate: llmEstimate.confirm,
	});
	const explanation = useParagraphExplanation({
		docId,
		nodeEditStateById: nodeEditStateById.current,
	});

	const analysisActive = drawer.isOpen && drawer.activeTab === 'analysis';
	const explanationActive = drawer.isOpen && drawer.activeTab === 'paragraph_explanation';
	const relatedActive = drawer.isOpen && drawer.activeTab === 'related';

	// Shared chat: a single thread feeds the Contract Chat Assistant and the chat
	// embedded in Contradiction Analysis (quick-actions + structured fix).
	const assistant = useAssistantChat({
		docId,
		nodeEditStateById: nodeEditStateById.current,
		getViewerElement: () => viewer.containerRef.current,
		paragraphElementById: paragraphElementById.current,
		contradictionResultsByParagraphId: contradiction.resultsByParagraphId,
		selectedRelatedParagraphs: related.selectedRelatedParagraphs,
		model,
		confirmLlmEstimate: llmEstimate.confirm,
	});

	// Related bridge: active in Related and in Paragraph Explanation. The list
	// differs by tab (all vs the tail after the top-5 the panel already shows).
	const relatedBridgeActive = relatedActive || explanationActive;
	const relatedBridgeParagraphs = useMemo(
		() =>
			relatedActive
				? related.selectedRelatedParagraphs
				: explanationActive
					? buildBridgeRelatedParagraphs(related.selectedRelatedParagraphs, 'paragraph_explanation')
					: [],
		[relatedActive, explanationActive, related.selectedRelatedParagraphs]
	);

	// Entity highlighting in the document body: from Paragraph Explanation or
	// from the contradiction why/risk (toggle on). Applied to the selected
	// paragraph and its related ones.
	const documentEntities = explanationActive
		? explanation.entities
		: analysisActive
			? assistant.contradictionEntities
			: [];
	const entityTargetIds = useMemo(
		() =>
			selectedParagraph
				? Array.from(
						new Set([selectedParagraph.id, ...relatedBridgeParagraphs.map((item) => item.node.id)])
					)
				: [],
		[selectedParagraph, relatedBridgeParagraphs]
	);
	useDocumentEntityHighlights({
		active: documentEntities.length > 0 && (explanationActive || analysisActive),
		renderEpoch: viewer.renderEpoch,
		paragraphElementById: paragraphElementById.current,
		targetIds: entityTargetIds,
		entities: documentEntities,
	});

	// Relation badges: emphasis + direction (reference/similarity) when selecting
	// in the Related tab.
	const relatedFocusOn = relatedActive && selectedParagraph != null;
	useRelatedBadges({
		active: relatedFocusOn,
		paragraphRelationHostById: viewer.maps.paragraphRelationHostById.current,
		selectedParagraphId: selectedParagraph?.id ?? null,
		related: related.selectedRelatedParagraphs,
	});

	useContradictionDecorations({
		active: analysisActive,
		renderEpoch: viewer.renderEpoch,
		resultsByParagraphId: contradiction.resultsByParagraphId,
		paragraphElementById: paragraphElementById.current,
		selectedParagraphId: selectedParagraph?.id ?? null,
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

	// Contradictions are loaded only on demand: "Saved" (stored) or
	// "Search" (LLM search). They don't auto-load when the graph is built.

	// Requests the explanation when opening its tab with a selected paragraph not yet explained.
	const selectedParagraphId = selectedParagraph?.id ?? null;
	const {
		loadedForParagraphId: explanationLoadedId,
		loading: explanationLoading,
		submit: submitExplanation,
	} = explanation;
	useEffect(() => {
		if (
			explanationActive &&
			selectedParagraphId &&
			explanationLoadedId !== selectedParagraphId &&
			!explanationLoading
		) {
			void submitExplanation();
		}
	}, [explanationActive, selectedParagraphId, explanationLoadedId, explanationLoading, submitExplanation]);

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

	const onFocusEvidenceSnippet = (paragraphId: string, role: 'a' | 'b') => {
		const mark = document.querySelector<HTMLElement>(
			`mark.docx-contradiction-snippet[data-contradiction-owner="${paragraphId}"][data-contradiction-role="${role}"]`
		);
		if (mark) {
			mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
			flashElement(mark);
		} else {
			onFocusNodeFromPanel(paragraphId, true);
		}
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
				<DocxPageHeader
					documentName={viewer.documentName}
					costLabel={costLabel}
					model={model}
					onModelChange={setModel}
					modelDisabled={contradiction.loading || explanation.loading}
				/>
				<DocumentViewer
					containerRef={viewer.containerRef}
					status={viewer.status}
					dimmed={graphBlocking}
					contradictionActive={analysisActive}
					renderEpoch={viewer.renderEpoch}
					resultsByParagraphId={contradiction.resultsByParagraphId}
					paragraphElementById={paragraphElementById.current}
					selectedParagraphId={selectedParagraphId}
					categoryColor={contradiction.selectedContradictionCategoryColor}
					onMarkerClick={(paragraphId) => onFocusNodeFromPanel(paragraphId, true)}
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
						graphBlocking ? null : (
							<RightPanelHeaderActions
								activeTab={drawer.activeTab}
								contradictionLoading={contradiction.loading}
								relatedLoading={relatedLoading}
								onLoadSaved={() => void contradiction.loadSavedContradictions()}
								onSearch={() => void contradiction.searchContradictions()}
								explanationDisabled={!selectedParagraph || explanation.loading}
								onExplain={() => void explanation.submit()}
								provider={assistant.provider}
								onProviderChange={assistant.setProvider}
								scope={assistant.scope}
								onScopeChange={assistant.setScope}
							/>
						)
					}
				onClose={drawer.close}
				closeDisabled={graphBlocking}
			>
				<RightPanelContent
					activeTab={drawer.activeTab}
					graphBlocking={graphBlocking}
					selectedParagraph={selectedParagraph}
					nodeEditStateById={nodeEditStateById.current}
					contradiction={contradiction}
					assistant={assistant}
					explanation={explanation}
					related={related}
					onFocusNodeFromPanel={onFocusNodeFromPanel}
					onFocusEvidenceSnippet={onFocusEvidenceSnippet}
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

			<LlmEstimateDialog
				estimate={llmEstimate.estimate}
				isOpen={llmEstimate.isOpen}
				onResolve={llmEstimate.resolve}
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
