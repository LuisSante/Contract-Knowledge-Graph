'use client';

import { useMemo } from 'react';
import type { DeonticKind, KnowledgeGraph } from '@/types/knowledge';
import {
	DEONTIC_MARK_KINDS,
	GRID_LANES,
	type GridLane,
	type GridMark,
	type GridRow,
	type MarkKind,
	type Side,
	type StatementGrid,
} from '@/features/docx/utils/knowledge/statement-grid';
import {
	clauseTitle,
	DEONTIC_KINDS,
	tallyClauses,
} from '@/features/docx/utils/knowledge/clause-favour';
import {
	clauseDependsOn,
	clauseModifiedBy,
	clauseDefines,
	clauseRefersTo,
	clauseUsesFrom,
} from '@/features/docx/utils/knowledge/graph-payload';
import { useClauseImportance } from '@/features/docx/hooks/useClauseImportance';
import type { ClauseRowLead } from '@/features/docx/components/clause-analyzer/grid/ClauseRow';

/** The two parties' lanes: the reciprocal one is not shown. */
export const SHOWN_LANES: GridLane[] = GRID_LANES.filter((lane) => lane !== 'shared');

interface ClauseRowsInput {
	docId: string;
	viewKg: KnowledgeGraph | null;
	/** Every statement between the two parties: the importance, the ranks and the details. */
	grid: StatementGrid | null;
	/** The grid as the condition mode leaves it: the squares, the counts and the rows. */
	shownGrid: StatementGrid | null;
	kindsShown: Set<MarkKind>;
	sortByImportance: boolean;
	selectedClauseId: string | null;
}

/**
 * The Clause Analyzer's rows: which clauses show in the type open, in what order, how each
 * one is named, and the counts on the type tabs.
 */
