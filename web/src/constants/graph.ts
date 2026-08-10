import type { ChangeLogState } from '@/types/document';

export const EMPTY_CHANGE_LOG: ChangeLogState = {
    hasChanges: false,
    oldSegments: [],
    newSegments: []
};

export const MAX_RELATED_PARAGRAPHS = 0;
