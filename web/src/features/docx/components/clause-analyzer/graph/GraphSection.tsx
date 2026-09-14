'use client';

import { useMemo, useState } from 'react';
import type { KgNodeKind, KnowledgeGraph } from '@/types/knowledge';
import type { ClauseImportance } from '@/services/knowledge';
import type { MarkKind } from '@/features/docx/utils/knowledge/statement-grid';
import { buildKgViz } from '@/features/docx/utils/knowledge/kg-graph';
import { clauseNeighbourhood } from '@/features/docx/utils/knowledge/clause-subgraph';
import { Checkbox } from '@/components/ui/checkbox';
import {
	DEFAULT_NODE_LIMIT,
	MAX_NODE_LIMIT,
	MIN_NODE_LIMIT,
} from '@/features/docx/components/clause-analyzer/constants';
import {
	GraphCanvas,
	type ScoreMode,
} from '@/features/docx/components/clause-analyzer/graph/GraphCanvas';

const MODES: ReadonlyArray<{ id: ScoreMode; label: string; hint: string }> = [
	{ id: 'ppr', label: 'PPR', hint: 'Where the walk ends up. The vector sums to 100.' },
	{ id: 'prior', label: 'prior', hint: 'Where it starts: 1/(|C|·|V_c|) on each statement.' },
	{ id: 'gain', label: 'gain', hint: 'PPR − prior: what the structure added or drained.' },
];

interface GraphSectionProps {
	kg: KnowledgeGraph;
	importance: ClauseImportance | null;
	/** The legend's kind filter, shared with the grid; parties and clauses always show. */
	visibleKinds: Set<MarkKind>;
	selectedClauseId: string | null;
	onSelectClause: (clauseId: string) => void;
}

export function GraphSection({
	kg,
	importance,
	visibleKinds,
	selectedClauseId,
	onSelectClause,
}: GraphSectionProps) {
	const [limit, setLimit] = useState(DEFAULT_NODE_LIMIT);
	const [scoreMode, setScoreMode] = useState<ScoreMode>('ppr');
	const [showLabels, setShowLabels] = useState(false);

	const kinds = useMemo<Set<KgNodeKind>>(
		() => new Set<KgNodeKind>([...visibleKinds, 'party', 'clause']),
		[visibleKinds]
	);

	const highlightIds = useMemo(
		() => (selectedClauseId ? clauseNeighbourhood(kg, selectedClauseId) : null),
		[kg, selectedClauseId]
	);

	const graph = useMemo(
		() =>
			importance
				? buildKgViz(kg, importance.byNode, importance.priorByNode, limit, kinds, highlightIds)
				: null,
		[kg, importance, limit, kinds, highlightIds]
	);

	if (!graph) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center border-t border-border/60 text-2xs text-muted-foreground">
				Computing clause importance…
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col border-t border-border/60">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-2xs text-muted-foreground">
				<label className="flex items-center gap-1.5">
					<span>Top</span>
					<input
						type="range"
						min={MIN_NODE_LIMIT}
						max={MAX_NODE_LIMIT}
						step={5}
						value={limit}
						onChange={(event) => setLimit(Number(event.target.value))}
						className="w-20 cursor-pointer"
						aria-label="How many of the highest-PPR nodes to draw"
					/>
					<span className="w-6 tabular-nums">{limit}</span>
				</label>

				<div className="flex gap-1">
					{MODES.map((mode) => (
						<button
							key={mode.id}
							type="button"
							onClick={() => setScoreMode(mode.id)}
							className={`rounded border px-1.5 py-0.5 ${
								scoreMode === mode.id
									? 'border-primary bg-primary/10 text-primary'
									: 'border-border/70 hover:text-foreground'
							}`}
							title={mode.hint}
						>
							{mode.label}
						</button>
					))}
				</div>

				<label className="flex cursor-pointer items-center gap-1.5">
					<Checkbox
						checked={showLabels}
						onCheckedChange={(value) => setShowLabels(value === true)}
						className="size-3.5 shrink-0"
						aria-label="Show node labels"
					/>
					<span>Labels</span>
				</label>

				<span className="tabular-nums" title="PPR mass captured by the nodes on screen">
					{graph.nodes.length}/{graph.totalNodes} nodes
					{graph.pinnedExtra > 0 && ` (+${graph.pinnedExtra})`} ·{' '}
					{(graph.massShown * 100).toFixed(1)}% of the mass · dashed ring = carries prior
				</span>
			</div>

			<GraphCanvas
				graph={graph}
				scoreMode={scoreMode}
				showLabels={showLabels}
				selectedClauseId={selectedClauseId}
				highlightIds={highlightIds}
				onSelectClause={onSelectClause}
			/>
		</div>
	);
}