export function useClauseRows({
	docId,
	viewKg,
	grid,
	shownGrid,
	kindsShown,
	sortByImportance,
	selectedClauseId,
}: ClauseRowsInput) {
	// Each type's squares on each side over the clause rows, for the tabs.
	const kindCounts = useMemo(() => {
		if (!shownGrid) return null;
		const counts = Object.fromEntries(DEONTIC_KINDS.map((k) => [k, { a: 0, b: 0 }])) as Record<
			DeonticKind,
			Record<Side, number>
		>;
		for (const row of shownGrid.rows) {
			if (!row.clauseId) continue;
			for (const lane of ['a', 'b'] as const) {
				for (const mark of row.marks[lane]) {
					if (DEONTIC_MARK_KINDS.includes(mark.kind)) counts[mark.kind as DeonticKind][lane] += 1;
				}
			}
		}
		return counts;
	}, [shownGrid]);

	// One importance for the pair, counted on every obligation, right and prohibition between
	// the two parties: it orders the rows, the same in every type shown, numbers them within
	// each tab, and weighs what the contract and the graph light up.
	const countedIds = useMemo(() => {
		const ids = new Set<string>();
		for (const row of grid?.rows ?? []) {
			for (const lane of SHOWN_LANES) {
				for (const mark of row.marks[lane]) {
					if (DEONTIC_MARK_KINDS.includes(mark.kind)) ids.add(mark.id);
				}
			}
		}
		// Empty means there is no pair yet, not "count nothing": then the importance is the
		// document-wide one, which a single statement's focus weighs its neighbours by.
		return ids.size > 0 ? [...ids].sort() : null;
	}, [grid]);
	const clauseImportance = useClauseImportance(docId, countedIds);
	// The rows go by the pair's importance only, never by the document-wide one.
	const rowImportance = countedIds ? clauseImportance : null;

	const visibleRows = useMemo(() => {
		const rows = (shownGrid?.rows ?? []).filter((row) =>
			SHOWN_LANES.some((lane) => row.marks[lane].some((mark) => kindsShown.has(mark.kind)))
		);
		if (!sortByImportance || !rowImportance) return rows;
		const weight = (row: GridRow) =>
			row.clauseId ? (rowImportance.byClause[row.clauseId] ?? 0) : -1;
		return rows.slice().sort((x, y) => weight(y) - weight(x));
	}, [shownGrid, kindsShown, sortByImportance, rowImportance]);

	const laneByStatement = useMemo(() => {
		const byId = new Map<string, GridLane>();
		for (const row of shownGrid?.rows ?? []) {
			for (const lane of GRID_LANES) {
				for (const mark of row.marks[lane]) byId.set(mark.id, lane);
			}
		}
		return byId;
	}, [shownGrid]);

	const clauseRows = useMemo(
		() => visibleRows.filter((row) => row.clauseId !== null),
		[visibleRows]
	);
	const unfiledRow = visibleRows.find((row) => row.clauseId === null) ?? null;

	const activeClause = useMemo(
		() => visibleRows.find((row) => row.clauseId && row.clauseId === selectedClauseId) ?? null,
		[visibleRows, selectedClauseId]
	);
	// The contract shows only the type the tab shows: a clause's obligations under
	// Obligations, its rights under Rights.
	const paintedClause = useMemo(() => {
		if (!activeClause) return activeClause;
		const keep = (marks: GridMark[]) => marks.filter((mark) => kindsShown.has(mark.kind));
		return {
			...activeClause,
			marks: {
				a: keep(activeClause.marks.a),
				b: keep(activeClause.marks.b),
				shared: keep(activeClause.marks.shared),
			},
		};
	}, [activeClause, kindsShown]);

	// Each clause's statements credited to its parties: what the picked row's detail lists.
	const tallies = useMemo(
		() => (grid && viewKg ? tallyClauses(grid, viewKg) : null),
		[grid, viewKg]
	);
	const talliesByClause = useMemo(
		() => (tallies ? new Map(tallies.map((t) => [t.clauseId, t] as const)) : null),
		[tallies]
	);

	// A clause's place by relevance among the rows of each type's tab: the number in its row's
	// circle, 1 to n in each tab, in the order the rows take there.
	const rankByKind = useMemo(() => {
		if (!shownGrid || !rowImportance) return null;
		const weight = (row: GridRow) =>
			row.clauseId ? (rowImportance.byClause[row.clauseId] ?? 0) : -1;
		return Object.fromEntries(
			DEONTIC_KINDS.map((kind) => {
				const ranked = shownGrid.rows
					.filter(
						(row) =>
							row.clauseId !== null &&
							SHOWN_LANES.some((lane) => row.marks[lane].some((mark) => mark.kind === kind))
					)
					.sort((x, y) => weight(y) - weight(x));
				return [kind, new Map(ranked.map((row, i) => [row.clauseId, i + 1] as const))];
			})
		) as Record<DeonticKind, Map<string | null, number>>;
	}, [shownGrid, rowImportance]);
	const kindShown = DEONTIC_KINDS.find((kind) => kindsShown.has(kind)) ?? null;
	const rankByClause = rankByKind && kindShown ? rankByKind[kindShown] : null;

	// Each row is named by the clause's place in importance, its number and heading (a
	// numbered subclause borrows its section's), and a link to the graph.
	const leadOf = useMemo(() => {
		if (!grid || !viewKg) return undefined;
		const clauseOf = new Map(viewKg.clauses.map((c) => [c.id, c] as const));
		const rank = rankByClause ?? new Map<string, number>();
		const modifiedBy = clauseModifiedBy(viewKg);
		const dependsOn = clauseDependsOn(viewKg);
		const refersTo = clauseRefersTo(viewKg);
		const usesFrom = clauseUsesFrom(viewKg);
		const defines = clauseDefines(viewKg);
		const numberOf = (id: string) => {
			const clause = clauseOf.get(id);
			const title = clauseTitle(clause, clause?.heading || id, viewKg.clauses);
			return title.section ?? title.heading;
		};
		return (row: GridRow): ClauseRowLead => {
			const title = row.clauseId
				? clauseTitle(clauseOf.get(row.clauseId), row.heading, viewKg.clauses)
				: { heading: row.heading, section: null };
			return {
				rank: row.clauseId ? rank.get(row.clauseId) : undefined,
				...title,
				modifiedBy: row.clauseId
					? modifiedBy
							.get(row.clauseId)
							?.map((m) => ({ clauseId: m.clauseId, label: numberOf(m.clauseId), kind: m.kind }))
					: undefined,
				dependsOn: row.clauseId
					? dependsOn.get(row.clauseId)?.map((id) => ({ clauseId: id, label: numberOf(id) }))
					: undefined,
				refersTo: row.clauseId
					? refersTo.get(row.clauseId)?.map((id) => ({ clauseId: id, label: numberOf(id) }))
					: undefined,
				defines: row.clauseId ? defines.get(row.clauseId) : undefined,
				usesFrom: row.clauseId
					? usesFrom.get(row.clauseId)?.map((u) => ({
							clauseId: u.clauseId,
							label: numberOf(u.clauseId),
							note: `it defines ${u.terms.map((t) => `“${t}”`).join(', ')}`,
						}))
					: undefined,
			};
		};
	}, [grid, viewKg, rankByClause]);

	// Where a red flag's statement sits in the table: its row's place in that type's tab and its
	// clause number. A condition has no tab of its own, so no place.
	const placeOfClause = useMemo(() => {
		if (!viewKg) return undefined;
		const clauseOf = new Map(viewKg.clauses.map((c) => [c.id, c] as const));
		return (clauseId: string, kind?: DeonticKind) => {
			const clause = clauseOf.get(clauseId);
			if (!clause) return null;
			const title = clauseTitle(clause, clause.heading || clause.ref || clause.id, viewKg.clauses);
			const rank = kind ? rankByKind?.[kind].get(clauseId) : undefined;
			return { rank, section: title.section, heading: title.heading };
		};
	}, [viewKg, rankByKind]);

	return {
		kindCounts,
		clauseImportance,
		rowImportance,
		clauseRows,
		unfiledRow,
		activeClause,
		paintedClause,
		laneByStatement,
		talliesByClause,
		leadOf,
		placeOfClause,
	};
}
