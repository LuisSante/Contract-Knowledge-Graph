'use client';

import {
	Fragment,
	useEffect,
	useMemo,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
} from 'react';
import {
	fetchClauseImportance,
	fetchKnowledgeGraph,
	fetchPartyMergeHints,
	type ClauseImportance,
} from '@/services/knowledge';
import { useDocumentStore } from '@/stores/document';
import { mergeGroupId, useKnowledgeGraphStore } from '@/stores/knowledgeGraph';
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
import { DEFAULT_SEVERITY } from '@/features/docx/utils/knowledge/attention';
import { PartyManager } from '@/features/docx/components/knowledge-graph/PartyManager';
import { computePairAttention, defaultDyad } from '@/features/docx/utils/knowledge/pair';
import {
	PartySelection,
	type PartyCardData,
} from '@/features/docx/components/knowledge-graph/PartySelection';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import type { DeonticKind, KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';

interface KnowledgeGraphPanelProps {
	docId: string;
}

const PARTY_COLOR = '#984ea3';
const PAIR_SECOND_COLOR = '#0d9488';

const KIND_COLORS: Record<MarkKind, string> = {
	obligation: '#e41a1c',
	right: '#4daf4a',
	prohibition: '#ff7f00',
	definedTerm: '#a65628',
	condition: '#f781bf',
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

const LANE_COLUMNS = 10;
const MARK_SIZE = 14;
const MARK_GAP = 4;
const LANE_WIDTH = LANE_COLUMNS * MARK_SIZE + (LANE_COLUMNS - 1) * MARK_GAP;
const LABEL_WIDTH = 176;

const ROW_PAGE = 10;

const MUTED_LANE_OPACITY = 0.22;

function WeightField({
	value,
	label,
	onCommit,
}: {
	value: number;
	label: string;
	onCommit: (value: number) => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	return (
		<input
			type="text"
			inputMode="decimal"
			value={draft ?? String(value)}
			onChange={(event) => {
				const raw = event.target.value;
				setDraft(raw);
				const parsed = Number(raw.replace(',', '.'));
				if (raw.trim() !== '' && !Number.isNaN(parsed)) onCommit(parsed);
			}}
			onBlur={() => setDraft(null)}
			onKeyDown={(event) => {
				if (event.key === 'Enter') event.currentTarget.blur();
			}}
			className="w-9 shrink-0 rounded border border-border/60 bg-background px-1 py-px text-center font-medium text-blue-600 tabular-nums outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300/60"
			aria-label={label}
			title="Type a weight between 0 and 1"
		/>
	);
}

export function KnowledgeGraphPanel({ docId }: KnowledgeGraphPanelProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [kg, setKg] = useState<KnowledgeGraph | null>(null);
	const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
	const [hover, setHover] = useState<{
		x: number;
		y: number;
		kind: MarkKind;
		detail: string;
		owner?: string;
	} | null>(null);

	const [visibleKinds, setVisibleKinds] = useState<Set<MarkKind>>(
		() => new Set(DEONTIC_MARK_KINDS)
	);

	const [selectedClauseId, setSelectedClauseId] = useState<string | null>(null);

	const [sortByAttention, setSortByAttention] = useState(true);
	const [rowLimit, setRowLimit] = useState(ROW_PAGE);

	const [showUnfiled, setShowUnfiled] = useState(false);
	const [paintLanes, setPaintLanes] = useState<Record<GridLane, boolean>>({
		a: true,
		b: true,
		shared: true,
	});

	const [showShared, setShowShared] = useState(false);
	const [mergeHints, setMergeHints] = useState<Record<string, string[]>>({});
	const [hintsLoading, setHintsLoading] = useState(false);

	const focusNodeId = useKnowledgeGraphStore((s) => s.focusNodeId);
	const hops = useKnowledgeGraphStore((s) => s.hops);
	const topK = useKnowledgeGraphStore((s) => s.topK);
	const severity = useKnowledgeGraphStore((s) => s.severity);
	const setSeverity = useKnowledgeGraphStore((s) => s.setSeverity);
	const resetSeverity = useKnowledgeGraphStore((s) => s.resetSeverity);
	const usePageRank = useKnowledgeGraphStore((s) => s.usePageRank);
	const focusNode = useKnowledgeGraphStore((s) => s.focusNode);
	const clearFocus = useKnowledgeGraphStore((s) => s.clearFocus);
	const setFocusMeta = useKnowledgeGraphStore((s) => s.setFocusMeta);
	const setBridgePayload = useKnowledgeGraphStore((s) => s.setBridgePayload);
	const setDocumentTarget = useKnowledgeGraphStore((s) => s.setDocumentTarget);
	const mergeGroups = useKnowledgeGraphStore((s) => s.mergeGroups);
	const mergeParties = useKnowledgeGraphStore((s) => s.mergeParties);
	const splitGroup = useKnowledgeGraphStore((s) => s.splitGroup);
	const hideParty = useKnowledgeGraphStore((s) => s.hideParty);
	const hiddenParties = useKnowledgeGraphStore((s) => s.hiddenParties);
	const unhideParty = useKnowledgeGraphStore((s) => s.unhideParty);
	const clearPartyView = useKnowledgeGraphStore((s) => s.clearPartyView);
	const secondPartyId = useKnowledgeGraphStore((s) => s.secondPartyId);
	const setSecondParty = useKnowledgeGraphStore((s) => s.setSecondParty);
	const focusPair = useKnowledgeGraphStore((s) => s.focusPair);
	const [slotOverride, setSlotOverride] = useState<[string | null, string | null] | null>(null);
	const [partyPickerOpen, setPartyPickerOpen] = useState(false);
	const paragraphs = useDocumentStore((s) => s.paragraphs);
	const nodesById = useMemo(() => new Map(paragraphs.map((n) => [n.id, n])), [paragraphs]);

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

	const viewKg = useMemo(
		() => (kg ? applyPartyView(kg, mergeGroups, new Set(hiddenParties)) : null),
		[kg, mergeGroups, hiddenParties]
	);

	const isPartyFocus = useMemo(
		() => Boolean(focusNodeId && viewKg?.parties.some((p) => p.id === focusNodeId)),
		[viewKg, focusNodeId]
	);

	const pair = useMemo(
		() =>
			viewKg && isPartyFocus && focusNodeId && secondPartyId && secondPartyId !== focusNodeId
				? computePairAttention(viewKg, focusNodeId, secondPartyId, topK, severity, usePageRank)
				: null,
		[viewKg, isPartyFocus, focusNodeId, secondPartyId, topK, severity, usePageRank]
	);

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

	const shownLanes = useMemo<GridLane[]>(
		() => (showShared ? GRID_LANES : GRID_LANES.filter((lane) => lane !== 'shared')),
		[showShared]
	);

	const clauseBenefit = useMemo(() => {
		if (!grid || !isPartyFocus) return null;
		const byClause = new Map<string, { a: number; b: number }>();
		for (const row of grid.rows) {
			if (!row.clauseId) continue;
			const benefit = { a: 0, b: 0 };
			for (const lane of shownLanes) {
				for (const mark of row.marks[lane]) {
					// Only the deontic three carry a severity; a qualifier describes a
					// statement that is already counted.
					if (!(mark.kind in severity)) continue;
					const weight = severity[mark.kind as DeonticKind];
					if (lane === 'shared') {
						benefit.a += weight;
						benefit.b += weight;
						continue;
					}
					const gains = mark.kind === 'right' ? lane : mark.counterpartLane;
					if (gains === 'a' || gains === 'b') benefit[gains] += weight;
				}
			}
			byClause.set(row.clauseId, benefit);
		}
		return byClause;
	}, [grid, isPartyFocus, severity, shownLanes]);

	const shareOf = (clauseId: string | null) => {
		const benefit = clauseId ? clauseBenefit?.get(clauseId) : null;
		if (!benefit) return null;
		const total = benefit.a + benefit.b;
		if (total <= 0) return null;
		return { a: benefit.a / total, b: benefit.b / total };
	};

	const countedIds = useMemo(() => {
		const ids = new Set<string>();
		for (const row of grid?.rows ?? []) {
			for (const lane of shownLanes) {
				for (const mark of row.marks[lane]) {
					if (visibleKinds.has(mark.kind)) ids.add(mark.id);
				}
			}
		}
		return ids;
	}, [grid, shownLanes, visibleKinds]);

	const [clauseImportance, setClauseImportance] = useState<ClauseImportance | null>(null);
	useEffect(() => {
		if (!docId || countedIds.size === 0) return;
		const controller = new AbortController();
		void fetchClauseImportance(docId, [...countedIds], controller.signal).then((result) => {
			if (result) setClauseImportance(result);
		});
		return () => controller.abort();
	}, [docId, countedIds]);

	const visibleRows = useMemo(() => {
		const rows = (grid?.rows ?? []).filter((row) =>
			shownLanes.some((lane) => row.marks[lane].some((mark) => visibleKinds.has(mark.kind)))
		);
		if (!sortByAttention || !clauseImportance) return rows;
		const weight = (row: GridRow) =>
			row.clauseId ? (clauseImportance.byClause[row.clauseId] ?? 0) : -1;
		return rows.slice().sort((x, y) => weight(y) - weight(x));
	}, [grid, visibleKinds, shownLanes, sortByAttention, clauseImportance]);

	const laneByStatement = useMemo(() => {
		const byId = new Map<string, GridLane>();
		for (const row of grid?.rows ?? []) {
			for (const lane of GRID_LANES) {
				for (const mark of row.marks[lane]) byId.set(mark.id, lane);
			}
		}
		return byId;
	}, [grid]);

	const clauseRows = useMemo(() => visibleRows.filter((row) => row.clauseId !== null), [visibleRows]);
	const unfiledRow = visibleRows.find((row) => row.clauseId === null) ?? null;
	const hiddenRows = Math.max(0, clauseRows.length - rowLimit);
	const shownRows = useMemo(
		() => [
			...clauseRows.slice(0, rowLimit),
			...(showUnfiled && unfiledRow ? [unfiledRow] : []),
		],
		[clauseRows, rowLimit, showUnfiled, unfiledRow]
	);

	const activeClause = useMemo(
		() => visibleRows.find((row) => row.clauseId && row.clauseId === selectedClauseId) ?? null,
		[visibleRows, selectedClauseId]
	);

	const focusedPartyName = focusNodeId ? (partyNameById.get(focusNodeId) ?? null) : null;
	useEffect(() => {
		setFocusMeta(focusedPartyName ? { label: focusedPartyName, kind: 'party' } : null);
	}, [focusedPartyName, setFocusMeta]);

	useEffect(() => {
		if (!viewKg || !focusNodeId) return;
		const clauseStatements = activeClause
			? [...activeClause.marks.a, ...activeClause.marks.b, ...activeClause.marks.shared].map(
					(mark) => mark.id
				)
			: null;
		const allLanesOn = shownLanes.every((lane) => paintLanes[lane]) && showShared;
		const statementIds =
			allLanesOn || !pair
				? (clauseStatements ?? undefined)
				: (clauseStatements ?? [...new Set([...pair.topA, ...pair.topB])]).filter((id) => {
						const lane = laneByStatement.get(id);
						return lane ? shownLanes.includes(lane) && paintLanes[lane] : true;
					});
		setBridgePayload(
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
		shownLanes,
		showShared,
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

	const severityDirty = DEONTIC_MARK_KINDS.some(
		(kind) => severity[kind as DeonticKind] !== DEFAULT_SEVERITY[kind as DeonticKind]
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
					? 'both parties'
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
					opacity: muted ? MUTED_LANE_OPACITY : 1,
				}}
				title={`${KIND_LABEL[mark.kind]} — ${mark.ownerName ?? (shared ? 'both parties' : '')}`}
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
							onAssign={(id, side) =>
								setSlotOverride(() => {
									const next: [string | null, string | null] = [slots[0], slots[1]];
									if (side === undefined) {
										if (next[0] === null) next[0] = id;
										else if (next[1] === null) next[1] = id;
										return next;
									}
									// Seating one card on the other's chair exchanges them
									// instead of duplicating the id across both seats.
									const other = side === 0 ? 1 : 0;
									if (next[other] === id) next[other] = next[side];
									next[side] = id;
									return next;
								})
							}
							onRelease={(side) => {
								const next: [string | null, string | null] = [...slots];
								next[side] = null;
								setSlotOverride(next);
							}}
							mergeHints={mergeHints}
							groupIds={mergeGroups.map((group) => group.id)}
							onMerge={(ids) => {
								// Predict the group id so a seated party keeps its seat as
								// the merged entity, instead of being pruned to an empty chair.
								const groupById = new Map(mergeGroups.map((g) => [g.id, g]));
								const members = new Set<string>();
								for (const id of ids) {
									const group = groupById.get(id);
									if (group) group.members.forEach((m) => members.add(m));
									else members.add(id);
								}
								if (members.size < 2) return;
								const newId = mergeGroupId(members);
								mergeParties(ids);
								setSlotOverride(() => {
									const remap = (seat: string | null) =>
										seat && (ids.includes(seat) || members.has(seat)) ? newId : seat;
									const a = remap(slots[0]);
									const b = remap(slots[1]);
									return a !== null && a === b ? [a, null] : [a, b];
								});
							}}
							onSplit={splitGroup}
							onDelete={hideParty}
							onContinue={() => {
								if (slots[0] && slots[1]) focusPair(slots[0], slots[1]);
							}}
						/>
					)}
					{status === 'ready' && grid && (
						<>
							<div className="h-full overflow-auto">
								<div className="min-w-[620px]">
									<div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-background/95 px-3 py-1.5 text-2xs backdrop-blur">
										<button
											type="button"
											onClick={() => setSortByAttention((on) => !on)}
											disabled={!clauseImportance}
											className="mr-2 shrink-0 truncate text-left font-medium text-muted-foreground/70 enabled:hover:text-foreground disabled:cursor-default"
											style={{ width: LABEL_WIDTH }}
											title="Order the rows by how much each clause weighs inside the contract (PageRank with a per-clause prior), or by its position in the document"
										>
											CLAUSE
											{clauseImportance && (
												<span className="font-normal opacity-70">
													{sortByAttention ? ' · most important first ↓' : ' · document order'}
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
										{showShared && (
											<span
												className="shrink-0 truncate font-medium text-muted-foreground/70"
												style={{ width: LANE_WIDTH }}
												title="Provisiones que el contrato dirige a las dos partes a la vez"
											>
												{laneName('shared')}
											</span>
										)}
									</div>

									{shownRows.map((row, index) => {
										const unfiled = row.clauseId === null;
										const share = shareOf(row.clauseId);
										const pctA = share ? Math.round(share.a * 100) : 0;
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
														share
															? `${row.heading} — del beneficio que reparte, ${pctA}% va a ${laneName('a')} y ${100 - pctA}% a ${laneName('b')}`
															: row.heading
													}
												>
													<span className="block truncate">{row.heading}</span>
													{/* Diverging from the centre; each half is that party's own 0–100%. */}
													{share && !unfiled && (
														<span className="mt-0.5 flex items-center gap-1">
															<span className="relative flex h-[4px] min-w-0 flex-1 items-center">
																<span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
																<span className="absolute left-1/2 h-full w-px -translate-x-1/2 bg-border/80" />
																<span
																	className="absolute top-0 h-full rounded-l-full"
																	style={{
																		right: '50%',
																		width: `${share.a * 50}%`,
																		backgroundColor: PARTY_COLOR,
																	}}
																/>
																<span
																	className="absolute top-0 h-full rounded-r-full"
																	style={{
																		left: '50%',
																		width: `${share.b * 50}%`,
																		backgroundColor: PAIR_SECOND_COLOR,
																	}}
																/>
															</span>
															<span className="w-14 shrink-0 text-right text-[9px] leading-none tabular-nums">
																<span style={{ color: PARTY_COLOR }}>{pctA}%</span>
																<span className="opacity-40">/</span>
																<span style={{ color: PAIR_SECOND_COLOR }}>{100 - pctA}%</span>
															</span>
														</span>
													)}
												</button>
												{/* Lane A fills right-to-left so it grows outward from the axis. */}
												{shownLanes.map((lane) => (
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

									<div className="flex items-center gap-3 px-3 py-2 text-2xs text-muted-foreground">
										{/* Both steps stay available at once: opening ten and closing ten are
										    the same move in opposite directions. */}
										{hiddenRows > 0 && (
											<Button
												variant="ghost"
												size="xs"
												className="h-6 px-1.5 text-2xs"
												onClick={() =>
													setRowLimit((limit) => Math.min(clauseRows.length, limit + ROW_PAGE))
												}
											>
												↓ Show {Math.min(ROW_PAGE, hiddenRows)} more · {hiddenRows} left
											</Button>
										)}
										{rowLimit > ROW_PAGE && (
											<Button
												variant="ghost"
												size="xs"
												className="h-6 px-1.5 text-2xs"
												onClick={() =>
													setRowLimit((limit) => Math.max(ROW_PAGE, limit - ROW_PAGE))
												}
											>
												↑ Hide {Math.min(ROW_PAGE, rowLimit - ROW_PAGE)}
											</Button>
										)}
										{unfiledRow && (
											<label
												className="flex cursor-pointer items-center gap-1.5"
												title="Entities the extraction filed under no clause. A gap in the graph, not a part of the contract."
											>
												<Checkbox
													checked={showUnfiled}
													onCheckedChange={(value) => setShowUnfiled(value === true)}
													className="size-3.5 shrink-0"
													aria-label="Show the No clause assigned band"
												/>
												Show “No clause assigned”
												<span className="tabular-nums opacity-60">{unfiledRow.total}</span>
											</label>
										)}
									</div>
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
					<aside className="w-36 shrink-0 space-y-2 overflow-y-auto border-l border-border/60 px-2 py-2 text-2xs text-muted-foreground">
						<div>
							<div className="mb-1 flex items-baseline justify-between">
								<span className="font-medium text-foreground/50">Entities</span>
								{severityDirty && (
									<button
										type="button"
										onClick={resetSeverity}
										className="text-muted-foreground underline hover:text-foreground"
										title="Back to the calibrated defaults (prohibition 1.0 · obligation 0.7 · right 0.3)"
									>
										reset
									</button>
								)}
							</div>
							<div className="grid grid-cols-1 gap-y-1">
								{MARK_KINDS.map((kind) => {
									const count = grid.countByKind[kind] ?? 0;
									const color = KIND_COLORS[kind];
									const deontic = (DEONTIC_MARK_KINDS as readonly MarkKind[]).includes(kind);
									return (
										<div key={kind}>
											<label
												className={`inline-flex w-full min-w-0 items-center gap-1.5 ${
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
											{/* Severity is the analyst's call, so the legend row that names the kind
											    also holds the dial: a clause weighs the sum of these. */}
											{deontic && (
												<div className="mt-0.5 flex items-center gap-1 pl-5">
													<input
														type="range"
														min={0}
														max={1}
														step={0.05}
														value={severity[kind as DeonticKind]}
														onChange={(event) =>
															setSeverity(kind as DeonticKind, Number(event.target.value))
														}
														className="min-w-0 flex-1 cursor-pointer"
														style={{ accentColor: color }}
														aria-label={`Weight of ${KIND_LABEL[kind]} in the clause weight`}
														title={`How much one ${KIND_LABEL[kind].toLowerCase()} counts toward its clause's weight`}
													/>
													<WeightField
														value={severity[kind as DeonticKind]}
														label={`Type the weight of ${KIND_LABEL[kind]}`}
														onCommit={(value) => setSeverity(kind as DeonticKind, value)}
													/>
												</div>
											)}
										</div>
									);
								})}
							</div>
						</div>


						<label
							className="flex cursor-pointer items-start gap-1.5 border-t border-border/60 pt-2"
							title="Provisiones que el contrato dirige a las dos partes a la vez («each Party»). Al abrirlas se añade una tercera columna y pasan a contar en el orden y en los porcentajes: como suman lo mismo a cada lado, acercan el reparto al 50/50."
						>
							<Checkbox
								checked={showShared}
								onCheckedChange={(value) => setShowShared(value === true)}
								className="mt-px size-3.5 shrink-0"
								aria-label="Mostrar la columna de provisiones bilaterales"
							/>
							<span className="min-w-0">Both Parties</span>
						</label>
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
