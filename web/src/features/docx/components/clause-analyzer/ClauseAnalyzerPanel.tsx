'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { cn } from '@/lib/utils';
import { useDocumentStore } from '@/stores/document';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import {
	buildDocumentTarget,
	clauseModifiedBy,
} from '@/features/docx/utils/knowledge/graph-payload';
import { applyPartyView } from '@/features/docx/utils/knowledge/party-view';
import {
	buildStatementGrid,
	DEONTIC_MARK_KINDS,
	GRID_LANES,
	type GridLane,
	type GridMark,
	type GridRow,
	type MarkKind,
	type Side,
	withoutMarks,
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
import { ByTypeView } from '@/features/docx/components/clause-analyzer/views/ByTypeView';
import {
	ConditionModePicker,
	FirmKey,
	KindTabs,
	type ConditionMode,
} from '@/features/docx/components/clause-analyzer/views/favour-bits';
import { KIND_COLORS } from '@/features/docx/components/clause-analyzer/constants';
import type { ClauseRowLead } from '@/features/docx/components/clause-analyzer/grid/ClauseRow';
import {
	byImportance,
	clauseTitle,
	creditedGrid,
	DEONTIC_KINDS,
	tallyClauses,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { ViewProps } from '@/features/docx/components/clause-analyzer/views/types';
import type { DeonticKind } from '@/types/knowledge';

interface ClauseAnalyzerPanelProps {
	docId: string;
	/** Switches the drawer to the knowledge graph tab. */
	onOpenGraph?: () => void;
}

/** No statements: the importance hook sends no request. */
const NO_IDS: readonly string[] = [];

export function ClauseAnalyzerPanel({ docId, onOpenGraph }: ClauseAnalyzerPanelProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [hover, setHover] = useState<HoverInfo | null>(null);

	const [visibleKinds, setVisibleKinds] = useState<Set<MarkKind>>(
		() => new Set(DEONTIC_MARK_KINDS)
	);

	const selectedClause = useClauseAnalyzerStore((s) => s.selectedClause);
	const selectClause = useClauseAnalyzerStore((s) => s.selectClause);
	const showDetails = useClauseAnalyzerStore((s) => s.showDetails);
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

	const nav = useAnalyzerView();
	// Table v1.1 shows one deontic type at a time, picked above the table, instead of
	// toggling them in the legend; Table keeps its own choice.
	const oneType = nav.view === 'table11';
	const [typeShown, setTypeShown] = useState<DeonticKind>('obligation');
	const kindsShown = useMemo(
		() => (oneType ? new Set<MarkKind>([typeShown]) : visibleKinds),
		[oneType, typeShown, visibleKinds]
	);
	// Statements a condition gates (its `gatesId`). Table v1.1 shows them as the reader picks:
	// drawn like the rest (All, the default), as outlines (Mark conditional), or left out (Only
	// firm). The mode stays across type tabs; the relevance order never changes with it.
	const [conditionMode, setConditionMode] = useState<ConditionMode>('all');
	// Conditions are shown anywhere (outlines, the card, pink in the contract) only when the
	// reader asks for them: under All the view is the one it always was.
	const showConditions = oneType && conditionMode === 'mark';
	const conditionalIds = useMemo(
		() =>
			oneType && viewKg
				? new Set(viewKg.conditions.flatMap((c) => (c.gatesId ? [c.gatesId] : [])))
				: undefined,
		[oneType, viewKg]
	);
	// Table v1.1 puts each square in the column of the party it favours, by Table v2's rule:
	// what one party has to do sits with the other. Table keeps the party that carries it.
	const shownGrid = useMemo(() => {
		if (!oneType || !grid) return grid;
		const credited = creditedGrid(grid);
		return conditionMode === 'firm' && conditionalIds
			? withoutMarks(credited, conditionalIds)
			: credited;
	}, [oneType, grid, conditionMode, conditionalIds]);

	// Each type's squares on each side over the clause rows, for Table v1.1's tabs: the same
	// counts Table v2 gives the contract.
	const kindCounts = useMemo(() => {
		if (!oneType || !shownGrid) return null;
		const counts = Object.fromEntries(DEONTIC_KINDS.map((k) => [k, { a: 0, b: 0 }])) as Record<
			DeonticKind,
			Record<Side, number>
		>;
		for (const row of shownGrid.rows) {
			if (!row.clauseId) continue;
			for (const lane of ['a', 'b'] as const) {
				for (const mark of row.marks[lane]) {
					if (DEONTIC_MARK_KINDS.includes(mark.kind)) counts[mark.kind as DeonticKind][lane] += 1;
				}
			}
		}
		return counts;
	}, [oneType, shownGrid]);

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

	// Table v1.1 ranks clauses on every obligation, right and prohibition between the two
	// parties, whatever Table's legend has on: the order is a clause's weight in the
	// contract, the same in every type shown and the same as Table v2's.
	const overviewIds = useMemo(() => {
		const ids = new Set<string>();
		for (const row of grid?.rows ?? []) {
			for (const lane of ['a', 'b'] as const) {
				for (const mark of row.marks[lane]) {
					if (DEONTIC_MARK_KINDS.includes(mark.kind)) ids.add(mark.id);
				}
			}
		}
		return ids.size > 0 ? [...ids].sort() : null;
	}, [grid]);
	const overviewImportance = useClauseImportance(
		docId,
		oneType && overviewIds ? overviewIds : NO_IDS
	);
	const rowImportance = oneType ? overviewImportance : clauseImportance;

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
		const rows = (shownGrid?.rows ?? []).filter((row) =>
			shownLanes.some((lane) => row.marks[lane].some((mark) => kindsShown.has(mark.kind)))
		);
		if (!sortByImportance || !rowImportance) return rows;
		const weight = (row: GridRow) =>
			row.clauseId ? (rowImportance.byClause[row.clauseId] ?? 0) : -1;
		return rows.slice().sort((x, y) => weight(y) - weight(x));
	}, [shownGrid, kindsShown, shownLanes, sortByImportance, rowImportance]);

	const laneByStatement = useMemo(() => {
		const byId = new Map<string, GridLane>();
		for (const row of shownGrid?.rows ?? []) {
			for (const lane of GRID_LANES) {
				for (const mark of row.marks[lane]) byId.set(mark.id, lane);
			}
		}
		return byId;
	}, [shownGrid]);

	const clauseRows = useMemo(
		() => visibleRows.filter((row) => row.clauseId !== null),
		[visibleRows]
	);
	const unfiledRow = visibleRows.find((row) => row.clauseId === null) ?? null;

	const activeClause = useMemo(
		() => visibleRows.find((row) => row.clauseId && row.clauseId === selectedClauseId) ?? null,
		[visibleRows, selectedClauseId]
	);
	// Table v1.1 paints in the contract only the type its tab shows: a clause's obligations
	// under Obligations, its rights under Rights. Table paints the whole clause.
	const paintedClause = useMemo(() => {
		if (!activeClause || !oneType) return activeClause;
		const keep = (marks: GridMark[]) => marks.filter((mark) => kindsShown.has(mark.kind));
		return {
			...activeClause,
			marks: {
				a: keep(activeClause.marks.a),
				b: keep(activeClause.marks.b),
				shared: keep(activeClause.marks.shared),
			},
		};
	}, [activeClause, oneType, kindsShown]);

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
		lanes: shownLanes,
		paintLanes,
		showShared,
		nodesById,
		hops,
		topK,
		severity,
		importanceByNode: clauseImportance?.byNode ?? null,
		paintConditions: showConditions,
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

	// Table v1.1's «modified by §11»: to §11, in the tab of the sentence that does the
	// modifying (a right of §11 opens Rights), picked and shown in the contract.
	const goToModifier = (clauseId: string, kind: DeonticKind | null) => {
		if (kind) setTypeShown(kind);
		selectClause(docId, clauseId);
		openInDocument(clauseId);
	};

	// Table v1.1's «Details»: the clause, open in Table v2 and shown in the contract. It is not
	// selected: back in Table v1.1 a selection would dim every other row.
	const openDetails = (clauseId: string) => {
		openInDocument(clauseId);
		showDetails(docId, clauseId);
		nav.setView('bytype');
	};

	const detailsOf = useMemo(
		() =>
			viewKg && shownGrid
				? markDetails(viewKg, shownGrid, oneType ? names : undefined, showConditions)
				: null,
		[viewKg, shownGrid, oneType, names, showConditions]
	);

	const showTooltip = (event: ReactMouseEvent, mark: GridMark) => {
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect || !detailsOf) return;
		setHover({ x: event.clientX - rect.left, y: event.clientY - rect.top, ...detailsOf(mark) });
	};

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
	// Table v1.1 names its rows as Table v2 does: the clause's place in importance, its number
	// and heading (a numbered subclause borrows its section's), and a link to the graph.
	const leadOf = useMemo(() => {
		if (!oneType || !grid || !viewKg) return undefined;
		const clauseOf = new Map(viewKg.clauses.map((c) => [c.id, c] as const));
		const ranked = overviewImportance
			? byImportance(tallyClauses(grid, viewKg), overviewImportance.byClause)
			: [];
		const rank = new Map(ranked.map((t, i) => [t.clauseId, i + 1] as const));
		const modifiedBy = clauseModifiedBy(viewKg);
		const numberOf = (id: string) => {
			const clause = clauseOf.get(id);
			const title = clauseTitle(clause, clause?.heading || id, viewKg.clauses);
			return title.section ?? title.heading;
		};
		return (row: GridRow): ClauseRowLead => {
			const title = row.clauseId
				? clauseTitle(clauseOf.get(row.clauseId), row.heading, viewKg.clauses)
				: { heading: row.heading, section: null };
			return {
				rank: row.clauseId ? rank.get(row.clauseId) : undefined,
				...title,
				modifiedBy: row.clauseId
					? modifiedBy
							.get(row.clauseId)
							?.map((m) => ({ clauseId: m.clauseId, label: numberOf(m.clauseId), kind: m.kind }))
					: undefined,
			};
		};
	}, [oneType, grid, viewKg, overviewImportance]);

	// Table and Table v1.1 are the grid below; every other view takes its place.
	const inView = viewProps !== null && nav.view !== 'table' && nav.view !== 'table11';

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
			{inView && viewProps && nav.view === 'bytype' && <ByTypeView {...viewProps} />}

			{oneType && pairIds && (
				<KindTabs
					kind={typeShown}
					onPick={setTypeShown}
					counts={kindCounts}
					names={names}
					aside={
						<div className="flex items-center gap-3">
							{conditionMode === 'mark' && <FirmKey color={KIND_COLORS[typeShown]} />}
							<ConditionModePicker mode={conditionMode} onPick={setConditionMode} />
						</div>
					}
				/>
			)}

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
								visibleKinds={kindsShown}
								activeClauseId={activeClause?.clauseId ?? null}
								shareOf={oneType ? () => null : shareOf}
								laneName={laneName}
								sortByImportance={sortByImportance}
								sortable={Boolean(rowImportance)}
								onToggleSort={() => setSortByImportance((on) => !on)}
								paintLanes={paintLanes}
								onPaintLane={setPaintLane}
								canPaintB={Boolean(secondPartyId)}
								showShared={showShared}
								centerLanes={oneType}
								laneColumns={oneType ? 15 : undefined}
								leadOf={leadOf}
								labelWidth={oneType ? 320 : undefined}
								boldStripes={oneType}
								conditionalIds={showConditions ? conditionalIds : undefined}
								sortLabels={
									oneType ? { importance: 'by relevance ↓', order: 'by order' } : undefined
								}
								favourSide={oneType}
								onSelectClause={(clauseId) => {
									selectClause(docId, selectedClauseId === clauseId ? null : clauseId);
									openInDocument(clauseId);
								}}
								onOpenGraph={openClauseInGraph}
								onDetails={oneType ? openDetails : undefined}
								onGoToModifier={oneType ? goToModifier : undefined}
								onOpenMark={openInDocument}
								onFocusMark={focusNode}
								onHoverMark={showTooltip}
								onLeaveMark={() => setHover(null)}
							/>
							<MarkTooltip hover={hover} />
						</>
					)}
				</div>

				{status === 'ready' && grid && !oneType && (
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
