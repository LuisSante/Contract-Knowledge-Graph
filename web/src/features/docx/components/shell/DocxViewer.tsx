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
import { useEntityHighlights } from '@/features/docx/hooks/useEntityHighlights';
import { useDocumentViewer } from '@/features/docx/hooks/useDocumentViewer';
import { useAssistantChat } from '@/features/docx/hooks/useAssistantChat';
import { useLlmTotalCost } from '@/features/docx/hooks/useLlmTotalCost';
import { useDocumentStore } from '@/stores/document';
import { useGraphStore } from '@/stores/knowledge-graph';
import { RIGHT_DRAWER_KEYBOARD_STEP } from '@/constants/docx-viewer';
import { extractParagraphs } from '@/services/paragraphs';

interface DocxViewerProps {
	searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export function DocxViewer({ searchParams }: DocxViewerProps) {
	const params = use(searchParams);
	const id = typeof params.id === 'string' ? params.id : null;
	const docId = id ?? '';

	const drawer = useRightDrawer();
	const isDesktop = useIsDesktop();
	const { open: openDrawer, close: closeDrawer } = drawer;
	const wasDesktopRef = useRef(isDesktop);
	useEffect(() => {
		if (wasDesktopRef.current && !isDesktop) {
			closeDrawer();
		} else if (!wasDesktopRef.current && isDesktop) {
			openDrawer();
		}
		wasDesktopRef.current = isDesktop;
	}, [isDesktop, openDrawer, closeDrawer]);
	const llmEstimate = useLlmEstimate();
	const onParagraphCommitRef = useRef<(() => void) | null>(null);
	const viewer = useDocumentViewer(id, { onParagraphCommitRef });
	const { paragraphElementById, nodeEditStateById } = viewer.maps;

	const setSelectedParagraph = useDocumentStore((s) => s.setSelectedParagraph);

	const [model, setModel] = useState('gpt-4.1');
	const { data: llmCost } = useLlmTotalCost();
	const costLabel = llmCost ? `Cost: ${llmCost.totalCostUsdFormatted} $` : null;

	const knowledgeGraphActive = drawer.isOpen && drawer.activeTab === 'knowledge_graph';

	const kgAnchorParagraphId = useGraphStore((s) => s.anchorParagraphId);
	const kgRelatedParagraphs = useGraphStore((s) => s.relatedParagraphs);
	const kgEntities = useGraphStore((s) => s.entities);
	const kgParagraphIds = useGraphStore((s) => s.paragraphIds);
	const kgToneByParagraphId = useGraphStore((s) => s.toneByParagraph);
	const kgScoreByParagraphId = useGraphStore((s) => s.scoreByParagraph);
	const paragraphs = useDocumentStore((s) => s.paragraphs);
	const kgAnchorParagraph = useMemo(
		() =>
			kgAnchorParagraphId ? (paragraphs.find((n) => n.id === kgAnchorParagraphId) ?? null) : null,
		[paragraphs, kgAnchorParagraphId]
	);

	const assistant = useAssistantChat({
		docId,
		nodeEditStateById: nodeEditStateById.current,
		model,
		confirmLlmEstimate: llmEstimate.confirm,
	});

	const bridgeActive = knowledgeGraphActive;
	const bridgeSelectedParagraph = knowledgeGraphActive ? kgAnchorParagraph : null;
	const bridgeParagraphs = knowledgeGraphActive ? kgRelatedParagraphs : [];

	const documentEntities = kgEntities;
	const entityTargetIds = useMemo(
		() => (knowledgeGraphActive ? kgParagraphIds : []),
		[knowledgeGraphActive, kgParagraphIds]
	);
	useEntityHighlights({
		active: documentEntities.length > 0 && knowledgeGraphActive,
		renderEpoch: viewer.renderEpoch,
		paragraphElementById: paragraphElementById.current,
		targetIds: entityTargetIds,
		entities: documentEntities,
	});

	useEffect(() => {
		if (!knowledgeGraphActive || !kgAnchorParagraphId || viewer.renderEpoch === 0) return;
		const element = paragraphElementById.current.get(kgAnchorParagraphId);
		if (!element) return;
		element.scrollIntoView({ behavior: 'smooth', block: 'center' });
		flashElement(element);
	}, [knowledgeGraphActive, kgAnchorParagraphId, viewer.renderEpoch, paragraphElementById]);

	const extractedDocIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (!docId || viewer.renderEpoch === 0) return;
		if (extractedDocIdRef.current === docId) return;

		const snapshot = useDocumentStore.getState().paragraphs;
		if (snapshot.length === 0) return;

		extractedDocIdRef.current = docId;
		void extractParagraphs(docId, snapshot, nodeEditStateById.current).catch((error) => {
			extractedDocIdRef.current = null;
			console.error('Failed to extract paragraphs:', error);
		});
	}, [docId, viewer.renderEpoch, nodeEditStateById]);

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

	const leftWidth = isDesktop
		? `calc(100% - ${drawer.sidebarWidth + (drawer.isOpen ? drawer.width : 0)}px)`
		: `calc(100% - ${drawer.sidebarWidth}px)`;
	const overlayPanel = !isDesktop;

	return (
		<main className="relative flex h-screen w-screen overflow-hidden bg-[var(--canvas)] font-sans">
			<div
				className="relative flex min-w-0 flex-col border-r border-gray-300"
				style={{ width: leftWidth }}
			>
				<DocxPageHeader documentName={viewer.documentName} />
				<DocumentViewer
					containerRef={viewer.containerRef}
					status={viewer.status}
					renderEpoch={viewer.renderEpoch}
					paragraphElementById={paragraphElementById.current}
					evidenceBridgeActive={bridgeActive}
					selectedParagraph={bridgeSelectedParagraph}
					evidenceParagraphs={bridgeParagraphs}
					toneByParagraph={knowledgeGraphActive ? kgToneByParagraphId : undefined}
					scoreByParagraph={knowledgeGraphActive ? kgScoreByParagraphId : undefined}
				/>
			</div>

			<RightPanel
				activeTab={drawer.activeTab}
				isOpen={drawer.isOpen}
				width={drawer.width}
				sidebarWidth={drawer.sidebarWidth}
				headerActions={
					<RightPanelHeaderActions
						activeTab={drawer.activeTab}
						costLabel={costLabel}
						model={model}
						onModelChange={setModel}
					/>
				}
				onClose={drawer.close}
			>
				<RightPanelContent
					activeTab={drawer.activeTab}
					docId={docId}
					assistant={assistant}
					onFocusNodeFromPanel={onFocusNodeFromPanel}
				/>
			</RightPanel>

			{overlayPanel && drawer.isOpen && (
				<button
					type="button"
					aria-label="Close panel"
					className="absolute inset-0 z-30 bg-foreground/30 transition-opacity duration-300"
					onClick={drawer.close}
				/>
			)}

			{isDesktop && drawer.isOpen && (
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

function flashElement(element: HTMLElement) {
	element.classList.remove('docx-citation-flash');
	void element.offsetWidth;
	element.classList.add('docx-citation-flash');
	window.setTimeout(() => element.classList.remove('docx-citation-flash'), 1300);
}
