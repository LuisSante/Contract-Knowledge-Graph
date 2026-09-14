'use client';

import { useMemo, useState } from 'react';
import type { KgNodeKind } from '@/types/knowledge';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import { useKnowledgeGraphData } from '@/features/docx/hooks/useKnowledgeGraphData';
import { useClauseImportance } from '@/features/docx/hooks/useClauseImportance';
import { applyPartyView } from '@/features/docx/utils/knowledge/party-view';
import {
	buildClauseIndex,
	clauseNeighbourhood,
} from '@/features/docx/utils/knowledge/clause-subgraph';
import {
	buildKgViz,
	DEFAULT_NODE_KINDS,
	KG_NODE_KINDS,
} from '@/features/docx/utils/knowledge/kg-graph';
import { ClauseList } from '@/features/docx/components/kg-visualization/ClauseList';
import {
	GraphCanvas,
	type ScoreMode,
} from '@/features/docx/components/kg-visualization/GraphCanvas';
import { GraphLegend } from '@/features/docx/components/kg-visualization/GraphLegend';
import {
	DEFAULT_NODE_LIMIT,
	MAX_NODE_LIMIT,
	MIN_NODE_LIMIT,
} from '@/features/docx/components/kg-visualization/constants';

interface KgVisualizationPanelProps {
	docId: string;
}

export function KgVisualizationPanel({ docId }: KgVisualizationPanelProps) {
	const clearFocus = useClauseAnalyzerStore((s) => s.clearFocus);
	const mergeGroups = useClauseAnalyzerStore((s) => s.mergeGroups);
	const hiddenParties = useClauseAnalyzerStore((s) => s.hiddenParties);

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [limit, setLimit] = useState(DEFAULT_NODE_LIMIT);
	const [visibleKinds, setVisibleKinds] = useState<Set<KgNodeKind>>(
		() => new Set(DEFAULT_NODE_KINDS)
	);
	const [scoreMode, setScoreMode] = useState<ScoreMode>('ppr');
	const [showLabels, setShowLabels] = useState(true);

	const { kg, status } = useKnowledgeGraphData(docId, clearFocus);

	const viewKg = useMemo(
		() => (kg ? applyPartyView(kg, mergeGroups, new Set(hiddenParties)) : null),
		[kg, mergeGroups, hiddenParties]
	);

	// null = every statement counts. The question here is which clause matters in the
	// contract, so nothing on screen should be narrowing the prior.
	const importance = useClauseImportance(docId, null);

	const clauses = useMemo(
		() => (viewKg && importance ? buildClauseIndex(viewKg, importance.byClause) : []),
		[viewKg, importance]
	);

	const selected = useMemo(
		() => clauses.find((clause) => clause.id === selectedId) ?? clauses[0] ?? null,
		[clauses, selectedId]
	);

	const highlightIds = useMemo(
		() => (viewKg && selected ? clauseNeighbourhood(viewKg, selected.id) : null),
		[viewKg, selected]
	);

	const graph = useMemo(
		() =>
			viewKg && importance
				? buildKgViz(
						viewKg,
						importance.byNode,
						importance.priorByNode,
						limit,
						visibleKinds,
						highlightIds
					)
				: null,
		[viewKg, importance, limit, visibleKinds, highlightIds]
	);

	const shownByKind = useMemo(() => {
		const counts = Object.fromEntries(KG_NODE_KINDS.map((k) => [k, 0])) as Record<
			KgNodeKind,
			number
		>;
		for (const node of graph?.nodes ?? []) counts[node.kind] += 1;
		return counts;
	}, [graph]);

	// Pinning brings the whole clause in, so this only falls short of the full set when
	// the reader has switched a kind off. Saying so beats wondering where it went.
	const highlightShown = useMemo(
		() =>
			graph && highlightIds ? graph.nodes.filter((node) => highlightIds.has(node.id)).length : 0,
		[graph, highlightIds]
	);

	const toggleKind = (kind: KgNodeKind, on: boolean) =>
		setVisibleKinds((previous) => {
			const next = new Set(previous);
			if (on) next.add(kind);
			else next.delete(kind);
			return next;
		});

	if (status !== 'ready') {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm">
				{status === 'loading' && (
					<span className="text-muted-foreground">Loading knowledge graph…</span>
				)}
				{status === 'missing' && (
					<span className="text-muted-foreground">
						No knowledge graph generated for this document yet. Build it with the notebook
						(notebooks/KG/build_kg.ipynb) into infra/json/kg/.
					</span>
				)}
				{status === 'error' && (
					<span className="text-destructive">Failed to load the knowledge graph.</span>
				)}
			</div>
		);
	}

	if (!importance) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
				Computing clause importance…
			</div>
		);
	}

	if (clauses.length === 0) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
				No clause in this graph holds a provision.
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1">
			<ClauseList clauses={clauses} selectedId={selected?.id ?? null} onSelect={setSelectedId} />

			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-2 text-2xs text-muted-foreground">
					<label className="flex items-center gap-1.5">
						<span>Top</span>
						<input
							type="range"
							min={MIN_NODE_LIMIT}
							max={MAX_NODE_LIMIT}
							step={5}
							value={limit}
							onChange={(event) => setLimit(Number(event.target.value))}
							className="w-24 cursor-pointer"
							aria-label="How many of the highest-PPR nodes to draw"
						/>
						<span className="w-6 tabular-nums">{limit}</span>
					</label>

					{graph && (
						<span className="tabular-nums" title="PPR mass captured by the nodes on screen">
							{graph.nodes.length}/{graph.totalNodes} nodes
							{graph.pinnedExtra > 0 && ` (+${graph.pinnedExtra} pinned)`} ·{' '}
							{(graph.massShown * 100).toFixed(1)}% of the mass · {graph.edges.length} edges ·{' '}
							{importance.iterations} iterations
						</span>
					)}

					{highlightIds && (
						<span
							className="tabular-nums"
							title="Nodes of the selected clause that are on screen — the rest are switched off in the legend"
						>
							· lit {highlightShown}/{highlightIds.size}
						</span>
					)}
				</div>

				{graph && (
					<div className="flex min-h-0 flex-1">
						<GraphCanvas
							graph={graph}
							scoreMode={scoreMode}
							showLabels={showLabels}
							selectedClauseId={selected?.id ?? null}
							highlightIds={highlightIds}
							onSelectClause={setSelectedId}
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
					</div>
				)}
			</div>
		</div>
	);
}
