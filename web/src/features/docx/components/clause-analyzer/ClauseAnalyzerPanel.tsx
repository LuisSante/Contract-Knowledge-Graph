'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useDocumentStore } from '@/stores/document';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import { buildDocumentTarget } from '@/features/docx/utils/knowledge/graph-payload';
import {
	buildStatementGrid,
	type GridLane,
	type GridMark,
	type GridRow,
	type MarkKind,
	withoutMarks,
} from '@/features/docx/utils/knowledge/statement-grid';
import { computePairScores } from '@/features/docx/utils/knowledge/pair';
import { useFocusPayload } from '@/features/docx/hooks/useFocusPayload';
import { useKnowledgeGraphData } from '@/features/docx/hooks/useKnowledgeGraphData';
import { useAnalyzerPairSync } from '@/features/docx/hooks/useAnalyzerPair';
import { SHOWN_LANES, useClauseRows } from '@/features/docx/hooks/useClauseRows';
import { useAgainstYou } from '@/features/docx/hooks/useAgainstYou';
import { PartyManager } from '@/features/docx/components/clause-analyzer/PartyManager';
import { PartyEntry } from '@/features/docx/components/clause-analyzer/PartyEntry';
import { ClauseGrid } from '@/features/docx/components/clause-analyzer/grid/ClauseGrid';
import {
	MarkTooltip,
	markDetails,
	type HoverInfo,
} from '@/features/docx/components/clause-analyzer/grid/MarkTooltip';
import { RedFlagsTable } from '@/features/docx/components/clause-analyzer/RedFlagsTable';
import {
	AgainstFilter,
	ConditionModePicker,
	FirmKey,
	KIND_LABEL,
	KindTabs,
	YouArePicker,
	type ConditionMode,
} from '@/features/docx/components/clause-analyzer/parts/table-bits';
import { KIND_COLORS } from '@/features/docx/components/clause-analyzer/constants';
import { short } from '@/features/docx/components/clause-analyzer/parts/bits';
import { withoutServed } from '@/features/docx/utils/knowledge/clause-favour';
import { ClauseDetail } from '@/features/docx/components/clause-analyzer/parts/party-statements';
import type { DeonticKind, KgCondition } from '@/types/knowledge';

interface ClauseAnalyzerPanelProps {
	docId: string;
	/** Switches the drawer to the knowledge graph tab. */
	onOpenGraph?: () => void;
}

/** No conditions to show in the detail: under All and Only firm. */
const NO_CONDITIONS: KgCondition[] = [];

