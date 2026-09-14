import type { KgNodeKind } from '@/types/knowledge';
import {
	KIND_COLORS as MARK_COLORS,
	KIND_LABEL as MARK_LABEL,
	PARTY_COLOR,
} from '@/features/docx/components/clause-analyzer/constants';

/** The clause analyzer's palette plus the two kinds it never draws as marks. */
export const NODE_COLORS: Record<KgNodeKind, string> = {
	...MARK_COLORS,
	party: PARTY_COLOR,
	clause: '#377eb8',
};

export const NODE_LABEL: Record<KgNodeKind, string> = {
	...MARK_LABEL,
	party: 'Party',
	clause: 'Clause',
};

export function formatShare(share: number): string {
	const pct = share * 100;
	if (pct >= 10) return `${Math.round(pct)}%`;
	if (pct >= 1) return `${pct.toFixed(1)}%`;
	return `${pct.toFixed(2)}%`;
}

export const MIN_RADIUS = 14;
export const MAX_RADIUS = 30;

export const DEFAULT_NODE_LIMIT = 40;
export const MIN_NODE_LIMIT = 10;
export const MAX_NODE_LIMIT = 150;

export function radiusOf(weight: number): number {
	return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.max(0, Math.min(1, weight));
}

/**
 * The PPR vector sums to 1, so every score is already a share of the whole walk. The
 * unit is stated once in the legend and the glyph carries digits only.
 */
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
