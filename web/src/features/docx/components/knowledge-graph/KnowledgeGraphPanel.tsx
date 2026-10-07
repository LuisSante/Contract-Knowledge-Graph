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
import { clauseNeighbourhood } from '@/features/docx/utils/knowledge/clause-subgraph';
import { buildDocumentTarget } from '@/features/docx/utils/knowledge/graph-payload';
import { GraphCanvas } from '@/features/docx/components/clause-analyzer/graph/GraphCanvas';
import { NODE_COLORS, NODE_LABEL } from '@/features/docx/components/clause-analyzer/constants';

const ALL_KINDS = new Set<KgNodeKind>(KG_NODE_KINDS);
const noReset = () => {};

/**
 * The whole knowledge graph, every node and edge, sized by PageRank over every
 * statement. The Clause Analyzer's graph is a cut of this one: the top N of what the
 * table shows.
 */
export function KnowledgeGraphPanel({ docId }: { docId: string }) {
	const [showLabels, setShowLabels] = useState(false);
	const [selectedClauseId, setSelectedClauseId] = useState<string | null>(null);
	const mergeGroups = useClauseAnalyzerStore((s) => s.mergeGroups);
	const hiddenParties = useClauseAnalyzerStore((s) => s.hiddenParties);
	const setDocumentTarget = useClauseAnalyzerStore((s) => s.setDocumentTarget);
	const paragraphs = useDocumentStore((s) => s.paragraphs);
	const nodesById = useMemo(() => new Map(paragraphs.map((n) => [n.id, n])), [paragraphs]);

	const { kg, status } = useKnowledgeGraphData(docId, noReset);
	const viewKg = useMemo(
		() => (kg ? applyPartyView(kg, mergeGroups, new Set(hiddenParties)) : null),
		[kg, mergeGroups, hiddenParties]
	);
	// null counts every statement: the document-wide reading, with no view filtering it.
	const importance = useClauseImportance(docId, null);

	const highlightIds = useMemo(
		() => (viewKg && selectedClauseId ? clauseNeighbourhood(viewKg, selectedClauseId) : null),
		[viewKg, selectedClauseId]
	);
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
				<span className="tabular-nums">
					{graph.nodes.length} nodes · {graph.edges.length} edges
				</span>
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
				onSelectClause={(clauseId) => {
					setSelectedClauseId((prev) => (prev === clauseId ? null : clauseId));
					if (viewKg) setDocumentTarget(buildDocumentTarget(viewKg, clauseId, nodesById));
				}}
			/>
		</div>
	);
}
