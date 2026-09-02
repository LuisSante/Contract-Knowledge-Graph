'use client';

import {
	Fragment,
	useEffect,
	useMemo,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
} from 'react';
import { fetchKnowledgeGraph, fetchPartyMergeHints } from '@/services/knowledge';
import { useDocumentStore } from '@/stores/document';
import { useKnowledgeGraphStore } from '@/stores/knowledgeGraph';
import {
	buildKnowledgeGraphBridge,
	buildNodeDocumentTarget,
	buildPairBridge,
} from '@/features/docx/utils/knowledge/kg-bridge';
import { applyPartyView } from '@/features/docx/utils/knowledge/party-view';
import {
	buildStatementGrid,
	DEONTIC_MARK_KINDS,
	GRID_LANES,
	MARK_KINDS,
	type GridLane,
	type GridMark,
	type GridRow,
	type MarkKind,
} from '@/features/docx/utils/knowledge/statement-grid';
import { computePartyAttention } from '@/features/docx/utils/knowledge/attention';
import { PartyManager } from '@/features/docx/components/knowledge-graph/PartyManager';
import { computePairAttention, defaultDyad } from '@/features/docx/utils/knowledge/pair';
import {
	PartySelection,
	type PartyCardData,
} from '@/features/docx/components/knowledge-graph/PartySelection';
// PARKED (burden/benefit): import type { KgLedger } from '@/features/docx/utils/knowledge/attention';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import type { KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';

interface KnowledgeGraphPanelProps {
	docId: string;
}

/**
 * The two party colours, by selection order. The anchor keeps the palette's party
 * purple — the same colour the document viewer underlines party mentions with — and it
 * does not change when the second party joins. The second is a teal deliberately
 * outside the deontic palette, so a lane header can never be misread as a kind.
 */
const PARTY_COLOR = '#984ea3';
const PAIR_SECOND_COLOR = '#0d9488';

const KIND_COLORS: Record<MarkKind, string> = {
	obligation: '#e41a1c',
	right: '#4daf4a',
	prohibition: '#ff7f00',
	definedTerm: '#a65628',
	condition: '#f781bf',
	// Set1's yellow is invisible on white; this is the same hue, dark enough to read.
	value: '#d4a017',
	reference: '#999999',
};

const KIND_LABEL: Record<MarkKind, string> = {
	obligation: 'Obligation',
	right: 'Right',
	prohibition: 'Prohibition',
	definedTerm: 'Defined term',
	condition: 'Condition',
	value: 'Value',
	reference: 'Reference',
};

/**
 * Marks wrap into a fixed matrix instead of one long line. With the qualifiers on, a
 * clause can hold thirty of them; a single row would stretch the lane and knock every
 * other lane out of alignment, which is exactly the drift the columns exist to prevent.
 */
const LANE_COLUMNS = 10;
const MARK_SIZE = 14;
const MARK_GAP = 4;
const LANE_WIDTH = LANE_COLUMNS * MARK_SIZE + (LANE_COLUMNS - 1) * MARK_GAP;
const LABEL_WIDTH = 176;

/** The other party's lane when one is singled out: present, not the subject. */
const MUTED_LANE_OPACITY = 0.22;
/** The contract names nobody at all — visible, but never mistaken for an allocated duty. */
const UNATTRIBUTED_OPACITY = 0.45;
// --- PARKED (burden/benefit: the diverging Total / Intensity bar) ---
// function DivergingBar({ label, burdenPct }: { label: string; burdenPct: number }) {
// 	return (
// 		<div>
// 			<div className="flex justify-between text-muted-foreground">
// 				<span>{label}</span>
// 				<span>
// 					{Math.round(burdenPct)}% / {Math.round(100 - burdenPct)}%
// 				</span>
// 			</div>
// 			<div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
// 				<span style={{ width: `${burdenPct}%`, backgroundColor: '#ef4444' }} />
// 				<span style={{ width: `${100 - burdenPct}%`, backgroundColor: '#22c55e' }} />
// 			</div>
// 		</div>
// 	);
// }

