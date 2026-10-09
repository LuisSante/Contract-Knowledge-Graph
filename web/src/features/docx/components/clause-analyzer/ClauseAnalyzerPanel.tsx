'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { cn } from '@/lib/utils';
import { useDocumentStore } from '@/stores/document';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import { buildDocumentTarget } from '@/features/docx/utils/knowledge/graph-payload';
import { applyPartyView } from '@/features/docx/utils/knowledge/party-view';
import {
	buildStatementGrid,
	DEONTIC_MARK_KINDS,
	GRID_LANES,
	type GridLane,
	type GridMark,
	type GridRow,
	type MarkKind,
} from '@/features/docx/utils/knowledge/statement-grid';
import { computePairScores } from '@/features/docx/utils/knowledge/pair';
import { computeBenefitShare, shareOfClause } from '@/features/docx/utils/knowledge/benefit-share';
import { useClauseImportance } from '@/features/docx/hooks/useClauseImportance';
import { useFocusPayload } from '@/features/docx/hooks/useFocusPayload';
import { useKnowledgeGraphData } from '@/features/docx/hooks/useKnowledgeGraphData';
import { useAnalyzerView } from '@/features/docx/hooks/useAnalyzerView';
import { PartyManager } from '@/features/docx/components/clause-analyzer/PartyManager';
import { PartyEntry } from '@/features/docx/components/clause-analyzer/PartyEntry';
import { ClauseGrid } from '@/features/docx/components/clause-analyzer/grid/ClauseGrid';
import {
	MarkTooltip,
	markDetails,
	type HoverInfo,
} from '@/features/docx/components/clause-analyzer/grid/MarkTooltip';
import { Legend } from '@/features/docx/components/clause-analyzer/legend/Legend';
import {
	PAIR_SECOND_COLOR,
	PARTY_COLOR,
} from '@/features/docx/components/clause-analyzer/constants';
import { ViewBar } from '@/features/docx/components/clause-analyzer/views/ViewBar';
import { ByTypeView } from '@/features/docx/components/clause-analyzer/views/ByTypeView';
import { EvidencePanelView } from '@/features/docx/components/clause-analyzer/views/EvidencePanelView';
import type { ViewProps } from '@/features/docx/components/clause-analyzer/views/types';

interface ClauseAnalyzerPanelProps {
	docId: string;
	/** Switches the drawer to the knowledge graph tab. */
	onOpenGraph?: () => void;
}

const LANE_COLORS: [string, string] = [PARTY_COLOR, PAIR_SECOND_COLOR];

