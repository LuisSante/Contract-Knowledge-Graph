import type { KgEdgeType, KgNodeKind, KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';
import { computeNodePpr } from '@/features/docx/utils/knowledge/party-pagerank';

export interface KgVizNode {
	id: string;
	kind: KgNodeKind;
	label: string;
	/** Raw PPR mass. */
	score: number;
	/** score / peak — the 0–1 reading shown as a percentage. */
	share: number;
	/** What the radius reads from; see `sizeShare` below for why it is not `share`. */
	weight: number;
	degree: number;
	isSeed: boolean;
}

export interface KgVizEdge {
	source: string;
	target: string;
	type: KgEdgeType;
}

export interface KgVizGraph {
	nodes: KgVizNode[];
	edges: KgVizEdge[];
	/** Nodes in the whole graph, before the top-N cut. */
	totalNodes: number;
	/** Share of the total PPR mass the drawn nodes account for. */
	massShown: number;
	countByKind: Record<KgNodeKind, number>;
}

export const KG_NODE_KINDS: KgNodeKind[] = [
	'party',
	'clause',
	'obligation',
	'right',
	'prohibition',
	'condition',
	'value',
	'definedTerm',
	'reference',
];

function truncate(text: string, max = 42): string {
	const clean = text.replace(/\s+/g, ' ').trim();
	return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

interface RawNode {
	id: string;
	kind: KgNodeKind;
	label: string;
}

function collectNodes(kg: KnowledgeGraph): RawNode[] {
	return [
		...kg.parties.map((n) => ({ id: n.id, kind: 'party' as const, label: n.name })),
		...kg.clauses.map((n) => ({
			id: n.id,
			kind: 'clause' as const,
			label: n.ref ? `${n.ref} ${n.heading}` : n.heading || n.id,
		})),
		...deonticNodes(kg).map((n) => ({
			id: n.id,
			kind: n.kind,
			label: n.action || n.summary || n.text,
		})),
		...kg.conditions.map((n) => ({ id: n.id, kind: 'condition' as const, label: n.trigger })),
		...kg.values.map((n) => ({
			id: n.id,
			kind: 'value' as const,
			label: [n.amount, n.unit].filter(Boolean).join(' ') || n.valueType,
		})),
		...kg.definedTerms.map((n) => ({ id: n.id, kind: 'definedTerm' as const, label: n.term })),
		...kg.references.map((n) => ({ id: n.id, kind: 'reference' as const, label: n.name })),
	];
}

/**
 * The top-`limit` nodes by PPR mass from `seedId`, with every edge that runs
 * between them.
 *
 * The cut is the whole point: the Bellicum graph is ~700 nodes and 1083 edges, so
 * drawing all of it answers nothing. Ranking by PPR and keeping the head *is* the
 * reading — what is on screen is where the walk put its mass.
 */
export function buildKgViz(
	kg: KnowledgeGraph,
	seedId: string,
	limit: number,
	kinds: Set<KgNodeKind>
): KgVizGraph {
	const { byId, peak } = computeNodePpr(kg, seedId);
	const raw = collectNodes(kg);

	const countByKind = Object.fromEntries(KG_NODE_KINDS.map((k) => [k, 0])) as Record<
		KgNodeKind,
		number
	>;
	for (const node of raw) countByKind[node.kind] += 1;

	const totalMass = [...byId.values()].reduce((sum, value) => sum + value, 0) || 1;

	const kept = raw
		.filter((node) => node.id === seedId || kinds.has(node.kind))
		.map((node) => ({ ...node, score: byId.get(node.id) ?? 0 }))
		.sort((a, b) => b.score - a.score)
		.slice(0, Math.max(limit, 1));

	const keptIds = new Set(kept.map((node) => node.id));
	const edges: KgVizEdge[] = kg.edges
		.filter((edge) => keptIds.has(edge.source) && keptIds.has(edge.target))
		.map((edge) => ({ source: edge.source, target: edge.target, type: edge.type }));

	const degree = new Map<string, number>();
	for (const edge of edges) {
		degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
		degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
	}

	// The seed holds an order of magnitude more mass than anything else, so sizing
	// against it flattens every other node onto the minimum radius. Sizing against
	// the runner-up spreads the rest across the full range; the seed is pinned to 1
	// and gets a ring of its own so it still reads as the origin.
	const runnerUp = kept.find((node) => node.id !== seedId)?.score ?? 0;

	const nodes: KgVizNode[] = kept.map((node) => {
		const isSeed = node.id === seedId;
		return {
			id: node.id,
			kind: node.kind,
			label: truncate(node.label || node.id),
			score: node.score,
			share: peak > 0 ? node.score / peak : 0,
			weight: isSeed ? 1 : runnerUp > 0 ? Math.min(1, node.score / runnerUp) : 0,
			degree: degree.get(node.id) ?? 0,
			isSeed,
		};
	});

	const massShown = nodes.reduce((sum, node) => sum + node.score, 0) / totalMass;

	return { nodes, edges, totalNodes: raw.length, massShown, countByKind };
}
