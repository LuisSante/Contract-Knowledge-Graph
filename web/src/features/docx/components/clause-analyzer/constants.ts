import type { KgNodeKind } from '@/types/knowledge';
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

// --- graph section ---

export const NODE_COLORS: Record<KgNodeKind, string> = {
	...KIND_COLORS,
	party: PARTY_COLOR,
	clause: '#377eb8',
};

export const NODE_LABEL: Record<KgNodeKind, string> = {
	...KIND_LABEL,
	party: 'Party',
	clause: 'Clause',
};

export const MIN_RADIUS = 14;
export const MAX_RADIUS = 30;

export const DEFAULT_NODE_LIMIT = 40;
export const MIN_NODE_LIMIT = 10;
export const MAX_NODE_LIMIT = 150;

export function radiusOf(weight: number): number {
	return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.max(0, Math.min(1, weight));
}

/** The PPR vector sums to 1, so every score is already a share of the whole walk. */
export function formatMass(value: number): string {
	const pct = value * 100;
	if (pct >= 1) return pct.toFixed(1);
	if (pct >= 0.01) return pct.toFixed(2);
	return pct > 0 ? '·' : '0';
}

/** Signed, in the same points as `formatMass` — what propagation added or drained. */
export function formatGain(value: number): string {
	const pct = value * 100;
	const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
	const magnitude = Math.abs(pct);
	if (magnitude >= 1) return `${sign}${magnitude.toFixed(1)}`;
	if (magnitude >= 0.01) return `${sign}${magnitude.toFixed(2)}`;
	return '0';
}
