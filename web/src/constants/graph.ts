import type { ChangeLogState } from '@/types/document';

export const EMPTY_CHANGE_LOG: ChangeLogState = {
	hasChanges: false,
	oldSegments: [],
	newSegments: [],
};
