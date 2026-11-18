'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDocumentStore } from '@/stores/document';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import {
	buildDocumentTarget,
	conditionParty,
	reciprocalStatements,
} from '@/features/docx/utils/knowledge/graph-payload';
import {
	buildStatementGrid,
	type GridLane,
	type GridMark,
	type GridRow,
	type MarkKind,
	type Side,
	withoutMarks,
	withSharedAside,
} from '@/features/docx/utils/knowledge/statement-grid';
import { computePairScores } from '@/features/docx/utils/knowledge/pair';
import { useFocusPayload } from '@/features/docx/hooks/useFocusPayload';
import { useKnowledgeGraphData } from '@/features/docx/hooks/useKnowledgeGraphData';
import { useAnalyzerPairSync } from '@/features/docx/hooks/useAnalyzerPair';
import { SHOWN_LANES, useClauseRows, type RowOrder } from '@/features/docx/hooks/useClauseRows';
import { useAgainstYou, useYouAre } from '@/features/docx/hooks/useAgainstYou';
import { PartyManager } from '@/features/docx/components/clause-analyzer/PartyManager';
import { PartyEntry } from '@/features/docx/components/clause-analyzer/PartyEntry';
import { ClauseGrid } from '@/features/docx/components/clause-analyzer/grid/ClauseGrid';
import {
	createMarkHoverStore,
	LiveMarkTooltip,
	markDetails,
} from '@/features/docx/components/clause-analyzer/grid/MarkTooltip';
import type { HoverPoint } from '@/features/docx/components/clause-analyzer/grid/Mark';
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
import { pairShort } from '@/features/docx/components/clause-analyzer/parts/bits';
import { withoutServed } from '@/features/docx/utils/knowledge/clause-favour';
import { statementTiming } from '@/features/docx/utils/knowledge/statement-timing';
import {
	ClauseDetail,
	type StatementHints,
} from '@/features/docx/components/clause-analyzer/parts/party-statements';
import { useRedFlags } from '@/features/docx/hooks/useRedFlags';
import { useRisks } from '@/features/docx/hooks/useRisks';
import {
	DatasetFlagsToggle,
	RiskControl,
	RisksNotice,
	type RisksByKind,
} from '@/features/docx/components/clause-analyzer/parts/risk-control';
import type { FlagLines } from '@/features/docx/components/clause-analyzer/parts/party-statements';
import { deonticNodes, type DeonticKind, type KgCondition } from '@/types/knowledge';
import type { DocumentTarget } from '@/features/docx/utils/knowledge/graph-payload';

interface ClauseAnalyzerPanelProps {
	docId: string;
	/** Switches the drawer to the knowledge graph tab. */
	onOpenGraph?: () => void;
}

/** No conditions to show in the detail: under All and Only firm. */
const NO_CONDITIONS: KgCondition[] = [];

