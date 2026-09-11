import type { DeonticKind } from '@/types/knowledge';
import type { DeonticSeverity } from '@/features/docx/utils/knowledge/party-pagerank';
import type { GridLane, StatementGrid } from '@/features/docx/utils/knowledge/statement-grid';

export function computeBenefitShare(
	grid: StatementGrid,
	severity: DeonticSeverity,
	lanes: GridLane[]
): Map<string, { a: number; b: number }> {
	const byClause = new Map<string, { a: number; b: number }>();
	for (const row of grid.rows) {
		if (!row.clauseId) continue;
		const benefit = { a: 0, b: 0 };
		for (const lane of lanes) {
			for (const mark of row.marks[lane]) {
				// Only the deontic three carry a severity; a qualifier describes a
				// statement that is already counted.
				if (!(mark.kind in severity)) continue;
				const weight = severity[mark.kind as DeonticKind];
				if (lane === 'shared') {
					benefit.a += weight;
					benefit.b += weight;
					continue;
				}
				const gains = mark.kind === 'right' ? lane : mark.counterpartLane;
				if (gains === 'a' || gains === 'b') benefit[gains] += weight;
			}
		}
		byClause.set(row.clauseId, benefit);
	}
	return byClause;
}

/** The pair as fractions of the clause's own total, or null when it hands out nothing. */
export function shareOfClause(
	byClause: Map<string, { a: number; b: number }> | null,
	clauseId: string | null
): { a: number; b: number } | null {
	const benefit = clauseId ? byClause?.get(clauseId) : null;
	if (!benefit) return null;
	const total = benefit.a + benefit.b;
	if (total <= 0) return null;
	return { a: benefit.a / total, b: benefit.b / total };
}
