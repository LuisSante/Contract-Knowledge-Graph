import type { KgEdgeType, KgNodeKind, KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';

export interface KgVizNode {
	id: string;
	kind: KgNodeKind;
	label: string;
	/** Share of the walk's total mass — the vector sums to 1, so this is a fraction. */
	score: number;
	/** Where the restart vector put mass on this node; 0 for everything but statements. */
	prior: number;
	/** score − prior: what propagation added, or drained away. */
	gain: number;
	/** 0–1 position on a log scale over the drawn set; what the radius reads from. */
	weight: number;
	degree: number;
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
	/** Share of the total mass the drawn nodes account for. */
	massShown: number;
	/** Pinned nodes that the top-N cut would have dropped. */
	pinnedExtra: number;
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
			label: n.heading || n.ref || n.id,
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
 * The top-`limit` nodes by PPR mass, with every edge that runs between them.
 *
 * The scores are the server's — `byNode` and `priorByNode` from the clause-importance
 * endpoint — not recomputed here. Passing the fixed point *and* the restart vector it
 * came from is the point: the gap between them is what propagation actually did.
 *
 * Sizing is logarithmic and computed over the drawn set. The full vector spans ~400:1,
 * from the heaviest party down to a defined term, so once the cut is wide a linear
 * radius pins everything below the top few onto the minimum and the picture stops
 * discriminating exactly where most of the nodes live.
 *
 * `pinned` survives the cut. Without it the selected clause is mostly invisible: at the
 * default 40 the top-N holds 3 of the 15 nodes of *Rights Granted* and 6 of the 18 of
 * *Term and Termination*, because conditions and values sit at the bottom of the vector.
 * The kind filter still applies — that one is the reader's own choice, not the cut's.
 */
export function buildKgViz(
	kg: KnowledgeGraph,
	scoreById: Record<string, number>,
	priorById: Record<string, number>,
	limit: number,
	kinds: Set<KgNodeKind>,
	pinned: Set<string> | null
): KgVizGraph {
	const raw = collectNodes(kg);

	const countByKind = Object.fromEntries(KG_NODE_KINDS.map((k) => [k, 0])) as Record<
		KgNodeKind,
		number
	>;
	for (const node of raw) countByKind[node.kind] += 1;

	const totalMass = Object.values(scoreById).reduce((sum, value) => sum + value, 0) || 1;

	const ranked = raw
		.filter((node) => kinds.has(node.kind))
		.map((node) => ({ ...node, score: scoreById[node.id] ?? 0 }))
		.sort((a, b) => b.score - a.score);

	const head = ranked.slice(0, Math.max(limit, 1));
	const headIds = new Set(head.map((node) => node.id));
	const extra = pinned ? ranked.filter((node) => pinned.has(node.id) && !headIds.has(node.id)) : [];
	const kept = [...head, ...extra];

	const keptIds = new Set(kept.map((node) => node.id));
	const edges: KgVizEdge[] = kg.edges
		.filter((edge) => keptIds.has(edge.source) && keptIds.has(edge.target))
		.map((edge) => ({ source: edge.source, target: edge.target, type: edge.type }));

	const degree = new Map<string, number>();
	for (const edge of edges) {
		degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
		degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
	}

	const positive = kept.map((node) => node.score).filter((score) => score > 0);
	const logMax = Math.log(Math.max(...positive, Number.MIN_VALUE));
	const logMin = Math.log(Math.min(...positive, Number.MIN_VALUE));
	const logSpan = logMax - logMin;

	const nodes: KgVizNode[] = kept.map((node) => {
		const prior = priorById[node.id] ?? 0;
		return {
			id: node.id,
			kind: node.kind,
			label: truncate(node.label || node.id),
			score: node.score,
			prior,
			gain: node.score - prior,
			weight: node.score > 0 && logSpan > 0 ? (Math.log(node.score) - logMin) / logSpan : 0,
			degree: degree.get(node.id) ?? 0,
		};
	});

	const massShown = nodes.reduce((sum, node) => sum + node.score, 0) / totalMass;

	return {
		nodes,
		edges,
		totalNodes: raw.length,
		massShown,
		pinnedExtra: extra.length,
		countByKind,
	};
}
