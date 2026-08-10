'use client';

import type { RightPanelTab } from '@/types/document';

interface RightPanelHeaderActionsProps {
	activeTab: RightPanelTab;
}

/**
 * Right-panel header actions, specific per tab. The only remaining tab
 * (`related`) has no header actions, so this renders nothing for now — kept as
 * the extension point for per-tab header controls.
 */
export function RightPanelHeaderActions(_props: RightPanelHeaderActionsProps) {
	return null;
}
