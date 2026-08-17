'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { fetchKnowledgeGraph } from '@/services/knowledge';
import { useDocumentStore } from '@/stores/document';
import {
	KG_TOP_K_STEP_SIZE,
	MAX_KG_HOPS,
	MAX_KG_TOP_K,
	MIN_KG_TOP_K,
	useKnowledgeGraphStore,
} from '@/stores/knowledgeGraph';
import { buildKnowledgeGraphBridge } from '@/features/docx/utils/knowledge/kg-bridge';
import type { KgLedger } from '@/features/docx/utils/knowledge/attention';
import type { KgEdgeType, KgNodeKind, KnowledgeGraph, ProvisionType } from '@/types/knowledge';

interface KnowledgeGraphPanelProps {
	docId: string;
}

type SimNode = d3.SimulationNodeDatum & {
	id: string;
	kind: KgNodeKind;
	label: string;
	title: string;
	provisionType?: ProvisionType;
	radius: number;
};

type SimLink = d3.SimulationLinkDatum<SimNode> & {
	type: KgEdgeType;
};

type NodeSelection = d3.Selection<SVGCircleElement, SimNode, SVGGElement, unknown>;
type LinkSelection = d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown>;

const NODE_COLORS: Record<KgNodeKind, string> = {
	party: '#7c3aed',
	clause: '#0ea5e9',
	definedTerm: '#14b8a6',
	provision: '#94a3b8',
	condition: '#a855f7',
	reference: '#64748b',
	value: '#eab308',
};

const PROVISION_COLORS: Record<ProvisionType, string> = {
	obligation: '#ef4444',
	right: '#22c55e',
	prohibition: '#f59e0b',
};

const EDGE_COLORS: Record<KgEdgeType, string> = {
	// Structure — muted, it is the scaffolding.
	is_part_of: '#cbd5e1',
	defines: '#5eead4',
	// Party attachment — the deontic tone.
	assigns_obligation_to: '#fca5a5',
	grants_right_to: '#86efac',
	// Semantic cross-clause links — what carries impact between clauses.
	uses: '#7dd3fc',
	references: '#94a3b8',
	depends_on: '#c084fc',
	supersedes: '#fb923c',
	modifies: '#fbbf24',
	contradicts: '#e11d48',
};

const NODE_LEGEND: Array<{ color: string; label: string }> = [
	{ color: NODE_COLORS.party, label: 'Party' },
	{ color: NODE_COLORS.clause, label: 'Clause' },
	{ color: PROVISION_COLORS.obligation, label: 'Obligation' },
	{ color: PROVISION_COLORS.right, label: 'Right' },
	{ color: PROVISION_COLORS.prohibition, label: 'Prohibition' },
	{ color: NODE_COLORS.definedTerm, label: 'Defined term' },
	{ color: NODE_COLORS.condition, label: 'Condition' },
	{ color: NODE_COLORS.reference, label: 'Reference' },
	{ color: NODE_COLORS.value, label: 'Value' },
];

const EDGE_LEGEND: Array<{ color: string; label: string }> = [
	{ color: EDGE_COLORS.assigns_obligation_to, label: 'assigns obligation to (→ party)' },
	{ color: EDGE_COLORS.grants_right_to, label: 'grants right to (→ party)' },
	{ color: EDGE_COLORS.depends_on, label: 'depends on (gated by a clause)' },
	{ color: EDGE_COLORS.references, label: 'references (neutral mention)' },
	{ color: EDGE_COLORS.uses, label: 'uses (→ defined term)' },
	{ color: EDGE_COLORS.defines, label: 'defines (clause → term)' },
	{ color: EDGE_COLORS.is_part_of, label: 'is part of (containment)' },
	{ color: EDGE_COLORS.supersedes, label: 'supersedes / modifies' },
];

const DIMMED_NODE_OPACITY = 0.1;
const DIMMED_LINK_OPACITY = 0.04;

function nodeColor(node: SimNode): string {
	if (node.kind === 'provision' && node.provisionType) {
		return PROVISION_COLORS[node.provisionType];
	}
	return NODE_COLORS[node.kind];
}

