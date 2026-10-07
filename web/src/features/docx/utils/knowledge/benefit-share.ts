import {
	DEONTIC_MARK_KINDS,
	type GridLane,
	type StatementGrid,
} from '@/features/docx/utils/knowledge/statement-grid';

/** Every statement counts once: the per-kind weights the bar used were never validated. */
export function computeBenefitShare(
	grid: StatementGrid,
	lanes: GridLane[]
): Map<string, { a: number; b: number }> {
	const byClause = new Map<string, { a: number; b: number }>();
	for (const row of grid.rows) {
		if (!row.clauseId) continue;
		const benefit = { a: 0, b: 0 };
		for (const lane of lanes) {
			for (const mark of row.marks[lane]) {
				// Only the deontic three count; a qualifier describes a statement that is
				// already counted.
				if (!DEONTIC_MARK_KINDS.includes(mark.kind)) continue;
				if (lane === 'shared') {
					benefit.a += 1;
					benefit.b += 1;
					continue;
				}
				const gains = mark.kind === 'right' ? lane : mark.counterpartLane;
				if (gains === 'a' || gains === 'b') benefit[gains] += 1;
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