// --- PARKED (burden/benefit ledger: the bars, the counts and the heaviest-clause list) ---
// /** Compact impact ledger for the focused party (burden ↔ benefit + top clauses). */
// function LedgerCard({
// 	ledger,
// 	onSelectClause,
// }: {
// 	ledger: KgLedger;
// 	onSelectClause: (clauseId: string) => void;
// }) {
// 	const total = ledger.burdenWeight + ledger.benefitWeight;
// 	const burdenPct = total > 0 ? (ledger.burdenWeight / total) * 100 : 50;
// 	const burdenIntensity = ledger.burdenCount > 0 ? ledger.burdenWeight / ledger.burdenCount : 0;
// 	const benefitIntensity = ledger.benefitCount > 0 ? ledger.benefitWeight / ledger.benefitCount : 0;
// 	const intensityTotal = burdenIntensity + benefitIntensity;
// 	const intensityBurdenPct = intensityTotal > 0 ? (burdenIntensity / intensityTotal) * 100 : 50;
// 	const maxClauseTotal = Math.max(...ledger.topClauses.map((c) => c.burden + c.benefit), 1e-9);
//
// 	return (
// 		<div className="flex flex-wrap items-start gap-x-6 gap-y-2 border-t border-border/60 px-3 py-2 text-2xs text-popover-foreground">
// 			<div className="min-w-[190px] flex-1 space-y-1.5">
// 				<div className="truncate font-semibold" title={ledger.partyName}>
// 					{ledger.partyName}
// 				</div>
// 				<div className="space-y-1">
// 					<div className="flex justify-between text-muted-foreground">
// 						<span className="inline-flex items-center gap-1">
// 							<span
// 								className="inline-block h-2 w-2 rounded-full"
// 								style={{ backgroundColor: '#ef4444' }}
// 							/>
// 							Burden
// 						</span>
// 						<span className="inline-flex items-center gap-1">
// 							Benefit
// 							<span
// 								className="inline-block h-2 w-2 rounded-full"
// 								style={{ backgroundColor: '#22c55e' }}
// 							/>
// 						</span>
// 					</div>
// 					<DivergingBar label="Total" burdenPct={burdenPct} />
// 					<DivergingBar label="Intensity" burdenPct={intensityBurdenPct} />
// 				</div>
// 				<div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
// 					<span>
// 						<span className="font-medium text-foreground">{ledger.obligations}</span> obligations
// 					</span>
// 					<span>
// 						<span className="font-medium text-foreground">{ledger.prohibitions}</span> prohibitions
// 					</span>
// 					<span>
// 						<span className="font-medium text-foreground">{ledger.rights}</span> rights
// 					</span>
// 				</div>
// 			</div>
//
// 			{ledger.topClauses.length > 0 && (
// 				<div className="min-w-[170px] flex-1 space-y-1">
// 					<div className="font-medium text-foreground/70">Heaviest clauses</div>
// 					{ledger.topClauses.map((clause) => {
// 						const clauseTotal = clause.burden + clause.benefit;
// 						const lengthPct = Math.max(8, (clauseTotal / maxClauseTotal) * 100);
// 						const burdenShare = clauseTotal > 0 ? clause.burden / clauseTotal : 0;
// 						return (
// 							<button
// 								key={clause.id}
// 								type="button"
// 								onClick={() => onSelectClause(clause.id)}
// 								className="flex w-full items-center gap-1.5 text-left hover:text-foreground"
// 								title={`${clause.label} — burden ${clause.burden.toFixed(2)} / benefit ${clause.benefit.toFixed(2)}`}
// 							>
// 								<span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
// 									<span style={{ width: `${lengthPct * burdenShare}%`, backgroundColor: '#ef4444' }} />
// 									<span
// 										style={{ width: `${lengthPct * (1 - burdenShare)}%`, backgroundColor: '#22c55e' }}
// 									/>
// 								</span>
// 								<span className="w-20 truncate">{clause.label}</span>
// 							</button>
// 						);
// 					})}
// 				</div>
// 			)}
//
// 		</div>
// 	);

