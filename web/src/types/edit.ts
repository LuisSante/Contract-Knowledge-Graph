export type TokenDiffSegment = {
	value: string;
	changed: boolean;
};

export type ChangeLogState = {
	hasChanges: boolean;
	oldSegments: TokenDiffSegment[];
	newSegments: TokenDiffSegment[];
};

export type ParagraphEditState = {
	committed: string;
	current: string;
	editedSinceCommit: boolean;
};
