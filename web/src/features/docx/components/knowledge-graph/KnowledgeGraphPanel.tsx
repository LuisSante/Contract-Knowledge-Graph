'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { fetchKnowledgeGraph, fetchPartyMergeHints } from '@/services/knowledge';
import { useDocumentStore } from '@/stores/document';
import { useKnowledgeGraphStore } from '@/stores/knowledgeGraph';
import { buildKnowledgeGraphBridge } from '@/features/docx/utils/knowledge/kg-bridge';
import { applyPartyView } from '@/features/docx/utils/knowledge/party-view';
import { PartyManager } from '@/features/docx/components/knowledge-graph/PartyManager';
import type { KgLedger } from '@/features/docx/utils/knowledge/attention';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import type { DeonticKind, KgEdgeType, KgNodeKind, KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';

interface KnowledgeGraphPanelProps {
	docId: string;
}

/** Parties carry the whole canvas on the entry view, so they get drawn larger. */
const PARTY_ENTRY_RADIUS = 24;

type SimNode = d3.SimulationNodeDatum & {
	id: string;
	kind: KgNodeKind;
	label: string;
	/** Tooltip body. The kind is rendered separately, so it is not repeated here. */
	detail: string;
	radius: number;
};

type SimLink = d3.SimulationLinkDatum<SimNode> & {
	type: KgEdgeType;
};

type NodeSelection = d3.Selection<SVGCircleElement, SimNode, SVGGElement, unknown>;
type LinkSelection = d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown>;

// ColorBrewer 9-class Set1 (qualitative), mapped to keep the deontic tone:
// red = obligation, green = right, orange = prohibition.
const NODE_COLORS: Record<KgNodeKind, string> = {
	party: '#984ea3',
	clause: '#377eb8',
	obligation: '#e41a1c',
	right: '#4daf4a',
	prohibition: '#ff7f00',
	definedTerm: '#a65628',
	condition: '#f781bf',
	reference: '#999999',
	value: '#ffff33',
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

const NODE_LEGEND: Array<{ kind: KgNodeKind; label: string }> = [
	{ kind: 'party', label: 'Party' },
	{ kind: 'clause', label: 'Clause' },
	{ kind: 'obligation', label: 'Obligation' },
	{ kind: 'right', label: 'Right' },
	{ kind: 'prohibition', label: 'Prohibition' },
	{ kind: 'definedTerm', label: 'Defined term' },
	{ kind: 'condition', label: 'Condition' },
	{ kind: 'reference', label: 'Reference' },
	{ kind: 'value', label: 'Value' },
];

// `types` groups the edge kinds one legend row stands for (supersedes/modifies share a row).
const EDGE_LEGEND: Array<{ types: KgEdgeType[]; label: string }> = [
	{ types: ['assigns_obligation_to'], label: 'assigns obligation to (→ party)' },
	{ types: ['grants_right_to'], label: 'grants right to (→ party)' },
	{ types: ['depends_on'], label: 'depends on (gated by a clause)' },
	{ types: ['references'], label: 'references (neutral mention)' },
	{ types: ['uses'], label: 'uses (→ defined term)' },
	{ types: ['defines'], label: 'defines (clause → term)' },
	{ types: ['is_part_of'], label: 'is part of (containment)' },
	{ types: ['supersedes', 'modifies'], label: 'supersedes / modifies' },
	{ types: ['contradicts'], label: 'contradicts' },
];

const KIND_LABEL: Record<KgNodeKind, string> = Object.fromEntries(
	NODE_LEGEND.map((item) => [item.kind, item.label])
) as Record<KgNodeKind, string>;

const DIMMED_NODE_OPACITY = 0.1;
const DIMMED_LINK_OPACITY = 0.04;

function nodeColor(node: SimNode): string {
	return NODE_COLORS[node.kind];
}

function buildGraph(kg: KnowledgeGraph): { nodes: SimNode[]; links: SimLink[] } {
	const nodes: SimNode[] = [];

	for (const party of kg.parties) {
		nodes.push({
			id: party.id,
			kind: 'party',
			label: party.name,
			detail: `${party.name}${party.role ? ` \u2014 ${party.role}` : ''}`,
			radius: 13,
		});
	}
	for (const clause of kg.clauses) {
		const label = clause.ref || clause.heading || clause.id;
		nodes.push({
			id: clause.id,
			kind: 'clause',
			label,
			detail: `${label}${clause.heading ? ` \u2014 ${clause.heading}` : ''}`,
			radius: 8,
		});
	}
	for (const term of kg.definedTerms) {
		nodes.push({
			id: term.id,
			kind: 'definedTerm',
			label: term.term,
			detail: `${term.term}${term.definition ? ` \u2014 ${term.definition}` : ''}`,
			radius: 7,
		});
	}
	for (const statement of deonticNodes(kg)) {
		nodes.push({
			id: statement.id,
			kind: statement.kind,
			label: statement.action || statement.kind,
			detail: statement.summary || statement.action,
			radius: 5.5,
		});
	}
	for (const condition of kg.conditions) {
		nodes.push({
			id: condition.id,
			kind: 'condition',
			label: condition.operator || 'IF',
			detail: `${condition.operator || 'IF'} ${condition.trigger}`,
			radius: 4.5,
		});
	}
	for (const reference of kg.references) {
		const label = [reference.name, reference.citation].filter(Boolean).join(' ');
		nodes.push({
			id: reference.id,
			kind: 'reference',
			label: reference.name,
			detail: label,
			radius: 4.5,
		});
	}
	for (const value of kg.values) {
		const label = [value.amount, value.unit].filter(Boolean).join(' ');
		nodes.push({
			id: value.id,
			kind: 'value',
			label,
			detail: `${label}${value.valueType ? ` \u2014 ${value.valueType}` : ''}`,
			radius: 4.5,
		});
	}

	const nodeIds = new Set(nodes.map((n) => n.id));
	const links: SimLink[] = kg.edges
		.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
		.map((e) => ({ source: e.source, target: e.target, type: e.type }));

	return { nodes, links };
}

const SEVERITY_ROWS: Array<{ kind: DeonticKind; label: string; color: string }> = [
	{ kind: 'obligation', label: 'Obligation', color: NODE_COLORS.obligation },
	{ kind: 'right', label: 'Right', color: NODE_COLORS.right },
	{ kind: 'prohibition', label: 'Prohibition', color: NODE_COLORS.prohibition },
];

/** Sliders that reweight each deontic kind; recompute is live via the store. */
function SeveritySliders() {
	const severity = useKnowledgeGraphStore((s) => s.severity);
	const setSeverity = useKnowledgeGraphStore((s) => s.setSeverity);
	const usePageRank = useKnowledgeGraphStore((s) => s.usePageRank);
	const setUsePageRank = useKnowledgeGraphStore((s) => s.setUsePageRank);
	return (
		<div className="space-y-1 border-t border-border/60 pt-1.5">
			<label className="flex cursor-pointer items-center justify-between">
				<span className="font-medium text-foreground/70">Weight by PageRank</span>
				<input
					type="checkbox"
					checked={usePageRank}
					onChange={(event) => setUsePageRank(event.target.checked)}
					className="cursor-pointer accent-primary"
				/>
			</label>
			<div className="font-medium text-foreground/70">Severity weights</div>
			{SEVERITY_ROWS.map(({ kind, label, color }) => (
				<label key={kind} className="flex items-center gap-1.5">
					<span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
					<span className="w-16">{label}</span>
					<input
						type="range"
						min={0}
						max={1}
						step={0.05}
						value={severity[kind]}
						onChange={(event) => setSeverity(kind, Number(event.target.value))}
						className="h-1 flex-1 cursor-pointer accent-primary"
					/>
					<span className="w-7 text-right tabular-nums">{severity[kind].toFixed(2)}</span>
				</label>
			))}
		</div>
	);
}

function DivergingBar({ label, burdenPct }: { label: string; burdenPct: number }) {
	return (
		<div>
			<div className="flex justify-between text-muted-foreground">
				<span>{label}</span>
				<span>
					{Math.round(burdenPct)}% / {Math.round(100 - burdenPct)}%
				</span>
			</div>
			<div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
				<span style={{ width: `${burdenPct}%`, backgroundColor: '#ef4444' }} />
				<span style={{ width: `${100 - burdenPct}%`, backgroundColor: '#22c55e' }} />
			</div>
		</div>
	);
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
	const burdenIntensity = ledger.burdenCount > 0 ? ledger.burdenWeight / ledger.burdenCount : 0;
	const benefitIntensity = ledger.benefitCount > 0 ? ledger.benefitWeight / ledger.benefitCount : 0;
	const intensityTotal = burdenIntensity + benefitIntensity;
	const intensityBurdenPct = intensityTotal > 0 ? (burdenIntensity / intensityTotal) * 100 : 50;
	const maxClauseTotal = Math.max(...ledger.topClauses.map((c) => c.burden + c.benefit), 1e-9);

	return (
		<div className="absolute right-3 top-3 z-10 w-56 space-y-2 rounded-md border border-border bg-popover/95 p-2.5 text-2xs text-popover-foreground shadow-md backdrop-blur">
			<div className="truncate font-semibold" title={ledger.partyName}>
				{ledger.partyName}
			</div>

			<div className="space-y-1">
				<div className="flex justify-between text-muted-foreground">
					<span className="inline-flex items-center gap-1">
						<span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#ef4444' }} />
						Burden
					</span>
					<span className="inline-flex items-center gap-1">
						Benefit
						<span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#22c55e' }} />
					</span>
				</div>
				<DivergingBar label="Total" burdenPct={burdenPct} />
				<DivergingBar label="Intensity" burdenPct={intensityBurdenPct} />
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
					{ledger.topClauses.map((clause) => {
						const clauseTotal = clause.burden + clause.benefit;
						const lengthPct = Math.max(8, (clauseTotal / maxClauseTotal) * 100);
						const burdenShare = clauseTotal > 0 ? clause.burden / clauseTotal : 0;
						return (
							<button
								key={clause.id}
								type="button"
								onClick={() => onSelectClause(clause.id)}
								className="flex w-full items-center gap-1.5 text-left hover:text-foreground"
								title={`${clause.label} — burden ${clause.burden.toFixed(2)} / benefit ${clause.benefit.toFixed(2)}`}
							>
								<span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
									<span style={{ width: `${lengthPct * burdenShare}%`, backgroundColor: '#ef4444' }} />
									<span
										style={{ width: `${lengthPct * (1 - burdenShare)}%`, backgroundColor: '#22c55e' }}
									/>
								</span>
								<span className="w-20 truncate">{clause.label}</span>
							</button>
						);
					})}
				</div>
			)}

			<SeveritySliders />
		</div>
	);
}

