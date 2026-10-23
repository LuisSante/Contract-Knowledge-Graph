'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
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
import { useClauseImportance } from '@/features/docx/hooks/useClauseImportance';
import { useFocusPayload } from '@/features/docx/hooks/useFocusPayload';
import { useKnowledgeGraphData } from '@/features/docx/hooks/useKnowledgeGraphData';
import { useAnalyzerPair } from '@/features/docx/hooks/useAnalyzerPair';
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
} from '@/features/docx/components/clause-analyzer/views/favour-bits';
import { KIND_COLORS } from '@/features/docx/components/clause-analyzer/constants';
import { short } from '@/features/docx/components/clause-analyzer/views/bits';
import type { ClauseRowLead } from '@/features/docx/components/clause-analyzer/grid/ClauseRow';
import {
	byImportance,
	clauseTitle,
	DEONTIC_KINDS,
	tallyClauses,
	withoutServed,
} from '@/features/docx/utils/knowledge/clause-favour';
import { PartyStatements } from '@/features/docx/components/clause-analyzer/views/party-statements';
import type { DeonticKind, KgCondition } from '@/types/knowledge';

interface ClauseAnalyzerPanelProps {
	docId: string;
	/** Switches the drawer to the knowledge graph tab. */
	onOpenGraph?: () => void;
}

/** No conditions to show in the detail: under All and Only firm. */
const NO_CONDITIONS: KgCondition[] = [];
/** No statements: the importance hook sends no request. */
const NO_IDS: readonly string[] = [];
/** Every deontic kind and the two parties' lanes: what the importance the graph tab shares
 *  counts. The reciprocal lane is not shown. */
