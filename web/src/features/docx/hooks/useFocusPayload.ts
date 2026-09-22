'use client';

import { useEffect } from 'react';
import type { Node as ParagraphNode } from '@/types/document';
import type { KnowledgeGraph } from '@/types/knowledge';
import type { DeonticSeverity } from '@/features/docx/utils/knowledge/party-ledger';
import type { PairScores } from '@/features/docx/utils/knowledge/pair';
import type { GridLane, GridRow } from '@/features/docx/utils/knowledge/statement-grid';
import { buildFocusPayload, buildPairPayload } from '@/features/docx/utils/knowledge/graph-payload';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';

interface FocusPayloadInput {
	kg: KnowledgeGraph | null;
	focusNodeId: string | null;
	pair: PairScores | null;
	activeClause: GridRow | null;
	laneByStatement: Map<string, GridLane>;
	lanes: GridLane[];
	paintLanes: Record<GridLane, boolean>;
	showShared: boolean;
	nodesById: Map<string, ParagraphNode>;
	laneColors: [string, string];
	hops: number;
	topK: number;
	severity: DeonticSeverity;
	importanceByNode: Record<string, number> | null;
}

export function useFocusPayload({
	kg,
	focusNodeId,
	pair,
	activeClause,
	laneByStatement,
	lanes,
	paintLanes,
	showShared,
	nodesById,
	laneColors,
	hops,
	topK,
	severity,
	importanceByNode,
}: FocusPayloadInput) {
	const setPayload = useClauseAnalyzerStore((s) => s.setPayload);

	useEffect(() => {
		if (!kg || !focusNodeId) return;
		const clauseStatements = activeClause
			? [...activeClause.marks.a, ...activeClause.marks.b, ...activeClause.marks.shared].map(
					(mark) => mark.id
				)
			: null;
		const allLanesOn = lanes.every((lane) => paintLanes[lane]) && showShared;
		const statementIds =
			allLanesOn || !pair
				? (clauseStatements ?? undefined)
				: (clauseStatements ?? [...new Set([...pair.topA, ...pair.topB])]).filter((id) => {
						const lane = laneByStatement.get(id);
						return lane ? lanes.includes(lane) && paintLanes[lane] : true;
					});
		setPayload(
			pair
				? buildPairPayload(kg, pair, nodesById, laneColors, statementIds)
				: buildFocusPayload(
						kg,
						activeClause?.clauseId ?? focusNodeId,
						activeClause ? 1 : hops,
						topK,
						nodesById,
						severity,
						importanceByNode
					)
		);
	}, [
		kg,
		pair,
		focusNodeId,
		activeClause,
		paintLanes,
		lanes,
		showShared,
		laneByStatement,
		nodesById,
		laneColors,
		hops,
		topK,
		severity,
		importanceByNode,
		setPayload,
	]);
}
