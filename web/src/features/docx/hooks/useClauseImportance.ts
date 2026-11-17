'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchClauseImportance, type ClauseImportance } from '@/services/knowledge';

/**
 * The contract with no party picked: the clauses that need each row, and the walk over the
 * whole graph. It carries no relevance, which is one party's (`usePartyImportance`).
 * `countedIds` restricts the rows, and that walk's restart, to the statements on screen. Pass
 * `null` to count every statement — the document-wide reading, with no view filtering it.
 * Null until the answer for these statements lands: an answer for other ones (another
 * pair, or the whole document) is never handed out as this one.
 */
export function useClauseImportance(docId: string, countedIds: readonly string[] | null) {
	return useImportance(docId, countedIds, null, true).importance;
}

/**
 * The relevance read from one party: the walk between clauses starts only on the clauses that
 * hold one of `startIds`, that party's statements among the counted ones. `importance` is null
 * while there is no party to read from, and until its answer lands; `pending` says the answer
 * is on its way, so a null with no `pending` means there is none to be had (the party holds no
 * statement, or the request failed).
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
	// A null importance is an answer too: the request for these statements failed.
	const [result, setResult] = useState<{
		key: string;
		importance: ClauseImportance | null;
	} | null>(null);
	const key = useMemo(
		() =>
			`${docId}|${countedIds ? countedIds.join(',') : '*'}|${startIds ? startIds.join(',') : '*'}`,
		[docId, countedIds, startIds]
	);
	const sent = Boolean(docId) && asked && (countedIds === null || countedIds.length > 0);

	useEffect(() => {
		if (!sent) return;
		const controller = new AbortController();
		void fetchClauseImportance(
			docId,
			countedIds && [...countedIds],
			startIds && [...startIds],
			controller.signal
		).then((importance) => {
			// A request dropped for another one is no answer at all.
			if (controller.signal.aborted) return;
			// A failure never takes the place of an answer already here for the same statements.
			setResult((held) => (importance || held?.key !== key ? { key, importance } : held));
		});
		return () => controller.abort();
	}, [docId, countedIds, startIds, sent, key]);

	const answered = sent && result?.key === key;
	return {
		importance: answered ? (result?.importance ?? null) : null,
		pending: sent && !answered,
	};
}
