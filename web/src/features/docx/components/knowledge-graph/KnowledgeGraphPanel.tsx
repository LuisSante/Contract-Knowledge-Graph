'use client';

import { useMemo, useState } from 'react';
import type { KgNodeKind } from '@/types/knowledge';
import { useDocumentStore } from '@/stores/document';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import { Checkbox } from '@/components/ui/checkbox';
import { useKnowledgeGraphData } from '@/features/docx/hooks/useKnowledgeGraphData';
import { useClauseImportance } from '@/features/docx/hooks/useClauseImportance';
import { applyPartyView } from '@/features/docx/utils/knowledge/party-view';
import { buildKgViz, KG_NODE_KINDS } from '@/features/docx/utils/knowledge/kg-graph';
import { clauseNeighbourhood, clauseRowIds } from '@/features/docx/utils/knowledge/clause-subgraph';
import { buildStatementGrid, GRID_LANES } from '@/features/docx/utils/knowledge/statement-grid';
import { useAnalyzerView } from '@/features/docx/hooks/useAnalyzerView';
import { buildDocumentTarget } from '@/features/docx/utils/knowledge/graph-payload';
import { GraphCanvas } from '@/features/docx/components/clause-analyzer/graph/GraphCanvas';
import { SelectedRow } from '@/features/docx/components/knowledge-graph/SelectedRow';
import {
	NEUTRAL_COLOR,
	NODE_COLORS,
	NODE_LABEL,
	PAIR_SECOND_COLOR,
	PARTY_COLOR,
} from '@/features/docx/components/clause-analyzer/constants';
import type { KgVizNode } from '@/features/docx/utils/knowledge/kg-graph';

const ALL_KINDS = new Set<KgNodeKind>(KG_NODE_KINDS);
const noReset = () => {};

/**
 * The whole knowledge graph, every node and edge, sized by PageRank over every
 * statement. The Clause Analyzer's graph is a cut of this one: the top N of what the
 * table shows.
 */