export function ClauseAnalyzerPanel({ docId, onOpenGraph }: ClauseAnalyzerPanelProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [hover, setHover] = useState<HoverInfo | null>(null);

	const selectedClause = useClauseAnalyzerStore((s) => s.selectedClause);
	const selectClause = useClauseAnalyzerStore((s) => s.selectClause);
	const selectedClauseId = selectedClause?.docId === docId ? selectedClause.clauseId : null;

	const [sortByImportance, setSortByImportance] = useState(true);
	const [paintLanes, setPaintLanes] = useState<Record<GridLane, boolean>>({
		a: true,
		b: true,
		shared: true,
	});

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

	const { kg, viewKg, status } = useKnowledgeGraphData(docId, clearFocus);

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

	// One deontic type at a time, picked in the tabs above the table; each row's detail
	// unfolds under it.
	const [typeShown, setTypeShown] = useState<DeonticKind>('obligation');
	const kindsShown = useMemo(() => new Set<MarkKind>([typeShown]), [typeShown]);
	// Statements a condition gates (its `gatesId`). The table shows them as the reader picks:
	// drawn like the rest (All, the default), as outlines (Mark conditional), or left out (Only
	// firm). The mode stays across type tabs; the relevance order never changes with it.
	const [conditionMode, setConditionMode] = useState<ConditionMode>('all');
	// Conditions are shown anywhere (outlines, the card, pink in the contract) only when the
	// reader asks for them: under All the view is the one it always was.
	const showConditions = conditionMode === 'mark';
	const conditionalIds = useMemo(
		() =>
			viewKg
				? new Set(viewKg.conditions.flatMap((c) => (c.gatesId ? [c.gatesId] : [])))
				: undefined,
		[viewKg]
	);
	// Each square sits in the column of the party it belongs to: an obligation or prohibition
	// with the party it binds, a right with its holder.
	const shownGrid = useMemo(() => {
		if (!grid) return grid;
		return conditionMode === 'firm' && conditionalIds ? withoutMarks(grid, conditionalIds) : grid;
	}, [grid, conditionMode, conditionalIds]);

	const {
		kindCounts,
		clauseImportance,
		rowImportance,
		clauseRows,
		unfiledRow,
		activeClause,
		paintedClause,
		laneByStatement,
		talliesByClause,
		leadOf,
		placeOfClause,
	} = useClauseRows({
		docId,
		viewKg,
		grid,
		shownGrid,
		kindsShown,
		sortByImportance,
		selectedClauseId,
	});

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

	const focusedPartyName = focusNodeId ? (partyNameById.get(focusNodeId) ?? null) : null;
	useEffect(() => {
		setFocusMeta(focusedPartyName ? { label: focusedPartyName, kind: 'party' } : null);
	}, [focusedPartyName, setFocusMeta]);

	useFocusPayload({
		kg: viewKg,
		focusNodeId,
		pair,
		activeClause: paintedClause,
		laneByStatement,
		lanes: SHOWN_LANES,
		paintLanes,
		showShared: false,
		nodesById,
		hops,
		topK,
		severity,
		importanceByNode: clauseImportance?.byNode ?? null,
		paintConditions: showConditions,
	});

	const setPaintLane = (lane: GridLane, on: boolean) =>
		setPaintLanes((prev) => ({ ...prev, [lane]: on }));

	const openInDocument = (nodeId: string) => {
		if (!viewKg) return;
		setDocumentTarget(
			buildDocumentTarget(viewKg, nodeId, nodesById, { withConditions: showConditions })
		);
	};

	const openClauseInGraph =
		onOpenGraph &&
		((clauseId: string) => {
			selectClause(docId, clauseId);
			openInDocument(clauseId);
			onOpenGraph();
		});

	const laneName = (lane: GridLane) =>
		lane === 'a'
			? (focusedPartyName ?? 'Party A')
			: lane === 'b'
				? secondPartyId
					? (partyNameById.get(secondPartyId) ?? 'Party B')
					: 'Party B'
				: 'Both parties';

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

	const { me, pickMe, againstIds, onlyAgainst, setOnlyAgainst, filtering, tableRows } =
		useAgainstYou(pairIds, clauseRows, typeShown, activeClause?.clauseId ?? null);

	// «modified by §11»: to §11, in the tab of the sentence that does the
	// modifying (a right of §11 opens Rights), picked and shown in the contract.
	const goToModifier = (clauseId: string, kind: DeonticKind | null) => {
		if (kind) setTypeShown(kind);
		selectClause(docId, clauseId);
		openInDocument(clauseId);
	};

	const detailsOf = useMemo(
		() => (viewKg && shownGrid ? markDetails(viewKg, shownGrid, showConditions) : null),
		[viewKg, shownGrid, showConditions]
	);

	// The picked row unfolds each party's own statements in it, for the open type only and in the
	// condition mode the reader chose.
	const renderDetail = (row: GridRow) => {
		const found = row.clauseId ? talliesByClause?.get(row.clauseId) : undefined;
		if (!found || !viewKg) return null;
		return (
			<ClauseDetail
				row={row}
				tally={
					conditionMode === 'firm' && conditionalIds ? withoutServed(found, conditionalIds) : found
				}
				kind={typeShown}
				names={names}
				conditions={showConditions ? viewKg.conditions : NO_CONDITIONS}
				onOpen={openInDocument}
			/>
		);
	};

	const showTooltip = (event: ReactMouseEvent, mark: GridMark) => {
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect || !detailsOf) return;
		setHover({ x: event.clientX - rect.left, y: event.clientY - rect.top, ...detailsOf(mark) });
	};

	useAnalyzerPairSync(pairIds, status === 'ready' ? viewKg : null);

	return (
		<div className="flex h-full flex-col">
			{pairIds && (
				<div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border/60 px-6 py-2">
					<YouArePicker names={names} me={me} onPick={pickMe} />
					<AgainstFilter
						on={onlyAgainst}
						onChange={setOnlyAgainst}
						count={againstIds?.size ?? 0}
						total={clauseRows.length}
						disabled={me === null}
					/>
				</div>
			)}

			{pairIds && (
				<KindTabs
					kind={typeShown}
					onPick={setTypeShown}
					counts={kindCounts}
					names={names}
					aside={
						<div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
							{conditionMode === 'mark' && <FirmKey color={KIND_COLORS[typeShown]} />}
							<ConditionModePicker mode={conditionMode} onPick={setConditionMode} />
						</div>
					}
				/>
			)}

			{/* The table fills the panel; the graph has a tab of its own. */}
			<div className="flex min-h-0 flex-1">
				{/* min-w-0: a table wider than the panel scrolls inside it instead of widening it. */}
				<div ref={containerRef} className="relative min-h-0 min-w-0 flex-1">
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
								clauseRows={tableRows}
								unfiledRow={filtering ? null : unfiledRow}
								lanes={SHOWN_LANES}
								visibleKinds={kindsShown}
								activeClauseId={activeClause?.clauseId ?? null}
								laneName={laneName}
								sortByImportance={sortByImportance}
								sortable={Boolean(rowImportance)}
								onToggleSort={() => setSortByImportance((on) => !on)}
								paintLanes={paintLanes}
								onPaintLane={setPaintLane}
								canPaintB={Boolean(secondPartyId)}
								leadOf={leadOf}
								conditionalIds={showConditions ? conditionalIds : undefined}
								youLane={me}
								againstIds={againstIds}
								emptyNote={
									filtering && me
										? `Nothing goes against ${short(names[me])} in ${KIND_LABEL[typeShown].toLowerCase()}.`
										: undefined
								}
								onSelectClause={(clauseId) => {
									selectClause(docId, selectedClauseId === clauseId ? null : clauseId);
									openInDocument(clauseId);
								}}
								onOpenGraph={openClauseInGraph}
								renderDetail={renderDetail}
								onGoToModifier={goToModifier}
								onOpenMark={openInDocument}
								onFocusMark={focusNode}
								onHoverMark={showTooltip}
								onLeaveMark={() => setHover(null)}
							/>
							<MarkTooltip hover={hover} />
						</>
					)}
				</div>
			</div>

			{status === 'ready' && (
				<PartyManager
					hidden={hiddenNamed}
					hasView={mergeGroups.length > 0 || hiddenParties.length > 0}
					onUnhide={unhideParty}
					onReset={clearPartyView}
				/>
			)}

			<RedFlagsTable docId={docId} kg={status === 'ready' ? kg : null} placeOf={placeOfClause} />
		</div>
	);
}
