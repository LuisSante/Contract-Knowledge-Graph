'use client';

import { useEffect, useState } from 'react';
import { fetchClauseImportance, type ClauseImportance } from '@/services/knowledge';

/**
 * `countedIds` restricts the restart prior to the statements on screen. Pass `null`
 * to count every statement — the document-wide reading, with no view filtering it.
 */
export function useClauseImportance(docId: string, countedIds: Set<string> | null) {
	const [importance, setImportance] = useState<ClauseImportance | null>(null);

	useEffect(() => {
		if (!docId) return;
		if (countedIds !== null && countedIds.size === 0) return;
		const controller = new AbortController();
		void fetchClauseImportance(docId, countedIds && [...countedIds], controller.signal).then(
			(result) => {
				if (result) setImportance(result);
			}
		);
		return () => controller.abort();
	}, [docId, countedIds]);

	return importance;
}
