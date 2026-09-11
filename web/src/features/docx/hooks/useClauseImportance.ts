'use client';

import { useEffect, useState } from 'react';
import { fetchClauseImportance, type ClauseImportance } from '@/services/knowledge';

/**
 * Structural weight per clause, from the backend. The prior is built only from the
 * statements on screen, so it refetches whenever the grid's filters change.
 */
export function useClauseImportance(docId: string, countedIds: Set<string>) {
	const [importance, setImportance] = useState<ClauseImportance | null>(null);

	useEffect(() => {
		if (!docId || countedIds.size === 0) return;
		const controller = new AbortController();
		void fetchClauseImportance(docId, [...countedIds], controller.signal).then((result) => {
			if (result) setImportance(result);
		});
		return () => controller.abort();
	}, [docId, countedIds]);

	return importance;
}
