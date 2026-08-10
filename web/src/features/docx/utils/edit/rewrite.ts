import type {
	AssistantProvider,
	ContradictionParagraphResult,
	ParagraphEditState,
	RelatedParagraph,
	SimplifyAuditRecord,
	SimplifySelectionRequest,
	SimplifyResultState
} from '@/types/document';
import {
	buildTargetForWholeParagraph,
	buildTargetFromSelectionRange,
	computeSimplifyToolbarPosition,
	getParagraphTextElement,
	normalizeBounds,
	preserveBoundaryWhitespace,
	replaceParagraphTextRange,
	type SimplifyTarget
} from '@/features/docx/utils/edit/simplify-selection';
import { buildFixRelatedContext } from '@/features/docx/utils/assistant/assistant';
import { fetchFixContradictionSelection, fetchSimplifySelection } from '@/services/assistant';
import { normalizeEditableText } from '@/features/docx/utils/docx-engine/paragraph';

type ErrorResolver = (error: unknown, fallbackMessage: string) => string;

type RewriteExecutionResult =
	| {
			ok: true;
			target: SimplifyTarget;
			result: SimplifyResultState;
			auditRecord: SimplifyAuditRecord;
	  }
	| {
			ok: false;
			error: string;
	  };

type ResolveTargetParams = {
	viewer: HTMLElement | null;
	selectedParagraphId: string | null;
	paragraphElementById: Map<string, HTMLElement>;
	fallbackTarget: SimplifyTarget | null;
};

type ExecuteFixParams = ResolveTargetParams & {
	activeDocumentId: string | null;
	assistantProvider: AssistantProvider;
	contradictionResultsByParagraphId: Map<string, ContradictionParagraphResult>;
	selectedRelatedParagraphs: RelatedParagraph[];
	nodeEditStateById: Map<string, ParagraphEditState>;
	fixRelatedLimit: number;
	resolveErrorMessage: ErrorResolver;
	confirmLlmEstimate?: (
		callType: 'assistant_fix_contradiction',
		payload: SimplifySelectionRequest
	) => Promise<boolean>;
};

type ExecuteSimplifyParams = ResolveTargetParams & {
	activeDocumentId: string | null;
	assistantProvider: AssistantProvider;
	resolveErrorMessage: ErrorResolver;
	confirmLlmEstimate?: (
		callType: 'assistant_simplify',
		payload: SimplifySelectionRequest
	) => Promise<boolean>;
};

type ApplyRewriteParams = {
	simplifyResult: SimplifyResultState | null;
	paragraphElementById: Map<string, HTMLElement>;
};

function resolvePreferredTarget({
	viewer,
	selectedParagraphId,
	paragraphElementById
}: Omit<ResolveTargetParams, 'fallbackTarget'>): SimplifyTarget | null {
	const rangeTarget = buildTargetFromSelectionRange({ viewer });
	if (rangeTarget) return rangeTarget;

	if (selectedParagraphId) {
		const paragraphTarget = buildTargetForWholeParagraph(selectedParagraphId, paragraphElementById);
		if (paragraphTarget) return paragraphTarget;
	}

	return null;
}

export function resolveActiveRewriteTarget(params: ResolveTargetParams): SimplifyTarget | null {
	return (
		resolvePreferredTarget({
			viewer: params.viewer,
			selectedParagraphId: params.selectedParagraphId,
			paragraphElementById: params.paragraphElementById
		}) ?? params.fallbackTarget
	);
}

export function getRewriteToolbarPosition(anchorRect: DOMRect): { left: number; top: number } {
	return computeSimplifyToolbarPosition(anchorRect, window.innerWidth, window.innerHeight);
}

function createAuditRecord(params: {
	documentId: string;
	createdAt: string;
	response: SimplifyResultState['payload'];
}): SimplifyAuditRecord {
	const { documentId, createdAt, response } = params;
	return {
		documentId,
		provider: response.provider,
		paragraphId: response.evidence.paragraph_id,
		selectionStart: response.evidence.selection_start,
		selectionEnd: response.evidence.selection_end,
		originalSnippet: response.originalSnippet,
		simplifiedSnippet: response.simplifiedSnippet,
		systemPrompt: response.audit.system_prompt,
		userPrompt: response.audit.user_prompt,
		modelResponse: response.audit.model_response,
		timestamp: createdAt
	};
}

