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
					<button
						type="button"
						onClick={() => onScoreMode('share')}
						className={`flex-1 rounded border px-1 py-0.5 ${
							scoreMode === 'share'
								? 'border-primary bg-primary/10 text-primary'
								: 'border-border/70 hover:text-foreground'
						}`}
						title="PPR as a percentage of the seed's own mass"
					>
						% of peak
					</button>
					<button
						type="button"
						onClick={() => onScoreMode('raw')}
						className={`flex-1 rounded border px-1 py-0.5 ${
							scoreMode === 'raw'
								? 'border-primary bg-primary/10 text-primary'
								: 'border-border/70 hover:text-foreground'
						}`}
						title="Raw PPR mass; the whole vector sums to 1"
					>
						raw PPR
					</button>
				</div>
			</div>

			<div className="space-y-1 border-t border-border/60 pt-2">
				<div className="font-medium text-foreground/50">Size</div>
				{/* Sizing runs against the runner-up, not the seed: the seed holds an order of
				    magnitude more mass and would flatten everything else onto one radius. */}
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
					<span className="min-w-0">less → more PPR</span>
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
					<span>dashed ring = seed</span>
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
