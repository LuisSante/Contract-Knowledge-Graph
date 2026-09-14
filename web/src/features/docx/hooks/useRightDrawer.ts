'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
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

export function useRightDrawer(fallbackTab: RightPanelTab = 'clause_analyzer') {
	const searchParams = useSearchParams();
	const [isOpen, setIsOpen] = useState(true);
	const [width, setWidthState] = useState(RIGHT_DRAWER_DEFAULT_WIDTH);
	const [labelsPinned, setLabelsPinned] = useState(false);

	const raw = searchParams.get(TAB_PARAM);
	const activeTab = isTab(raw) ? raw : fallbackTab;

	useEffect(() => {
		if (isTab(raw)) return;
		const params = new URLSearchParams(searchParams.toString());
		params.set(TAB_PARAM, fallbackTab);
		window.history.replaceState(null, '', `?${params.toString()}`);
	}, [raw, searchParams, fallbackTab]);

	const setWidth = useCallback((next: number) => {
		const max =
			typeof window !== 'undefined'
				? window.innerWidth * RIGHT_DRAWER_MAX_RATIO
				: Number.POSITIVE_INFINITY;
		setWidthState(Math.min(Math.max(next, RIGHT_DRAWER_MIN_WIDTH), max));
	}, []);

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

	const sidebarWidth = labelsPinned ? RIGHT_TOOLBAR_EXPANDED_WIDTH : RIGHT_TOOLBAR_WIDTH;

	return {
		isOpen,
		width,
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
