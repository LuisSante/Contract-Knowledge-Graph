'use client';

import {
	DEONTIC_MARK_KINDS,
	MARK_KINDS,
	type MarkKind,
} from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind } from '@/types/knowledge';
import type { DeonticSeverity } from '@/features/docx/utils/knowledge/party-pagerank';
import { Checkbox } from '@/components/ui/checkbox';
import { WeightField } from '@/features/docx/components/knowledge-graph/legend/WeightField';
import { KIND_COLORS, KIND_LABEL } from '@/features/docx/components/knowledge-graph/constants';

interface LegendProps {
	countByKind: Record<MarkKind, number>;
	visibleKinds: Set<MarkKind>;
	onToggleKind: (kind: MarkKind, on: boolean) => void;
	severity: DeonticSeverity;
	onSeverity: (kind: DeonticKind, value: number) => void;
	severityDirty: boolean;
	onResetSeverity: () => void;
	showShared: boolean;
	onShowShared: (on: boolean) => void;
}

/**
 * Kind filter and severity dials. Only the seven mark kinds appear: clauses are
 * bands and parties are lanes, so neither of those is a mark.
 */
export function Legend({
	countByKind,
	visibleKinds,
	onToggleKind,
	severity,
	onSeverity,
	severityDirty,
	onResetSeverity,
	showShared,
	onShowShared,
}: LegendProps) {
	return (
		<aside className="w-36 shrink-0 space-y-2 overflow-y-auto border-l border-border/60 px-2 py-2 text-2xs text-muted-foreground">
			<div>
				<div className="mb-1 flex items-baseline justify-between">
					<span className="font-medium text-foreground/50">Entities</span>
					{severityDirty && (
						<button
							type="button"
							onClick={onResetSeverity}
							className="text-muted-foreground underline hover:text-foreground"
							title="Back to the calibrated defaults (prohibition 1.0 · obligation 0.7 · right 0.3)"
						>
							reset
						</button>
					)}
				</div>
				<div className="grid grid-cols-1 gap-y-1">
					{MARK_KINDS.map((kind) => {
						const count = countByKind[kind] ?? 0;
						const color = KIND_COLORS[kind];
						const deontic = (DEONTIC_MARK_KINDS as readonly MarkKind[]).includes(kind);
						return (
							<div key={kind}>
								<label
									className={`inline-flex w-full min-w-0 items-center gap-1.5 ${
										count === 0 ? 'opacity-40' : 'cursor-pointer'
									}`}
								>
									<Checkbox
										checked={visibleKinds.has(kind)}
										disabled={count === 0}
										onCheckedChange={(value) => onToggleKind(kind, value === true)}
										className="size-3.5 shrink-0 border-current data-[state=checked]:text-white"
										style={{
											color,
											backgroundColor: visibleKinds.has(kind) ? color : undefined,
											borderColor: color,
										}}
										aria-label={`${KIND_LABEL[kind]} (${count})`}
									/>
									<span className="truncate" title={KIND_LABEL[kind]}>
										{KIND_LABEL[kind]}
									</span>
									<span className="ml-auto shrink-0 tabular-nums opacity-60">{count}</span>
								</label>
								{/* Severity is the analyst's call, so the legend row that names the kind
								    also holds the dial: a clause weighs the sum of these. */}
								{deontic && (
									<div className="mt-0.5 flex items-center gap-1 pl-5">
										<input
											type="range"
											min={0}
											max={1}
											step={0.05}
											value={severity[kind as DeonticKind]}
											onChange={(event) =>
												onSeverity(kind as DeonticKind, Number(event.target.value))
											}
											className="min-w-0 flex-1 cursor-pointer"
											style={{ accentColor: color }}
											aria-label={`Weight of ${KIND_LABEL[kind]} in the clause weight`}
											title={`How much one ${KIND_LABEL[kind].toLowerCase()} counts toward its clause's weight`}
										/>
										<WeightField
											value={severity[kind as DeonticKind]}
											label={`Type the weight of ${KIND_LABEL[kind]}`}
											onCommit={(value) => onSeverity(kind as DeonticKind, value)}
										/>
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>

			<label
				className="flex cursor-pointer items-start gap-1.5 border-t border-border/60 pt-2"
				title="Provisiones que el contrato dirige a las dos partes a la vez («each Party»). Al abrirlas se añade una tercera columna y pasan a contar en el orden y en los porcentajes: como suman lo mismo a cada lado, acercan el reparto al 50/50."
			>
				<Checkbox
					checked={showShared}
					onCheckedChange={(value) => onShowShared(value === true)}
					className="mt-px size-3.5 shrink-0"
					aria-label="Mostrar la columna de provisiones bilaterales"
				/>
				<span className="min-w-0">Both Parties</span>
			</label>
		</aside>
	);
}
