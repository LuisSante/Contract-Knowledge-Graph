'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

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
