import type {
	RightPanelTab
} from '@/types/document';

// Quick questions for the KG chat about the focused party (burden/benefit of its clauses).
export const ASSISTANT_KG_SUGGESTIONS = [
	'Why does the contract burden this party?',
	'Which clause is riskiest for this party?',
	'Which clauses benefit this party the most?',
];

// Models for the global header selector (chat + knowledge-graph extraction).
export const GLOBAL_ANALYSIS_MODEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
	{ value: 'gpt-4.1', label: 'gpt-4.1' },
	{ value: 'gpt-5', label: 'gpt-5' },
	{ value: 'gpt-5.1', label: 'gpt-5.1' },
];

export const RIGHT_PANEL_TOOLS: Array<{ id: RightPanelTab; label: string }> = [
	{ id: 'knowledge_graph', label: 'Knowledge Graph' },
	{ id: 'assistant', label: 'Chat' },
];
 
export const RIGHT_TOOLBAR_WIDTH = 42;
export const RIGHT_TOOLBAR_EXPANDED_WIDTH = 162;
export const RIGHT_DRAWER_MIN_WIDTH = 360;
export const RIGHT_DRAWER_DEFAULT_WIDTH = 900;
export const RIGHT_DRAWER_MAX_RATIO = 0.68;
export const RIGHT_DRAWER_KEYBOARD_STEP = 24;