const COUNTED_KINDS = new Set<MarkKind>(DEONTIC_MARK_KINDS);
const SHOWN_LANES: GridLane[] = GRID_LANES.filter((lane) => lane !== 'shared');

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

	// Each type's squares on each side over the clause rows, for the tabs.
	const kindCounts = useMemo(() => {
		if (!shownGrid) return null;
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
	}, [shownGrid]);

	const countedIds = useMemo(() => {
		const ids = new Set<string>();
		for (const row of grid?.rows ?? []) {
			for (const lane of SHOWN_LANES) {
				for (const mark of row.marks[lane]) {
					if (COUNTED_KINDS.has(mark.kind)) ids.add(mark.id);
				}
			}
		}
		// Empty means the grid has not resolved yet, not "count nothing": publishing []
		// would leave the graph tab waiting forever on a request that never fires.
		return ids.size > 0 ? [...ids].sort() : null;
	}, [grid]);

	const clauseImportance = useClauseImportance(docId, countedIds);

	// The rows are ranked on every obligation, right and prohibition between the two parties:
	// the order is a clause's weight in the contract, the same in every type shown.
	const rankedIds = useMemo(() => {
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
	const rowImportance = useClauseImportance(docId, rankedIds ?? NO_IDS);

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
			SHOWN_LANES.some((lane) => row.marks[lane].some((mark) => kindsShown.has(mark.kind)))
		);
		if (!sortByImportance || !rowImportance) return rows;
		const weight = (row: GridRow) =>
			row.clauseId ? (rowImportance.byClause[row.clauseId] ?? 0) : -1;
		return rows.slice().sort((x, y) => weight(y) - weight(x));
	}, [shownGrid, kindsShown, sortByImportance, rowImportance]);

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
	// The contract shows only the type the tab shows: a clause's obligations under
	// Obligations, its rights under Rights.
	const paintedClause = useMemo(() => {
		if (!activeClause) return activeClause;
		const keep = (marks: GridMark[]) => marks.filter((mark) => kindsShown.has(mark.kind));
		return {
			...activeClause,
			marks: {
				a: keep(activeClause.marks.a),
				b: keep(activeClause.marks.b),
				shared: keep(activeClause.marks.shared),
			},
		};
	}, [activeClause, kindsShown]);

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

	// «You are»: the reader's party, kept by id so another pair forgets it. Nobody is picked
	// at first, and the table reads as it always did until someone is.
	const [meId, setMeId] = useState<string | null>(null);
	const me: Side | null = meId ? (meId === pairA ? 'a' : meId === pairB ? 'b' : null) : null;
	// A clause goes against the reader, in the type shown, when the reader has more obligations
	// or prohibitions in it than the other party, or the other party holds more rights.
	const againstIds = useMemo(() => {
		if (!me) return null;
		const other: Side = me === 'a' ? 'b' : 'a';
		const shown = (row: GridRow, side: Side) =>
			row.marks[side].filter((mark) => kindsShown.has(mark.kind)).length;
		const burden = typeShown !== 'right';
		return new Set(
			clauseRows.flatMap((row) => {
				const mine = shown(row, me);
				const theirs = shown(row, other);
				return row.clauseId && (burden ? mine > theirs : theirs > mine) ? [row.clauseId] : [];
			})
		);
	}, [me, clauseRows, kindsShown, typeShown]);
	const [onlyAgainst, setOnlyAgainst] = useState(false);
	const filtering = onlyAgainst && againstIds !== null;
	// The picked clause stays in the list even when it does not go against the reader: it is
	// painted in the contract, and a painted clause with no row would have nothing to close it.
	const activeId = activeClause?.clauseId ?? null;
	const tableRows = useMemo(
		() =>
			filtering && againstIds
				? clauseRows.filter(
						(row) => row.clauseId && (againstIds.has(row.clauseId) || row.clauseId === activeId)
					)
				: clauseRows,
		[filtering, againstIds, clauseRows, activeId]
	);

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
	const talliesByClause = useMemo(
		() =>
			grid && viewKg
				? new Map(tallyClauses(grid, viewKg).map((t) => [t.clauseId, t] as const))
				: null,
		[grid, viewKg]
	);
	const renderDetail = (row: GridRow) => {
		const found = row.clauseId ? talliesByClause?.get(row.clauseId) : undefined;
		if (!found || !viewKg) return null;
		const tally =
			conditionMode === 'firm' && conditionalIds ? withoutServed(found, conditionalIds) : found;
		const kinds = [typeShown];
		// The same count the row's squares show: each party's own statements of the open type.
		const count = (side: Side) => row.marks[side].filter((mark) => mark.kind === typeShown).length;
		const a = count('a');
		const b = count('b');
		const kind = KIND_LABEL[typeShown].toLowerCase();
		const lead = a === b ? null : a > b ? 'a' : 'b';
		return (
			<div className="space-y-3">
				<p className="text-sm font-medium text-foreground">
					{lead
						? `${short(names[lead])} has more ${kind} (${Math.max(a, b)} vs ${Math.min(a, b)}).`
						: `As many ${kind} for each party (${a} each).`}
				</p>
				<PartyStatements
					tally={tally}
					kinds={kinds}
					names={names}
					conditions={showConditions ? viewKg.conditions : NO_CONDITIONS}
					onOpen={openInDocument}
				/>
			</div>
		);
	};

	const showTooltip = (event: ReactMouseEvent, mark: GridMark) => {
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect || !detailsOf) return;
		setHover({ x: event.clientX - rect.left, y: event.clientY - rect.top, ...detailsOf(mark) });
	};

	// A clause's place by relevance: the number in its row's circle.
	const rankByClause = useMemo(() => {
		if (!grid || !viewKg || !rowImportance) return null;
		const ranked = byImportance(tallyClauses(grid, viewKg), rowImportance.byClause);
		return new Map(ranked.map((t, i) => [t.clauseId, i + 1] as const));
	}, [grid, viewKg, rowImportance]);

	// Each row is named by the clause's place in importance, its number and heading (a
	// numbered subclause borrows its section's), and a link to the graph.
	const leadOf = useMemo(() => {
		if (!grid || !viewKg) return undefined;
		const clauseOf = new Map(viewKg.clauses.map((c) => [c.id, c] as const));
		const rank = rankByClause ?? new Map<string, number>();
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
	}, [grid, viewKg, rankByClause]);

	// Where a red flag's statement sits in the table: its row's place and its clause number.
	const placeOfClause = useMemo(() => {
		if (!viewKg) return undefined;
		const clauseOf = new Map(viewKg.clauses.map((c) => [c.id, c] as const));
		return (clauseId: string) => {
			const clause = clauseOf.get(clauseId);
			if (!clause) return null;
			const title = clauseTitle(clause, clause.heading || clause.ref || clause.id, viewKg.clauses);
			return { rank: rankByClause?.get(clauseId), section: title.section, heading: title.heading };
		};
	}, [viewKg, rankByClause]);

	// The pair lives in the URL too: a shared link opens on the same comparison.
	const { pair: urlPair, setPair } = useAnalyzerPair();
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
			{pairIds && (
				<div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border/60 px-6 py-2">
					<YouArePicker
						names={names}
						me={me}
						onPick={(side) => setMeId(side ? pairIds[side] : null)}
					/>
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
