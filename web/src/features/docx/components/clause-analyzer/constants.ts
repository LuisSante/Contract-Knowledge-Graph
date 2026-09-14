import type { MarkKind } from '@/features/docx/utils/knowledge/statement-grid';

export const PARTY_COLOR = '#984ea3';
export const PAIR_SECOND_COLOR = '#0d9488';

export const KIND_COLORS: Record<MarkKind, string> = {
	obligation: '#e41a1c',
	right: '#4daf4a',
	prohibition: '#ff7f00',
	definedTerm: '#a65628',
	condition: '#f781bf',
	value: '#d4a017',
	reference: '#999999',
};

export const KIND_LABEL: Record<MarkKind, string> = {
	obligation: 'Obligation',
	right: 'Right',
	prohibition: 'Prohibition',
	definedTerm: 'Defined term',
	condition: 'Condition',
	value: 'Value',
	reference: 'Reference',
};

export const LANE_COLUMNS = 10;
export const MARK_SIZE = 14;
export const MARK_GAP = 4;
export const LANE_WIDTH = LANE_COLUMNS * MARK_SIZE + (LANE_COLUMNS - 1) * MARK_GAP;
export const LABEL_WIDTH = 176;

export const ROW_PAGE = 10;

export const MUTED_LANE_OPACITY = 0.22;
