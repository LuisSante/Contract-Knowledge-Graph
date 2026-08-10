import { normalizeEditableText } from './dom';
import type { ParagraphEditState } from './types';

/**
 * Ensures an edit-state entry for a paragraph (idempotent).
 * Engine model helper: operates on the map injected by the consumer.
 */
export function ensureNodeEditState(
	nodeEditStateById: Map<string, ParagraphEditState>,
	nodeId: string,
	fallbackText: string
): ParagraphEditState {
	const normalizedFallback = normalizeEditableText(fallbackText ?? '');
	const existing = nodeEditStateById.get(nodeId);
	if (existing) return existing;

	const state: ParagraphEditState = {
		committed: normalizedFallback,
		current: normalizedFallback,
		editedSinceCommit: false
	};
	nodeEditStateById.set(nodeId, state);
	return state;
}
