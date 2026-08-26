import type { DeonticKind, KgDeonticNode, KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';
import type { Node as ParagraphNode, RelatedParagraph } from '@/types/document';
import type { DocumentEntityHighlight } from '@/features/docx/utils/assistant/entity-marks';
import type { KnowledgeGraphBridgePayload } from '@/stores/knowledgeGraph';
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
	toneSplit: {},
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

	const enumOf = (pid: string): number =>
		nodesById.get(pid)?.paragraph_enum ?? Number(pid.match(/-p-(\d+)$/)?.[1] ?? '0');
	const toRelated = (ids: string[], anchorId: string | null): RelatedParagraph[] =>
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

		const paragraphSet = new Set<string>();
		const scoreByParagraphId: Record<string, number> = {};
		const toneByParagraphId: Record<string, DeonticTone> = {};
		for (const v of topStatements) {
			const score = attention.deonticScore.get(v.id) ?? 0;
			const tone = attention.toneByDeontic.get(v.id) ?? 'burden';
			if (v.text) add(v.text, `kg-${v.id}`, v.kind);
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

		// Arc glyph input. A statement sits wholly on one side, so its arc is a full
		// ring; a clause carries whatever mix its statements add up to.
		const toneSplit: Record<string, { burden: number; benefit: number }> = {};
		for (const [statementId, tone] of attention.toneByDeontic) {
			const magnitude = attention.deonticScore.get(statementId) ?? 0;
			toneSplit[statementId] =
				tone === 'burden' ? { burden: magnitude, benefit: 0 } : { burden: 0, benefit: magnitude };
		}
		for (const clause of kg.clauses) {
			const burden = attention.clauseBurden.get(clause.id) ?? 0;
			const benefit = attention.clauseBenefit.get(clause.id) ?? 0;
			if (burden > 0 || benefit > 0) toneSplit[clause.id] = { burden, benefit };
		}

		return {
			anchorParagraphId,
			relatedParagraphs: toRelated(presentParagraphIds, anchorParagraphId),
			entities,
			paragraphIds: presentParagraphIds,
			focusNodeIds,
			nodeScores: Object.fromEntries(attention.nodeScore),
			scoreByParagraphId,
			toneByParagraphId,
			toneSplit,
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