export function KnowledgeGraphPanel({ docId }: KnowledgeGraphPanelProps) {
	// The grid is plain layout, so the container only exists to anchor the tooltip.
	const containerRef = useRef<HTMLDivElement>(null);
	const [kg, setKg] = useState<KnowledgeGraph | null>(null);
	const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
	const [hover, setHover] = useState<{
		x: number;
		y: number;
		kind: MarkKind;
		detail: string;
		/** Which party the statement belongs to — the second half of the tooltip title. */
		owner?: string;
	} | null>(null);
	// The deontic three are what the contract asserts; the qualifiers describe those
	// assertions, so they start off and are opted into.
	const [visibleKinds, setVisibleKinds] = useState<Set<MarkKind>>(
		() => new Set(DEONTIC_MARK_KINDS)
	);
	/**
	 * Clause picked in the grid. While one is picked the document answers for it alone
	 * instead of for the whole party — otherwise every clause paints the same page.
	 */
	const [selectedClauseId, setSelectedClauseId] = useState<string | null>(null);
	/**
	 * Rows ranked by how much of the selection's PageRank pull lands on each clause, so
	 * the heaviest clauses surface first — the question users actually bring to the
	 * grid. Off restores the contract's own order.
	 */
	const [sortByAttention, setSortByAttention] = useState(true);
	/**
	 * Which lanes reach the document. Untick a party and the page stops answering for it;
	 * untick the bilateral column and what stays painted is only what is asymmetric.
	 * One mechanism for all three columns — the lane is the only thing being chosen.
	 */
	const [paintLanes, setPaintLanes] = useState<Record<GridLane, boolean>>({
		a: true,
		b: true,
		shared: true,
	});
	const [mergeHints, setMergeHints] = useState<Record<string, string[]>>({});
	const [hintsLoading, setHintsLoading] = useState(false);

	const focusNodeId = useKnowledgeGraphStore((s) => s.focusNodeId);
	const hops = useKnowledgeGraphStore((s) => s.hops);
	const topK = useKnowledgeGraphStore((s) => s.topK);
	const severity = useKnowledgeGraphStore((s) => s.severity);
	const usePageRank = useKnowledgeGraphStore((s) => s.usePageRank);
	const focusNode = useKnowledgeGraphStore((s) => s.focusNode);
	const clearFocus = useKnowledgeGraphStore((s) => s.clearFocus);
	const setFocusMeta = useKnowledgeGraphStore((s) => s.setFocusMeta);
	const setBridgePayload = useKnowledgeGraphStore((s) => s.setBridgePayload);
	const setDocumentTarget = useKnowledgeGraphStore((s) => s.setDocumentTarget);
	const mergeGroups = useKnowledgeGraphStore((s) => s.mergeGroups);
	const hiddenParties = useKnowledgeGraphStore((s) => s.hiddenParties);
	const unhideParty = useKnowledgeGraphStore((s) => s.unhideParty);
	const clearPartyView = useKnowledgeGraphStore((s) => s.clearPartyView);
	const selectedPartyIds = useKnowledgeGraphStore((s) => s.selectedPartyIds);
	const toggleSelectedParty = useKnowledgeGraphStore((s) => s.toggleSelectedParty);
	const clearSelectedParties = useKnowledgeGraphStore((s) => s.clearSelectedParties);
	// PARKED (burden/benefit): const ledger = useKnowledgeGraphStore((s) => s.ledger);
	const secondPartyId = useKnowledgeGraphStore((s) => s.secondPartyId);
	const setSecondParty = useKnowledgeGraphStore((s) => s.setSecondParty);
	const focusPair = useKnowledgeGraphStore((s) => s.focusPair);
	/** Null until the user touches a card — then it is authoritative over the suggestion. */
	const [slotOverride, setSlotOverride] = useState<[string | null, string | null] | null>(null);
	const [partyPickerOpen, setPartyPickerOpen] = useState(false);
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
				setMergeHints({});
				setHintsLoading(true);
				fetchPartyMergeHints(docId)
					.then((hints) => {
						if (!cancelled) setMergeHints(hints.candidates);
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

	// The user's merge/hide choices canonicalize parties view-time; the stored KG
	// is never mutated, so every downstream computation runs over this view.
	const viewKg = useMemo(
		() => (kg ? applyPartyView(kg, mergeGroups, new Set(hiddenParties)) : null),
		[kg, mergeGroups, hiddenParties]
	);

	const isPartyFocus = useMemo(
		() => Boolean(focusNodeId && viewKg?.parties.some((p) => p.id === focusNodeId)),
		[viewKg, focusNodeId]
	);

	// The grid does not read attention — every statement gets a mark either way. The
	// pair is still computed because the document bridge ranks paragraphs with it.
	const pair = useMemo(
		() =>
			viewKg && isPartyFocus && focusNodeId && secondPartyId && secondPartyId !== focusNodeId
				? computePairAttention(viewKg, focusNodeId, secondPartyId, topK, severity, usePageRank)
				: null,
		[viewKg, isPartyFocus, focusNodeId, secondPartyId, topK, severity, usePageRank]
	);

	// Entry view: each party carries the count of provisions it is party to, so the
	// choice is informed instead of two identical dots.
	const partyCards = useMemo<PartyCardData[]>(() => {
		if (!viewKg) return [];
		const tally = new Map<string, PartyCardData>(
			viewKg.parties.map((p) => [
				p.id,
				{ id: p.id, name: p.name, role: p.role, obligations: 0, rights: 0, prohibitions: 0, total: 0 },
			])
		);
		for (const v of deonticNodes(viewKg)) {
			for (const partyId of new Set([v.burdenPartyId, v.benefitPartyId])) {
				const row = partyId ? tally.get(partyId) : undefined;
				if (!row) continue;
				if (v.kind === 'obligation') row.obligations += 1;
				else if (v.kind === 'right') row.rights += 1;
				else row.prohibitions += 1;
				row.total += 1;
			}
		}
		return [...tally.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
	}, [viewKg]);

	// The pair the contract is actually between is seated by default, so the common case
	// is one click of confirmation. Derived rather than synced: a merge or a hide can
	// retire a party id, and pruning here keeps the seats honest without an effect.
	const slots = useMemo<[string | null, string | null]>(() => {
		if (!viewKg) return [null, null];
		const known = new Set(viewKg.parties.map((p) => p.id));
		const prune = (seat: string | null) => (seat && known.has(seat) ? seat : null);
		if (slotOverride) return [prune(slotOverride[0]), prune(slotOverride[1])];
		const suggested = defaultDyad(viewKg);
		return suggested ? [suggested[0], suggested[1]] : [null, null];
	}, [viewKg, slotOverride]);

	const partyNameById = useMemo(
		() => new Map((kg?.parties ?? []).map((p) => [p.id, p.name] as const)),
		[kg]
	);
	const hiddenNamed = useMemo(
		() => hiddenParties.map((id) => ({ id, name: partyNameById.get(id) ?? id })),
		[hiddenParties, partyNameById]
	);

	const grid = useMemo(
		() => (viewKg && focusNodeId ? buildStatementGrid(viewKg, focusNodeId, secondPartyId) : null),
		[viewKg, focusNodeId, secondPartyId]
	);

	/**
	 * Combined pull per clause — what "important" means when the rows are ranked. With a
	 * pair seated it is both parties' summed clause pull (the same quantity the pair
	 * bridge sizes nodes with); alone it is the focused party's own clause score. Null
	 * for a statement anchor, where attention has no party to seed on.
	 */
	const clauseAttention = useMemo(() => {
		if (!viewKg || !focusNodeId || !isPartyFocus) return null;
		if (pair) {
			const combined = new Map<string, number>();
			for (const [id, { a, b }] of Object.entries(pair.clauseSplit)) combined.set(id, a + b);
			return combined;
		}
		return computePartyAttention(viewKg, focusNodeId, severity, usePageRank).clauseScore;
	}, [viewKg, focusNodeId, isPartyFocus, pair, severity, usePageRank]);

	/**
	 * A band only exists while it holds something you can see. Filtering the kinds can
	 * empty a clause just as surely as the extraction can, and a row of nothing reads as
	 * a finding either way — so rows follow the filter, and reappear when it changes.
	 */
	const visibleRows = useMemo(() => {
		const rows = (grid?.rows ?? []).filter((row) =>
			GRID_LANES.some((lane) => row.marks[lane].some((mark) => visibleKinds.has(mark.kind)))
		);
		if (!sortByAttention || !clauseAttention) return rows;
		// Stable, so equal pull keeps document order; -1 keeps the residue row last.
		const pull = (row: GridRow) => (row.clauseId ? (clauseAttention.get(row.clauseId) ?? 0) : -1);
		return rows.slice().sort((x, y) => pull(y) - pull(x));
	}, [grid, visibleKinds, sortByAttention, clauseAttention]);

	/** The widest bar belongs to the heaviest visible clause; the rest are relative to it. */
	const peakPull = useMemo(
		() =>
			clauseAttention
				? Math.max(
						0,
						...visibleRows.map((row) =>
							row.clauseId ? (clauseAttention.get(row.clauseId) ?? 0) : 0
						)
					)
				: 0,
		[clauseAttention, visibleRows]
	);

	const laneByStatement = useMemo(() => {
		const byId = new Map<string, GridLane>();
		for (const row of grid?.rows ?? []) {
			for (const lane of GRID_LANES) {
				for (const mark of row.marks[lane]) byId.set(mark.id, lane);
			}
		}
		return byId;
	}, [grid]);

	/** Self-pruning: a merge, a hide or a filter that empties the band retires the id. */
	const activeClause = useMemo(
		() => visibleRows.find((row) => row.clauseId && row.clauseId === selectedClauseId) ?? null,
		[visibleRows, selectedClauseId]
	);

	// The focus chip lives in the panel header, which has no access to the graph.
	const focusedPartyName = focusNodeId ? (partyNameById.get(focusNodeId) ?? null) : null;
	useEffect(() => {
		setFocusMeta(focusedPartyName ? { label: focusedPartyName, kind: 'party' } : null);
	}, [focusedPartyName, setFocusMeta]);

	// Derive the bridge payload (anchor + related paragraphs + entity spans + deontic
	// rail) and hand it to the document viewer.
	useEffect(() => {
		if (!viewKg || !focusNodeId) return;
		const clauseStatements = activeClause
			? [...activeClause.marks.a, ...activeClause.marks.b, ...activeClause.marks.shared].map(
					(mark) => mark.id
				)
			: null;
		// Dropping a lane needs an explicit list, so whenever one is off the pair's two
		// top-K sets are materialized here rather than left to the bridge to resolve.
		const allLanesOn = GRID_LANES.every((lane) => paintLanes[lane]);
		const statementIds =
			allLanesOn || !pair
				? (clauseStatements ?? undefined)
				: (clauseStatements ?? [...new Set([...pair.topA, ...pair.topB])]).filter((id) => {
						const lane = laneByStatement.get(id);
						return lane ? paintLanes[lane] : true;
					});
		setBridgePayload(
			// With a pair on the canvas the document has to answer for both parties, or the
			// grid shows two and the page reflects one.
			pair
				? buildPairBridge(viewKg, pair, nodesById, [PARTY_COLOR, PAIR_SECOND_COLOR], statementIds)
				: buildKnowledgeGraphBridge(
						viewKg,
						activeClause?.clauseId ?? focusNodeId,
						activeClause ? 1 : hops,
						topK,
						nodesById,
						severity,
						usePageRank
					)
		);
	}, [
		viewKg,
		pair,
		focusNodeId,
		activeClause,
		paintLanes,
		laneByStatement,
		hops,
		topK,
		nodesById,
		severity,
		usePageRank,
		setBridgePayload,
	]);

	const partyCount = viewKg?.parties.length ?? null;

	const allKindsOn = MARK_KINDS.every(
		(kind) => (grid?.countByKind[kind] ?? 0) === 0 || visibleKinds.has(kind)
	);

	const toggleKind = (kind: MarkKind, on: boolean) => {
		setVisibleKinds((prev) => {
			const next = new Set(prev);
			if (on) next.add(kind);
			else next.delete(kind);
			return next;
		});
	};

	const setPaintLane = (lane: GridLane, on: boolean) =>
		setPaintLanes((prev) => ({ ...prev, [lane]: on }));

	/** Single click moves the document; double click re-anchors the grid on that node. */
	const openInDocument = (nodeId: string) => {
		if (!viewKg) return;
		setDocumentTarget(buildNodeDocumentTarget(viewKg, nodeId, nodesById));
	};

	const showTooltip = (event: ReactMouseEvent, mark: GridMark) => {
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect) return;
		setHover({
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
			kind: mark.kind,
			detail: mark.detail,
			owner:
				mark.ownerName ??
				(mark.lane === 'shared'
					? mark.attributed
						? 'both parties'
						: 'no party named'
					: undefined),
		});
	};

	const laneName = (lane: GridLane) =>
		lane === 'a'
			? (focusedPartyName ?? 'Party A')
			: lane === 'b'
				? (secondPartyId ? (partyNameById.get(secondPartyId) ?? 'Party B') : 'Party B')
				: 'Both parties';

	const renderMark = (mark: GridMark) => {
		if (!visibleKinds.has(mark.kind)) return null;
		const shared = mark.lane === 'shared';
		const outsideClause = activeClause !== null && !activeClause.marks[mark.lane].includes(mark);
		const muted = outsideClause || !paintLanes[mark.lane];
		return (
			<button
				key={mark.id}
				type="button"
				className="shrink-0 rounded-[3px] transition-opacity hover:ring-2 hover:ring-foreground/30"
				style={{
					width: MARK_SIZE,
					height: MARK_SIZE,
					backgroundColor: KIND_COLORS[mark.kind],
					opacity: muted ? MUTED_LANE_OPACITY : mark.attributed ? 1 : UNATTRIBUTED_OPACITY,
					// Dashed now means one thing only: the contract names nobody.
					...(mark.attributed ? {} : { outline: '1px dashed #cbd5e1', outlineOffset: '1px' }),
				}}
				title={`${KIND_LABEL[mark.kind]} — ${mark.ownerName ?? (shared ? (mark.attributed ? 'both parties' : 'no party named') : '')}`}
				onMouseEnter={(event) => showTooltip(event, mark)}
				onMouseMove={(event) => showTooltip(event, mark)}
				onMouseLeave={() => setHover(null)}
				onClick={() => openInDocument(mark.id)}
				onDoubleClick={() => focusNode(mark.id)}
			/>
		);
	};

	return (
		<div className="flex h-full flex-col">
			{status === 'ready' && partyCount !== null && (
				<div className="border-b border-border/60 px-3 py-2 text-2xs text-muted-foreground">
					<div className="flex items-center justify-between gap-2">
						<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
							<span className="flex items-center gap-1">
								{isPartyFocus ? (
									<span className="relative">
										<button
											type="button"
											onClick={() => setPartyPickerOpen((open) => !open)}
											className="rounded border border-border/70 px-1.5 py-0.5 hover:bg-muted"
											title="Add a second party to compare the two side by side"
										>
											{secondPartyId ? '2 of' : '1 of'} {partyCount} parties ▾
										</button>
										{partyPickerOpen && (
											<span className="absolute top-full left-0 z-20 mt-1 flex w-56 flex-col gap-1 rounded-md border border-border bg-popover p-2 shadow-md">
												{(viewKg?.parties ?? []).map((party) => {
													const isAnchor = party.id === focusNodeId;
													const checked = isAnchor || party.id === secondPartyId;
													const color = isAnchor
														? PARTY_COLOR
														: party.id === secondPartyId
															? PAIR_SECOND_COLOR
															: 'transparent';
													return (
														<label
															key={party.id}
															className={
																isAnchor
																	? 'flex cursor-default items-center gap-2 opacity-70'
																	: 'flex cursor-pointer items-center gap-2 hover:text-foreground'
															}
														>
															<input
																type="checkbox"
																checked={checked}
																disabled={isAnchor}
																onChange={() =>
																	setSecondParty(party.id === secondPartyId ? null : party.id)
																}
																className="cursor-pointer accent-primary"
															/>
															<span
																className="inline-block h-2 w-2 shrink-0 rounded-full border"
																style={{ backgroundColor: color, borderColor: 'currentColor' }}
															/>
															<span className="truncate">{party.name}</span>
														</label>
													);
												})}
											</span>
										)}
									</span>
								) : (
									<span>{partyCount} parties</span>
								)}
							</span>
						</div>
						<Button
							variant="ghost"
							size="xs"
							className="h-6 shrink-0 px-1.5 text-2xs"
							onClick={() => setVisibleKinds(allKindsOn ? new Set() : new Set(MARK_KINDS))}
						>
							{allKindsOn ? 'Hide all' : 'Show all'}
						</Button>
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
					{/* Entry view: the pair is chosen before anything is drawn, in one place. */}
					{status === 'ready' && !focusNodeId && (
						<PartySelection
							parties={partyCards}
							slots={slots}
							slotColors={[PARTY_COLOR, PAIR_SECOND_COLOR]}
							onAssign={(id) =>
								setSlotOverride(
									slots[0] === null ? [id, slots[1]] : slots[1] === null ? [slots[0], id] : slots
								)
							}
							onRelease={(side) => {
								const next: [string | null, string | null] = [...slots];
								next[side] = null;
								setSlotOverride(next);
							}}
							selectedPartyIds={selectedPartyIds}
							onToggleSelect={toggleSelectedParty}
							mergeHints={mergeHints}
							onContinue={() => {
								if (slots[0] && slots[1]) {
									clearSelectedParties();
									focusPair(slots[0], slots[1]);
								}
							}}
						/>
					)}
					{status === 'ready' && grid && (
						<>
							<div className="h-full overflow-auto">
								<div className="min-w-[620px]">
									{/* Lane header. Each checkbox decides whether that lane reaches the document. */}
									<div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-background/95 px-3 py-1.5 text-2xs backdrop-blur">
										{/* The header doubles as the sort switch: pull order answers "what
										    matters most", document order answers "where am I". */}
										<button
											type="button"
											onClick={() => setSortByAttention((on) => !on)}
											disabled={!clauseAttention}
											className="mr-2 shrink-0 truncate text-left font-medium text-muted-foreground/70 enabled:hover:text-foreground disabled:cursor-default"
											style={{ width: LABEL_WIDTH }}
											title="Order the rows by how much attention the selected parties put on each clause, or by the clause's position in the contract"
										>
											CLAUSE
											{clauseAttention && (
												<span className="font-normal opacity-70">
													{sortByAttention ? ' · most pull first ↓' : ' · document order'}
												</span>
											)}
										</button>
										{(['a', 'b'] as const).map((lane) => (
											<label
												key={lane}
												className={`flex min-w-0 shrink-0 cursor-pointer items-center gap-1.5 font-semibold ${
													lane === 'a' ? 'justify-end' : 'justify-start'
												}`}
												style={{
													width: LANE_WIDTH,
													color: lane === 'a' ? PARTY_COLOR : PAIR_SECOND_COLOR,
												}}
												title={`Paint ${laneName(lane)}’s entities in the document`}
											>
												{lane === 'b' && (
													<Checkbox
														checked={paintLanes.b}
														disabled={!secondPartyId}
														onCheckedChange={(value) => setPaintLane('b', value === true)}
														className="size-3.5 shrink-0 border-current"
														style={{ backgroundColor: paintLanes.b ? PAIR_SECOND_COLOR : undefined }}
														aria-label={`Paint ${laneName('b')}’s statements`}
													/>
												)}
												<span className="truncate">{laneName(lane)}</span>
												{lane === 'a' && (
													<Checkbox
														checked={paintLanes.a}
														onCheckedChange={(value) => setPaintLane('a', value === true)}
														className="size-3.5 shrink-0 border-current"
														style={{ backgroundColor: paintLanes.a ? PARTY_COLOR : undefined }}
														aria-label={`Paint ${laneName('a')}’s statements`}
													/>
												)}
											</label>
										))}
										<label
											className="flex shrink-0 cursor-pointer items-center gap-1.5 font-medium text-muted-foreground/70"
											style={{ width: LANE_WIDTH }}
											title="Bilateral provisions: the contract binds both sides at once («each Party», «either Party», «the other»). Untick to keep them out of the document — what stays painted is what is asymmetric. Dashed marks are the exception: there the contract names nobody."
										>
											<Checkbox
												checked={paintLanes.shared}
												onCheckedChange={(value) => setPaintLane('shared', value === true)}
												className="size-3.5 shrink-0"
												aria-label="Paint bilateral provisions in the document"
											/>
											<span className="truncate">BOTH PARTIES</span>
										</label>
									</div>

									{visibleRows.map((row, index) => {
										const unfiled = row.clauseId === null;
										const pull =
											clauseAttention && row.clauseId
												? (clauseAttention.get(row.clauseId) ?? 0)
												: 0;
										const split = pair && row.clauseId ? pair.clauseSplit[row.clauseId] : null;
										const shareA =
											split && split.a + split.b > 0 ? split.a / (split.a + split.b) : 1;
										const pctA = Math.round(shareA * 100);
										return (
											<div
												key={row.clauseId ?? 'unfiled'}
												className={`flex items-start gap-2 px-3 py-1.5 ${
													activeClause?.clauseId === row.clauseId
														? 'bg-primary/10 ring-1 ring-inset ring-primary/30'
														: unfiled
															? 'bg-destructive/5'
															: index % 2 === 0
																? 'bg-muted/30'
																: ''
												}`}
											>
												<button
													type="button"
													onClick={() => {
														if (!row.clauseId) return;
														setSelectedClauseId((prev) =>
															prev === row.clauseId ? null : row.clauseId
														);
														openInDocument(row.clauseId);
													}}
													disabled={unfiled}
													className={`mt-0.5 shrink-0 text-left text-2xs disabled:cursor-default ${
														unfiled
															? 'font-medium text-destructive/80'
															: 'text-foreground/80 hover:underline'
													}`}
													style={{ width: LABEL_WIDTH }}
													title={
														split
															? `${row.heading} — ${laneName('a')} ${pctA}% · ${laneName('b')} ${100 - pctA}%`
															: row.heading
													}
												>
													<span className="block truncate">{row.heading}</span>
													{/* The quantity the ranking sorts by, made visible — so "first"
													    also says "by how much", and a pair says whose pull it is,
													    with the split spelled out as a percentage per side. */}
													{clauseAttention && !unfiled && peakPull > 0 && (
														<span className="mt-0.5 flex items-center gap-1">
															<span className="flex h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
																<span
																	style={{
																		width: `${(pull / peakPull) * shareA * 100}%`,
																		backgroundColor: PARTY_COLOR,
																	}}
																/>
																{split && (
																	<span
																		style={{
																			width: `${(pull / peakPull) * (1 - shareA) * 100}%`,
																			backgroundColor: PAIR_SECOND_COLOR,
																		}}
																	/>
																)}
															</span>
															{/* Fixed width whether or not a number lands in it, so every
															    track spans the same room and stays comparable row to row. */}
															{pair && (
																<span className="w-8 shrink-0 text-right text-[9px] leading-none tabular-nums">
																	{split && (
																		<>
																			<span style={{ color: PARTY_COLOR }}>{pctA}</span>
																			<span className="opacity-50">/</span>
																			<span style={{ color: PAIR_SECOND_COLOR }}>{100 - pctA}</span>
																		</>
																	)}
																</span>
															)}
														</span>
													)}
												</button>
												{/* Lane A fills right-to-left so it still grows outward from the
												    axis once the marks wrap; lane B fills the ordinary way. */}
												{GRID_LANES.map((lane) => (
													<Fragment key={lane}>
														{lane === 'b' && (
															<span className="w-px shrink-0 self-stretch bg-border" />
														)}
														<div
															dir={lane === 'a' ? 'rtl' : 'ltr'}
															className="grid shrink-0 content-start"
															style={{
																width: LANE_WIDTH,
																gap: MARK_GAP,
																gridTemplateColumns: `repeat(${LANE_COLUMNS}, ${MARK_SIZE}px)`,
															}}
														>
															{row.marks[lane].map(renderMark)}
														</div>
													</Fragment>
												))}
											</div>
										);
									})}
								</div>
							</div>

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
											sideOffset={12}
											className="max-w-[360px] border-l-4 px-3.5 py-2.5 shadow-lg"
											style={{ borderLeftColor: KIND_COLORS[hover.kind] }}
										>
											<span className="flex items-baseline gap-1.5 text-sm leading-snug">
												<span
													className="relative top-[-1px] inline-block size-2.5 shrink-0 self-center rounded-full"
													style={{ backgroundColor: KIND_COLORS[hover.kind] }}
												/>
												<span className="font-semibold">{KIND_LABEL[hover.kind]}</span>
												{hover.owner && <span className="min-w-0 opacity-80">— {hover.owner}</span>}
											</span>
											{hover.detail && (
												<span className="mt-1.5 block text-xs leading-relaxed opacity-90">
													{hover.detail}
												</span>
											)}
										</TooltipContent>
									)}
								</Tooltip>
							</TooltipProvider>
						</>
					)}
				</div>

				{/* Legend / kind filter — right sidebar. Only the three kinds the grid draws:
				    clauses are bands and parties are lanes, so neither is a mark. */}
				{status === 'ready' && grid && (
					<aside className="w-32 shrink-0 space-y-2 overflow-y-auto border-l border-border/60 px-2 py-2 text-2xs text-muted-foreground">
						<div>
							<div className="mb-1 font-medium text-foreground/50">Entities</div>
							<div className="grid grid-cols-1 gap-y-1">
								{MARK_KINDS.map((kind) => {
									const count = grid.countByKind[kind] ?? 0;
									const color = KIND_COLORS[kind];
									return (
										<label
											key={kind}
											className={`inline-flex min-w-0 items-center gap-1.5 ${
												count === 0 ? 'opacity-40' : 'cursor-pointer'
											}`}
										>
											<Checkbox
												checked={visibleKinds.has(kind)}
												disabled={count === 0}
												onCheckedChange={(value) => toggleKind(kind, value === true)}
												className="size-3.5 shrink-0 border-current data-[state=checked]:text-white"
												style={{
													color,
													backgroundColor: visibleKinds.has(kind) ? color : undefined,
													borderColor: color,
												}}
												aria-label={`${KIND_LABEL[kind]} (${count})`}
											/>
											<span className="truncate" title={KIND_LABEL[kind]}>
												{KIND_LABEL[kind]}
											</span>
											<span className="ml-auto shrink-0 tabular-nums opacity-60">{count}</span>
										</label>
									);
								})}
							</div>
						</div>
					</aside>
				)}
			</div>

			{status === 'ready' && (
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
