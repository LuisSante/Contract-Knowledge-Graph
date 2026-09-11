'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useDocumentStore } from '@/stores/document';
import { useGraphStore } from '@/stores/knowledge-graph';
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
import { DEFAULT_SEVERITY } from '@/features/docx/utils/knowledge/party-pagerank';
import { computePairScores } from '@/features/docx/utils/knowledge/pair';
import {
	computeBenefitShare,
	shareOfClause,
} from '@/features/docx/utils/knowledge/benefit-share';
import { useClauseImportance } from '@/features/docx/hooks/useClauseImportance';
import { useFocusPayload } from '@/features/docx/hooks/useFocusPayload';
import { useKnowledgeGraphData } from '@/features/docx/hooks/useKnowledgeGraphData';
import { PartyManager } from '@/features/docx/components/knowledge-graph/PartyManager';
import { PartyEntry } from '@/features/docx/components/knowledge-graph/PartyEntry';
import { PanelHeader } from '@/features/docx/components/knowledge-graph/PanelHeader';
import { ClauseGrid } from '@/features/docx/components/knowledge-graph/grid/ClauseGrid';
import {
	MarkTooltip,
	type HoverInfo,
} from '@/features/docx/components/knowledge-graph/grid/MarkTooltip';
import { Legend } from '@/features/docx/components/knowledge-graph/legend/Legend';
import {
	PAIR_SECOND_COLOR,
	PARTY_COLOR,
} from '@/features/docx/components/knowledge-graph/constants';
import type { DeonticKind } from '@/types/knowledge';

interface KnowledgeGraphPanelProps {
	docId: string;
}

const LANE_COLORS: [string, string] = [PARTY_COLOR, PAIR_SECOND_COLOR];

export function KnowledgeGraphPanel({ docId }: KnowledgeGraphPanelProps) {
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
	const focusNodeId = useGraphStore((s) => s.focusNodeId);
	const hops = useGraphStore((s) => s.hops);
	const topK = useGraphStore((s) => s.topK);
	const severity = useGraphStore((s) => s.severity);
	const setSeverity = useGraphStore((s) => s.setSeverity);
	const resetSeverity = useGraphStore((s) => s.resetSeverity);
	const usePageRank = useGraphStore((s) => s.usePageRank);
	const focusNode = useGraphStore((s) => s.focusNode);
	const clearFocus = useGraphStore((s) => s.clearFocus);
	const setFocusMeta = useGraphStore((s) => s.setFocusMeta);
	const setDocumentTarget = useGraphStore((s) => s.setDocumentTarget);
	const mergeGroups = useGraphStore((s) => s.mergeGroups);
	const mergeParties = useGraphStore((s) => s.mergeParties);
	const splitGroup = useGraphStore((s) => s.splitGroup);
	const hideParty = useGraphStore((s) => s.hideParty);
	const hiddenParties = useGraphStore((s) => s.hiddenParties);
	const unhideParty = useGraphStore((s) => s.unhideParty);
	const clearPartyView = useGraphStore((s) => s.clearPartyView);
	const secondPartyId = useGraphStore((s) => s.secondPartyId);
	const setSecondParty = useGraphStore((s) => s.setSecondParty);
	const focusPair = useGraphStore((s) => s.focusPair);
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

	const pair = useMemo(
		() =>
			viewKg && isPartyFocus && focusNodeId && secondPartyId && secondPartyId !== focusNodeId
				? computePairScores(viewKg, focusNodeId, secondPartyId, topK, severity, usePageRank)
				: null,
		[viewKg, isPartyFocus, focusNodeId, secondPartyId, topK, severity, usePageRank]
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
		return ids;
	}, [grid, shownLanes, visibleKinds]);

	const clauseImportance = useClauseImportance(docId, countedIds);

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

	const clauseRows = useMemo(() => visibleRows.filter((row) => row.clauseId !== null), [visibleRows]);
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
		usePageRank,
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
					{/* Entry view: the pair is chosen before anything is drawn, in one place. */}
					{status === 'ready' && viewKg && !focusNodeId && (
						<PartyEntry
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
