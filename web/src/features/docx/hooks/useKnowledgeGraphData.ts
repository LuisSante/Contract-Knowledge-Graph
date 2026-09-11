'use client';

import { useEffect, useState } from 'react';
import { fetchKnowledgeGraph, fetchPartyMergeHints } from '@/services/knowledge';
import type { KnowledgeGraph } from '@/types/knowledge';

export type KnowledgeGraphStatus = 'loading' | 'ready' | 'missing' | 'error';

export function useKnowledgeGraphData(docId: string, onReload: () => void) {
	const [kg, setKg] = useState<KnowledgeGraph | null>(null);
	const [status, setStatus] = useState<KnowledgeGraphStatus>('loading');
	const [mergeHints, setMergeHints] = useState<Record<string, string[]>>({});
	const [hintsLoading, setHintsLoading] = useState(false);

	useEffect(() => {
		if (!docId) return;
		let cancelled = false;
		onReload();

		const load = async () => {
			setStatus('loading');
			setKg(null);
			try {
				const graph = await fetchKnowledgeGraph(docId);
				if (cancelled) return;
				if (!graph) {
					setStatus('missing');
					return;
				}
				setKg(graph);
				setStatus('ready');
				setMergeHints({});
				setHintsLoading(true);
				fetchPartyMergeHints(docId)
					.then((hints) => {
						if (!cancelled) setMergeHints(hints.candidates);
					})
					.finally(() => {
						if (!cancelled) setHintsLoading(false);
					});
			} catch {
				if (!cancelled) setStatus('error');
			}
		};
		void load();

		return () => {
			cancelled = true;
		};
	}, [docId, onReload]);

	return { kg, status, mergeHints, hintsLoading };
}