export function KnowledgeGraphPanel({ docId }: KnowledgeGraphPanelProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const nodeSelRef = useRef<NodeSelection | null>(null);
	const linkSelRef = useRef<LinkSelection | null>(null);
	const draggedRef = useRef(false);
	// Layout carried across rebuilds: a top-K or severity change swaps the node set,
	// and without these the whole subgraph re-seeds and the camera snaps back.
	const posRef = useRef(new Map<string, { x: number; y: number }>());
	const transformRef = useRef<d3.ZoomTransform | null>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const [kg, setKg] = useState<KnowledgeGraph | null>(null);
	const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
	const [hover, setHover] = useState<{
		x: number;
		y: number;
		kind: KgNodeKind;
		detail: string;
	} | null>(null);
	// The kind filter doubles as the zoom level: only `party` is the entry view,
	// everything checked is the full graph.
	const [visibleKinds, setVisibleKinds] = useState<Set<KgNodeKind>>(() => new Set(['party']));
	// Until the user touches the filter the initial `{party}` is just a default, so
	// the first drill-down may replace it. After that the filter is theirs to keep.
	const filterTouchedRef = useRef(false);
	const [mergeHints, setMergeHints] = useState<Record<string, string[]>>({});
	const [mergeEntities, setMergeEntities] = useState<string[]>([]);
	const [hintsLoading, setHintsLoading] = useState(false);
	// Bumped whenever the d3 selections are rebuilt, so the styling effect re-runs.
	const [graphVersion, setGraphVersion] = useState(0);

	const focusNodeId = useKnowledgeGraphStore((s) => s.focusNodeId);
	const hops = useKnowledgeGraphStore((s) => s.hops);
	const topK = useKnowledgeGraphStore((s) => s.topK);
	const severity = useKnowledgeGraphStore((s) => s.severity);
	const usePageRank = useKnowledgeGraphStore((s) => s.usePageRank);
	const focusNode = useKnowledgeGraphStore((s) => s.focusNode);
	const clearFocus = useKnowledgeGraphStore((s) => s.clearFocus);
	const setFocusMeta = useKnowledgeGraphStore((s) => s.setFocusMeta);
	const setBridgePayload = useKnowledgeGraphStore((s) => s.setBridgePayload);
	const mergeGroups = useKnowledgeGraphStore((s) => s.mergeGroups);
	const hiddenParties = useKnowledgeGraphStore((s) => s.hiddenParties);
	const unhideParty = useKnowledgeGraphStore((s) => s.unhideParty);
	const clearPartyView = useKnowledgeGraphStore((s) => s.clearPartyView);
	const selectedPartyIds = useKnowledgeGraphStore((s) => s.selectedPartyIds);
	const toggleSelectedParty = useKnowledgeGraphStore((s) => s.toggleSelectedParty);
	const clearSelectedParties = useKnowledgeGraphStore((s) => s.clearSelectedParties);
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
		posRef.current.clear();
		transformRef.current = null;

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
				setMergeHints({});
				setMergeEntities([]);
				setHintsLoading(true);
				fetchPartyMergeHints(docId)
					.then((hints) => {
						if (!cancelled) {
							setMergeHints(hints.candidates);
							setMergeEntities(hints.entities);
						}
					})
					.finally(() => {
						if (!cancelled) setHintsLoading(false);
					});
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

	// The user's merge/hide choices canonicalize parties view-time; the stored KG
	// is never mutated, so every downstream computation runs over this view.
	const viewKg = useMemo(
		() => (kg ? applyPartyView(kg, mergeGroups, new Set(hiddenParties)) : null),
		[kg, mergeGroups, hiddenParties]
	);

	const fullGraph = useMemo(() => (viewKg ? buildGraph(viewKg) : null), [viewKg]);

	const rawPartyName = useMemo(
		() => new Map((kg?.parties ?? []).map((p) => [p.id, p.name] as const)),
		[kg]
	);
	const hiddenNamed = useMemo(
		() => hiddenParties.map((id) => ({ id, name: rawPartyName.get(id) ?? id })),
		[hiddenParties, rawPartyName]
	);
	const membersOf = useMemo<Record<string, string[]>>(
		() => Object.fromEntries(mergeGroups.map((g) => [g.id, g.members])),
		[mergeGroups]
	);


	// Scope is the focus subgraph, or the whole graph when nothing is focused.
	// Everything downstream reads it, so the kind filter composes on top.
	const scopeIds = useMemo<Set<string> | null>(
		() => (focusNodeIds.length > 0 ? new Set(focusNodeIds) : null),
		[focusNodeIds]
	);

	/** How many nodes of each kind the current scope holds, filter aside. */
	const kindCounts = useMemo(() => {
		const counts = {} as Record<KgNodeKind, number>;
		for (const node of fullGraph?.nodes ?? []) {
			if (scopeIds && !scopeIds.has(node.id)) continue;
			counts[node.kind] = (counts[node.kind] ?? 0) + 1;
		}
		return counts;
	}, [fullGraph, scopeIds]);

	// visible = (focus ? subgraph : everything) ∩ checked kinds.
	const graph = useMemo(() => {
		if (!fullGraph) return null;
		const soloParties = visibleKinds.size === 1 && visibleKinds.has('party');
		const nodes = fullGraph.nodes
			.filter((n) => visibleKinds.has(n.kind) && (!scopeIds || scopeIds.has(n.id)))
			// The bare parties carry the whole canvas, so they are drawn larger.
			.map((n) => (soloParties && !scopeIds ? { ...n, radius: PARTY_ENTRY_RADIUS } : n));
		const ids = new Set(nodes.map((n) => n.id));
		return {
			nodes,
			links: fullGraph.links.filter(
				(l) => ids.has(l.source as string) && ids.has(l.target as string)
			),
		};
	}, [fullGraph, visibleKinds, scopeIds]);

	const focusedNode = useMemo(
		() => fullGraph?.nodes.find((n) => n.id === focusNodeId) ?? null,
		[fullGraph, focusNodeId]
	);
	const isPartyEntry = !scopeIds && visibleKinds.size === 1 && visibleKinds.has('party');

	// First drill-down out of the pristine entry view: open every kind so the
	// subgraph is actually visible instead of being filtered down to the party.
	useEffect(() => {
		if (!focusNodeId || filterTouchedRef.current) return;
		filterTouchedRef.current = true;
		setVisibleKinds(new Set(NODE_LEGEND.map((item) => item.kind)));
	}, [focusNodeId]);

	// The focus chip lives in the panel header, which has no access to the graph.
	useEffect(() => {
		setFocusMeta(focusedNode ? { label: focusedNode.label, kind: focusedNode.kind } : null);
	}, [focusedNode, setFocusMeta]);

	// The bright set comes from the derived payload (party top-K or neighborhood).
	const highlightIds = useMemo<Set<string> | null>(
		() => (focusNodeIds.length > 0 ? new Set(focusNodeIds) : null),
		[focusNodeIds]
	);

	// Derive the bridge payload (anchor + related paragraphs + entity spans +
	// deontic rail + ledger) and hand it to the document viewer.
	useEffect(() => {
		if (!viewKg || !focusNodeId) return;
		setBridgePayload(
			buildKnowledgeGraphBridge(viewKg, focusNodeId, hops, topK, nodesById, severity, usePageRank)
		);
	}, [viewKg, focusNodeId, hops, topK, nodesById, severity, usePageRank, setBridgePayload]);

	// d3-force simulation + render. Rebuilds only when the graph or size changes.
	useEffect(() => {
		if (!graph || !svgRef.current || size.width === 0 || size.height === 0) return;
		const { width, height } = size;
		// Nodes we have already laid out keep their position; the rest fan out from
		// the centre on a golden-angle spiral so they never start stacked.
		const positions = posRef.current;
		const nodes: SimNode[] = graph.nodes.map((n, i) => {
			const prev = positions.get(n.id);
			if (prev) return { ...n, x: prev.x, y: prev.y };
			const angle = i * 2.399963;
			return { ...n, x: width / 2 + Math.cos(angle) * 30, y: height / 2 + Math.sin(angle) * 30 };
		});
		const links = graph.links.map((l) => ({ ...l }));
		// Mostly-known node set => this is a refinement, not a new graph: settle gently
		// and leave the camera alone.
		const known = nodes.filter((n) => positions.has(n.id)).length;
		const warmStart = nodes.length > 0 && known / nodes.length > 0.8;

		const svg = d3.select(svgRef.current);
		svg.selectAll('*').remove();

		const root = svg.append('g');

		// Auto-fit runs once after the layout settles, but a manual zoom/pan cancels
		// it for good so the view never snaps back under the user.
		let userZoomed = false;
		let didFit = warmStart;
		let panned = false;

		const zoom = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.2, 4])
			.on('zoom', (event) => {
				if (event.sourceEvent) {
					userZoomed = true;
					panned = true;
				}
				transformRef.current = event.transform;
				root.attr('transform', event.transform.toString());
			});
		svg.call(zoom).on('dblclick.zoom', null);

		if (warmStart && transformRef.current) svg.call(zoom.transform, transformRef.current);

		svg.on('pointerdown', () => {
			panned = false;
		});
		svg.on('click', (event: MouseEvent) => {
			if (panned || event.target !== svgRef.current) return;
			clearFocus();
		});

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

		// The tooltip is anchored to an invisible element at the cursor, so it only
		// needs container-relative coordinates; Radix handles offset and flipping.
		const track = (event: MouseEvent, d: SimNode) => {
			const rect = containerRef.current?.getBoundingClientRect();
			setHover({
				x: event.clientX - (rect?.left ?? 0),
				y: event.clientY - (rect?.top ?? 0),
				kind: d.kind,
				detail: d.detail,
			});
		};

		node
			.on('mouseenter', track)
			.on('mousemove', track)
			.on('mouseleave', () => setHover(null))
			.on('click', (event: MouseEvent, d) => {
				event.stopPropagation();
				if (draggedRef.current) return; // ignore the click that ends a drag
				if ((event.ctrlKey || event.metaKey) && d.kind === 'party') {
					toggleSelectedParty(d.id); // Ctrl/Cmd-click builds the action selection
					return;
				}
				clearSelectedParties();
				focusNode(d.id);
			});

		// Party names stay readable at every zoom level — they are the entry point.
		const label = root
			.append('g')
			.attr('pointer-events', 'none')
			.selectAll<SVGTextElement, SimNode>('text')
			.data(nodes.filter((d) => d.kind === 'party'))
			.join('text')
			.text((d) => d.label)
			.attr('font-size', 11)
			.attr('font-weight', 500)
			.attr('text-anchor', 'middle')
			.attr('fill', 'currentColor');

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
			)
			.alpha(warmStart ? 0.35 : 1);

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
			label.attr('x', (d) => d.x ?? 0).attr('y', (d) => (d.y ?? 0) + d.radius + 13);
		});
		simulation.on('end', () => {
			if (userZoomed || didFit) return;
			didFit = true;
			fitToView();
		});

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
			// Hand the settled layout to the next rebuild.
			for (const n of nodes) {
				if (n.x != null && n.y != null) positions.set(n.id, { x: n.x, y: n.y });
			}
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

		const selectedSet = new Set(selectedPartyIds);
		const entitySet = new Set(mergeEntities);
		const hasEntityInfo = entitySet.size > 0;
		const selectedRaw = selectedPartyIds.flatMap((id) => membersOf[id] ?? [id]);
		const selHasEntity = selectedRaw.some((r) => entitySet.has(r));
		const selHasRole = selectedRaw.some((r) => !entitySet.has(r));
		const complete = hasEntityInfo && selHasEntity && selHasRole;
		const compatibleRaw = new Set(selectedRaw.flatMap((raw) => mergeHints[raw] ?? []));
		// Only decorate when the resolver gave us something (pairs or entity typing).
		const hasHintData = compatibleRaw.size > 0 || hasEntityInfo;
		const hintByNode = new Map<string, 'suggested' | 'discouraged'>(
			selectedRaw.length === 0 || !viewKg || !hasHintData
				? []
				: viewKg.parties
						.filter((p) => !selectedSet.has(p.id))
						.map((p) => {
							const raws = membersOf[p.id] ?? [p.id];
							const paired = raws.some((r) => compatibleRaw.has(r));
							const cHasEntity = raws.some((r) => entitySet.has(r));
							// Entity-aware blocks only apply when we know which parties are entities;
							// otherwise fall back to the pure pairwise hint (never over-restrict).
							const blocked =
								hasEntityInfo &&
								(complete || (selHasEntity && cHasEntity) || (!selHasEntity && !cHasEntity));
							const tone: 'suggested' | 'discouraged' =
								!blocked && paired ? 'suggested' : 'discouraged';
							return [p.id, tone] as const;
						})
		);
		// Resolver hint (green = plausible merge, amber = not) + the selection ring,
		// which wins over the hint. Both only show while a party is selected.
		const applySelection = () => {
			if (selectedSet.size > 0) {
				node
					.filter((d) => hintByNode.get(d.id) === 'suggested')
					.attr('opacity', 1)
					.attr('stroke', '#22c55e')
					.attr('stroke-width', 2.4);
				node
					.filter((d) => hintByNode.get(d.id) === 'discouraged')
					.attr('opacity', 1)
					.attr('stroke', '#f59e0b')
					.attr('stroke-width', 2);
			}
			node
				.filter((d) => selectedSet.has(d.id))
				.attr('opacity', 1)
				.attr('stroke', '#7c3aed')
				.attr('stroke-width', 3);
		};

		if (!highlightIds) {
			node
				.attr('opacity', 1)
				.attr('stroke', '#fff')
				.attr('stroke-width', 1.2)
				.attr('r', (d) => d.radius);
			link.attr('stroke-opacity', 0.8);
			applySelection();
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
		applySelection();
	}, [graphVersion, highlightIds, focusNodeId, nodeScores, selectedPartyIds, membersOf, mergeHints, mergeEntities, viewKg]);

	const counts = viewKg
		? {
				parties: viewKg.parties.length,
				clauses: viewKg.clauses.length,
				statements: viewKg.obligations.length + viewKg.rights.length + viewKg.prohibitions.length,
			}
		: null;

	// Edge legend still mirrors the canvas: only the edge types actually drawn.
	const presentEdgeTypes = new Set((graph?.links ?? []).map((l) => l.type));
	const visibleEdgeLegend = EDGE_LEGEND.filter((item) =>
		item.types.some((t) => presentEdgeTypes.has(t))
	);
	const allKindsOn = NODE_LEGEND.every(
		(item) => kindCounts[item.kind] === undefined || visibleKinds.has(item.kind)
	);

	const toggleKind = (kind: KgNodeKind, on: boolean) => {
		filterTouchedRef.current = true;
		setVisibleKinds((prev) => {
			const next = new Set(prev);
			if (on) next.add(kind);
			else next.delete(kind);
			return next;
		});
	};

	return (
		<div className="flex h-full flex-col">
			{status === 'ready' && counts && (
				<div className="border-b border-border/60 px-3 py-2 text-2xs text-muted-foreground">
					<div className="flex items-center justify-between gap-2">
						<span>
							{counts.parties} parties · {counts.clauses} clauses · {counts.statements} statements
						</span>
						<Button
							variant="ghost"
							size="xs"
							className="h-6 px-1.5 text-2xs"
							onClick={() => {
								filterTouchedRef.current = true;
								setVisibleKinds(
									allKindsOn ? new Set(['party']) : new Set(NODE_LEGEND.map((i) => i.kind))
								);
							}}
						>
							{allKindsOn ? 'Only parties' : 'Select all'}
						</Button>
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
						{ledger && <LedgerCard ledger={ledger} onSelectClause={(id) => focusNode(id)} />}
						<svg
							ref={svgRef}
							className="h-full w-full cursor-grab text-foreground active:cursor-grabbing"
						/>
						<TooltipProvider>
							<Tooltip open={hover !== null}>
								<TooltipTrigger asChild>
									<span
										aria-hidden
										className="pointer-events-none absolute size-0"
										style={{ left: hover?.x ?? 0, top: hover?.y ?? 0 }}
									/>
								</TooltipTrigger>
								{hover && (
									<TooltipContent
										side="top"
										sideOffset={10}
										className="max-w-[280px] border-2 px-2.5 py-1.5"
										style={{ borderColor: NODE_COLORS[hover.kind] }}
									>
										<span className="flex items-center gap-1.5">
											<span
												className="size-2 shrink-0 rounded-full"
												style={{ backgroundColor: NODE_COLORS[hover.kind] }}
											/>
											<span className="text-2xs font-medium uppercase tracking-wide opacity-70">
												{KIND_LABEL[hover.kind]}
											</span>
										</span>
										<span className="mt-1 block text-2xs leading-snug">{hover.detail}</span>
									</TooltipContent>
								)}
							</Tooltip>
						</TooltipProvider>
					</>
				)}
			</div>

			{status === 'ready' && visibleKinds.has('party') && (
				<PartyManager
					hidden={hiddenNamed}
					hasView={mergeGroups.length > 0 || hiddenParties.length > 0}
					hintsLoading={hintsLoading}
					onUnhide={unhideParty}
					onReset={clearPartyView}
				/>
			)}

			{/* The legend is the filter: each kind is a checkbox in its own colour, and
			    the count is how many that kind has inside the current scope. */}
			{status === 'ready' && (
				<div className="space-y-2 border-t border-border/60 px-3 py-2 text-2xs text-muted-foreground">
					<div>
						<div className="mb-1 font-medium text-foreground/50">Nodes</div>
						<div className="grid grid-cols-3 gap-x-3 gap-y-1">
							{NODE_LEGEND.map((item) => {
								const count = kindCounts[item.kind] ?? 0;
								const color = NODE_COLORS[item.kind];
								const checked = visibleKinds.has(item.kind);
								return (
									<label
										key={item.kind}
										className={`inline-flex min-w-0 items-center gap-1.5 ${
											count === 0 ? 'opacity-40' : 'cursor-pointer'
										}`}
									>
										<Checkbox
											checked={checked}
											disabled={count === 0}
											onCheckedChange={(value) => toggleKind(item.kind, value === true)}
											className="size-3.5 shrink-0 border-current data-[state=checked]:text-white"
											style={{
												color,
												backgroundColor: checked ? color : undefined,
												borderColor: color,
											}}
											aria-label={`${item.label} (${count})`}
										/>
										<span className="truncate">{item.label}</span>
										<span className="ml-auto shrink-0 tabular-nums opacity-60">{count}</span>
									</label>
								);
							})}
						</div>
					</div>
					{visibleEdgeLegend.length > 0 && (
						<div>
							<div className="mb-1 font-medium text-foreground/50">Edges</div>
							<div className="grid grid-cols-4 gap-x-3 gap-y-1">
								{visibleEdgeLegend.map((item) => (
									<span key={item.label} className="inline-flex items-center gap-1.5" title={item.label}>
										<span
											className="inline-block h-0.5 w-4 shrink-0 rounded-full"
											style={{ backgroundColor: EDGE_COLORS[item.types[0]] }}
										/>
										<span className="truncate">{item.label}</span>
									</span>
								))}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
