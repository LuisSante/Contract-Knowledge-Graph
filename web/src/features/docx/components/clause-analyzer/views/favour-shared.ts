'use client';

import { short } from '@/features/docx/components/clause-analyzer/views/bits';
import {
	DEONTIC_KINDS,
	type ClauseTally,
	type Served,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind } from '@/types/knowledge';

/** A clause's statements that belong to one party in the types shown: the obligations and
 *  prohibitions that bind it and the rights it holds, a type at a time. */
export const ownedBy = (t: ClauseTally, side: Side, kinds: DeonticKind[]): Served[] =>
	t.served
		.filter((s) => {
			const owner = s.kind === 'right' ? s.to : s.by;
			return kinds.includes(s.kind) && (owner === side || owner === 'both');
		})
		.sort((x, y) => DEONTIC_KINDS.indexOf(x.kind) - DEONTIC_KINDS.indexOf(y.kind));

/**
 * Whose statement a party gets: its own right, or the other party's obligation or prohibition,
 * which that party has to honour. The titles are worded from whoever acts ("Bear audit
 * expense"), so without this "What National gets: Bear audit expense" reads as National paying.
 */
export function originOf(
	s: Served,
	names: Record<Side, string>
): { text: string; side: Side | null } {
	const side = s.kind === 'right' ? s.to : s.by;
	const shared = side !== 'a' && side !== 'b';
	// The column it sits in already says in whose favour it is; the tag says whose it is.
	if (shared) return { text: `Both parties’ ${s.kind}`, side: null };
	return { text: `${short(names[side])}'s ${s.kind}`, side };
}
