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
	return useImportance(docId, countedIds, null, true);
}

/**
 * The relevance read from one party: the walk between clauses starts only on the clauses that
 * hold one of `startIds`, that party's statements among the counted ones. Null while there
 * is no party to read from, and until its answer lands.
 */
export function usePartyImportance(
	docId: string,
	countedIds: readonly string[] | null,
	startIds: readonly string[] | null
) {
	const asked = countedIds !== null && startIds !== null && startIds.length > 0;
	return useImportance(docId, countedIds, startIds, asked);
}

function useImportance(
	docId: string,
	countedIds: readonly string[] | null,
	startIds: readonly string[] | null,
	asked: boolean
) {
	const [result, setResult] = useState<{ key: string; importance: ClauseImportance } | null>(null);
	const key = useMemo(
		() =>
			`${docId}|${countedIds ? countedIds.join(',') : '*'}|${startIds ? startIds.join(',') : '*'}`,
		[docId, countedIds, startIds]
	);

	useEffect(() => {
		if (!docId || !asked) return;
		if (countedIds !== null && countedIds.length === 0) return;
		const controller = new AbortController();
		void fetchClauseImportance(
			docId,
			countedIds && [...countedIds],
			startIds && [...startIds],
			controller.signal
		).then((importance) => {
			if (importance) setResult({ key, importance });
		});
		return () => controller.abort();
	}, [docId, countedIds, startIds, asked, key]);

	return asked && result?.key === key ? result.importance : null;
}
