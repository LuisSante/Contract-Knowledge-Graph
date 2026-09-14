import type { DeonticKind, KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';

export const DEONTIC_KINDS: DeonticKind[] = ['obligation', 'right', 'prohibition'];

export interface ClauseSummary {
	id: string;
	ref: string | null;
	heading: string;
	/** Importance against the heaviest clause in the document; the raw mass is never read. */
	share: number;
	countByKind: Record<DeonticKind, number>;
}

const EMPTY_COUNTS = (): Record<DeonticKind, number> => ({
	obligation: 0,
	right: 0,
	prohibition: 0,
});

function isEntity(kg: KnowledgeGraph, id: string): boolean {
	return (
		kg.parties.some((n) => n.id === id) ||
		kg.conditions.some((n) => n.id === id) ||
		kg.values.some((n) => n.id === id) ||
		kg.references.some((n) => n.id === id) ||
		kg.definedTerms.some((n) => n.id === id)
	);
}

/** Every clause that holds at least one statement, heaviest first. */
export function buildClauseIndex(
	kg: KnowledgeGraph,
	byClause: Record<string, number>
): ClauseSummary[] {
	const counts = new Map<string, Record<DeonticKind, number>>();
	for (const statement of deonticNodes(kg)) {
		if (!statement.clauseId) continue;
		const bucket = counts.get(statement.clauseId) ?? EMPTY_COUNTS();
		bucket[statement.kind] += 1;
		counts.set(statement.clauseId, bucket);
	}

	// Normalising against the top clause, not against the raw mass, is what makes the
	// bars match the table in docs/metricas/importancia-clausula.md.
	const peak = Math.max(0, ...Object.values(byClause));

	return kg.clauses
		.filter((clause) => counts.has(clause.id))
		.map((clause) => ({
			id: clause.id,
			ref: clause.ref,
			// One clause in the corpus carries a ref and an empty heading.
			heading: clause.heading || clause.ref || clause.id,
			share: peak > 0 ? (byClause[clause.id] ?? 0) / peak : 0,
			countByKind: counts.get(clause.id) ?? EMPTY_COUNTS(),
		}))
		.sort((a, b) => b.share - a.share);
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
