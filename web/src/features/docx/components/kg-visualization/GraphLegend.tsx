'use client';

import type { KgNodeKind } from '@/types/knowledge';
import { Checkbox } from '@/components/ui/checkbox';
import { KG_NODE_KINDS } from '@/features/docx/utils/knowledge/kg-graph';
import {
	MAX_RADIUS,
	MIN_RADIUS,
	NODE_COLORS,
	NODE_LABEL,
} from '@/features/docx/components/kg-visualization/constants';
import type { ScoreMode } from '@/features/docx/components/kg-visualization/GraphCanvas';

const MODES: ReadonlyArray<{ id: ScoreMode; label: string; hint: string }> = [
	{
		id: 'ppr',
		label: 'PPR',
		hint: 'Where the walk ends up. The vector sums to 100, so each number is that node’s share of the whole.',
	},
	{
		id: 'prior',
		label: 'prior',
		hint: 'Where the walk starts: 1/(|C|·|V_c|) on each statement, nothing anywhere else. Also sums to 100.',
	},
	{
		id: 'gain',
		label: 'gain',
		hint: 'PPR − prior, in the same points. Positive means the structure fed this node; negative means it leaked mass to its neighbours.',
	},
];

interface GraphLegendProps {
	countByKind: Record<KgNodeKind, number>;
	shownByKind: Record<KgNodeKind, number>;
	visibleKinds: Set<KgNodeKind>;
	onToggleKind: (kind: KgNodeKind, on: boolean) => void;
	scoreMode: ScoreMode;
	onScoreMode: (mode: ScoreMode) => void;
	showLabels: boolean;
	onShowLabels: (on: boolean) => void;
}

export function GraphLegend({
	countByKind,
	shownByKind,
	visibleKinds,
	onToggleKind,
	scoreMode,
	onScoreMode,
	showLabels,
	onShowLabels,
}: GraphLegendProps) {
	return (
		<aside className="w-44 shrink-0 space-y-3 overflow-y-auto border-l border-border/60 px-2 py-2 text-2xs text-muted-foreground">
			<div>
				<div className="mb-1 font-medium text-foreground/50">Node kinds</div>
				<div className="grid grid-cols-1 gap-y-1">
					{KG_NODE_KINDS.map((kind) => {
						const total = countByKind[kind] ?? 0;
						const shown = shownByKind[kind] ?? 0;
						const color = NODE_COLORS[kind];
						return (
							<label
								key={kind}
								className={`inline-flex w-full min-w-0 items-center gap-1.5 ${
									total === 0 ? 'opacity-40' : 'cursor-pointer'
								}`}
								title={`${shown} of ${total} ${NODE_LABEL[kind]} nodes are on screen`}
							>
								<Checkbox
									checked={visibleKinds.has(kind)}
									disabled={total === 0}
									onCheckedChange={(value) => onToggleKind(kind, value === true)}
									className="size-3.5 shrink-0 border-current data-[state=checked]:text-white"
									style={{
										color,
										backgroundColor: visibleKinds.has(kind) ? color : undefined,
										borderColor: color,
									}}
									aria-label={`${NODE_LABEL[kind]} (${shown} of ${total})`}
								/>
								<span className="truncate">{NODE_LABEL[kind]}</span>
								<span className="ml-auto shrink-0 tabular-nums opacity-60">
									{shown}/{total}
								</span>
							</label>
						);
					})}
				</div>
			</div>

			<div className="space-y-1 border-t border-border/60 pt-2">
				<div className="font-medium text-foreground/50">Number in the node</div>
				<div className="flex gap-1">
					{MODES.map((mode) => (
						<button
							key={mode.id}
							type="button"
							onClick={() => onScoreMode(mode.id)}
							className={`flex-1 rounded border px-1 py-0.5 ${
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
				<div className="opacity-70">points of the total mass (· = under 0.01)</div>
				{scoreMode === 'gain' && (
					<div className="opacity-70">dashed outline = lost mass to its neighbours</div>
				)}
			</div>

			<div className="space-y-1 border-t border-border/60 pt-2">
				<div className="font-medium text-foreground/50">Size</div>
				{/* Logarithmic: the vector spans ~300:1, so a linear radius would pin every
				    node below the top few onto the minimum. */}
				<div className="flex items-center gap-2">
					<svg width={MAX_RADIUS * 2 + 4} height={MAX_RADIUS + 6} aria-hidden="true">
						<circle
							cx={MIN_RADIUS / 2 + 2}
							cy={MAX_RADIUS / 2 + 3}
							r={MIN_RADIUS / 2}
							fill="currentColor"
							fillOpacity={0.15}
							stroke="currentColor"
							strokeOpacity={0.5}
						/>
						<circle
							cx={MIN_RADIUS + MAX_RADIUS / 2 + 4}
							cy={MAX_RADIUS / 2 + 3}
							r={MAX_RADIUS / 2}
							fill="currentColor"
							fillOpacity={0.4}
							stroke="currentColor"
							strokeOpacity={0.5}
						/>
					</svg>
					<span className="min-w-0">less → more PPR (log)</span>
				</div>
				<div className="flex items-center gap-1.5">
					<svg width={18} height={18} aria-hidden="true">
						<circle
							cx={9}
							cy={9}
							r={7}
							fill="none"
							stroke="currentColor"
							strokeWidth={1.2}
							strokeDasharray="3 2"
						/>
					</svg>
					<span>ring = carries prior</span>
				</div>
			</div>

			<label className="flex cursor-pointer items-center gap-1.5 border-t border-border/60 pt-2">
				<Checkbox
					checked={showLabels}
					onCheckedChange={(value) => onShowLabels(value === true)}
					className="size-3.5 shrink-0"
					aria-label="Show node labels"
				/>
				<span>Node labels</span>
			</label>
		</aside>
	);
}