function buildGraph(kg: KnowledgeGraph): { nodes: SimNode[]; links: SimLink[] } {
	const nodes: SimNode[] = [];

	for (const party of kg.parties) {
		nodes.push({
			id: party.id,
			kind: 'party',
			label: party.name,
			title: `${party.role || 'Party'}: ${party.name}`,
			radius: 13,
		});
	}
	for (const clause of kg.clauses) {
		const label = clause.ref || clause.heading || clause.id;
		nodes.push({
			id: clause.id,
			kind: 'clause',
			label,
			title: `Clause ${label}${clause.heading ? ` — ${clause.heading}` : ''}`,
			radius: 8,
		});
	}
	for (const term of kg.definedTerms) {
		nodes.push({
			id: term.id,
			kind: 'definedTerm',
			label: term.term,
			title: `TERM ${term.term}${term.definition ? ` — ${term.definition}` : ''}`,
			radius: 7,
		});
	}
	for (const provision of kg.provisions) {
		nodes.push({
			id: provision.id,
			kind: 'provision',
			provisionType: provision.type,
			label: provision.action || provision.type,
			title: `${provision.type.toUpperCase()}: ${provision.summary}`,
			radius: 5.5,
		});
	}
	for (const condition of kg.conditions) {
		nodes.push({
			id: condition.id,
			kind: 'condition',
			label: condition.operator || 'IF',
			title: `${condition.operator || 'IF'}: ${condition.trigger}`,
			radius: 4.5,
		});
	}
	for (const reference of kg.references) {
		const label = [reference.name, reference.citation].filter(Boolean).join(' ');
		nodes.push({
			id: reference.id,
			kind: 'reference',
			label: reference.name,
			title: `REFERENCE: ${label}`,
			radius: 4.5,
		});
	}
	for (const value of kg.values) {
		const label = [value.amount, value.unit].filter(Boolean).join(' ');
		nodes.push({
			id: value.id,
			kind: 'value',
			label,
			title: `${value.valueType || 'VALUE'}: ${label}`,
			radius: 4.5,
		});
	}

	const nodeIds = new Set(nodes.map((n) => n.id));
	const links: SimLink[] = kg.edges
		.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
		.map((e) => ({ source: e.source, target: e.target, type: e.type }));

	return { nodes, links };
}

