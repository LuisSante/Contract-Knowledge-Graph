'use client';

import { useCallback, useState } from 'react';
import {
	RIGHT_DRAWER_DEFAULT_WIDTH,
	RIGHT_DRAWER_MAX_RATIO,
	RIGHT_DRAWER_MIN_WIDTH,
	RIGHT_TOOLBAR_WIDTH,
	RIGHT_TOOLBAR_EXPANDED_WIDTH,
} from '@/constants/docx-viewer';
import type { RightPanelTab } from '@/types/document';

/**
 * State of the docx viewer's right drawer: visibility, width (clamped) and active
 * tab. Encapsulates the cluster of UI-state that in Svelte lived loose in
 * `docx/+page.svelte` (`isRightDrawerOpen`, `rightDrawerWidth`, `activeRightPanelTab`).
 *
 * The drag-resize logic (pointer events) will be added on iteration — see the
 * decomposition map of the plan.
 */
export function useRightDrawer(initialTab: RightPanelTab = 'analysis') {
	const [isOpen, setIsOpen] = useState(true);
	const [width, setWidthState] = useState(RIGHT_DRAWER_DEFAULT_WIDTH);
	const [activeTab, setActiveTab] = useState<RightPanelTab>(initialTab);
	const [labelsPinned, setLabelsPinned] = useState(false);

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

	const selectTool = useCallback((tab: RightPanelTab) => {
		setActiveTab(tab);
		setIsOpen(true);
	}, []);

	const sidebarWidth = labelsPinned ? RIGHT_TOOLBAR_EXPANDED_WIDTH : RIGHT_TOOLBAR_WIDTH;

	return {
		isOpen,
		width,
		activeTab,
		labelsPinned,
		sidebarWidth,
		setActiveTab,
		selectTool,
		setWidth,
		open,
		close,
		toggle,
		toggleLabels,
	};
}