export async function executeFixContradictionRewrite(
	params: ExecuteFixParams
): Promise<RewriteExecutionResult> {
	if (!params.activeDocumentId) {
		return { ok: false, error: 'No document is loaded.' };
	}

	const target = resolveActiveRewriteTarget(params);
	if (!target) {
		return {
			ok: false,
			error: 'Select text in a paragraph or focus a paragraph to fix contradictions.'
		};
	}

	const contradiction = params.contradictionResultsByParagraphId.get(target.paragraphId);
	if (!contradiction) {
		return {
			ok: false,
			error:
				'No contradiction result is available for this paragraph yet. Run "Search contradictions" first.'
		};
	}

	if (!contradiction.contradiction) {
		return { ok: false, error: 'This paragraph is not currently classified as contradiction.' };
	}

	const bounds = normalizeBounds(
		target.selectionStart,
		target.selectionEnd,
		target.paragraphText.length
	);
	const selectionStart = bounds.start;
	const selectionEnd = bounds.end === bounds.start ? target.paragraphText.length : bounds.end;

	try {
		const requestPayload: SimplifySelectionRequest = {
			documentId: params.activeDocumentId,
			provider: params.assistantProvider,
			paragraphId: target.paragraphId,
			paragraphText: target.paragraphText,
			selectionStart,
			selectionEnd,
			contradictionReason: contradiction.brief_reason,
			relatedParagraphs: buildFixRelatedContext(
				params.selectedRelatedParagraphs,
				params.nodeEditStateById,
				params.fixRelatedLimit
			)
		};
		if (params.confirmLlmEstimate) {
			const approved = await params.confirmLlmEstimate('assistant_fix_contradiction', requestPayload);
			if (!approved) return { ok: false, error: 'Request canceled by user.' };
		}
		const response = await fetchFixContradictionSelection(requestPayload);

		const createdAt = new Date().toISOString();
		const result: SimplifyResultState = {
			payload: response,
			paragraphTextSnapshot: target.paragraphText,
			createdAt
		};

		return {
			ok: true,
			target,
			result,
			auditRecord: createAuditRecord({
				documentId: params.activeDocumentId,
				createdAt,
				response
			})
		};
	} catch (error) {
		return {
			ok: false,
			error: params.resolveErrorMessage(error, 'Failed to fix contradiction for selected text.')
		};
	}
}

export async function executeSimplifyRewrite(
	params: ExecuteSimplifyParams
): Promise<RewriteExecutionResult> {
	if (!params.activeDocumentId) {
		return { ok: false, error: 'No document is loaded.' };
	}

	const target = resolveActiveRewriteTarget(params);
	if (!target) {
		return { ok: false, error: 'Select text in a paragraph or focus a paragraph to simplify.' };
	}

	const bounds = normalizeBounds(
		target.selectionStart,
		target.selectionEnd,
		target.paragraphText.length
	);
	const selectionStart = bounds.start;
	const selectionEnd = bounds.end === bounds.start ? target.paragraphText.length : bounds.end;

	try {
		const requestPayload: SimplifySelectionRequest = {
			documentId: params.activeDocumentId,
			provider: params.assistantProvider,
			paragraphId: target.paragraphId,
			paragraphText: target.paragraphText,
			selectionStart,
			selectionEnd
		};
		if (params.confirmLlmEstimate) {
			const approved = await params.confirmLlmEstimate('assistant_simplify', requestPayload);
			if (!approved) return { ok: false, error: 'Request canceled by user.' };
		}
		const response = await fetchSimplifySelection(requestPayload);

		const createdAt = new Date().toISOString();
		const result: SimplifyResultState = {
			payload: response,
			paragraphTextSnapshot: target.paragraphText,
			createdAt
		};

		return {
			ok: true,
			target,
			result,
			auditRecord: createAuditRecord({
				documentId: params.activeDocumentId,
				createdAt,
				response
			})
		};
	} catch (error) {
		return {
			ok: false,
			error: params.resolveErrorMessage(error, 'Failed to simplify the selected text.')
		};
	}
}

export async function copyRewriteSnippetToClipboard(
	simplifyResult: SimplifyResultState | null
): Promise<string | null> {
	if (!simplifyResult) return null;
	if (!navigator.clipboard) {
		return 'Clipboard access is unavailable in this browser.';
	}

	try {
		await navigator.clipboard.writeText(simplifyResult.payload.simplifiedSnippet);
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : 'Failed to copy text.';
	}
}

export function applyRewriteToParagraph(params: ApplyRewriteParams): {
	ok: boolean;
	error?: string;
	paragraphId?: string;
} {
	if (!params.simplifyResult) return { ok: false };

	const payload = params.simplifyResult.payload;
	const paragraphId = payload.evidence.paragraph_id;
	const paragraphElement = params.paragraphElementById.get(paragraphId);
	if (!paragraphElement) {
		return { ok: false, error: 'Could not find the paragraph to replace.' };
	}

	const paragraphTextElement = getParagraphTextElement(paragraphElement);
	const currentParagraphText = normalizeEditableText(paragraphTextElement.innerText ?? '');
	let bounds = normalizeBounds(
		payload.evidence.selection_start,
		payload.evidence.selection_end,
		currentParagraphText.length
	);

	const snapshotText = params.simplifyResult.paragraphTextSnapshot;
	if (snapshotText !== currentParagraphText) {
		const locatedStart = currentParagraphText.indexOf(payload.originalSnippet);
		if (locatedStart >= 0) {
			bounds = {
				start: locatedStart,
				end: locatedStart + payload.originalSnippet.length
			};
		} else {
			return {
				ok: false,
				error:
					'The paragraph changed after simplification. Please run Simplify again on the latest text.'
			};
		}
	}

	const replacement = preserveBoundaryWhitespace(
		payload.originalSnippet,
		payload.simplifiedSnippet
	);
	replaceParagraphTextRange(paragraphTextElement, bounds.start, bounds.end, replacement);
	paragraphTextElement.dispatchEvent(new Event('input', { bubbles: true }));
	paragraphTextElement.focus();

	return { ok: true, paragraphId };
}
