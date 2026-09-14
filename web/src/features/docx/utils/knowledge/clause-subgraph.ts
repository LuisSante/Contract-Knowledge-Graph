import type { KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';

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
