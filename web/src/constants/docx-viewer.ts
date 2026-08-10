import type { RightPanelTab } from '@/types/document';

export const RIGHT_PANEL_TOOLS: Array<{ id: RightPanelTab; label: string }> = [
	{ id: 'related', label: 'Related Paragraphs' },
];

export const RIGHT_TOOLBAR_WIDTH = 42;
export const RIGHT_TOOLBAR_EXPANDED_WIDTH = 162;
export const RIGHT_DRAWER_MIN_WIDTH = 360;
export const RIGHT_DRAWER_DEFAULT_WIDTH = 550;
export const RIGHT_DRAWER_MAX_RATIO = 0.68;
export const RIGHT_DRAWER_KEYBOARD_STEP = 24;
