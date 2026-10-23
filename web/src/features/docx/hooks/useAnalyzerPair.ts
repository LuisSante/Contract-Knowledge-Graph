'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import type { KnowledgeGraph } from '@/types/knowledge';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import { defaultPair } from '@/features/docx/utils/knowledge/pair';

/** The pair compared lives in the URL, so a comparison can be shared or reloaded. */
export function useAnalyzerPair() {
	const params = useSearchParams();
	const pairRaw = params.get('pair')?.split(',') ?? [];
	const pair = pairRaw.length === 2 ? { a: pairRaw[0], b: pairRaw[1] } : null;

	const patch = useCallback((changes: Record<string, string | null>) => {
		const next = new URLSearchParams(window.location.search);
		for (const [key, value] of Object.entries(changes)) {
			if (value === null) next.delete(key);
			else next.set(key, value);
		}
		window.history.replaceState(null, '', `?${next.toString()}`);
	}, []);

	const setPair = useCallback(
		(ids: { a: string; b: string } | null) => patch({ pair: ids ? `${ids.a},${ids.b}` : null }),
		[patch]
	);

	return { pair, setPair };
}

/**
 * The Clause Analyzer's side of the pair in the URL, so a shared link opens on the same
 * comparison: it writes the pair compared, clears it when the comparison closes, and opens
 * the link's pair while nothing is compared yet.
 */
export function useAnalyzerPairSync(
	pairIds: { a: string; b: string } | null,
	viewKg: KnowledgeGraph | null
) {
	const focusNodeId = useClauseAnalyzerStore((s) => s.focusNodeId);
	const focusPair = useClauseAnalyzerStore((s) => s.focusPair);
	const { pair: urlPair, setPair } = useAnalyzerPair();
	const pairKey = pairIds ? `${pairIds.a},${pairIds.b}` : null;
	const hadPair = useRef(false);
	useEffect(() => {
		if (pairKey) {
			hadPair.current = true;
			const [a, b] = pairKey.split(',');
			setPair({ a, b });
		} else if (hadPair.current && focusNodeId === null) {
			hadPair.current = false;
			setPair(null);
		}
	}, [pairKey, focusNodeId, setPair]);
	const wantA = urlPair?.a ?? null;
	const wantB = urlPair?.b ?? null;
	useEffect(() => {
		if (!viewKg || focusNodeId || !wantA || !wantB) return;
		const known = (id: string) => viewKg.parties.some((p) => p.id === id);
		if (known(wantA) && known(wantB)) focusPair(wantA, wantB);
	}, [viewKg, focusNodeId, wantA, wantB, focusPair]);
}

/**
 * The pair another tab draws: the one chosen in the Clause Analyzer, else the one the link
 * carries if the analyzer has not been opened in this visit. With `suggest`, else the one the
 * analyzer's entry suggests, so the parties keep their colours before anyone compares.
 */
export function useComparedPair(viewKg: KnowledgeGraph | null, suggest = false) {
	const focusNodeId = useClauseAnalyzerStore((s) => s.focusNodeId);
	const secondPartyId = useClauseAnalyzerStore((s) => s.secondPartyId);
	const { pair } = useAnalyzerPair();
	const suggested = useMemo(
		() => (suggest && viewKg ? defaultPair(viewKg) : null),
		[suggest, viewKg]
	);
	return {
		aId: focusNodeId ?? pair?.a ?? suggested?.[0] ?? null,
		bId: focusNodeId ? secondPartyId : (pair?.b ?? suggested?.[1] ?? null),
	};
}
