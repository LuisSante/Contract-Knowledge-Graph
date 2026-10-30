'use client';

import { useMemo, useState } from 'react';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import type { DeonticKind } from '@/types/knowledge';
import type { GridRow, Side } from '@/features/docx/utils/knowledge/statement-grid';

/**
 * «You are» and «Only against you». The reader's party is kept by id, so another pair forgets
 * it; nobody is picked at first, and the table reads as it always did until someone is. It lives
 * in the store, per document, so the Deadlines tab can start from the same party.
 */
export function useAgainstYou(
	docId: string,
	pairIds: Record<Side, string> | null,
	clauseRows: GridRow[],
	typeShown: DeonticKind,
	/** The picked clause, kept in the list even when it does not go against the reader. */
	activeId: string | null
) {
	const stored = useClauseAnalyzerStore((s) => s.me);
	const setMe = useClauseAnalyzerStore((s) => s.setMe);
	const meId = stored?.docId === docId ? stored.partyId : null;
	const me: Side | null = meId
		? meId === pairIds?.a
			? 'a'
			: meId === pairIds?.b
				? 'b'
				: null
		: null;
	const pickMe = (side: Side | null) => setMe(docId, side && pairIds ? pairIds[side] : null);

	// A clause goes against the reader, in the type shown, when the reader has more obligations
	// or prohibitions in it than the other party, or the other party holds more rights.
	const againstIds = useMemo(() => {
		if (!me) return null;
		const other: Side = me === 'a' ? 'b' : 'a';
		const shown = (row: GridRow, side: Side) =>
			row.marks[side].filter((mark) => mark.kind === typeShown).length;
		const burden = typeShown !== 'right';
		return new Set(
			clauseRows.flatMap((row) => {
				const mine = shown(row, me);
				const theirs = shown(row, other);
				return row.clauseId && (burden ? mine > theirs : theirs > mine) ? [row.clauseId] : [];
			})
		);
	}, [me, clauseRows, typeShown]);

	const [onlyAgainst, setOnlyAgainst] = useState(false);
	const filtering = onlyAgainst && againstIds !== null;
	// The picked clause stays: it is painted in the contract, and a painted clause with no row
	// would have nothing to close it.
	const tableRows = useMemo(
		() =>
			filtering && againstIds
				? clauseRows.filter(
						(row) => row.clauseId && (againstIds.has(row.clauseId) || row.clauseId === activeId)
					)
				: clauseRows,
		[filtering, againstIds, clauseRows, activeId]
	);

	return { me, pickMe, againstIds, onlyAgainst, setOnlyAgainst, filtering, tableRows };
}
