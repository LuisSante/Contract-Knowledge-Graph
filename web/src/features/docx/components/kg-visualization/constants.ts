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

export const MIN_RADIUS = 14;
export const MAX_RADIUS = 30;

export const DEFAULT_NODE_LIMIT = 40;
export const MIN_NODE_LIMIT = 10;
export const MAX_NODE_LIMIT = 150;

export function radiusOf(weight: number): number {
	return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(Math.max(0, Math.min(1, weight)));
}

/**
 * Raw PPR runs from ~0.15 at the seed down past 1e-4, so a fixed precision either
 * clips the tail to "0.000" or pads the head with noise.
 */
export function formatPpr(score: number): string {
	if (score <= 0) return '0';
	if (score >= 0.0005) return score.toFixed(3).replace(/^0/, '');
	return score.toExponential(0).replace('e-', 'e−');
}

export function formatShare(share: number): string {
	const pct = share * 100;
	if (pct >= 10) return `${Math.round(pct)}%`;
	if (pct >= 1) return `${pct.toFixed(1)}%`;
	return `${pct.toFixed(2)}%`;
}

/** The unit is stated once in the legend, so the glyph carries digits only. */
export function formatShareCompact(share: number): string {
	const pct = share * 100;
	if (pct >= 10) return String(Math.round(pct));
	if (pct >= 1) return pct.toFixed(1);
	return pct.toFixed(2).replace(/^0/, '');
}
