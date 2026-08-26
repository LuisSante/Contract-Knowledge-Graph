'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { fetchKnowledgeGraph, fetchPartyMergeHints } from '@/services/knowledge';
import { useDocumentStore } from '@/stores/document';
import { useKnowledgeGraphStore } from '@/stores/knowledgeGraph';
import { buildKnowledgeGraphBridge } from '@/features/docx/utils/knowledge/kg-bridge';
import { applyPartyView } from '@/features/docx/utils/knowledge/party-view';
import {
	computeRadialLayout,
	type RadialSector,
} from '@/features/docx/utils/knowledge/radial-layout';
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

// The arc glyph reuses the deontic palette on purpose: a burden is what an obligation
// colour already means to the reader, a benefit what a right means.
const BURDEN_COLOR = NODE_COLORS.obligation;
const BENEFIT_COLOR = NODE_COLORS.right;
/** Gap between a node's edge and the ring drawn around it. */
const ARC_OFFSET = 3.5;
const ARC_WIDTH = 2.5;

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
		<div className="min-w-[210px] flex-1 space-y-1">
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
		<div className="flex flex-wrap items-start gap-x-6 gap-y-2 border-t border-border/60 px-3 py-2 text-2xs text-popover-foreground">
			<div className="min-w-[190px] flex-1 space-y-1.5">
				<div className="truncate font-semibold" title={ledger.partyName}>
					{ledger.partyName}
				</div>
				<div className="space-y-1">
					<div className="flex justify-between text-muted-foreground">
						<span className="inline-flex items-center gap-1">
							<span
								className="inline-block h-2 w-2 rounded-full"
								style={{ backgroundColor: '#ef4444' }}
							/>
							Burden
						</span>
						<span className="inline-flex items-center gap-1">
							Benefit
							<span
								className="inline-block h-2 w-2 rounded-full"
								style={{ backgroundColor: '#22c55e' }}
							/>
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
			</div>

			{ledger.topClauses.length > 0 && (
				<div className="min-w-[170px] flex-1 space-y-1">
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
	// Only the camera survives a rebuild now — node positions are a pure function of
	// the graph, so there is nothing else to carry over.
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
	// `is_part_of` (containment) is normally hidden — position already encodes it — but a
	// toggle draws it faintly to prove a clause is connected to the statements it holds.
	const [showContainment, setShowContainment] = useState(false);
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
	const toneSplit = useKnowledgeGraphStore((s) => s.toneSplit);
	const ledger = useKnowledgeGraphStore((s) => s.ledger);
	const paragraphs = useDocumentStore((s) => s.paragraphs);
	const nodesById = useMemo(() => new Map(paragraphs.map((n) => [n.id, n])), [paragraphs]);
	const paragraphOrder = useMemo(
		() => new Map(paragraphs.map((n) => [n.id, n.paragraph_enum])),
		[paragraphs]
	);

	// Fetch the pre-generated KG for the current document.
	useEffect(() => {
		if (!docId) return;
		let cancelled = false;
		clearFocus();
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
			// No focus means the entry view, which only ever holds the parties.
			if (scopeIds ? !scopeIds.has(node.id) : node.kind !== 'party') continue;
			counts[node.kind] = (counts[node.kind] ?? 0) + 1;
		}
		return counts;
	}, [fullGraph, scopeIds]);

	// visible = (focus ? subgraph ∩ checked kinds : just the parties).
	//
	// Without a focus there is no attention to encode, so every node would share a
	// radius and the ring would collapse into one dense necklace. The radial map is a
	// focused view by construction; unfocused it stays on the entry state.
	const graph = useMemo(() => {
		if (!fullGraph) return null;
		const nodes = scopeIds
			? fullGraph.nodes.filter((n) => visibleKinds.has(n.kind) && scopeIds.has(n.id))
			: fullGraph.nodes
					.filter((n) => n.kind === 'party')
					.map((n) => ({ ...n, radius: PARTY_ENTRY_RADIUS }));
		const ids = new Set(nodes.map((n) => n.id));
		return {
			nodes,
			links: fullGraph.links.filter(
				(l) =>
					// Containment is already encoded by which sector a node sits in, so it is
					// hidden by default (556 of 1083 chords that say nothing new) unless the
					// user opts in to see it.
					(showContainment || l.type !== 'is_part_of') &&
					ids.has(l.source as string) &&
					ids.has(l.target as string)
			),
		};
	}, [fullGraph, visibleKinds, scopeIds, showContainment]);

	const focusedNode = useMemo(
		() => fullGraph?.nodes.find((n) => n.id === focusNodeId) ?? null,
		[fullGraph, focusNodeId]
	);
	const isPartyFocus = focusedNode?.kind === 'party';

	// Laid out over the whole graph, not the filtered slice, so the ring stays put
	// when kinds are toggled — only which nodes get drawn changes.
	const layout = useMemo(
		() =>
			viewKg && size.width > 0 && size.height > 0
				? computeRadialLayout(viewKg, {
						width: size.width,
						height: size.height,
						scores: nodeScores,
						paragraphOrder,
						centerNodeId: isPartyFocus ? focusNodeId : null,
					})
				: null,
		[viewKg, size, nodeScores, paragraphOrder, focusNodeId, isPartyFocus]
	);

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

	// Deterministic radial render: every position comes from the layout module, so
	// there is no simulation, no settling and no reshuffle when the filter changes.
	useEffect(() => {
		if (!graph || !layout || !svgRef.current || size.width === 0 || size.height === 0) return;

		const nodes: SimNode[] = [];
		for (const item of graph.nodes) {
			const position = layout.positions.get(item.id);
			if (position) nodes.push({ ...item, x: position.x, y: position.y });
		}
		const placed = new Set(nodes.map((n) => n.id));
		const links = graph.links
			.filter((l) => placed.has(l.source as string) && placed.has(l.target as string))
			.map((l) => ({ ...l }));
		const byId = new Map(nodes.map((n) => [n.id, n] as const));

		const svg = d3.select(svgRef.current);
		svg.selectAll('*').remove();
		const root = svg.append('g');

		let panned = false;
		const zoom = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.2, 4])
			.on('zoom', (event) => {
				if (event.sourceEvent) panned = true;
				transformRef.current = event.transform;
				root.attr('transform', event.transform.toString());
			});
		svg.call(zoom).on('dblclick.zoom', null);
		// The layout is already sized to the container, so identity fits by construction.
		// Only the user's own pan/zoom needs carrying across a rebuild.
		if (transformRef.current) svg.call(zoom.transform, transformRef.current);

		svg.on('pointerdown', () => {
			panned = false;
		});
		svg.on('click', (event: MouseEvent) => {
			if (panned || event.target !== svgRef.current) return;
			clearFocus();
		});

		const { x: cx, y: cy } = layout.center;
		const pointAt = (angle: number, distance: number) =>
			[cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance] as const;
		const arcPath = (radius: number, from: number, to: number) => {
			const [x0, y0] = pointAt(from, radius);
			const [x1, y1] = pointAt(to, radius);
			return `M${x0},${y0}A${radius},${radius},0,${to - from > Math.PI ? 1 : 0},1,${x1},${y1}`;
		};

		// Hovering a sector lights the whole wedge, so it goes in first and everything
		// else draws over it.
		const wedge = root
			.append('path')
			.attr('fill', NODE_COLORS.clause)
			.attr('fill-opacity', 0.09)
			.attr('pointer-events', 'none')
			.attr('visibility', 'hidden');

		// --- the ring: one arc per clause, in document order, width by attention ---
		const scaffold = root.append('g').attr('pointer-events', 'none').attr('fill', 'none');
		scaffold
			.append('circle')
			.attr('cx', cx)
			.attr('cy', cy)
			.attr('r', layout.boundaryRadius)
			.attr('stroke', 'currentColor')
			.attr('stroke-opacity', 0.16)
			.attr('stroke-dasharray', '4 5');

		const peakWeight = Math.max(...layout.sectors.map((s) => s.weight), 1e-9);
		scaffold
			.selectAll<SVGPathElement, RadialSector>('path')
			.data(layout.sectors)
			.join('path')
			// A hair of padding each side keeps neighbouring sectors legible as separate.
			.attr('d', (d) => arcPath(layout.ringRadius, d.startAngle + 0.004, d.endAngle - 0.004))
			.attr('stroke', NODE_COLORS.clause)
			.attr('stroke-width', (d) => 2 + 5 * (d.weight / peakWeight))
			.attr('stroke-linecap', 'round')
			.attr('stroke-opacity', (d) => 0.25 + 0.6 * (d.weight / peakWeight));

		/** Keep a ring label from overrunning the circle it belongs to. */
		const anchorFor = (angle: number) =>
			Math.cos(angle) < -0.1 ? 'end' : Math.cos(angle) > 0.1 ? 'start' : 'middle';

		// Labelling 142 sectors is unreadable, so only the ones that carry weight.
		const labelled = [...layout.sectors]
			.filter((s: RadialSector) => s.weight > 0)
			.sort((a, b) => b.weight - a.weight)
			.slice(0, 14);
		scaffold
			.append('g')
			.selectAll<SVGTextElement, RadialSector>('text')
			.data(labelled)
			.join('text')
			.attr('x', (d) => pointAt((d.startAngle + d.endAngle) / 2, layout.ringRadius + 9)[0])
			.attr('y', (d) => pointAt((d.startAngle + d.endAngle) / 2, layout.ringRadius + 9)[1])
			.attr('text-anchor', (d) => anchorFor((d.startAngle + d.endAngle) / 2))
			.attr('dominant-baseline', 'middle')
			.attr('font-size', 9)
			.attr('fill', 'currentColor')
			.attr('fill-opacity', 0.55)
			.text((d) => d.label);

		// The ref of whichever sector is under the cursor, including the ones too light
		// to have earned a permanent label.
		const hoverLabel = root
			.append('text')
			.attr('pointer-events', 'none')
			.attr('dominant-baseline', 'middle')
			.attr('font-size', 10)
			.attr('font-weight', 500)
			.attr('fill', 'currentColor')
			.attr('visibility', 'hidden');

		// Sector hit areas — a fat invisible stroke over the ring. Appended before the
		// nodes so that wherever the two overlap the node still wins the pointer.
		root
			.append('g')
			.attr('fill', 'none')
			.attr('stroke', 'transparent')
			.attr('stroke-width', 16)
			.attr('cursor', 'pointer')
			.selectAll<SVGPathElement, RadialSector>('path')
			.data(layout.sectors)
			.join('path')
			.attr('d', (d) => arcPath(layout.ringRadius, d.startAngle, d.endAngle))
			.on('mouseenter mousemove', (event: MouseEvent, d) => {
				const mid = (d.startAngle + d.endAngle) / 2;
				const [sx, sy] = pointAt(d.startAngle, layout.ringRadius);
				const [ex, ey] = pointAt(d.endAngle, layout.ringRadius);
				const large = d.endAngle - d.startAngle > Math.PI ? 1 : 0;
				const r = layout.ringRadius;
				wedge
					.attr('d', `M${cx},${cy}L${sx},${sy}A${r},${r},0,${large},1,${ex},${ey}Z`)
					.attr('visibility', 'visible');
				const [lx, ly] = pointAt(mid, layout.ringRadius + 9);
				hoverLabel
					.attr('x', lx)
					.attr('y', ly)
					.attr('text-anchor', anchorFor(mid))
					.text(d.label)
					.attr('visibility', 'visible');
				const rect = containerRef.current?.getBoundingClientRect();
				setHover({
					x: event.clientX - (rect?.left ?? 0),
					y: event.clientY - (rect?.top ?? 0),
					kind: 'clause',
					detail: d.weight > 0 ? `${d.label} — weight ${d.weight.toFixed(2)}` : d.label,
				});
			})
			.on('mouseleave', () => {
				wedge.attr('visibility', 'hidden');
				hoverLabel.attr('visibility', 'hidden');
				setHover(null);
			})
			.on('click', (event: MouseEvent, d) => {
				event.stopPropagation();
				clearSelectedParties();
				focusNode(d.clauseId);
			});

		const link = root
			.append('g')
			.attr('stroke-opacity', 0.8)
			.selectAll<SVGLineElement, SimLink>('line')
			.data(links)
			.join('line')
			.attr('stroke', (d) => EDGE_COLORS[d.type])
			.attr('stroke-width', 1.2)
			.attr('x1', (d) => byId.get(d.source as string)?.x ?? 0)
			.attr('y1', (d) => byId.get(d.source as string)?.y ?? 0)
			.attr('x2', (d) => byId.get(d.target as string)?.x ?? 0)
			.attr('y2', (d) => byId.get(d.target as string)?.y ?? 0);

		// --- the arc glyph: how this node's weight splits burden vs benefit ---
		//
		// Two concentric dashed rings rather than path arcs: the dash length is the
		// share, and the rotation is where the second one starts. Drawn under the nodes
		// so a node never sits on top of its own reading.
		const arcs = nodes
			.map((d) => ({ node: d, split: toneSplit[d.id] }))
			.filter((item) => item.split && item.split.burden + item.split.benefit > 0);
		const arcLayer = root.append('g').attr('pointer-events', 'none').attr('fill', 'none');
		for (const side of ['burden', 'benefit'] as const) {
			arcLayer
				.append('g')
				.selectAll<SVGCircleElement, (typeof arcs)[number]>('circle')
				.data(arcs)
				.join('circle')
				.attr('cx', (d) => d.node.x ?? 0)
				.attr('cy', (d) => d.node.y ?? 0)
				.attr('r', (d) => d.node.radius + ARC_OFFSET)
				.attr('stroke', side === 'burden' ? BURDEN_COLOR : BENEFIT_COLOR)
				.attr('stroke-width', ARC_WIDTH)
				.attr('stroke-dasharray', (d) => {
					const total = d.split!.burden + d.split!.benefit;
					const share = (side === 'burden' ? d.split!.burden : d.split!.benefit) / total;
					const circumference = 2 * Math.PI * (d.node.radius + ARC_OFFSET);
					return `${circumference * share} ${circumference * (1 - share)}`;
				})
				// Burden starts at 12 o'clock; benefit picks up where it ends.
				.attr('transform', (d) => {
					const total = d.split!.burden + d.split!.benefit;
					const start = side === 'burden' ? 0 : (d.split!.burden / total) * 360;
					return `rotate(${start - 90} ${d.node.x ?? 0} ${d.node.y ?? 0})`;
				});
		}

		const node = root
			.append('g')
			.attr('stroke', '#fff')
			.attr('stroke-width', 1.2)
			.selectAll<SVGCircleElement, SimNode>('circle')
			.data(nodes)
			.join('circle')
			.attr('cx', (d) => d.x ?? 0)
			.attr('cy', (d) => d.y ?? 0)
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
				if ((event.ctrlKey || event.metaKey) && d.kind === 'party') {
					toggleSelectedParty(d.id); // Ctrl/Cmd-click builds the action selection
					return;
				}
				clearSelectedParties();
				focusNode(d.id);
			});

		// Party names stay readable at every zoom level — they are the entry point.
		root
			.append('g')
			.attr('pointer-events', 'none')
			.selectAll<SVGTextElement, SimNode>('text')
			.data(nodes.filter((d) => d.kind === 'party'))
			.join('text')
			.text((d) => d.label)
			.attr('x', (d) => d.x ?? 0)
			.attr('y', (d) => (d.y ?? 0) + d.radius + 13)
			.attr('font-size', 11)
			.attr('font-weight', 500)
			.attr('text-anchor', 'middle')
			.attr('fill', 'currentColor');

		nodeSelRef.current = node;
		linkSelRef.current = link;
		setGraphVersion((v) => v + 1);

		return () => {
			nodeSelRef.current = null;
			linkSelRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [graph, layout, size, toneSplit]);

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

		// Size stays a function of the node kind. Attention already has a channel —
		// distance from the centre — and encoding it twice makes near and far nodes of
		// the same kind look like different things.
		const radiusFor = (d: SimNode): number =>
			d.id === focusNodeId ? d.radius * 1.55 : d.radius;

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
						<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
							<span>
								{counts.parties} parties · {counts.clauses} clauses · {counts.statements} statements
							</span>
							{Object.keys(toneSplit).length > 0 && (
								<span className="flex items-center gap-1.5">
									<span className="font-medium text-foreground/50">Ring</span>
									<span
										className="inline-block h-2 w-2 shrink-0 rounded-full border-2"
										style={{ borderColor: BURDEN_COLOR }}
									/>
									<span>burden</span>
									<span
										className="ml-1 inline-block h-2 w-2 shrink-0 rounded-full border-2"
										style={{ borderColor: BENEFIT_COLOR }}
									/>
									<span>benefit</span>
								</span>
							)}
						</div>
						<div className="flex shrink-0 items-center gap-2">
							{scopeIds && (
								<label
									className="flex cursor-pointer items-center gap-1.5"
									title="Draw the is_part_of edges (statement → its clause). Off by default: position already encodes containment."
								>
									<input
										type="checkbox"
										checked={showContainment}
										onChange={(event) => setShowContainment(event.target.checked)}
										className="cursor-pointer accent-primary"
									/>
									Containment
								</label>
							)}
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
				</div>
			)}

			<div className="flex min-h-0 flex-1">
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

				{/* Legend / kind filter — right sidebar, full height, narrow (labels truncate to a tooltip). */}
				{status === 'ready' && (
					<aside className="w-32 shrink-0 space-y-2 overflow-y-auto border-l border-border/60 px-2 py-2 text-2xs text-muted-foreground">
						<div>
							<div className="mb-1 font-medium text-foreground/50">Nodes</div>
							<div className="grid grid-cols-1 gap-y-1">
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
											<span className="truncate" title={item.label}>
												{item.label}
											</span>
											<span className="ml-auto shrink-0 tabular-nums opacity-60">{count}</span>
										</label>
									);
								})}
							</div>
						</div>
						{visibleEdgeLegend.length > 0 && (
							<div>
								<div className="mb-1 font-medium text-foreground/50">Edges</div>
								<div className="grid grid-cols-1 gap-y-1">
									{visibleEdgeLegend.map((item) => (
										<span
											key={item.label}
											className="inline-flex items-center gap-1.5"
											title={item.label}
										>
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
					</aside>
				)}
			</div>

			{/* Controls + metrics — bottom bar, only when a party is focused. */}
			{status === 'ready' && ledger && (
				<LedgerCard ledger={ledger} onSelectClause={(id) => focusNode(id)} />
			)}

			{status === 'ready' && visibleKinds.has('party') && (
				<PartyManager
					hidden={hiddenNamed}
					hasView={mergeGroups.length > 0 || hiddenParties.length > 0}
					hintsLoading={hintsLoading}
					onUnhide={unhideParty}
					onReset={clearPartyView}
				/>
			)}
		</div>
	);
}
