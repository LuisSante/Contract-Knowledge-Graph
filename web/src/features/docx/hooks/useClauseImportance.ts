'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchClauseImportance, type ClauseImportance } from '@/services/knowledge';

/**
 * `countedIds` restricts the restart prior to the statements on screen. Pass `null`
 * to count every statement — the document-wide reading, with no view filtering it.
 * Null until the answer for these statements lands: an answer for other ones (another
 * pair, or the whole document) is never handed out as this one.
 */
export function useClauseImportance(docId: string, countedIds: readonly string[] | null) {
	const [result, setResult] = useState<{ key: string; importance: ClauseImportance } | null>(null);
	const key = useMemo(
		() => `${docId}|${countedIds ? countedIds.join(',') : '*'}`,
		[docId, countedIds]
	);

	useEffect(() => {
		if (!docId) return;
		if (countedIds !== null && countedIds.length === 0) return;
		const controller = new AbortController();
		void fetchClauseImportance(docId, countedIds && [...countedIds], controller.signal).then(
			(importance) => {
				if (importance) setResult({ key, importance });
			}
		);
		return () => controller.abort();
	}, [docId, countedIds, key]);

	return result?.key === key ? result.importance : null;
}
