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
	MARK_KINDS,
	type GridLane,
	type GridMark,
	type GridRow,
	type MarkKind,
} from '@/features/docx/utils/knowledge/statement-grid';
import { DEFAULT_SEVERITY } from '@/features/docx/utils/knowledge/party-ledger';
import { computePairScores } from '@/features/docx/utils/knowledge/pair';
import { computeBenefitShare, shareOfClause } from '@/features/docx/utils/knowledge/benefit-share';
import { useClauseImportance } from '@/features/docx/hooks/useClauseImportance';
import { useFocusPayload } from '@/features/docx/hooks/useFocusPayload';
import { useKnowledgeGraphData } from '@/features/docx/hooks/useKnowledgeGraphData';
import { PartyManager } from '@/features/docx/components/clause-analyzer/PartyManager';
import { PartyEntry } from '@/features/docx/components/clause-analyzer/PartyEntry';
import { PanelHeader } from '@/features/docx/components/clause-analyzer/PanelHeader';
import { ClauseGrid } from '@/features/docx/components/clause-analyzer/grid/ClauseGrid';
import {
	MarkTooltip,
	type HoverInfo,
} from '@/features/docx/components/clause-analyzer/grid/MarkTooltip';
import { Legend } from '@/features/docx/components/clause-analyzer/legend/Legend';
import { GraphSection } from '@/features/docx/components/clause-analyzer/graph/GraphSection';
import {
	PAIR_SECOND_COLOR,
	PARTY_COLOR,
} from '@/features/docx/components/clause-analyzer/constants';
import type { DeonticKind } from '@/types/knowledge';

interface ClauseAnalyzerPanelProps {
	docId: string;
}

const LANE_COLORS: [string, string] = [PARTY_COLOR, PAIR_SECOND_COLOR];

export function ClauseAnalyzerPanel({ docId }: ClauseAnalyzerPanelProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [hover, setHover] = useState<HoverInfo | null>(null);

	const [visibleKinds, setVisibleKinds] = useState<Set<MarkKind>>(
		() => new Set(DEONTIC_MARK_KINDS)
	);

	const [selectedClauseId, setSelectedClauseId] = useState<string | null>(null);

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
	const setSeverity = useClauseAnalyzerStore((s) => s.setSeverity);
	const resetSeverity = useClauseAnalyzerStore((s) => s.resetSeverity);
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
	const setSecondParty = useClauseAnalyzerStore((s) => s.setSecondParty);
	const focusPair = useClauseAnalyzerStore((s) => s.focusPair);
	const [partyPickerOpen, setPartyPickerOpen] = useState(false);
	const paragraphs = useDocumentStore((s) => s.paragraphs);
	const nodesById = useMemo(() => new Map(paragraphs.map((n) => [n.id, n])), [paragraphs]);

	const { kg, status, mergeHints, hintsLoading } = useKnowledgeGraphData(docId, clearFocus);

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
		() => (grid && isPartyFocus ? computeBenefitShare(grid, severity, shownLanes) : null),
		[grid, isPartyFocus, severity, shownLanes]
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
		setDocumentTarget(buildDocumentTarget(viewKg, nodeId, nodesById));
	};

	const showTooltip = (event: ReactMouseEvent, mark: GridMark) => {
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect) return;
		setHover({
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
			kind: mark.kind,
			detail: mark.detail,
			owner: mark.ownerName ?? (mark.lane === 'shared' ? 'both parties' : undefined),
		});
	};

	const laneName = (lane: GridLane) =>
		lane === 'a'
			? (focusedPartyName ?? 'Party A')
			: lane === 'b'
				? secondPartyId
					? (partyNameById.get(secondPartyId) ?? 'Party B')
					: 'Party B'
				: 'Both parties';

	const showGraph = status === 'ready' && Boolean(viewKg) && Boolean(grid);

	return (
		<div className="flex h-full flex-col">
			{status === 'ready' && viewKg && (
				<PanelHeader
					parties={viewKg.parties}
					focusPartyId={isPartyFocus ? focusNodeId : null}
					secondPartyId={secondPartyId}
					onSecondParty={setSecondParty}
					pickerOpen={partyPickerOpen}
					onPickerOpen={setPartyPickerOpen}
					allKindsOn={allKindsOn}
					onToggleAllKinds={() => setVisibleKinds(allKindsOn ? new Set() : new Set(MARK_KINDS))}
				/>
			)}

			{/* With the graph below, this hugs its rows instead of claiming a fixed share:
			    seven clauses are ~300px and the rest belongs to the graph. The floor keeps
			    the legend from scrolling on short documents; the cap keeps a long grid from
			    pushing the graph off screen — it scrolls inside instead. With no graph —
			    party picker, loading, error — it fills, or the footer's border would float
			    mid-panel with white space under it. */}
			<div
				className={cn('flex', showGraph ? 'max-h-[62%] min-h-[240px] shrink-0' : 'min-h-0 flex-1')}
			>
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
							mergeHints={mergeHints}
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
									setSelectedClauseId((prev) => (prev === clauseId ? null : clauseId));
									openInDocument(clauseId);
								}}
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
						severity={severity}
						onSeverity={setSeverity}
						severityDirty={severityDirty}
						onResetSeverity={resetSeverity}
						showShared={showShared}
						onShowShared={setShowShared}
					/>
				)}
			</div>

			{showGraph && viewKg && (
				<GraphSection
					kg={viewKg}
					importance={clauseImportance}
					visibleKinds={visibleKinds}
					selectedClauseId={activeClause?.clauseId ?? null}
					onSelectClause={(clauseId) =>
						setSelectedClauseId((prev) => (prev === clauseId ? null : clauseId))
					}
				/>
			)}

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
