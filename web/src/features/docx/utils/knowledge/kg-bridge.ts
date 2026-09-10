import type { DeonticKind, KgDeonticNode, KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';
import type { Node as ParagraphNode, EvidenceParagraph } from '@/types/document';
import type { DocumentEntityHighlight } from '@/features/docx/utils/assistant/entity-marks';
import type { KnowledgeGraphBridgePayload } from '@/stores/knowledgeGraph';
import type { PairAttention } from '@/features/docx/utils/knowledge/pair';
import {
	computePartyAttention,
	type DeonticSeverity,
	type DeonticTone,
} from '@/features/docx/utils/knowledge/attention';


type EntityKind = 'party' | 'clause' | 'definedTerm' | DeonticKind;

const KIND_COLORS: Record<EntityKind, { color: string; soft: string }> = {
	party: { color: '#7c3aed', soft: 'rgba(124, 58, 237, 0.16)' },
	clause: { color: '#0ea5e9', soft: 'rgba(14, 165, 233, 0.16)' },
	definedTerm: { color: '#14b8a6', soft: 'rgba(20, 184, 166, 0.16)' },
	obligation: { color: '#ef4444', soft: 'rgba(239, 68, 68, 0.16)' },
	right: { color: '#22c55e', soft: 'rgba(34, 197, 94, 0.16)' },
	prohibition: { color: '#f59e0b', soft: 'rgba(245, 158, 11, 0.16)' },
};

const EMPTY: KnowledgeGraphBridgePayload = {
	anchorParagraphId: null,
	relatedParagraphs: [],
	entities: [],
	paragraphIds: [],
	focusNodeIds: [],
	nodeScores: {},
	scoreByParagraphId: {},
	toneByParagraphId: {},
	ledger: null,
};

/** Undirected adjacency over the deontic edges, for n-hop expansion. */
function buildAdjacency(kg: KnowledgeGraph): Map<string, Set<string>> {
	const adjacency = new Map<string, Set<string>>();
	const add = (a: string, b: string) => {
		let set = adjacency.get(a);
		if (!set) {
			set = new Set();
			adjacency.set(a, set);
		}
		set.add(b);
	};
	for (const edge of kg.edges) {
		add(edge.source, edge.target);
		add(edge.target, edge.source);
	}
	return adjacency;
}

/** Node ids reachable from `start` within `hops` edges (inclusive). */
function neighborhood(start: string, hops: number, adjacency: Map<string, Set<string>>): Set<string> {
	const seen = new Set<string>([start]);
	let frontier: string[] = [start];
	for (let depth = 0; depth < hops; depth += 1) {
		const next: string[] = [];
		for (const id of frontier) {
			for (const neighbor of adjacency.get(id) ?? []) {
				if (!seen.has(neighbor)) {
					seen.add(neighbor);
					next.push(neighbor);
				}
			}
		}
		if (next.length === 0) break;
		frontier = next;
	}
	return seen;
}

function makeEntityCollector() {
	const entities: DocumentEntityHighlight[] = [];
	const seen = new Set<string>();
	const add = (rawLabel: string, key: string, kind: EntityKind) => {
		const label = rawLabel.trim();
		if (label.length < 2) return;
		const dedupe = label.toLowerCase();
		if (seen.has(dedupe)) return;
		seen.add(dedupe);
		const palette = KIND_COLORS[kind];
		entities.push({ label, key, color: palette.color, softColor: palette.soft });
	};
	return { entities, add };
}

/** Same de-duplication as the collector, with an explicit colour instead of a kind. */
function addColored(
	entities: DocumentEntityHighlight[],
	rawLabel: string,
	key: string,
	color: string,
	softColor: string
) {
	const label = rawLabel.trim();
	if (label.length < 2) return;
	if (entities.some((entity) => entity.label.toLowerCase() === label.toLowerCase())) return;
	entities.push({ label, key, color, softColor });
}

function paragraphEnum(pid: string, nodesById: Map<string, ParagraphNode>): number {
	return nodesById.get(pid)?.paragraph_enum ?? Number(pid.match(/-p-(\d+)$/)?.[1] ?? '0');
}

/**
 * Which fragments of a statement to underline.
 *
 * `evidenceSpans` holds every fragment the evidence pass located. When the model
 * stitched a shared preamble onto each item of a list — one sentence of the reference
 * contract carries six prohibitions, and all six repeat
 * "Bellicum ... may not:" — that preamble is identical across them, so underlining it
 * would hand one arbitrary statement a span six of them claim. Only the fragments that
 * tell them apart are kept; if every fragment is shared, the longest stands in.
 */
function evidenceLabels(
	statement: KgDeonticNode,
	spanOwners: Map<string, number>
): string[] {
	const spans = statement.evidenceSpans?.length ? statement.evidenceSpans : [statement.text];
	const distinctive = spans.filter((span) => span && (spanOwners.get(span) ?? 0) <= 1);
	if (distinctive.length > 0) return distinctive;
	return spans.filter(Boolean).sort((left, right) => right.length - left.length).slice(0, 1);
}

/** How many statements claim each fragment, so a shared preamble can be told apart. */
function countSpanOwners(kg: KnowledgeGraph): Map<string, number> {
	const counts = new Map<string, number>();
	for (const statement of deonticNodes(kg)) {
		for (const span of new Set(statement.evidenceSpans ?? [])) {
			counts.set(span, (counts.get(span) ?? 0) + 1);
		}
	}
	return counts;
}

/** The document-side half of the payload: where to scroll and what to underline. */
export type KnowledgeGraphDocumentTarget = Pick<
	KnowledgeGraphBridgePayload,
	| 'anchorParagraphId'
	| 'relatedParagraphs'
	| 'entities'
	| 'paragraphIds'
	| 'scoreByParagraphId'
	| 'toneByParagraphId'
>;

/**
 * "Take me to where this node lives" — one node, its own paragraphs, nothing else.
 *
 * Deliberately narrower than `buildKnowledgeGraphBridge`: it carries no `focusNodeIds`
 * and no `nodeScores`, so writing it moves the document without touching what the ring
 * draws. That separation is the whole point — navigating and re-focusing used to be the
 * same act because they travelled in the same payload.
 */
export function buildNodeDocumentTarget(
	kg: KnowledgeGraph,
	nodeId: string,
	nodesById: Map<string, ParagraphNode>
): KnowledgeGraphDocumentTarget {
	const { entities, add } = makeEntityCollector();
	let paragraphIds: string[] = [];

	const party = kg.parties.find((p) => p.id === nodeId);
	const clause = kg.clauses.find((c) => c.id === nodeId);
	const statement = deonticNodes(kg).find((v) => v.id === nodeId);
	const term = kg.definedTerms.find((t) => t.id === nodeId);

	if (party) {
		paragraphIds = party.paragraphIds;
		add(party.name, `kg-${party.id}`, 'party');
		for (const alias of party.aliases) add(alias, `kg-${party.id}`, 'party');
	} else if (clause) {
		paragraphIds = clause.paragraphIds;
		if (clause.ref) add(clause.ref, `kg-${clause.id}`, 'clause');
	} else if (statement) {
		paragraphIds = statement.paragraphIds;
		for (const span of evidenceLabels(statement, countSpanOwners(kg))) {
			add(span, `kg-${statement.id}`, statement.kind);
		}
		const home = kg.clauses.find((c) => c.id === statement.clauseId);
		if (home?.ref) add(home.ref, `kg-${home.id}`, 'clause');
	} else if (term) {
		paragraphIds = term.paragraphIds;
		add(term.term, `kg-${term.id}`, 'definedTerm');
	} else {
		paragraphIds =
			kg.conditions.find((c) => c.id === nodeId)?.paragraphIds ??
			kg.references.find((r) => r.id === nodeId)?.paragraphIds ??
			kg.values.find((v) => v.id === nodeId)?.paragraphIds ??
			[];
	}

	const ordered = [...new Set(paragraphIds)]
		.filter((pid) => nodesById.has(pid))
		.sort((a, b) => paragraphEnum(a, nodesById) - paragraphEnum(b, nodesById));
	const anchorParagraphId = ordered[0] ?? null;

	return {
		anchorParagraphId,
		relatedParagraphs: ordered
			.filter((pid) => pid !== anchorParagraphId)
			.map((pid) => ({ node: nodesById.get(pid) as ParagraphNode, relationTypes: [], references: [] })),
		entities,
		paragraphIds: ordered,
		// Every paragraph of the node matters equally — there is no ranking within one node.
		scoreByParagraphId: Object.fromEntries(ordered.map((pid) => [pid, 1] as const)),
		toneByParagraphId: {},
	};
}

/**
 * Document bridge for the *pair* view: the union of both parties' top-K.
 *
 * Building it from the anchor alone left the ring showing two parties while the document
 * reflected one — half the reading was invisible on the page. Each party's mentions are
 * underlined in its own colour, so the document speaks the same language as the ring.
 */
export function buildPairBridge(
	kg: KnowledgeGraph,
	pair: PairAttention,
	nodesById: Map<string, ParagraphNode>,
	partyColors: readonly [string, string],
	/**
	 * Narrows the bridge to these statements instead of the pair's two top-K sets — how
	 * picking one clause in the grid makes the document answer for that clause alone.
	 * The party colouring stays either way: the reader still needs to see who is who.
	 */
	statementIds?: readonly string[]
): KnowledgeGraphBridgePayload {
	const byId = new Map(deonticNodes(kg).map((v) => [v.id, v] as const));
	const clauseById = new Map(kg.clauses.map((c) => [c.id, c]));
	const partyById = new Map(kg.parties.map((p) => [p.id, p]));
	const spanOwners = countSpanOwners(kg);
	const { entities, add } = makeEntityCollector();

	// Parties first: their colour is the one the ring gives them, not the kind palette.
	for (const [index, partyId] of [pair.partyAId, pair.partyBId].entries()) {
		const party = partyById.get(partyId);
		if (!party) continue;
		const color = partyColors[index];
		const soft = `${color}29`;
		for (const label of [party.name, ...party.aliases]) {
			addColored(entities, label, `kg-${party.id}`, color, soft);
		}
	}

	const statements = [...new Set(statementIds ?? [...pair.topA, ...pair.topB])]
		.map((id) => byId.get(id))
		.filter((v): v is KgDeonticNode => Boolean(v))
		.sort((a, b) => (pair.nodeScores[b.id] ?? 0) - (pair.nodeScores[a.id] ?? 0));

	const paragraphSet = new Set<string>();
	const scoreByParagraphId: Record<string, number> = {};
	for (const v of statements) {
		const score = pair.nodeScores[v.id] ?? 0;
		for (const span of evidenceLabels(v, spanOwners)) add(span, `kg-${v.id}`, v.kind);
		const clause = v.clauseId ? clauseById.get(v.clauseId) : undefined;
		if (clause?.ref) add(clause.ref, `kg-${clause.id}`, 'clause');
		for (const pid of v.paragraphIds) {
			if (!nodesById.has(pid)) continue;
			paragraphSet.add(pid);
			scoreByParagraphId[pid] = Math.max(scoreByParagraphId[pid] ?? 0, score);
		}
	}

	const present = [...paragraphSet].sort(
		(a, b) => paragraphEnum(a, nodesById) - paragraphEnum(b, nodesById)
	);
	const anchorParagraphId =
		(statements[0]?.paragraphIds ?? []).find((pid) => nodesById.has(pid)) ?? present[0] ?? null;

	return {
		anchorParagraphId,
		relatedParagraphs: present
			.filter((pid) => pid !== anchorParagraphId)
			.map((pid) => ({ node: nodesById.get(pid) as ParagraphNode, relationTypes: [], references: [] })),
		entities,
		paragraphIds: present,
		focusNodeIds: statementIds
			? [
					pair.partyAId,
					pair.partyBId,
					...statements.map((v) => v.id),
					...statements.flatMap((v) => (v.clauseId ? [v.clauseId] : [])),
				]
			: pair.focusNodeIds,
		nodeScores: pair.nodeScores,
		scoreByParagraphId,
		toneByParagraphId: {},
			ledger: null,
	};
}

export function buildKnowledgeGraphBridge(
	kg: KnowledgeGraph,
	focusNodeId: string | null,
	hops: number,
	topK: number,
	nodesById: Map<string, ParagraphNode>,
	severity: DeonticSeverity,
	usePageRank: boolean
): KnowledgeGraphBridgePayload {
	if (!focusNodeId) return EMPTY;

	const partyById = new Map(kg.parties.map((p) => [p.id, p]));
	const clauseById = new Map(kg.clauses.map((c) => [c.id, c]));
	const deonticById = new Map(deonticNodes(kg).map((v) => [v.id, v] as const));
	const termById = new Map(kg.definedTerms.map((t) => [t.id, t]));

	const enumOf = (pid: string) => paragraphEnum(pid, nodesById);
	const toRelated = (ids: string[], anchorId: string | null): EvidenceParagraph[] =>
		ids
			.filter((pid) => pid !== anchorId)
			.map((pid) => ({ node: nodesById.get(pid) as ParagraphNode, relationTypes: [], references: [] }))
			.sort((a, b) => a.node.paragraph_enum - b.node.paragraph_enum);

	// ---- Party focus: attention-ranked top-K statements ----------------------
	if (partyById.has(focusNodeId)) {
		const party = partyById.get(focusNodeId)!;
		const attention = computePartyAttention(kg, focusNodeId, severity, usePageRank);

		const rankedStatements = [...attention.toneByDeontic.keys()]
			.map((id) => deonticById.get(id))
			.filter((v): v is KgDeonticNode => Boolean(v))
			.sort(
				(a, b) => (attention.deonticScore.get(b.id) ?? 0) - (attention.deonticScore.get(a.id) ?? 0)
			);
		const topStatements = rankedStatements.slice(0, topK);

		const { entities, add } = makeEntityCollector();
		add(party.name, `kg-${party.id}`, 'party');
		for (const alias of party.aliases) add(alias, `kg-${party.id}`, 'party');

		const spanOwners = countSpanOwners(kg);
		const paragraphSet = new Set<string>();
		const scoreByParagraphId: Record<string, number> = {};
		const toneByParagraphId: Record<string, DeonticTone> = {};
		for (const v of topStatements) {
			const score = attention.deonticScore.get(v.id) ?? 0;
			const tone = attention.toneByDeontic.get(v.id) ?? 'burden';
			for (const span of evidenceLabels(v, spanOwners)) add(span, `kg-${v.id}`, v.kind);
			const clause = v.clauseId ? clauseById.get(v.clauseId) : undefined;
			if (clause?.ref) add(clause.ref, `kg-${clause.id}`, 'clause');
			for (const pid of v.paragraphIds) {
				if (!nodesById.has(pid)) continue;
				paragraphSet.add(pid);
				scoreByParagraphId[pid] = Math.max(scoreByParagraphId[pid] ?? 0, score);
				// Burden takes precedence when a paragraph mixes both.
				if (toneByParagraphId[pid] !== 'burden') toneByParagraphId[pid] = tone;
			}
		}

		const presentParagraphIds = [...paragraphSet];
		const topParagraphs = (topStatements[0]?.paragraphIds ?? [])
			.filter((pid) => nodesById.has(pid))
			.sort((a, b) => enumOf(a) - enumOf(b));
		const anchorParagraphId =
			topParagraphs[0] ?? [...presentParagraphIds].sort((a, b) => enumOf(a) - enumOf(b))[0] ?? null;

		const focusNodeIds = Array.from(
			new Set<string>([
				party.id,
				...topStatements.map((v) => v.id),
				...topStatements.map((v) => v.clauseId).filter((id): id is string => Boolean(id)),
			])
		);

		return {
			anchorParagraphId,
			relatedParagraphs: toRelated(presentParagraphIds, anchorParagraphId),
			entities,
			paragraphIds: presentParagraphIds,
			focusNodeIds,
			nodeScores: Object.fromEntries(attention.nodeScore),
			scoreByParagraphId,
			toneByParagraphId,
			ledger: attention.ledger,
		};
	}

	// ---- Clause / statement focus: deontic neighborhood ----------------------
	const paragraphIdsOfNode = (id: string): string[] =>
		clauseById.get(id)?.paragraphIds ?? deonticById.get(id)?.paragraphIds ?? [];

	const hood = neighborhood(focusNodeId, hops, buildAdjacency(kg));
	const { entities, add } = makeEntityCollector();
	const paragraphSet = new Set<string>();
	for (const id of hood) {
		const party = partyById.get(id);
		if (party) {
			for (const pid of party.paragraphIds) paragraphSet.add(pid);
			add(party.name, `kg-${id}`, 'party');
			for (const alias of party.aliases) add(alias, `kg-${id}`, 'party');
			continue;
		}
		const clause = clauseById.get(id);
		if (clause) {
			for (const pid of clause.paragraphIds) paragraphSet.add(pid);
			if (clause.ref) add(clause.ref, `kg-${id}`, 'clause');
			continue;
		}
		const statement = deonticById.get(id);
		if (statement) {
			for (const pid of statement.paragraphIds) paragraphSet.add(pid);
			if (statement.text) add(statement.text, `kg-${id}`, statement.kind);
			continue;
		}
		const term = termById.get(id);
		if (term) {
			for (const pid of term.paragraphIds) paragraphSet.add(pid);
			add(term.term, `kg-${id}`, 'definedTerm');
		}
	}

	const presentParagraphIds = [...paragraphSet].filter((pid) => nodesById.has(pid));
	const focusedPresent = paragraphIdsOfNode(focusNodeId)
		.filter((pid) => nodesById.has(pid))
		.sort((a, b) => enumOf(a) - enumOf(b));
	const anchorParagraphId =
		focusedPresent[0] ?? [...presentParagraphIds].sort((a, b) => enumOf(a) - enumOf(b))[0] ?? null;

	return {
		...EMPTY,
		anchorParagraphId,
		relatedParagraphs: toRelated(presentParagraphIds, anchorParagraphId),
		entities,
		paragraphIds: presentParagraphIds,
		focusNodeIds: [...hood],
	};
}
