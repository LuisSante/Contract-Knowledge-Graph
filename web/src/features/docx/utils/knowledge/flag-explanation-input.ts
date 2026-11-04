import type { KnowledgeGraph } from '@/types/knowledge';
import type { FlagExplanationInput } from '@/types/flag-explanation';
import type { FlagHopPath } from './red-flag-hops';

/** Selecciona el camino existente. No envía inferencias, puntuaciones ni el grafo completo. */
export function flagExplanationInput(path: FlagHopPath, kg: KnowledgeGraph): FlagExplanationInput {
	const ids = new Set<string>();
	const add = (id: string | null | undefined) => {
		if (id) ids.add(id);
	};
	add(path.clauseId);
	const links = [...path.outgoing, ...path.incoming, ...path.clauseOutgoing];
	const statements = [
		path.root,
		...path.siblings,
		...links.flatMap((l) => (l.statement ? [l.statement] : [])),
	];
	for (const hop of statements) {
		add(hop.statement.id);
		add(hop.statement.clauseId);
		add(hop.ownerId);
		add(hop.otherId);
		for (const condition of hop.conditions) {
			add(condition.condition.id);
			add(condition.partyId);
		}
	}
	for (const link of links) {
		add(link.fromClauseId);
		add(link.toClauseId);
	}
	for (const node of [...path.cites, ...path.terms, ...path.clauseValues]) add(node.id);
	const targets = new Set(ids);
	for (const value of kg.values)
		if (value.quantifiesId && targets.has(value.quantifiesId)) add(value.id);
	return { rootId: path.root.statement.id, nodeIds: [...ids], flags: path.flags };
}
