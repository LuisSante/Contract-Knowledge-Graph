import type {
	AssistantMode,
	AssistantProvider,
	AssistantScope,
	ContradictionTaxonomyType,
	RightPanelTab
} from '@/types/document';

export const QUICK_ACTION_WHY_CONTRADICTION_FREE = 'Why is it a contradiction? (Free)';
export const QUICK_ACTION_WHY_CONTRADICTION_AI = 'Why is it a contradiction? (AI cost)';
export const QUICK_ACTION_CONTRADICTION_RISKS = 'What are the risks of this contradiction?';

export const QUICK_ACTIONS = [
	QUICK_ACTION_WHY_CONTRADICTION_FREE,
	QUICK_ACTION_WHY_CONTRADICTION_AI,
	'Who is liable?',
	'Can I terminate?',
	"What happens if I don't?",
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

export const MAX_SIMPLIFY_AUDIT_TRAIL = 200;

export const CONTRADICTION_TAXONOMY_ORDER: ReadonlyArray<ContradictionTaxonomyType> = [
	'temporal',
	'numerical',
	'authority',
	'process',
	'policy_reversal',
	'specificity'
];

export const CONTRADICTION_TAXONOMY_LABELS: Readonly<Record<ContradictionTaxonomyType, string>> = {
	temporal: 'Temporal',
	numerical: 'Numerical',
	authority: 'Authority',
	process: 'Process',
	policy_reversal: 'Policy Reversal',
	specificity: 'Specificity'
};

export const CONTRADICTION_TAXONOMY_COLORS: Readonly<Record<ContradictionTaxonomyType, string>> = {
	temporal: '#9c00cc',
	numerical: '#0f8536',
	authority: '#e4bb05',
	process: '#1cb18e',
	policy_reversal: '#ff8000',
	specificity: '#07399d'
};

export const CONTRADICTION_CLAIM_SIDE_COLORS: Readonly<Record<'a' | 'b', string>> = {
	a: '#2563eb',
	b: '#d97706'
};

export const RIGHT_PANEL_TOOLS: Array<{ id: RightPanelTab; label: string }> = [
	{ id: 'analysis', label: 'Contradiction Analysis' },
	// { id: 'redundancy', label: 'Redundancy Analysis' },
	{ id: 'related', label: 'Related Paragraphs' },
	// Hidden from the rail (the code/hook/panel are kept in features/docx):
	// { id: 'paragraph_explanation', label: 'Paragraph Explanation' },
	// { id: 'summarize', label: 'Summarize & Simplify' },
	// { id: 'ambiguity', label: 'Ambiguity Analysis' },
	// { id: 'revisions', label: 'Paragraph Revisions' },
	{ id: 'assistant', label: 'Contract Chat Assistant' }
];
 
export const RIGHT_TOOLBAR_WIDTH = 42;
export const RIGHT_TOOLBAR_EXPANDED_WIDTH = 162;
export const RIGHT_DRAWER_MIN_WIDTH = 360;
export const RIGHT_DRAWER_DEFAULT_WIDTH = 550;
export const RIGHT_DRAWER_MAX_RATIO = 0.68;
export const RIGHT_DRAWER_KEYBOARD_STEP = 24;
export const FIX_CONTRADICTION_TOP_RELATED = 3;
