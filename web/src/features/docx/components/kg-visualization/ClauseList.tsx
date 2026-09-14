'use client';

import type { ClauseSummary } from '@/features/docx/utils/knowledge/clause-subgraph';
import { DEONTIC_KINDS } from '@/features/docx/utils/knowledge/clause-subgraph';
import {
	formatShare,
	NODE_COLORS,
	NODE_LABEL,
} from '@/features/docx/components/kg-visualization/constants';

interface ClauseListProps {
	clauses: ClauseSummary[];
	selectedId: string | null;
	onSelect: (clauseId: string) => void;
}

export function ClauseList({ clauses, selectedId, onSelect }: ClauseListProps) {
	return (
		<aside className="flex w-52 shrink-0 flex-col border-r border-border/60">
			<div className="min-h-0 flex-1 overflow-y-auto">
				{clauses.map((clause) => {
					const selected = clause.id === selectedId;
					return (
						<button
							key={clause.id}
							type="button"
							onClick={() => onSelect(clause.id)}
							className={`w-full border-b border-border/40 px-3 py-2 text-left text-2xs transition-colors ${
								selected ? 'bg-primary/10' : 'hover:bg-muted/60'
							}`}
							title={clause.ref ? `${clause.ref} · ${clause.heading}` : clause.heading}
						>
							<div className="flex items-baseline gap-1.5">
								<span
									className={`min-w-0 flex-1 truncate ${
										selected ? 'font-medium text-primary' : 'text-foreground/85'
									}`}
								>
									{clause.heading}
								</span>
								<span className="shrink-0 tabular-nums text-muted-foreground">
									{formatShare(clause.share)}
								</span>
							</div>

							<div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
								<div
									className="h-full rounded-full"
									style={{
										width: `${Math.max(clause.share * 100, 2)}%`,
										backgroundColor: NODE_COLORS.clause,
									}}
								/>
							</div>

							{/* The counts answer "what is in this clause" without opening it. */}
							<div className="mt-1 flex items-center gap-2 text-muted-foreground">
								{DEONTIC_KINDS.map((kind) => (
									<span
										key={kind}
										className={`inline-flex items-center gap-1 ${
											clause.countByKind[kind] === 0 ? 'opacity-30' : ''
										}`}
										title={`${clause.countByKind[kind]} ${NODE_LABEL[kind]}`}
									>
										<span
											className="inline-block h-2 w-2 rounded-sm"
											style={{ backgroundColor: NODE_COLORS[kind] }}
										/>
										<span className="tabular-nums">{clause.countByKind[kind]}</span>
									</span>
								))}
							</div>
						</button>
					);
				})}
			</div>
		</aside>
	);
}
