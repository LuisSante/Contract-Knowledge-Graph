'use client';

import { useEffect, useState, type RefObject } from 'react';
import {
	computeEvidenceBridge,
	EMPTY_EVIDENCE_BRIDGE,
	sameEvidenceBridge,
	type EvidenceBridge,
} from '@/features/docx/utils/evidence/evidence-bridge';
import { attachShiftWheelCompression } from '@/features/docx/utils/docx-engine/shift-wheel-compression';
import type { Node as ParagraphNode, EvidenceParagraph } from '@/types/document';

const COMPRESS_DURATION_MS = 560;

const NODE_CLASSES = [
	'docx-paragraph-explanation-selected',
	'docx-paragraph-explanation-related',
	'docx-paragraph-explanation-source-hidden',
	'docx-paragraph-explanation-muted',
];

interface UseRelatedBridgeParams {
	active: boolean;
	renderEpoch: number;
	scrollHostRef: RefObject<HTMLElement | null>;
	paragraphElementById: Map<string, HTMLElement>;
	selectedParagraph: ParagraphNode | null;
	evidence: EvidenceParagraph[];
}

export function useEvidenceBridge({
	active,
	renderEpoch,
	scrollHostRef,
	paragraphElementById,
	selectedParagraph,
	evidence,
}: UseRelatedBridgeParams) {
	const [bridge, setBridge] = useState<EvidenceBridge>(EMPTY_EVIDENCE_BRIDGE);

	const clearNodeClasses = () => {
		for (const element of paragraphElementById.values()) {
			element.classList.remove(...NODE_CLASSES);
		}
	};

	/** The classes each paragraph should carry for this state: the selected one, the linked
	 *  ones (hidden at their place once moved), and the rest muted while they are moved. */
	const nodeClassesFor = (movedNodeIds: Set<string>, compression: number) => {
		const classesById = new Map<string, string[]>();
		if (!selectedParagraph?.id) return classesById;
		const shouldMute = compression > 0.02 && movedNodeIds.size > 0;
		if (shouldMute) {
			for (const id of paragraphElementById.keys()) {
				classesById.set(id, ['docx-paragraph-explanation-muted']);
			}
		}
		for (const item of evidence) {
			const classes = ['docx-paragraph-explanation-related'];
			if (compression > 0.02 && movedNodeIds.has(item.node.id)) {
				classes.push('docx-paragraph-explanation-source-hidden');
			}
			classesById.set(item.node.id, classes);
		}
		const selectedClasses = classesById.get(selectedParagraph.id) ?? [];
		classesById.set(selectedParagraph.id, [
			...selectedClasses.filter((name) => name !== 'docx-paragraph-explanation-muted'),
			'docx-paragraph-explanation-selected',
		]);
		return classesById;
	};

	// Runs every frame while scrolling: touch only the classes that change.
	const applyNodeClasses = (movedNodeIds: Set<string>, compression: number) => {
		const classesById = nodeClassesFor(movedNodeIds, compression);
		for (const [id, element] of paragraphElementById) {
			const wanted = classesById.get(id);
			for (const name of NODE_CLASSES) {
				const want = wanted?.includes(name) ?? false;
				if (element.classList.contains(name) !== want) element.classList.toggle(name, want);
			}
		}
	};

	useEffect(() => {
		const host = scrollHostRef.current;
		if (!active || !host || renderEpoch === 0 || !selectedParagraph) {
			setBridge(EMPTY_EVIDENCE_BRIDGE);
			clearNodeClasses();
			return;
		}

		let lastBridge: EvidenceBridge | null = null;
		const refresh = (compression: number) => {
			const currentHost = scrollHostRef.current;
			if (!currentHost || !selectedParagraph) return;
			const result = computeEvidenceBridge({
				scrollHost: currentHost,
				paragraphElementById,
				selectedParagraph,
				evidence,
				compression,
			});
			applyNodeClasses(result.movedNodeIds, compression);
			if (lastBridge && sameEvidenceBridge(lastBridge, result)) return;
			lastBridge = result;
			setBridge(result);
		};

		const cleanup = attachShiftWheelCompression({
			host,
			durationMs: COMPRESS_DURATION_MS,
			refresh,
		});

		return () => {
			cleanup();
			clearNodeClasses();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [active, renderEpoch, scrollHostRef, paragraphElementById, selectedParagraph, evidence]);

	return bridge;
}
