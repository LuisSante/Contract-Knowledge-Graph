import type {
	AssistantMode,
	AssistantProvider,
	AssistantScope,
	RightPanelTab
} from '@/types/document';


export const QUICK_ACTIONS = [
	'Who is liable?',
	'Can I terminate?',
	"What happens if I don't?",
];

// Quick questions for the KG chat about the focused party (burden/benefit of its clauses).
export const ASSISTANT_KG_SUGGESTIONS = [
	'Why does the contract burden this party?',
	'Which clause is riskiest for this party?',
	'Which clauses benefit this party the most?',
];

export const MODE_OPTIONS: ReadonlyArray<{ value: AssistantMode; label: string }> = [
	{ value: 'explain', label: 'Explain' },
	{ value: 'suggest_questions', label: 'Suggestion Question' }
];

export const SCOPE_OPTIONS: ReadonlyArray<{ value: AssistantScope; label: string }> = [
	{ value: 'selected', label: 'Selected Paragraph' },
	{ value: 'full_contract', label: 'Full Contract' }
];

export const PROVIDER_OPTIONS: ReadonlyArray<{ value: AssistantProvider; label: string }> = [
	{ value: 'openai', label: 'OpenAI' },
	{ value: 'gemini', label: 'Gemini' },
];

export const CONTRADICTION_OPENAI_MODEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
	{ value: 'gpt-4.1', label: 'gpt-4.1' },
	{ value: 'gpt-5', label: 'gpt-5' },
	{ value: 'gpt-5.1', label: 'gpt-5.1' }

];

export const PARAGRAPH_EXPLANATION_MODEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
	{ value: 'gpt-5.1', label: 'gpt-5.1' },
	{ value: 'gpt-5', label: 'gpt-5' },
	{ value: 'gpt-4.1', label: 'gpt-4.1' }
];

// Models for the global header selector (Contradiction Analysis + Paragraph Explanation).
export const GLOBAL_ANALYSIS_MODEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
	{ value: 'gpt-4.1', label: 'gpt-4.1' },
	{ value: 'gpt-5', label: 'gpt-5' },
	{ value: 'gpt-5.1', label: 'gpt-5.1' },
];

export const COMMIT_SHORTCUT_LABEL = 'CTRL + SHIFT + ENTER';
export const COMMIT_SHORTCUT_HINT = 'Commit changes with Ctrl + Shift + Enter';
export const COMMIT_SHORTCUT_TOOLTIP = 'Ctrl + Shift + Enter to save';





export const CONTRADICTION_CLAIM_SIDE_COLORS: Readonly<Record<'a' | 'b', string>> = {
	a: '#2563eb',
	b: '#d97706'
};

export const RIGHT_PANEL_TOOLS: Array<{ id: RightPanelTab; label: string }> = [
	// Related Paragraphs hidden while the ContraVis paragraph graph is disabled:
	// { id: 'related', label: 'Related Paragraphs' },
	{ id: 'knowledge_graph', label: 'Knowledge Graph' },
	{ id: 'assistant', label: 'Chat' },
];
 
export const RIGHT_TOOLBAR_WIDTH = 42;
export const RIGHT_TOOLBAR_EXPANDED_WIDTH = 162;
export const RIGHT_DRAWER_MIN_WIDTH = 360;
export const RIGHT_DRAWER_DEFAULT_WIDTH = 900;
export const RIGHT_DRAWER_MAX_RATIO = 0.68;
export const RIGHT_DRAWER_KEYBOARD_STEP = 24;
export const FIX_CONTRADICTION_TOP_RELATED = 3;
