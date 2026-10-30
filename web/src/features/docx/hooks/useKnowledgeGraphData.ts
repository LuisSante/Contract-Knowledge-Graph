'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchKnowledgeGraph } from '@/services/knowledge';
import type { KnowledgeGraph } from '@/types/knowledge';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import { applyPartyView } from '@/features/docx/utils/knowledge/party-view';

export type KnowledgeGraphStatus = 'loading' | 'ready' | 'missing' | 'error';

const noReload = () => {};

/**
 * The contract's graph, as fetched (`kg`) and as the parties are set up in the Clause
 * Analyzer (`viewKg`): merged parties drawn as one, hidden ones left out. Every tab reads
 * the same view. `retry` fetches it again after an error.
 */
export function useKnowledgeGraphData(docId: string, onReload: () => void = noReload) {
	const [kg, setKg] = useState<KnowledgeGraph | null>(null);
	const [status, setStatus] = useState<KnowledgeGraphStatus>('loading');
	const [attempt, setAttempt] = useState(0);
	const retry = useCallback(() => setAttempt((n) => n + 1), []);
	const mergeGroups = useClauseAnalyzerStore((s) => s.mergeGroups);
	const hiddenParties = useClauseAnalyzerStore((s) => s.hiddenParties);

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
			} catch {
				if (!cancelled) setStatus('error');
			}
		};
		void load();

		return () => {
			cancelled = true;
		};
	}, [docId, onReload, attempt]);

	const viewKg = useMemo(
		() => (kg ? applyPartyView(kg, mergeGroups, new Set(hiddenParties)) : null),
		[kg, mergeGroups, hiddenParties]
	);

	return { kg, viewKg, status, retry };
}
