import type { KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';
import { GRID_LANES, type StatementGrid } from '@/features/docx/utils/knowledge/statement-grid';

function isEntity(kg: KnowledgeGraph, id: string): boolean {
	return (
		kg.parties.some((n) => n.id === id) ||
		kg.conditions.some((n) => n.id === id) ||
		kg.values.some((n) => n.id === id) ||
		kg.references.some((n) => n.id === id) ||
		kg.definedTerms.some((n) => n.id === id)
	);
}

/**
 * The clause, its provisions, and every entity those provisions reach — the set the
 * graph lights up, and the one it keeps past the top-N cut.
 *
 * Parties come from `burdenPartyId`/`benefitPartyId` rather than from edges: a fair
 * number of statements name a party the extractor never emitted an edge for.
 */
export function clauseNeighbourhood(kg: KnowledgeGraph, clauseId: string): Set<string> {
	const own = deonticNodes(kg).filter((node) => node.clauseId === clauseId);
	const ownIds = new Set(own.map((node) => node.id));
	const ids = new Set<string>([clauseId, ...ownIds]);

	for (const node of own) {
		if (node.burdenPartyId) ids.add(node.burdenPartyId);
		if (node.benefitPartyId) ids.add(node.benefitPartyId);
	}
	for (const edge of kg.edges) {
		const other = ownIds.has(edge.source)
			? edge.target
			: ownIds.has(edge.target)
				? edge.source
				: null;
		if (other && isEntity(kg, other)) ids.add(other);
	}
	return ids;
}

/**
 * Exactly what the Table draws in a clause's row — its statements and the conditions,
 * values, terms and references anchored to them or to the clause — plus the clause
 * itself and the two parties being compared. Not a hop count: conditions sit two hops
 * from their clause, while sub-clauses one hop away are not part of the row.
 */
export function clauseRowIds(
	grid: StatementGrid,
	clauseId: string,
	partyIds: Array<string | null>
): Set<string> {
	const ids = new Set<string>([clauseId]);
	for (const partyId of partyIds) if (partyId) ids.add(partyId);
	const row = grid.rows.find((r) => r.clauseId === clauseId);
	for (const lane of GRID_LANES) for (const mark of row?.marks[lane] ?? []) ids.add(mark.id);
	return ids;
}