export function KnowledgeGraphPanel({ docId }: { docId: string }) {
	const [showLabels, setShowLabels] = useState(false);
	const [byParty, setByParty] = useState(false);
	const selectedClause = useClauseAnalyzerStore((s) => s.selectedClause);
	const selectClause = useClauseAnalyzerStore((s) => s.selectClause);
	const selectedClauseId = selectedClause?.docId === docId ? selectedClause.clauseId : null;
	const mergeGroups = useClauseAnalyzerStore((s) => s.mergeGroups);
	const hiddenParties = useClauseAnalyzerStore((s) => s.hiddenParties);
	const setDocumentTarget = useClauseAnalyzerStore((s) => s.setDocumentTarget);
	const focusNodeId = useClauseAnalyzerStore((s) => s.focusNodeId);
	const secondPartyId = useClauseAnalyzerStore((s) => s.secondPartyId);
	// The pair chosen in the Clause Analyzer, or the one the link carries if the analyzer
	// has not been opened in this visit.
	const { pair } = useAnalyzerView();
	const aId = focusNodeId ?? pair?.a ?? null;
	const bId = focusNodeId ? secondPartyId : (pair?.b ?? null);
	const paragraphs = useDocumentStore((s) => s.paragraphs);
	const nodesById = useMemo(() => new Map(paragraphs.map((n) => [n.id, n])), [paragraphs]);

	const { kg, status } = useKnowledgeGraphData(docId, noReset);
	const viewKg = useMemo(
		() => (kg ? applyPartyView(kg, mergeGroups, new Set(hiddenParties)) : null),
		[kg, mergeGroups, hiddenParties]
	);
	// null counts every statement: the document-wide reading, with no view filtering it.
	const importance = useClauseImportance(docId, null);

	const grid = useMemo(
		() => (viewKg && aId ? buildStatementGrid(viewKg, aId, bId) : null),
		[viewKg, aId, bId]
	);
	// Each node in the colour of the Table column it is drawn in: a statement in its
	// owner's lane, a qualifier in the lane of what it qualifies. The clause keeps its own.
	const colorOf = useMemo(() => {
		if (!byParty || !grid) return undefined;
		const laneColor = { a: PARTY_COLOR, b: PAIR_SECOND_COLOR, shared: NEUTRAL_COLOR };
		const byId = new Map<string, string>();
		if (aId) byId.set(aId, PARTY_COLOR);
		if (bId) byId.set(bId, PAIR_SECOND_COLOR);
		for (const row of grid.rows)
			for (const lane of GRID_LANES)
				for (const mark of row.marks[lane]) byId.set(mark.id, laneColor[lane]);
		return (node: KgVizNode) =>
			node.kind === 'clause' ? NODE_COLORS.clause : (byId.get(node.id) ?? NEUTRAL_COLOR);
	}, [byParty, grid, aId, bId]);

	// A selected clause lights what its row in the Table shows, and the two parties.
	// With no pair chosen there is no row, so it lights the clause's neighbourhood.
	const highlightIds = useMemo(() => {
		if (!viewKg || !selectedClauseId) return null;
		return grid
			? clauseRowIds(grid, selectedClauseId, [aId, bId])
			: clauseNeighbourhood(viewKg, selectedClauseId);
	}, [viewKg, grid, selectedClauseId, aId, bId]);
	const graph = useMemo(
		() =>
			viewKg && importance
				? buildKgViz(
						viewKg,
						importance.byNode,
						importance.priorByNode,
						Number.POSITIVE_INFINITY,
						ALL_KINDS,
						null
					)
				: null,
		[viewKg, importance]
	);

	const nameOf = (id: string | null) =>
		(id && viewKg?.parties.find((p) => p.id === id)?.name) || 'Party';
	const openInDocument = (nodeId: string) => {
		if (viewKg) setDocumentTarget(buildDocumentTarget(viewKg, nodeId, nodesById));
	};

	if (status === 'missing' || status === 'error' || !graph) {
		return (
			<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
				{status === 'missing'
					? 'No knowledge graph generated for this document yet.'
					: status === 'error'
						? 'Failed to load the knowledge graph.'
						: 'Loading the knowledge graph…'}
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-1.5 text-2xs text-muted-foreground">
				<label className="flex cursor-pointer items-center gap-1.5">
					<Checkbox
						checked={showLabels}
						onCheckedChange={(value) => setShowLabels(value === true)}
						className="size-3.5 shrink-0"
						aria-label="Show node labels"
					/>
					<span>Labels</span>
				</label>
				{/* <span className="tabular-nums">
					{graph.nodes.length} nodes {graph.edges.length} edges
				</span> */}
				<span className="ml-auto flex flex-wrap items-center gap-x-2.5 gap-y-1">
					{KG_NODE_KINDS.filter((kind) => graph.countByKind[kind] > 0).map((kind) => (
						<span key={kind} className="inline-flex items-center gap-1">
							<span
								className="size-2 rounded-full"
								style={{ backgroundColor: NODE_COLORS[kind] }}
							/>
							{NODE_LABEL[kind]}
							<span className="tabular-nums opacity-70">{graph.countByKind[kind]}</span>
						</span>
					))}
				</span>
			</div>
			<GraphCanvas
				graph={graph}
				showLabels={showLabels}
				selectedClauseId={selectedClauseId}
				highlightIds={highlightIds}
				colorOf={colorOf}
				onSelectClause={(clauseId) => {
					selectClause(docId, selectedClauseId === clauseId ? null : clauseId);
					if (viewKg) setDocumentTarget(buildDocumentTarget(viewKg, clauseId, nodesById));
				}}
			/>
			{viewKg && grid && (
				<SelectedRow
					kg={viewKg}
					grid={grid}
					clauseId={selectedClauseId}
					names={{ a: nameOf(aId), b: nameOf(bId) }}
					onSelect={(clauseId) =>
						selectClause(docId, selectedClauseId === clauseId ? null : clauseId)
					}
					onOpenMark={openInDocument}
					byParty={byParty}
					onByParty={setByParty}
				/>
			)}
		</div>
	);
}