export function ClauseAnalyzerPanel({ docId, onOpenGraph }: ClauseAnalyzerPanelProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	// The mark card lives in a store of its own: a mouse move redraws the card, not the table.
	const [hoverStore] = useState(createMarkHoverStore);
	const tabsId = useId();

	const selectedClause = useClauseAnalyzerStore((s) => s.selectedClause);
	const selectClause = useClauseAnalyzerStore((s) => s.selectClause);
	const selectedClauseId = selectedClause?.docId === docId ? selectedClause.clauseId : null;

	const [sortBy, setSortBy] = useState<RowOrder>('size');
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

	const { kg, viewKg, status, retry } = useKnowledgeGraphData(docId, clearFocus);

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
	// What the system's detector judged risky: those squares get the black outline. Nothing is
	// marked until the reader asks, with «Free» (the saved answer) or «AI» (the model, now).
	const {
		risks,
		byStatement: riskByStatement,
		source: risksSource,
		hasSaved: hasSavedRisks,
		status: risksStatus,
		noticeId: risksNoticeId,
		closeNotice: closeRisksNotice,
		toggleSaved: toggleSavedRisks,
		detectWithAI: detectRisksWithAI,
	} = useRisks(docId);
	const riskyIds = useMemo(
		() => (riskByStatement.size > 0 ? new Set(riskByStatement.keys()) : undefined),
		[riskByStatement]
	);
	// The dataset's red flags and the statements they matched: those squares get a dot under
	// them. They only validate the system's marks, so the reader can hide them.
	const redFlags = useRedFlags(docId, status === 'ready' ? kg : null);
	const [showDatasetFlags, setShowDatasetFlags] = useState(true);
	const hasDatasetFlags = redFlags.statementIds.size > 0;
	const flaggedIds = hasDatasetFlags && showDatasetFlags ? redFlags.statementIds : undefined;
	const conditionalIds = useMemo(
		() =>
			viewKg
				? new Set(viewKg.conditions.flatMap((c) => (c.gatesId ? [c.gatesId] : [])))
				: undefined,
		[viewKg]
	);
	// Each square sits in the column of the party it belongs to: an obligation or prohibition
	// with the party it binds, a right with its holder.
	// Each reciprocal pair sits in the Both column, a square per pair, and counts for neither
	// party. Its checkbox, like the parties', only paints or quiets those squares in the contract.
	// A contract with no pair written word for word for both parties gets no Both column: there
	// is nothing to set aside.
	const hasPairs = useMemo(
		() =>
			Boolean(grid && viewKg && withSharedAside(grid, viewKg).rows.some((row) => row.both?.length)),
		[grid, viewKg]
	);
	const shownGrid = useMemo(() => {
		if (!grid) return grid;
		const firm =
			conditionMode === 'firm' && conditionalIds ? withoutMarks(grid, conditionalIds) : grid;
		return viewKg ? withSharedAside(firm, viewKg) : firm;
	}, [grid, conditionMode, conditionalIds, viewKg]);

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

	// «You are»: the reader's party. The rows are read from it by relevance, and «Only against
	// you» filters by it.
	const { me, pickMe } = useYouAre(docId, pairIds);
	const viewpoint = useMemo(
		() => (me ? { side: me, name: pairShort(names)[me] } : null),
		[me, names]
	);

	// Relevance is one party's: with nobody picked, or with none to be had for the one picked,
	// the rows go by size or by the contract's order. `order` is the one they are in.
	const {
		kindCounts,
		bothCounts,
		clauseImportance,
		order,
		reading,
		relevanceFor,
		sameForBoth,
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
		sortBy,
		selectedClauseId,
		viewpoint,
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
						clauseImportance?.graphByClause ?? null
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

	// What a red flag paints in the contract waits for the row it picks: selecting a clause
	// repaints the contract with the row (the effect above), so this one runs after it.
	const [flagTarget, setFlagTarget] = useState<DocumentTarget | null>(null);
	useEffect(() => {
		if (flagTarget) setDocumentTarget(flagTarget);
	}, [flagTarget, setDocumentTarget]);
	// The squares a red flag picked, ringed in blue until another row is picked.
	const [spotlight, setSpotlight] = useState<{ docId: string; ids: ReadonlySet<string> } | null>(
		null
	);

	// The rows are memoised: what they are handed keeps its identity between draws.
	const setPaintLane = useCallback(
		(lane: GridLane, on: boolean) => setPaintLanes((prev) => ({ ...prev, [lane]: on })),
		[]
	);

	const openInDocument = useCallback(
		(nodeId: string) => {
			if (!viewKg) return;
			setDocumentTarget(
				buildDocumentTarget(viewKg, nodeId, nodesById, { withConditions: showConditions })
			);
		},
		[viewKg, nodesById, showConditions, setDocumentTarget]
	);

	const openClauseInGraph = useMemo(
		() =>
			onOpenGraph &&
			((clauseId: string) => {
				selectClause(docId, clauseId);
				openInDocument(clauseId);
				onOpenGraph();
			}),
		[onOpenGraph, selectClause, docId, openInDocument]
	);

	const laneName = useCallback(
		(lane: GridLane) =>
			lane === 'a'
				? (focusedPartyName ?? 'Party A')
				: lane === 'b'
					? secondPartyId
						? (partyNameById.get(secondPartyId) ?? 'Party B')
						: 'Party B'
					: 'Both parties',
		[focusedPartyName, secondPartyId, partyNameById]
	);

	// A row of the RED FLAGS table: the tab and row of the statement it matched, its square
	// ringed, and the flag painted in the contract.
	const revealFlag = useCallback(
		(statementIds: string[], target: DocumentTarget) => {
			const statement = viewKg
				? statementIds
						.map((id) => deonticNodes(viewKg).find((s) => s.id === id))
						.find((s) => s !== undefined)
				: undefined;
			if (statement) {
				setTypeShown(statement.kind);
				// Every statement the flag matched in that row and tab: «Obligation ×2» rings both.
				const same = statementIds.filter((id) => {
					const s = viewKg && deonticNodes(viewKg).find((x) => x.id === id);
					return s && s.kind === statement.kind && s.clauseId === statement.clauseId;
				});
				setSpotlight({ docId, ids: new Set(same) });
				if (statement.clauseId) selectClause(docId, statement.clauseId);
			}
			setFlagTarget(target);
		},
		[viewKg, docId, selectClause]
	);
	const flagLines = useMemo(
		(): FlagLines | undefined =>
			riskyIds || flaggedIds
				? { risks: riskyIds ? riskByStatement : undefined, flaggedIds }
				: undefined,
		[riskyIds, riskByStatement, flaggedIds]
	);
	// Risky squares in the whole contract and in each tab, and how they sit against the
	// dataset's red flags: the ones a flag lands on, outline and dot on the same square, and the
	// ones no flag lands on. The two add up to all of them. Whether the dots are shown changes
	// none of it. A reciprocal pair is one square.
	const riskCounts = useMemo(() => {
		const byKind: RisksByKind = { obligation: 0, right: 0, prohibition: 0 };
		const counts = { byKind, total: 0, flagged: 0, unflagged: 0 };
		if (!shownGrid || !riskyIds) return counts;
		const count = (kind: MarkKind, ids: readonly string[]) => {
			counts.total += 1;
			if (kind in byKind) byKind[kind as keyof RisksByKind] += 1;
			if (ids.some((id) => redFlags.statementIds.has(id))) counts.flagged += 1;
			else counts.unflagged += 1;
		};
		for (const row of shownGrid.rows) {
			for (const lane of ['a', 'b'] as const)
				for (const mark of row.marks[lane]) if (riskyIds.has(mark.id)) count(mark.kind, [mark.id]);
			for (const mark of row.both ?? []) {
				const ids = mark.twinIds ?? [mark.id];
				if (ids.some((id) => riskyIds.has(id))) count(mark.kind, ids);
			}
		}
		return counts;
	}, [shownGrid, riskyIds, redFlags.statementIds]);

	const { againstIds, onlyAgainst, setOnlyAgainst, filtering, tableRows } = useAgainstYou(
		me,
		clauseRows,
		typeShown,
		activeClause?.clauseId ?? null
	);
	// Picking a party asks what matters to it: the rows go by relevance, read from that party.
	const pickViewpoint = (side: Side | null) => {
		pickMe(side);
		if (side) setSortBy('importance');
	};

	// «modified by §11»: to §11, in the tab of the sentence that does the
	// modifying (a right of §11 opens Rights), picked and shown in the contract.
	// «depends on §5», «refers to §1.4»: to that clause in the same tab, since the edge names
	// no sentence.
	const goToModifier = useCallback(
		(clauseId: string, kind: DeonticKind | null) => {
			if (kind) setTypeShown(kind);
			selectClause(docId, clauseId);
			openInDocument(clauseId);
		},
		[selectClause, docId, openInDocument]
	);

	const pickClause = useCallback(
		(clauseId: string) => {
			setSpotlight(null);
			selectClause(docId, selectedClauseId === clauseId ? null : clauseId);
			openInDocument(clauseId);
		},
		[selectClause, docId, selectedClauseId, openInDocument]
	);

	const detailsOf = useMemo(
		() =>
			viewKg && shownGrid ? markDetails(viewKg, shownGrid, showConditions, riskByStatement) : null,
		[viewKg, shownGrid, showConditions, riskByStatement]
	);

	// What the detail says beside each statement: a twin the other party has word for word,
	// which party a condition names, and its deadline, frequency and values.
	const hints = useMemo((): StatementHints | undefined => {
		if (!viewKg || !pairA || !pairB) return undefined;
		const sideOf = (id: string | null): Side | null =>
			id === pairA ? 'a' : id === pairB ? 'b' : null;
		const conditionSide: StatementHints['conditionSide'] = new Map();
		for (const [conditionId, partyId] of conditionParty(viewKg)) {
			const side = sideOf(partyId);
			if (side) conditionSide.set(conditionId, side);
		}
		return {
			reciprocal: reciprocalStatements(viewKg),
			conditionSide,
			timing: statementTiming(viewKg),
		};
	}, [viewKg, pairA, pairB]);

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
				hints={hints}
				onOpen={openInDocument}
				flags={flagLines}
				sharedAside={hasPairs}
			/>
		);
	};

	const showTooltip = useCallback(
		(point: HoverPoint, mark: GridMark) => {
			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect || !detailsOf) return;
			hoverStore.setState({
				hover: { x: point.clientX - rect.left, y: point.clientY - rect.top, ...detailsOf(mark) },
			});
		},
		[detailsOf, hoverStore]
	);
	const hideTooltip = useCallback(() => hoverStore.setState({ hover: null }), [hoverStore]);

	useAnalyzerPairSync(pairIds, status === 'ready' ? viewKg : null);

	// The reader is told the contract is not analysed; where the graph comes from is for us.
	useEffect(() => {
		if (status === 'missing')
			console.info(
				`No knowledge graph for ${docId}: build it with notebooks/KG/build_kg.ipynb into infra/json/kg/.`
			);
	}, [status, docId]);

	return (
		<div className="flex h-full flex-col">
			{/* The two rows share a container: how they are laid out depends on the panel's width
			    alone, never on what is switched on, so pressing a control moves nothing. */}
			{pairIds && (
				<div className="@container shrink-0">
					<div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border/60 px-6 py-2">
						<YouArePicker names={names} me={me} onPick={pickViewpoint} />
						<AgainstFilter on={onlyAgainst} onChange={setOnlyAgainst} disabled={me === null} />
						{/* The risks, right above the conditions picker. A count or a notice shows up on
						    this group's left, so nothing else moves. In a wide panel it shares the row
						    with «You are»; in a narrower one it always has a line of its own, still above
						    the tabs. */}
						<div className="ml-auto flex basis-full flex-wrap items-center justify-end gap-x-3 gap-y-1.5 @[54rem]:basis-auto">
							{conditionMode === 'mark' && (
								<FirmKey color={KIND_COLORS[typeShown]} className="@[54rem]:hidden" />
							)}
							<RiskControl
								status={risksStatus}
								source={risksSource}
								hasSaved={hasSavedRisks}
								found={riskCounts.total}
								byKind={riskCounts.byKind}
								flags={redFlags.flags.length}
								flagged={riskCounts.flagged}
								unflagged={riskCounts.unflagged}
								failed={risks?.clausesFailed ?? 0}
								color={KIND_COLORS[typeShown]}
								flagsShown={hasDatasetFlags && showDatasetFlags}
								onFree={toggleSavedRisks}
								onAI={detectRisksWithAI}
							/>
							{hasDatasetFlags && (
								<DatasetFlagsToggle on={showDatasetFlags} onChange={setShowDatasetFlags} />
							)}
						</div>
					</div>

					{/* An answer has just gone on screen, the model's or the saved one: the reader is
					    told, and what it found in each tab, on a card in the window's corner that
					    takes no room here. */}
					<RisksNotice
						noticeId={risksNoticeId}
						found={riskCounts.total}
						byKind={riskCounts.byKind}
						flags={redFlags.flags.length}
						flagged={riskCounts.flagged}
						unflagged={riskCounts.unflagged}
						failed={risks?.clausesFailed ?? 0}
						onClose={closeRisksNotice}
					/>

					{/* The tabs share their line with the conditions picker only, so the two stay level.
					    The key sits beside the picker in a wide panel; in a narrower one it opens the
					    risks' line above. */}
					<KindTabs
						id={tabsId}
						kind={typeShown}
						onPick={setTypeShown}
						counts={kindCounts}
						shared={hasPairs ? bothCounts : null}
						names={names}
						aside={
							<div className="flex items-center justify-end gap-x-3">
								{conditionMode === 'mark' && (
									<FirmKey color={KIND_COLORS[typeShown]} className="hidden @[54rem]:flex" />
								)}
								<ConditionModePicker mode={conditionMode} onPick={setConditionMode} />
							</div>
						}
					/>
				</div>
			)}

			{/* The table fills the panel; the graph has a tab of its own. */}
			<div className="flex min-h-0 flex-1">
				{/* min-w-0: a table wider than the panel scrolls inside it instead of widening it. */}
				<div
					ref={containerRef}
					className="relative min-h-0 min-w-0 flex-1"
					{...(pairIds && {
						id: `${tabsId}-panel`,
						role: 'tabpanel',
						'aria-labelledby': `${tabsId}-tab-${typeShown}`,
					})}
				>
					{status === 'loading' && (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							Loading knowledge graph…
						</div>
					)}
					{status === 'missing' && (
						<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
							This contract has not been analysed yet.
						</div>
					)}
					{status === 'error' && (
						<div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
							<p className="text-sm text-destructive">Could not load this contract’s analysis.</p>
							<Button size="sm" variant="outline" onClick={retry}>
								Retry
							</Button>
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
								sortBy={order}
								relevanceFor={relevanceFor}
								sameForBoth={sameForBoth === true}
								// The party's relevance is on its way and the rows wait for it: by size they
								// do not, since neither their order nor their place comes from it.
								pending={reading === 'pending' && order !== 'size'}
								// Relevance was asked for and there is none for the party picked.
								relevanceMissing={sortBy === 'importance' && me !== null && reading === 'none'}
								// Size, order, and round again; with a party's relevance to give, it comes between.
								onToggleSort={() =>
									setSortBy(
										order === 'size'
											? reading !== 'none'
												? 'importance'
												: 'order'
											: order === 'importance'
												? 'order'
												: 'size'
									)
								}
								paintLanes={paintLanes}
								onPaintLane={setPaintLane}
								canPaintB={Boolean(secondPartyId)}
								leadOf={leadOf}
								conditionalIds={showConditions ? conditionalIds : undefined}
								riskyIds={riskyIds}
								flaggedIds={flaggedIds}
								spotlightIds={spotlight?.docId === docId ? spotlight.ids : undefined}
								bothLane={hasPairs}
								youLane={me}
								againstIds={againstIds}
								emptyNote={
									filtering && me
										? `Nothing goes against ${pairShort(names)[me]} in ${KIND_LABEL[typeShown].toLowerCase()}.`
										: undefined
								}
								onSelectClause={pickClause}
								onOpenGraph={openClauseInGraph}
								renderDetail={renderDetail}
								onGoToModifier={goToModifier}
								onOpenMark={openInDocument}
								onFocusMark={focusNode}
								onHoverMark={showTooltip}
								onLeaveMark={hideTooltip}
							/>
							<LiveMarkTooltip store={hoverStore} />
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

			<RedFlagsTable
				docId={docId}
				kg={status === 'ready' ? kg : null}
				placeOf={placeOfClause}
				onReveal={revealFlag}
			/>
		</div>
	);
}
