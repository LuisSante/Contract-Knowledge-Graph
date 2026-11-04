'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchRedFlags } from '@/services/red-flags';
import { detect, type FlagMatch } from '@/features/docx/utils/knowledge/red-flags';
import type { KnowledgeGraph } from '@/types/knowledge';
import type { RedFlag } from '@/types/red-flags';

// One request per contract, shared by every view that asks: the analyzer and the graph tab.
const requests = new Map<string, Promise<RedFlag[]>>();

function loadFlags(docId: string): Promise<RedFlag[]> {
	let request = requests.get(docId);
	if (!request) {
		request = fetchRedFlags(docId).catch(() => {
			requests.delete(docId);
			return [];
		});
		requests.set(docId, request);
	}
	return request;
}

export interface RedFlagsOfDocument {
	flags: RedFlag[];
	/** Each flag's match, in the flags' order; empty until the graph is loaded. */
	matches: FlagMatch[];
	/** Statements some flag matched: their squares get the black outline. */
	statementIds: ReadonlySet<string>;
	/** Conditions some flag matched, when it was found as one. */
	conditionIds: ReadonlySet<string>;
}

const NONE: RedFlagsOfDocument = {
	flags: [],
	matches: [],
	statementIds: new Set(),
	conditionIds: new Set(),
};

/** The dataset's red flags for a contract and where the graph holds each one. Most contracts
 *  are not in the dataset: they get none. */
export function useRedFlags(docId: string, kg: KnowledgeGraph | null): RedFlagsOfDocument {
	// Kept with the document they belong to, so another contract never shows them while it loads.
	const [loaded, setLoaded] = useState<{ docId: string; flags: RedFlag[] } | null>(null);

	useEffect(() => {
		if (!docId) return;
		let cancelled = false;
		void loadFlags(docId).then((flags) => {
			if (!cancelled) setLoaded({ docId, flags });
		});
		return () => {
			cancelled = true;
		};
	}, [docId]);

	return useMemo(() => {
		const flags = loaded?.docId === docId ? loaded.flags : [];
		if (!kg || flags.length === 0) return flags.length === 0 ? NONE : { ...NONE, flags };
		const matches = flags.map((flag) => detect(kg, flag));
		return {
			flags,
			matches,
			statementIds: new Set(matches.flatMap((m) => m.statementIds)),
			conditionIds: new Set(matches.flatMap((m) => m.conditionIds)),
		};
	}, [loaded, docId, kg]);
}
