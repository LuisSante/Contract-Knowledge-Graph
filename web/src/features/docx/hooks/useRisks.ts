'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { detectRisksWithAI, fetchSavedRisks } from '@/services/risks';
import type { ContractRisk, ContractRisks } from '@/types/risks';

/** Where the risks on screen come from: the saved answer (free) or the model, asked just now. */
export type RisksSource = 'saved' | 'ai';
export type RisksStatus = 'idle' | 'detecting' | 'error';

const NO_RISKS: ReadonlyMap<string, ContractRisk> = new Map();

/**
 * The risks the system's detector found in a contract. Nothing is shown until the reader asks,
 * and there are two ways to ask: «Free» shows the answer saved from the last time the model
 * reviewed the contract, «AI» asks the model now and costs a call per clause. Each new answer
 * takes the saved one's place, so «Free» always shows the latest.
 */
export function useRisks(docId: string) {
	// Each is kept with the document it belongs to, so another contract never shows it while
	// its own loads.
	const [saved, setSaved] = useState<{ docId: string; risks: ContractRisks | null } | null>(null);
	const [shown, setShown] = useState<{
		docId: string;
		source: RisksSource;
		risks: ContractRisks;
	} | null>(null);
	const [status, setStatus] = useState<RisksStatus>('idle');
	// An answer has just gone on screen, the model's or the saved one: the reader is told, until
	// the notice leaves (closed, or timed out) or the risks come off the screen. Each notice
	// gets a number no other one has, so the clock of one that already left never closes the
	// one that followed it.
	const [notice, setNotice] = useState<{ docId: string; id: number } | null>(null);
	const lastNoticeId = useRef(0);
	const announce = useCallback(() => {
		lastNoticeId.current += 1;
		setNotice({ docId, id: lastNoticeId.current });
	}, [docId]);

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
		if (current?.source === 'saved') {
			setShown(null);
			setNotice(null);
		} else if (savedRisks) {
			setShown({ docId, source: 'saved', risks: savedRisks });
			announce();
		}
	}, [docId, savedRisks, current, announce]);

	/** «AI»: asks the model now. Its answer is shown and becomes the saved one, the one «Free»
	 *  shows from then on. A request that fails leaves the saved answer as it was. */
	const detectWithAI = useCallback(async () => {
		if (!docId) return;
		setStatus('detecting');
		setNotice(null);
		try {
			const answer = await detectRisksWithAI(docId);
			if (answer) {
				setShown({ docId, source: 'ai', risks: answer });
				setSaved({ docId, risks: answer });
				announce();
			}
			setStatus('idle');
		} catch {
			setStatus('error');
		}
	}, [docId, announce]);

	/** Closes one notice, by its number: asked of one that is no longer there, it does nothing. */
	const closeNotice = useCallback(
		(id: number) => setNotice((was) => (was?.id === id ? null : was)),
		[]
	);

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
		/** There is a saved answer for «Free» to show. */
		hasSaved: savedRisks !== null,
		status,
		/** The number of the answer that has just gone on screen, while the reader is being told
		 *  of it; null once the notice has left. */
		noticeId: notice?.docId === docId && current ? notice.id : null,
		closeNotice,
		toggleSaved,
		detectWithAI,
	};
}
