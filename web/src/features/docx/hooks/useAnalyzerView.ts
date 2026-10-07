'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Side } from '@/features/docx/utils/knowledge/statement-grid';

export const VIEWS = [
	{ id: 'table', label: 'Table' },
	{ id: 'scenarios', label: 'What if…' },
	// Prototypes to compare side by side; they go one by one as they are ruled out.
	{ id: 'diff', label: 'C2 · Diff' },
	{ id: 'events', label: 'C3 · Events' },
	{ id: 'lanes', label: 'P1 · Lanes' },
	{ id: 'bytype', label: 'P2 · By type' },
	{ id: 'balance', label: 'P3 · Balance' },
	{ id: 'verdict', label: 'P4 · Verdict' },
] as const;

export type View = (typeof VIEWS)[number]['id'];

const isView = (value: string | null): value is View => VIEWS.some((v) => v.id === value);

/** Everything the reader navigates lives in the URL, so a view can be shared or reloaded. */
export function useAnalyzerView() {
	const params = useSearchParams();
	const raw = params.get('view');
	const view: View = isView(raw) ? raw : 'table';
	const row = params.get('row');
	const reader: Side = params.get('as') === 'b' ? 'b' : 'a';
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

	const setView = useCallback((next: View) => patch({ view: next, row: null }, true), [patch]);
	const setRow = useCallback((id: string | null) => patch({ row: id }, true), [patch]);
	const setReader = useCallback((side: Side) => patch({ as: side }, false), [patch]);
	const setPair = useCallback(
		(ids: { a: string; b: string } | null) =>
			patch({ pair: ids ? `${ids.a},${ids.b}` : null }, false),
		[patch]
	);

	return { view, row, reader, pair, setView, setRow, setReader, setPair };
}
