'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchContractSummary, generateContractSummary } from '@/services/summary';
import type { ContractSummary } from '@/types/summary';

export type ContractSummaryStatus = 'loading' | 'ready' | 'missing' | 'generating' | 'error';

export function useContractSummary(docId: string) {
	const [summary, setSummary] = useState<ContractSummary | null>(null);
	const [status, setStatus] = useState<ContractSummaryStatus>('loading');

	useEffect(() => {
		if (!docId) return;
		let cancelled = false;

		const load = async () => {
			setStatus('loading');
			setSummary(null);
			try {
				const result = await fetchContractSummary(docId);
				if (cancelled) return;
				setSummary(result);
				setStatus(result ? 'ready' : 'missing');
			} catch {
				if (!cancelled) setStatus('error');
			}
		};
		void load();

		return () => {
			cancelled = true;
		};
	}, [docId]);

	/** `force` is what the regenerate button sends; without it the server replays the cached one. */
	const generate = useCallback(
		async (force = false) => {
			if (!docId) return;
			setStatus('generating');
			try {
				const result = await generateContractSummary(docId, force);
				setSummary(result);
				setStatus(result ? 'ready' : 'missing');
			} catch {
				setStatus('error');
			}
		},
		[docId]
	);

	return { summary, status, generate };
}
