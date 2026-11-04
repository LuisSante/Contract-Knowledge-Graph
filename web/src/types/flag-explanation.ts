export interface FlagExplanationInput {
	rootId: string;
	nodeIds: string[];
	flags: import('./red-flags').RedFlag[];
}

export interface ExplanationEvidence {
	id: string;
	nodeIds: string[];
}

export interface ExplanationReason {
	id: string;
	concept: string;
	kind: 'interpretation' | 'missing_information';
	targetId: string;
	relation: string;
	evidenceIds: string[];
}

/** What protects the exposed party, or that nothing in the path does: always answered. */
export interface ExplanationSafeguard {
	concept: string;
	found: boolean;
	targetId: string;
	relation: string;
	evidenceIds: string[];
}

export interface FlagExplanationResponse {
	model: string;
	explanation: {
		status: 'explained' | 'partial' | 'insufficient';
		summary: string;
		exposedPartyIds: string[];
		reasons: ExplanationReason[];
		safeguard?: ExplanationSafeguard;
	};
	evidence: ExplanationEvidence[];
}

export interface FlagExplanationEstimate {
	model: string;
	estimatedInputTokens: number;
	estimatedOutputTokens: number;
	estimatedCostUsd: number | null;
	outputBudgetCostUsd: number | null;
}
