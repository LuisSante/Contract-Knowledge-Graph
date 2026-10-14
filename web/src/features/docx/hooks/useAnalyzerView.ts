'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

export const VIEWS = [
	{ id: 'table', label: 'Table' },
	// Meant to replace Table; both stay while Table serves as the reference.
	{ id: 'bytype', label: 'Table v2' },
] as const;

export type View = (typeof VIEWS)[number]['id'];

const isView = (value: string | null): value is View => VIEWS.some((v) => v.id === value);

/** Everything the reader navigates lives in the URL, so a view can be shared or reloaded. */
export function useAnalyzerView() {
	const params = useSearchParams();
	const raw = params.get('view');
	const view: View = isView(raw) ? raw : 'table';
	const pairRaw = params.get('pair')?.split(',') ?? [];
	const pair = pairRaw.length === 2 ? { a: pairRaw[0], b: pairRaw[1] } : null;

	const patch = useCallback((changes: Record<string, string | null>, push: boolean) => {
		const next = new URLSearchParams(window.location.search);
		for (const [key, value] of Object.entries(changes)) {
			if (value === null) next.delete(key);
			else next.set(key, value);
		}
		const url = `?${next.toString()}`;
		if (push) window.history.pushState(null, '', url);
		else window.history.replaceState(null, '', url);
	}, []);

	const setView = useCallback((next: View) => patch({ view: next }, true), [patch]);
	const setPair = useCallback(
		(ids: { a: string; b: string } | null) =>
			patch({ pair: ids ? `${ids.a},${ids.b}` : null }, false),
		[patch]
	);

	return { view, pair, setView, setPair };
}
