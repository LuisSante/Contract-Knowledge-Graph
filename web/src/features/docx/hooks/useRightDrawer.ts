'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import {
	DESKTOP_MIN_VIEWPORT,
	DOCUMENT_MIN_WIDTH,
	RIGHT_DRAWER_DEFAULT_WIDTH,
	RIGHT_DRAWER_MAX_RATIO,
	RIGHT_DRAWER_MIN_WIDTH,
	RIGHT_PANEL_TOOLS,
	RIGHT_TOOLBAR_WIDTH,
	RIGHT_TOOLBAR_EXPANDED_WIDTH,
} from '@/constants/docx-viewer';
import type { RightPanelTab } from '@/types/document';

export const TAB_PARAM = 'tab';

function isTab(value: string | null): value is RightPanelTab {
	return RIGHT_PANEL_TOOLS.some((tool) => tool.id === value);
}

const subscribeViewport = (onChange: () => void) => {
	window.addEventListener('resize', onChange);
	return () => window.removeEventListener('resize', onChange);
};
const viewportWidth = () => window.innerWidth;
// The server knows no viewport: it renders the default width, as the first client render does.
const noViewport = () => null;

/** The widest the panel may be beside the contract, so the contract keeps a readable column. */
function maxWidthFor(viewport: number, sidebarWidth: number): number {
	return Math.max(
		RIGHT_DRAWER_MIN_WIDTH,
		Math.min(viewport * RIGHT_DRAWER_MAX_RATIO, viewport - sidebarWidth - DOCUMENT_MIN_WIDTH)
	);
}

/** The width the panel takes on this viewport. Below the desktop breakpoint it overlays the
 *  contract and its own CSS caps it to the screen. */
function fitWidth(preferred: number, viewport: number | null, sidebarWidth: number): number {
	if (viewport == null || viewport < DESKTOP_MIN_VIEWPORT) return preferred;
	return Math.min(Math.max(preferred, RIGHT_DRAWER_MIN_WIDTH), maxWidthFor(viewport, sidebarWidth));
}

export function useRightDrawer(fallbackTab: RightPanelTab = 'clause_analyzer') {
	const searchParams = useSearchParams();
	const [isOpen, setIsOpen] = useState(true);
	// What the reader chose (or the default); the viewport decides how much of it fits, so
	// widening the window gives the panel back its width.
	const [preferredWidth, setPreferredWidth] = useState(RIGHT_DRAWER_DEFAULT_WIDTH);
	const [labelsPinned, setLabelsPinned] = useState(false);
	const viewport = useSyncExternalStore(subscribeViewport, viewportWidth, noViewport);
	const sidebarWidth = labelsPinned ? RIGHT_TOOLBAR_EXPANDED_WIDTH : RIGHT_TOOLBAR_WIDTH;
	const width = fitWidth(preferredWidth, viewport, sidebarWidth);
	const maxWidth = viewport == null ? null : maxWidthFor(viewport, sidebarWidth);

	const raw = searchParams.get(TAB_PARAM);
	const activeTab = isTab(raw) ? raw : fallbackTab;

	useEffect(() => {
		if (isTab(raw)) return;
		const params = new URLSearchParams(searchParams.toString());
		params.set(TAB_PARAM, fallbackTab);
		window.history.replaceState(null, '', `?${params.toString()}`);
	}, [raw, searchParams, fallbackTab]);

	const setWidth = useCallback(
		(next: number) => setPreferredWidth(fitWidth(next, window.innerWidth, sidebarWidth)),
		[sidebarWidth]
	);

	const open = useCallback(() => setIsOpen(true), []);
	const close = useCallback(() => setIsOpen(false), []);
	const toggle = useCallback(() => setIsOpen((value) => !value), []);
	const toggleLabels = useCallback(() => setLabelsPinned((value) => !value), []);

	const selectTool = useCallback(
		(tab: RightPanelTab) => {
			setIsOpen(true);
			if (tab === activeTab) return;
			const params = new URLSearchParams(searchParams.toString());
			params.set(TAB_PARAM, tab);
			window.history.pushState(null, '', `?${params.toString()}`);
		},
		[searchParams, activeTab]
	);

	return {
		isOpen,
		width,
		minWidth: RIGHT_DRAWER_MIN_WIDTH,
		maxWidth,
		activeTab,
		labelsPinned,
		sidebarWidth,
		selectTool,
		setWidth,
		open,
		close,
		toggle,
		toggleLabels,
	};
}
