'use client';

import { useMemo, useState } from 'react';
import type { KgNodeKind } from '@/types/knowledge';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import { useKnowledgeGraphData } from '@/features/docx/hooks/useKnowledgeGraphData';
import { applyPartyView } from '@/features/docx/utils/knowledge/party-view';
import { buildKgViz, KG_NODE_KINDS } from '@/features/docx/utils/knowledge/kg-graph';
import {
	DEFAULT_NODE_LIMIT,
	MAX_NODE_LIMIT,
	MIN_NODE_LIMIT,
} from '@/features/docx/components/kg-visualization/constants';
import {
	GraphCanvas,
	type ScoreMode,
} from '@/features/docx/components/kg-visualization/GraphCanvas';
import { GraphLegend } from '@/features/docx/components/kg-visualization/GraphLegend';

interface KgVisualizationPanelProps {
	docId: string;
}

/**
 * The knowledge graph drawn as a graph, seeded on one party, to read the PPR
 * vector the clause analyzer only ever shows already folded into clause weights.
 * It is a diagnostic view, not an answer to the research question.
 */
export function KgVisualizationPanel({ docId }: KgVisualizationPanelProps) {
	const focusNodeId = useClauseAnalyzerStore((s) => s.focusNodeId);
	const focusNode = useClauseAnalyzerStore((s) => s.focusNode);
	const clearFocus = useClauseAnalyzerStore((s) => s.clearFocus);
	const mergeGroups = useClauseAnalyzerStore((s) => s.mergeGroups);
	const hiddenParties = useClauseAnalyzerStore((s) => s.hiddenParties);

	const [limit, setLimit] = useState(DEFAULT_NODE_LIMIT);
	const [visibleKinds, setVisibleKinds] = useState<Set<KgNodeKind>>(() => new Set(KG_NODE_KINDS));
	const [scoreMode, setScoreMode] = useState<ScoreMode>('share');
	const [showLabels, setShowLabels] = useState(true);

	const { kg, status } = useKnowledgeGraphData(docId, clearFocus);

	// Same party view as the clause analyzer: merging two parties changes the walk,
	// so the two tabs would otherwise report different PPR for the same document.
	const viewKg = useMemo(
		() => (kg ? applyPartyView(kg, mergeGroups, new Set(hiddenParties)) : null),
		[kg, mergeGroups, hiddenParties]
	);

	const seedId = useMemo(() => {
		if (!viewKg || viewKg.parties.length === 0) return null;
		const focused = viewKg.parties.find((party) => party.id === focusNodeId);
		return focused?.id ?? viewKg.parties[0].id;
	}, [viewKg, focusNodeId]);

	const graph = useMemo(
		() => (viewKg && seedId ? buildKgViz(viewKg, seedId, limit, visibleKinds) : null),
		[viewKg, seedId, limit, visibleKinds]
	);

	const shownByKind = useMemo(() => {
		const counts = Object.fromEntries(KG_NODE_KINDS.map((k) => [k, 0])) as Record<
			KgNodeKind,
			number
		>;
		for (const node of graph?.nodes ?? []) counts[node.kind] += 1;
		return counts;
	}, [graph]);

	const toggleKind = (kind: KgNodeKind, on: boolean) =>
		setVisibleKinds((previous) => {
			const next = new Set(previous);
			if (on) next.add(kind);
			else next.delete(kind);
			return next;
		});

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{status === 'ready' && viewKg && seedId && graph && (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-2 text-2xs text-muted-foreground">
					<label className="flex items-center gap-1.5">
						<span>Seed</span>
						<Select value={seedId} onValueChange={focusNode}>
							<SelectTrigger
								size="sm"
								className="h-6 w-44 border-border/70 px-2 text-2xs"
								title="The party the personalized walk restarts from"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent className="min-w-0">
								{viewKg.parties.map((party) => (
									<SelectItem key={party.id} value={party.id} className="text-2xs">
										{party.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</label>

					<label className="flex items-center gap-1.5">
						<span>Top</span>
						<input
							type="range"
							min={MIN_NODE_LIMIT}
							max={MAX_NODE_LIMIT}
							step={5}
							value={limit}
							onChange={(event) => setLimit(Number(event.target.value))}
							className="w-28 cursor-pointer"
							aria-label="How many of the highest-PPR nodes to draw"
						/>
						<span className="w-6 tabular-nums">{limit}</span>
					</label>

					<span className="tabular-nums" title="PPR mass captured by the nodes on screen">
						{graph.nodes.length} of {graph.totalNodes} nodes · {(graph.massShown * 100).toFixed(1)}%
						of the mass · {graph.edges.length} edges
					</span>
				</div>
			)}

			<div className="flex min-h-0 flex-1">
				{status === 'loading' && (
					<div className="flex h-full flex-1 items-center justify-center text-sm text-muted-foreground">
						Loading knowledge graph…
					</div>
				)}
				{status === 'missing' && (
					<div className="flex h-full flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
						No knowledge graph generated for this document yet. Build it with the notebook
						(notebooks/KG/build_kg.ipynb) into infra/json/kg/.
					</div>
				)}
				{status === 'error' && (
					<div className="flex h-full flex-1 items-center justify-center text-sm text-destructive">
						Failed to load the knowledge graph.
					</div>
				)}
				{status === 'ready' && !seedId && (
					<div className="flex h-full flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
						The graph has no party to seed the walk from.
					</div>
				)}

				{status === 'ready' && graph && seedId && (
					<>
						<GraphCanvas
							graph={graph}
							scoreMode={scoreMode}
							showLabels={showLabels}
							onSeed={focusNode}
						/>
						<GraphLegend
							countByKind={graph.countByKind}
							shownByKind={shownByKind}
							visibleKinds={visibleKinds}
							onToggleKind={toggleKind}
							scoreMode={scoreMode}
							onScoreMode={setScoreMode}
							showLabels={showLabels}
							onShowLabels={setShowLabels}
						/>
					</>
				)}
			</div>
		</div>
	);
}
