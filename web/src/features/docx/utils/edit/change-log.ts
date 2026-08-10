import { diffWordsWithSpace } from 'diff';
import { EMPTY_CHANGE_LOG } from '@/constants/graph';
import type { ChangeLogState, TokenDiffSegment } from '@/types/document';
import { normalizeEditableText } from '@/features/docx/utils/docx-engine/dom';

export function buildChangeLog(committedText: string, currentText: string): ChangeLogState {
	const oldText = normalizeEditableText(committedText);
	const newText = normalizeEditableText(currentText);
	if (oldText === newText) return { ...EMPTY_CHANGE_LOG, oldSegments: [], newSegments: [] };

	const oldSegments: TokenDiffSegment[] = [];
	const newSegments: TokenDiffSegment[] = [];
	let hasChanges = false;

	for (const segment of diffWordsWithSpace(oldText, newText)) {
		if (segment.removed) {
			oldSegments.push({ value: segment.value, changed: true });
			hasChanges = true;
			continue;
		}

		if (segment.added) {
			newSegments.push({ value: segment.value, changed: true });
			hasChanges = true;
			continue;
		}

		oldSegments.push({ value: segment.value, changed: false });
		newSegments.push({ value: segment.value, changed: false });
	}

	return { hasChanges, oldSegments, newSegments };
}
