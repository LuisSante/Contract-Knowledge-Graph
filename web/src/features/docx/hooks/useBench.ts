'use client';

import { useEffect, useState } from 'react';
import { fetchBench } from '@/services/knowledge';
import type { Bench } from '@/features/docx/utils/knowledge/benchmark';

export function useBench(docId: string, enabled: boolean) {
	const [bench, setBench] = useState<{ docId: string; data: Bench | null } | null>(null);

	useEffect(() => {
		if (!docId || !enabled || bench?.docId === docId) return;
		const controller = new AbortController();
		void fetchBench(docId, controller.signal).then((data) => {
			if (!controller.signal.aborted) setBench({ docId, data });
		});
		return () => controller.abort();
	}, [docId, enabled, bench?.docId]);

	const ready = bench?.docId === docId;
	return { bench: ready ? bench.data : null, loading: enabled && !ready };
}
