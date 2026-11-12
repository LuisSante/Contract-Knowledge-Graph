'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { detectRisksWithAI, fetchSavedRisks } from '@/services/risks';
import type { ContractRisk, ContractRisks } from '@/types/risks';

/** Where the risks on screen come from: the saved answer (free) or the model, asked just now. */
export type RisksSource = 'saved' | 'ai';
export type RisksStatus = 'idle' | 'detecting' | 'error';

const NO_RISKS: ReadonlyMap<string, ContractRisk> = new Map();

/**
 * The risks the system's detector found in a contract. Nothing is shown until the reader asks,
 * and there are two ways to ask: «Free» shows the answer saved from the first time the model
 * reviewed the contract, «AI» asks the model now and costs a call per clause. The server keeps
 * only that first answer, so «Free» always shows the same one.
 */
export function useRisks(docId: string) {
	// Each is kept with the document it belongs to, so another contract never shows it while
	// its own loads.
	const [saved, setSaved] = useState<{ docId: string; risks: ContractRisks | null } | null>(null);
	const [shown, setShown] = useState<{
		docId: string;
		source: RisksSource;
		risks: ContractRisks;
		/** An answer from the model that the server did not keep, because an earlier one stays. */
		unsaved: boolean;
	} | null>(null);
	const [status, setStatus] = useState<RisksStatus>('idle');

	// Reading what is saved costs nothing, so it is known up front: it decides whether «Free»
	// has anything to show. It is not put on screen until the reader asks.
	useEffect(() => {
		if (!docId) return;
		let cancelled = false;
		void fetchSavedRisks(docId)
			.then((risks) => {
				if (!cancelled) setSaved({ docId, risks });
			})
			.catch(() => {
				if (!cancelled) setSaved({ docId, risks: null });
			});
		return () => {
			cancelled = true;
		};
	}, [docId]);

	const savedRisks = saved?.docId === docId ? saved.risks : null;
	const current = shown?.docId === docId ? shown : null;

	/** «Free»: the saved answer goes on screen, or comes off it when it is already there. */
	const toggleSaved = useCallback(() => {
		setStatus('idle');
		setShown((now) =>
			now?.docId === docId && now.source === 'saved'
				? null
				: savedRisks
					? { docId, source: 'saved', risks: savedRisks, unsaved: false }
					: now
		);
	}, [docId, savedRisks]);

	/** «AI»: asks the model now. Its answer is shown; the server keeps it only if it is the
	 *  contract's first. */
	const detectWithAI = useCallback(async () => {
		if (!docId) return;
		setStatus('detecting');
		try {
			const result = await detectRisksWithAI(docId);
			if (result.risks) {
				setShown({ docId, source: 'ai', risks: result.risks, unsaved: !result.saved });
				if (result.saved) setSaved({ docId, risks: result.risks });
			}
			setStatus('idle');
		} catch {
			setStatus('error');
		}
	}, [docId]);

	const risks = current?.risks ?? null;
	/** Each risky statement's type and reason, by statement id. */
	const byStatement = useMemo(
		() =>
			risks && risks.risks.length > 0
				? new Map(risks.risks.map((risk) => [risk.statementId, risk] as const))
				: NO_RISKS,
		[risks]
	);

	return {
		risks,
		byStatement,
		/** What is on screen: null until the reader asks. */
		source: current?.source ?? null,
		/** The answer on screen came from the model and was not kept. */
		unsaved: current?.unsaved ?? false,
		/** There is a saved answer for «Free» to show. */
		hasSaved: savedRisks !== null,
		status,
		toggleSaved,
		detectWithAI,
	};
}