/** Compact impact ledger for the focused party (burden ↔ benefit + top clauses). */
function LedgerCard({
	ledger,
	onSelectClause,
}: {
	ledger: KgLedger;
	onSelectClause: (clauseId: string) => void;
}) {
	const total = ledger.burdenWeight + ledger.benefitWeight;
	const burdenPct = total > 0 ? (ledger.burdenWeight / total) * 100 : 50;
	const benefitPct = 100 - burdenPct;

	return (
		<div className="absolute right-3 top-3 z-10 w-56 space-y-2 rounded-md border border-border bg-popover/95 p-2.5 text-2xs text-popover-foreground shadow-md backdrop-blur">
			<div className="truncate font-semibold" title={ledger.partyName}>
				{ledger.partyName}
			</div>

			<div>
				<div className="mb-0.5 flex justify-between text-muted-foreground">
					<span>Burden {ledger.burdenWeight.toFixed(1)}</span>
					<span>Benefit {ledger.benefitWeight.toFixed(1)}</span>
				</div>
				<div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
					<span style={{ width: `${burdenPct}%`, backgroundColor: '#ef4444' }} />
					<span style={{ width: `${benefitPct}%`, backgroundColor: '#22c55e' }} />
				</div>
			</div>

			<div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
				<span>
					<span className="font-medium text-foreground">{ledger.obligations}</span> obligations
				</span>
				<span>
					<span className="font-medium text-foreground">{ledger.prohibitions}</span> prohibitions
				</span>
				<span>
					<span className="font-medium text-foreground">{ledger.rights}</span> rights
				</span>
			</div>

			{ledger.topClauses.length > 0 && (
				<div className="space-y-1">
					<div className="font-medium text-foreground/70">Heaviest clauses</div>
					{ledger.topClauses.map((clause) => (
						<button
							key={clause.id}
							type="button"
							onClick={() => onSelectClause(clause.id)}
							className="flex w-full items-center gap-1.5 text-left hover:text-foreground"
							title={clause.label}
						>
							<span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
								<span
									className="block h-full rounded-full bg-primary"
									style={{ width: `${Math.max(6, clause.score * 100)}%` }}
								/>
							</span>
							<span className="w-20 truncate">{clause.label}</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

export function KnowledgeGraphPanel({ docId }: KnowledgeGraphPanelProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const nodeSelRef = useRef<NodeSelection | null>(null);
	const linkSelRef = useRef<LinkSelection | null>(null);
	const draggedRef = useRef(false);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const [kg, setKg] = useState<KnowledgeGraph | null>(null);
	const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
	const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
	// Bumped whenever the d3 selections are rebuilt, so the styling effect re-runs.
	const [graphVersion, setGraphVersion] = useState(0);

	const focusNodeId = useKnowledgeGraphStore((s) => s.focusNodeId);
	const hops = useKnowledgeGraphStore((s) => s.hops);
	const topK = useKnowledgeGraphStore((s) => s.topK);
	const focusNode = useKnowledgeGraphStore((s) => s.focusNode);
	const setHops = useKnowledgeGraphStore((s) => s.setHops);
	const setTopK = useKnowledgeGraphStore((s) => s.setTopK);
	const clearFocus = useKnowledgeGraphStore((s) => s.clearFocus);
	const setBridgePayload = useKnowledgeGraphStore((s) => s.setBridgePayload);
	const focusNodeIds = useKnowledgeGraphStore((s) => s.focusNodeIds);
	const nodeScores = useKnowledgeGraphStore((s) => s.nodeScores);
	const ledger = useKnowledgeGraphStore((s) => s.ledger);
	const paragraphs = useDocumentStore((s) => s.paragraphs);
	const nodesById = useMemo(() => new Map(paragraphs.map((n) => [n.id, n])), [paragraphs]);

	// Fetch the pre-generated KG for the current document.
	useEffect(() => {
		if (!docId) return;
		let cancelled = false;
		clearFocus();

		const load = async () => {
			setStatus('loading');
			setKg(null);
			try {
				const graph = await fetchKnowledgeGraph(docId);
				if (cancelled) return;
				if (!graph) {
					setStatus('missing');
					return;
				}
				setKg(graph);
				setStatus('ready');
			} catch {
				if (!cancelled) setStatus('error');
			}
		};
		void load();

		return () => {
			cancelled = true;
		};
	}, [docId, clearFocus]);

	// Track container size so the graph fills the (resizable) panel.
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			const rect = entries[0]?.contentRect;
			if (rect) setSize({ width: rect.width, height: rect.height });
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const graph = useMemo(() => (kg ? buildGraph(kg) : null), [kg]);
	const focusedNode = useMemo(
		() => graph?.nodes.find((n) => n.id === focusNodeId) ?? null,
		[graph, focusNodeId]
	);
	const isPartyFocus = focusedNode?.kind === 'party';

	// The bright set comes from the derived payload (party top-K or neighborhood).
	const highlightIds = useMemo<Set<string> | null>(
		() => (focusNodeIds.length > 0 ? new Set(focusNodeIds) : null),
		[focusNodeIds]
	);

	// Derive the bridge payload (anchor + related paragraphs + entity spans +
	// deontic rail + ledger) and hand it to the document viewer.
	useEffect(() => {
		if (!kg || !focusNodeId) return;
		setBridgePayload(buildKnowledgeGraphBridge(kg, focusNodeId, hops, topK, nodesById));
	}, [kg, focusNodeId, hops, topK, nodesById, setBridgePayload]);

	// d3-force simulation + render. Rebuilds only when the graph or size changes.
	useEffect(() => {
		if (!graph || !svgRef.current || size.width === 0 || size.height === 0) return;
		const { width, height } = size;
		const nodes = graph.nodes.map((n) => ({ ...n }));
		const links = graph.links.map((l) => ({ ...l }));

		const svg = d3.select(svgRef.current);
		svg.selectAll('*').remove();

		const root = svg.append('g');

		const zoom = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.2, 4])
			.on('zoom', (event) => root.attr('transform', event.transform.toString()));
		svg.call(zoom).on('dblclick.zoom', null);
		svg.on('click', () => clearFocus());

		const link = root
			.append('g')
			.attr('stroke-opacity', 0.8)
			.selectAll<SVGLineElement, SimLink>('line')
			.data(links)
			.join('line')
			.attr('stroke', (d) => EDGE_COLORS[d.type])
			.attr('stroke-width', 1.2);

		const node = root
			.append('g')
			.attr('stroke', '#fff')
			.attr('stroke-width', 1.2)
			.selectAll<SVGCircleElement, SimNode>('circle')
			.data(nodes)
			.join('circle')
			.attr('r', (d) => d.radius)
			.attr('fill', (d) => nodeColor(d))
			.attr('cursor', 'pointer');

		node
			.on('mouseenter', (event: MouseEvent, d) => {
				const rect = containerRef.current?.getBoundingClientRect();
				setHover({
					x: event.clientX - (rect?.left ?? 0) + 12,
					y: event.clientY - (rect?.top ?? 0) + 12,
					text: d.title,
				});
			})
			.on('mousemove', (event: MouseEvent, d) => {
				const rect = containerRef.current?.getBoundingClientRect();
				setHover({
					x: event.clientX - (rect?.left ?? 0) + 12,
					y: event.clientY - (rect?.top ?? 0) + 12,
					text: d.title,
				});
			})
			.on('mouseleave', () => setHover(null))
			.on('click', (event: MouseEvent, d) => {
				event.stopPropagation();
				if (draggedRef.current) return; // ignore the click that ends a drag
				focusNode(d.id);
			});

		nodeSelRef.current = node;
		linkSelRef.current = link;

		const chargeStrength = -220 - nodes.length * 1.5;

		const simulation = d3
			.forceSimulation<SimNode>(nodes)
			.force(
				'link',
				d3
					.forceLink<SimNode, SimLink>(links)
					.id((d) => d.id)
					.distance(70)
					.strength(0.5)
			)
			.force('charge', d3.forceManyBody<SimNode>().strength(chargeStrength).distanceMax(600))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('x', d3.forceX(width / 2).strength(0.03))
			.force('y', d3.forceY(height / 2).strength(0.03))
			.force(
				'collide',
				d3.forceCollide<SimNode>().radius((d) => d.radius + 7)
			);

		const fitToView = () => {
			const pad = 24;
			const xs = nodes.map((n) => n.x ?? 0);
			const ys = nodes.map((n) => n.y ?? 0);
			const minX = Math.min(...xs);
			const maxX = Math.max(...xs);
			const minY = Math.min(...ys);
			const maxY = Math.max(...ys);
			const gw = Math.max(maxX - minX, 1);
			const gh = Math.max(maxY - minY, 1);
			const k = Math.min((width - pad * 2) / gw, (height - pad * 2) / gh, 1.5);
			const tx = width / 2 - k * ((minX + maxX) / 2);
			const ty = height / 2 - k * ((minY + maxY) / 2);
			svg
				.transition()
				.duration(400)
				.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
		};

		simulation.on('tick', () => {
			link
				.attr('x1', (d) => (d.source as SimNode).x ?? 0)
				.attr('y1', (d) => (d.source as SimNode).y ?? 0)
				.attr('x2', (d) => (d.target as SimNode).x ?? 0)
				.attr('y2', (d) => (d.target as SimNode).y ?? 0);
			node.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0);
		});
		simulation.on('end', fitToView);

		const drag = d3
			.drag<SVGCircleElement, SimNode>()
			.on('start', (event, d) => {
				draggedRef.current = false;
				if (!event.active) simulation.alphaTarget(0.3).restart();
				d.fx = d.x;
				d.fy = d.y;
			})
			.on('drag', (event, d) => {
				draggedRef.current = true;
				d.fx = event.x;
				d.fy = event.y;
			})
			.on('end', (event, d) => {
				if (!event.active) simulation.alphaTarget(0);
				d.fx = null;
				d.fy = null;
			});
		node.call(drag);

		setGraphVersion((v) => v + 1);

		return () => {
			simulation.stop();
			nodeSelRef.current = null;
			linkSelRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [graph, size]);

	// Restyle (highlight / dim / size-by-attention) without rebuilding the sim.
	useEffect(() => {
		const node = nodeSelRef.current;
		const link = linkSelRef.current;
		if (!node || !link) return;

		if (!highlightIds) {
			node
				.attr('opacity', 1)
				.attr('stroke', '#fff')
				.attr('stroke-width', 1.2)
				.attr('r', (d) => d.radius);
			link.attr('stroke-opacity', 0.8);
			return;
		}

		const radiusFor = (d: SimNode): number => {
			if (!highlightIds.has(d.id)) return d.radius;
			const score = nodeScores[d.id];
			// Attention-scaled radius for party focus; otherwise a light emphasis.
			if (score != null) return d.radius * (0.7 + 1.7 * score);
			return d.id === focusNodeId ? d.radius * 1.55 : d.radius;
		};

		node
			.attr('opacity', (d) => (highlightIds.has(d.id) ? 1 : DIMMED_NODE_OPACITY))
			.attr('stroke', (d) => (d.id === focusNodeId ? '#0f172a' : '#fff'))
			.attr('stroke-width', (d) => (d.id === focusNodeId ? 2.6 : highlightIds.has(d.id) ? 1.5 : 1))
			.attr('r', radiusFor);

		link.attr('stroke-opacity', (d) => {
			const source = typeof d.source === 'string' ? d.source : (d.source as SimNode).id;
			const target = typeof d.target === 'string' ? d.target : (d.target as SimNode).id;
			return highlightIds.has(source) && highlightIds.has(target) ? 0.95 : DIMMED_LINK_OPACITY;
		});
	}, [graphVersion, highlightIds, focusNodeId, nodeScores]);

	const counts = kg
		? {
				parties: kg.parties.length,
				clauses: kg.clauses.length,
				provisions: kg.provisions.length,
			}
		: null;

	return (
		<div className="flex h-full flex-col">
			{status === 'ready' && counts && (
				<div className="space-y-1.5 border-b border-border/60 px-3 py-2 text-2xs text-muted-foreground">
					<div>
						{counts.parties} parties · {counts.clauses} clauses · {counts.provisions} provisions
					</div>
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
						<span className="font-medium text-foreground/70">Nodes</span>
						{NODE_LEGEND.map((item) => (
							<span key={item.label} className="inline-flex items-center gap-1">
								<span
									className="inline-block h-2 w-2 rounded-full"
									style={{ backgroundColor: item.color }}
								/>
								{item.label}
							</span>
						))}
					</div>
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
						<span className="font-medium text-foreground/70">Edges</span>
						{EDGE_LEGEND.map((item) => (
							<span key={item.label} className="inline-flex items-center gap-1">
								<span
									className="inline-block h-0.5 w-4 rounded-full"
									style={{ backgroundColor: item.color }}
								/>
								{item.label}
							</span>
						))}
					</div>
				</div>
			)}

			<div ref={containerRef} className="relative min-h-0 flex-1">
				{status === 'loading' && (
					<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
						Loading knowledge graph…
					</div>
				)}
				{status === 'missing' && (
					<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
						No knowledge graph generated for this document yet. Build it with the notebook
						(notebooks/KG/build_kg.ipynb) into infra/json/kg/.
					</div>
				)}
				{status === 'error' && (
					<div className="flex h-full items-center justify-center text-sm text-destructive">
						Failed to load the knowledge graph.
					</div>
				)}
				{status === 'ready' && (
					<>
						{focusedNode && (
							<div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-md border border-border bg-popover/95 px-2 py-1 text-2xs text-popover-foreground shadow-sm backdrop-blur">
								<span className="max-w-[160px] truncate font-medium" title={focusedNode.label}>
									{focusedNode.label}
								</span>
								{isPartyFocus ? (
									<>
										<span className="text-muted-foreground">· top {topK}</span>
										<button
											type="button"
											aria-label="Fewer clauses"
											disabled={topK <= MIN_KG_TOP_K}
											onClick={() => setTopK((k) => k - KG_TOP_K_STEP_SIZE)}
											className="flex h-4 w-4 items-center justify-center rounded border border-border leading-none hover:bg-muted disabled:opacity-40"
										>
											−
										</button>
										<button
											type="button"
											aria-label="More clauses"
											disabled={topK >= MAX_KG_TOP_K}
											onClick={() => setTopK((k) => k + KG_TOP_K_STEP_SIZE)}
											className="flex h-4 w-4 items-center justify-center rounded border border-border leading-none hover:bg-muted disabled:opacity-40"
										>
											+
										</button>
									</>
								) : (
									<>
										<span className="text-muted-foreground">· {hops}-hop</span>
										<button
											type="button"
											aria-label="Fewer hops"
											disabled={hops <= 0}
											onClick={() => setHops((h) => h - 1)}
											className="flex h-4 w-4 items-center justify-center rounded border border-border leading-none hover:bg-muted disabled:opacity-40"
										>
											−
										</button>
										<button
											type="button"
											aria-label="More hops"
											disabled={hops >= MAX_KG_HOPS}
											onClick={() => setHops((h) => h + 1)}
											className="flex h-4 w-4 items-center justify-center rounded border border-border leading-none hover:bg-muted disabled:opacity-40"
										>
											+
										</button>
									</>
								)}
								<button
									type="button"
									onClick={() => clearFocus()}
									className="rounded border border-border px-1.5 leading-none hover:bg-muted"
								>
									Clear
								</button>
							</div>
						)}

						{ledger && <LedgerCard ledger={ledger} onSelectClause={(id) => focusNode(id)} />}

						<svg ref={svgRef} className="h-full w-full" />
						{hover && (
							<div
								className="pointer-events-none absolute z-10 max-w-[280px] rounded-md border border-border bg-popover px-2 py-1 text-2xs text-popover-foreground shadow-md"
								style={{ left: hover.x, top: hover.y }}
							>
								{hover.text}
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