export function ClauseAnalyzerPanel({ docId, onOpenGraph }: ClauseAnalyzerPanelProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [hover, setHover] = useState<HoverInfo | null>(null);

	const [visibleKinds, setVisibleKinds] = useState<Set<MarkKind>>(
		() => new Set(DEONTIC_MARK_KINDS)
	);

	const selectedClause = useClauseAnalyzerStore((s) => s.selectedClause);
	const selectClause = useClauseAnalyzerStore((s) => s.selectClause);
	const selectedClauseId = selectedClause?.docId === docId ? selectedClause.clauseId : null;

	const [sortByImportance, setSortByImportance] = useState(true);
	const [paintLanes, setPaintLanes] = useState<Record<GridLane, boolean>>({
		a: true,
		b: true,
		shared: true,
	});

	const [showShared, setShowShared] = useState(false);
	const focusNodeId = useClauseAnalyzerStore((s) => s.focusNodeId);
	const hops = useClauseAnalyzerStore((s) => s.hops);
	const topK = useClauseAnalyzerStore((s) => s.topK);
	const severity = useClauseAnalyzerStore((s) => s.severity);
	const focusNode = useClauseAnalyzerStore((s) => s.focusNode);
	const clearFocus = useClauseAnalyzerStore((s) => s.clearFocus);
	const setFocusMeta = useClauseAnalyzerStore((s) => s.setFocusMeta);
	const setDocumentTarget = useClauseAnalyzerStore((s) => s.setDocumentTarget);
	const mergeGroups = useClauseAnalyzerStore((s) => s.mergeGroups);
	const mergeParties = useClauseAnalyzerStore((s) => s.mergeParties);
	const splitGroup = useClauseAnalyzerStore((s) => s.splitGroup);
	const hideParty = useClauseAnalyzerStore((s) => s.hideParty);
	const hiddenParties = useClauseAnalyzerStore((s) => s.hiddenParties);
	const unhideParty = useClauseAnalyzerStore((s) => s.unhideParty);
	const clearPartyView = useClauseAnalyzerStore((s) => s.clearPartyView);
	const secondPartyId = useClauseAnalyzerStore((s) => s.secondPartyId);
	const focusPair = useClauseAnalyzerStore((s) => s.focusPair);
	const paragraphs = useDocumentStore((s) => s.paragraphs);
	const nodesById = useMemo(() => new Map(paragraphs.map((n) => [n.id, n])), [paragraphs]);

	const { kg, status } = useKnowledgeGraphData(docId, clearFocus);

	const viewKg = useMemo(
		() => (kg ? applyPartyView(kg, mergeGroups, new Set(hiddenParties)) : null),
		[kg, mergeGroups, hiddenParties]
	);

	const isPartyFocus = useMemo(
		() => Boolean(focusNodeId && viewKg?.parties.some((p) => p.id === focusNodeId)),
		[viewKg, focusNodeId]
	);

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

	const clauseBenefit = useMemo(
		() => (grid && isPartyFocus ? computeBenefitShare(grid, shownLanes) : null),
		[grid, isPartyFocus, shownLanes]
	);
	const shareOf = (clauseId: string | null) => shareOfClause(clauseBenefit, clauseId);

	const countedIds = useMemo(() => {
		const ids = new Set<string>();
		for (const row of grid?.rows ?? []) {
			for (const lane of shownLanes) {
				for (const mark of row.marks[lane]) {
					if (visibleKinds.has(mark.kind)) ids.add(mark.id);
				}
			}
		}
		// Empty means the grid has not resolved yet, not "count nothing": publishing []
		// would leave the graph tab waiting forever on a request that never fires.
		return ids.size > 0 ? [...ids].sort() : null;
	}, [grid, shownLanes, visibleKinds]);

	const clauseImportance = useClauseImportance(docId, countedIds);

	const pair = useMemo(
		() =>
			viewKg && isPartyFocus && focusNodeId && secondPartyId && secondPartyId !== focusNodeId
				? computePairScores(
						viewKg,
						focusNodeId,
						secondPartyId,
						topK,
						severity,
						clauseImportance?.byClause ?? null
					)
				: null,
		[viewKg, isPartyFocus, focusNodeId, secondPartyId, topK, severity, clauseImportance]
	);

	const visibleRows = useMemo(() => {
		const rows = (grid?.rows ?? []).filter((row) =>
			shownLanes.some((lane) => row.marks[lane].some((mark) => visibleKinds.has(mark.kind)))
		);
		if (!sortByImportance || !clauseImportance) return rows;
		const weight = (row: GridRow) =>
			row.clauseId ? (clauseImportance.byClause[row.clauseId] ?? 0) : -1;
		return rows.slice().sort((x, y) => weight(y) - weight(x));
	}, [grid, visibleKinds, shownLanes, sortByImportance, clauseImportance]);

	const laneByStatement = useMemo(() => {
		const byId = new Map<string, GridLane>();
		for (const row of grid?.rows ?? []) {
			for (const lane of GRID_LANES) {
				for (const mark of row.marks[lane]) byId.set(mark.id, lane);
			}
		}
		return byId;
	}, [grid]);

	const clauseRows = useMemo(
		() => visibleRows.filter((row) => row.clauseId !== null),
		[visibleRows]
	);
	const unfiledRow = visibleRows.find((row) => row.clauseId === null) ?? null;

	const activeClause = useMemo(
		() => visibleRows.find((row) => row.clauseId && row.clauseId === selectedClauseId) ?? null,
		[visibleRows, selectedClauseId]
	);

	const focusedPartyName = focusNodeId ? (partyNameById.get(focusNodeId) ?? null) : null;
	useEffect(() => {
		setFocusMeta(focusedPartyName ? { label: focusedPartyName, kind: 'party' } : null);
	}, [focusedPartyName, setFocusMeta]);

	useFocusPayload({
		kg: viewKg,
		focusNodeId,
		pair,
		activeClause,
		laneByStatement,
		lanes: shownLanes,
		paintLanes,
		showShared,
		nodesById,
		laneColors: LANE_COLORS,
		hops,
		topK,
		severity,
		importanceByNode: clauseImportance?.byNode ?? null,
	});

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
		setDocumentTarget(buildDocumentTarget(viewKg, nodeId, nodesById));
	};

	const openClauseInGraph =
		onOpenGraph &&
		((clauseId: string) => {
			selectClause(docId, clauseId);
			openInDocument(clauseId);
			onOpenGraph();
		});

	const detailsOf = useMemo(
		() => (viewKg && grid ? markDetails(viewKg, grid) : null),
		[viewKg, grid]
	);

	const showTooltip = (event: ReactMouseEvent, mark: GridMark) => {
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect || !detailsOf) return;
		setHover({ x: event.clientX - rect.left, y: event.clientY - rect.top, ...detailsOf(mark) });
	};

	const laneName = (lane: GridLane) =>
		lane === 'a'
			? (focusedPartyName ?? 'Party A')
			: lane === 'b'
				? secondPartyId
					? (partyNameById.get(secondPartyId) ?? 'Party B')
					: 'Party B'
				: 'Both parties';

	const nav = useAnalyzerView();
	const pairIds =
		status === 'ready' &&
		isPartyFocus &&
		focusNodeId &&
		secondPartyId &&
		secondPartyId !== focusNodeId
			? { a: focusNodeId, b: secondPartyId }
			: null;
	const pairA = pairIds?.a ?? null;
	const pairB = pairIds?.b ?? null;
	const names = useMemo(
		() => ({
			a: viewKg?.parties.find((p) => p.id === pairA)?.name ?? 'Party A',
			b: viewKg?.parties.find((p) => p.id === pairB)?.name ?? 'Party B',
		}),
		[viewKg, pairA, pairB]
	);
	const viewProps: ViewProps | null =
		pairIds && viewKg && grid
			? {
					docId,
					kg: viewKg,
					names,
					grid,
					importance: clauseImportance?.byClause ?? null,
					onOpen: openInDocument,
					onOpenGraph: openClauseInGraph,
				}
			: null;
	const inView = viewProps !== null && nav.view !== 'table';

	// The pair lives in the URL too: a shared link opens on the same comparison.
	const { pair: urlPair, setPair } = nav;
	const pairKey = pairIds ? `${pairIds.a},${pairIds.b}` : null;
	const hadPair = useRef(false);
	useEffect(() => {
		if (pairKey) {
			hadPair.current = true;
			const [a, b] = pairKey.split(',');
			setPair({ a, b });
		} else if (hadPair.current && focusNodeId === null) {
			hadPair.current = false;
			setPair(null);
		}
	}, [pairKey, focusNodeId, setPair]);
	const wantA = urlPair?.a ?? null;
	const wantB = urlPair?.b ?? null;
	useEffect(() => {
		if (status !== 'ready' || !viewKg || focusNodeId || !wantA || !wantB) return;
		const known = (id: string) => viewKg.parties.some((p) => p.id === id);
		if (known(wantA) && known(wantB)) focusPair(wantA, wantB);
	}, [status, viewKg, focusNodeId, wantA, wantB, focusPair]);

	return (
		<div className="flex h-full flex-col">
			{viewProps && <ViewBar view={nav.view} onView={nav.setView} />}
			{inView && viewProps && nav.view === 'bytype' && <ByTypeView {...viewProps} />}
			{inView && viewProps && nav.view === 'evidence' && <EvidencePanelView {...viewProps} />}

			{/* The table fills the panel; the graph has a tab of its own. */}
			<div className={cn('flex', inView ? 'hidden' : 'min-h-0 flex-1')}>
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
					{/* Entry view: the pair is chosen before anything is drawn, in one place. */}
					{status === 'ready' && viewKg && !focusNodeId && (
						<PartyEntry
							docId={docId}
							kg={viewKg}
							mergeGroups={mergeGroups}
							onMerge={mergeParties}
							onSplit={splitGroup}
							onDelete={hideParty}
							onContinue={focusPair}
						/>
					)}
					{status === 'ready' && grid && (
						<>
							<ClauseGrid
								clauseRows={clauseRows}
								unfiledRow={unfiledRow}
								lanes={shownLanes}
								visibleKinds={visibleKinds}
								activeClauseId={activeClause?.clauseId ?? null}
								shareOf={shareOf}
								laneName={laneName}
								sortByImportance={sortByImportance}
								sortable={Boolean(clauseImportance)}
								onToggleSort={() => setSortByImportance((on) => !on)}
								paintLanes={paintLanes}
								onPaintLane={setPaintLane}
								canPaintB={Boolean(secondPartyId)}
								showShared={showShared}
								onSelectClause={(clauseId) => {
									selectClause(docId, selectedClauseId === clauseId ? null : clauseId);
									openInDocument(clauseId);
								}}
								onOpenGraph={openClauseInGraph}
								onOpenMark={openInDocument}
								onFocusMark={focusNode}
								onHoverMark={showTooltip}
								onLeaveMark={() => setHover(null)}
							/>
							<MarkTooltip hover={hover} />
						</>
					)}
				</div>

				{status === 'ready' && grid && (
					<Legend
						countByKind={grid.countByKind}
						visibleKinds={visibleKinds}
						onToggleKind={toggleKind}
						showShared={showShared}
						onShowShared={setShowShared}
					/>
				)}
			</div>

			{status === 'ready' && (
				<PartyManager
					hidden={hiddenNamed}
					hasView={mergeGroups.length > 0 || hiddenParties.length > 0}
					onUnhide={unhideParty}
					onReset={clearPartyView}
				/>
			)}
		</div>
	);
}
