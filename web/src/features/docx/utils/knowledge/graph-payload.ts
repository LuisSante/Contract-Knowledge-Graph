import type { DeonticKind, KgDeonticNode, KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';
import type { Node as ParagraphNode, EvidenceParagraph } from '@/types/document';
import type { EntityHighlight } from '@/features/docx/utils/assistant/entity-marks';
import type { GraphPayload } from '@/stores/clause-analyzer';
import type { PairScores } from '@/features/docx/utils/knowledge/pair';
import {
	computePartyScores,
	type DeonticSeverity,
	type DeonticTone,
} from '@/features/docx/utils/knowledge/party-ledger';
import { sectionOf } from '@/features/docx/utils/knowledge/clause-favour';

type EntityKind = 'party' | 'clause' | 'definedTerm' | DeonticKind;

const KIND_COLORS: Record<EntityKind, { color: string; soft: string }> = {
	party: { color: '#7c3aed', soft: 'rgba(124, 58, 237, 0.16)' },
	clause: { color: '#0ea5e9', soft: 'rgba(14, 165, 233, 0.16)' },
	definedTerm: { color: '#14b8a6', soft: 'rgba(20, 184, 166, 0.16)' },
	obligation: { color: '#ef4444', soft: 'rgba(239, 68, 68, 0.16)' },
	right: { color: '#22c55e', soft: 'rgba(34, 197, 94, 0.16)' },
	prohibition: { color: '#f59e0b', soft: 'rgba(245, 158, 11, 0.16)' },
};

const EMPTY: GraphPayload = {
	anchorParagraphId: null,
	relatedParagraphs: [],
	entities: [],
	paragraphIds: [],
	focusNodeIds: [],
	nodeScores: {},
	scoreByParagraph: {},
	toneByParagraph: {},
	ledger: null,
};

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

function neighborhood(
	start: string,
	hops: number,
	adjacency: Map<string, Set<string>>
): Set<string> {
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
	const entities: EntityHighlight[] = [];
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

function paragraphEnum(pid: string, nodesById: Map<string, ParagraphNode>): number {
	return nodesById.get(pid)?.paragraph_enum ?? Number(pid.match(/-p-(\d+)$/)?.[1] ?? '0');
}

function evidenceLabels(statement: KgDeonticNode, spanOwners: Map<string, number>): string[] {
	const spans = statement.evidenceSpans?.length ? statement.evidenceSpans : [statement.text];
	const distinctive = spans.filter((span) => span && (spanOwners.get(span) ?? 0) <= 1);
	if (distinctive.length > 0) return distinctive;
	return spans
		.filter(Boolean)
		.sort((left, right) => right.length - left.length)
		.slice(0, 1);
}

function countSpanOwners(kg: KnowledgeGraph): Map<string, number> {
	const counts = new Map<string, number>();
	for (const statement of deonticNodes(kg)) {
		for (const span of new Set(statement.evidenceSpans ?? [])) {
			counts.set(span, (counts.get(span) ?? 0) + 1);
		}
	}
	return counts;
}

export type DocumentTarget = Pick<
	GraphPayload,
	| 'anchorParagraphId'
	| 'relatedParagraphs'
	| 'entities'
	| 'paragraphIds'
	| 'focusNodeIds'
	| 'scoreByParagraph'
	| 'toneByParagraph'
>;

export function buildDocumentTarget(
	kg: KnowledgeGraph,
	nodeId: string,
	nodesById: Map<string, ParagraphNode>
): DocumentTarget {
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
			.map((pid) => ({
				node: nodesById.get(pid) as ParagraphNode,
				relationTypes: [],
				references: [],
			})),
		entities,
		paragraphIds: ordered,
		focusNodeIds: [nodeId],
		scoreByParagraph: Object.fromEntries(ordered.map((pid) => [pid, 1] as const)),
		toneByParagraph: {},
	};
}

/** For evidence the graph holds no node for, such as a span CUAD marked. */
export function buildParagraphTarget(
	paragraphIds: string[],
	nodesById: Map<string, ParagraphNode>
): DocumentTarget {
	const ordered = [...new Set(paragraphIds)]
		.filter((pid) => nodesById.has(pid))
		.sort((a, b) => paragraphEnum(a, nodesById) - paragraphEnum(b, nodesById));
	const anchorParagraphId = ordered[0] ?? null;
	return {
		anchorParagraphId,
		relatedParagraphs: ordered
			.filter((pid) => pid !== anchorParagraphId)
			.map((pid) => ({
				node: nodesById.get(pid) as ParagraphNode,
				relationTypes: [],
				references: [],
			})),
		entities: [],
		paragraphIds: ordered,
		focusNodeIds: [],
		scoreByParagraph: Object.fromEntries(ordered.map((pid) => [pid, 1] as const)),
		toneByParagraph: {},
	};
}

/** One `modifies` edge between two different clauses: `from` holds the changing statement
 *  (or is the changing clause), `to` is the clause it changes. */
interface ClauseModification {
	from: string;
	to: string;
	statementId: string | null;
	/** The changing sentence's type; null when a whole clause is the source. */
	kind: DeonticKind | null;
	/** Where the change is written: the edge's own evidence, else its source's paragraphs. */
	paragraphIds: string[];
}

function clauseModifications(kg: KnowledgeGraph): ClauseModification[] {
	const statementById = new Map(deonticNodes(kg).map((v) => [v.id, v] as const));
	const clauseById = new Map(kg.clauses.map((c) => [c.id, c] as const));
	const out: ClauseModification[] = [];
	for (const edge of kg.edges) {
		if (edge.type !== 'modifies' || !clauseById.has(edge.target)) continue;
		const statement = statementById.get(edge.source);
		const from = statement?.clauseId ?? (clauseById.has(edge.source) ? edge.source : null);
		if (!from || from === edge.target) continue;
		out.push({
			from,
			to: edge.target,
			statementId: statement?.id ?? null,
			kind: statement?.kind ?? null,
			paragraphIds: edge.paragraphIds.length
				? edge.paragraphIds
				: (statement?.paragraphIds ?? clauseById.get(from)?.paragraphIds ?? []),
		});
	}
	return out;
}

/** A clause that modifies another, with the type of its changing sentence. */
export interface ClauseModifier {
	clauseId: string;
	kind: DeonticKind | null;
}

/** For each clause, the clauses that modify it: what could limit, except or cancel it. One
 *  entry per modifying clause, typed by its first changing sentence. */
export function clauseModifiedBy(kg: KnowledgeGraph): Map<string, ClauseModifier[]> {
	const by = new Map<string, ClauseModifier[]>();
	for (const m of clauseModifications(kg)) {
		const list = by.get(m.to) ?? [];
		if (!list.some((x) => x.clauseId === m.from)) list.push({ clauseId: m.from, kind: m.kind });
		by.set(m.to, list);
	}
	return by;
}

interface ModifiesPartner {
	paragraphId: string;
	statementId: string | null;
	from: string;
	to: string;
}

/**
 * What a clause is read with: the sentences in other clauses that modify it, where the edge
 * says they are written. Only that direction, as the table says it ("modified by"); never
 * itself, and never a chain.
 */
function modifiesPartners(kg: KnowledgeGraph, clauseId: string): ModifiesPartner[] {
	return clauseModifications(kg)
		.filter((m) => m.to === clauseId)
		.flatMap((m) => m.paragraphIds.map((paragraphId) => ({ paragraphId, ...m })));
}

export function buildPairPayload(
	kg: KnowledgeGraph,
	pair: PairScores,
	nodesById: Map<string, ParagraphNode>,
	statementIds?: readonly string[],
	/** The clause picked in the table. The document links its paragraphs only to the sentences
	 *  that modify it (`modifies`); with no clause picked, nothing is linked. */
	clauseId?: string | null
): GraphPayload {
	const byId = new Map(deonticNodes(kg).map((v) => [v.id, v] as const));
	const clauseById = new Map(kg.clauses.map((c) => [c.id, c]));
	const spanOwners = countSpanOwners(kg);
	// Only the statements are painted, not the parties' names: the table's columns already
	// say whose side each one is on.
	const { entities, add } = makeEntityCollector();

	const statements = [...new Set(statementIds ?? [...pair.topA, ...pair.topB])]
		.map((id) => byId.get(id))
		.filter((v): v is KgDeonticNode => Boolean(v))
		.sort((a, b) => (pair.nodeScores[b.id] ?? 0) - (pair.nodeScores[a.id] ?? 0));

	const paragraphSet = new Set<string>();
	const scoreByParagraph: Record<string, number> = {};
	for (const v of statements) {
		const score = pair.nodeScores[v.id] ?? 0;
		for (const span of evidenceLabels(v, spanOwners)) add(span, `kg-${v.id}`, v.kind);
		const clause = v.clauseId ? clauseById.get(v.clauseId) : undefined;
		if (clause?.ref) add(clause.ref, `kg-${clause.id}`, 'clause');
		for (const pid of v.paragraphIds) {
			if (!nodesById.has(pid)) continue;
			paragraphSet.add(pid);
			scoreByParagraph[pid] = Math.max(scoreByParagraph[pid] ?? 0, score);
		}
	}

	const anchorParagraphId =
		(statements[0]?.paragraphIds ?? []).find((pid) => nodesById.has(pid)) ??
		[...paragraphSet].sort(
			(a, b) => paragraphEnum(a, nodesById) - paragraphEnum(b, nodesById)
		)[0] ??
		null;

	// The line in the margin means "read these together", so it only joins what the graph
	// joins. Paragraphs that merely hold statements of the pair stay painted, unlinked.
	const partners = clauseId ? modifiesPartners(kg, clauseId) : [];
	for (const id of new Set(partners.flatMap((p) => (p.statementId ? [p.statementId] : [])))) {
		const v = byId.get(id);
		if (v) for (const span of evidenceLabels(v, spanOwners)) add(span, `kg-${v.id}`, v.kind);
	}
	const partnerAt = new Map<string, ModifiesPartner>();
	for (const p of partners) {
		if (!nodesById.has(p.paragraphId) || p.paragraphId === anchorParagraphId) continue;
		if (!partnerAt.has(p.paragraphId)) partnerAt.set(p.paragraphId, p);
	}
	for (const pid of partnerAt.keys()) paragraphSet.add(pid);
	const numberOf = (id: string) => {
		const clause = clauseById.get(id);
		return sectionOf(clause?.ref) ?? clause?.heading ?? id;
	};
	const present = [...paragraphSet].sort(
		(a, b) => paragraphEnum(a, nodesById) - paragraphEnum(b, nodesById)
	);

	return {
		anchorParagraphId,
		relatedParagraphs: [...partnerAt.values()]
			.sort(
				(a, b) => paragraphEnum(a.paragraphId, nodesById) - paragraphEnum(b.paragraphId, nodesById)
			)
			.map((p) => ({
				node: nodesById.get(p.paragraphId) as ParagraphNode,
				relation: { kind: 'modifies' as const, from: numberOf(p.from), to: numberOf(p.to) },
			})),
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
		scoreByParagraph,
		toneByParagraph: {},
		ledger: null,
	};
}

export function buildFocusPayload(
	kg: KnowledgeGraph,
	focusNodeId: string | null,
	hops: number,
	topK: number,
	nodesById: Map<string, ParagraphNode>,
	severity: DeonticSeverity,
	importanceByNode: Record<string, number> | null
): GraphPayload {
	if (!focusNodeId) return EMPTY;

	const partyById = new Map(kg.parties.map((p) => [p.id, p]));
	const clauseById = new Map(kg.clauses.map((c) => [c.id, c]));
	const deonticById = new Map(deonticNodes(kg).map((v) => [v.id, v] as const));
	const termById = new Map(kg.definedTerms.map((t) => [t.id, t]));

	const enumOf = (pid: string) => paragraphEnum(pid, nodesById);
	const toRelated = (ids: string[], anchorId: string | null): EvidenceParagraph[] =>
		ids
			.filter((pid) => pid !== anchorId)
			.map((pid) => ({
				node: nodesById.get(pid) as ParagraphNode,
				relationTypes: [],
				references: [],
			}))
			.sort((a, b) => a.node.paragraph_enum - b.node.paragraph_enum);

	// ---- Party focus: top-K statements ranked by the server's fixed point ---
	if (partyById.has(focusNodeId)) {
		const party = partyById.get(focusNodeId)!;
		const scores = computePartyScores(kg, focusNodeId, severity);
		const rankValue = (id: string) => importanceByNode?.[id] ?? scores.deonticScore.get(id) ?? 0;

		const rankedStatements = [...scores.toneByDeontic.keys()]
			.map((id) => deonticById.get(id))
			.filter((v): v is KgDeonticNode => Boolean(v))
			.sort((a, b) => rankValue(b.id) - rankValue(a.id));
		const topStatements = rankedStatements.slice(0, topK);

		const { entities, add } = makeEntityCollector();
		add(party.name, `kg-${party.id}`, 'party');
		for (const alias of party.aliases) add(alias, `kg-${party.id}`, 'party');

		const spanOwners = countSpanOwners(kg);
		const paragraphSet = new Set<string>();
		const scoreByParagraph: Record<string, number> = {};
		const toneByParagraph: Record<string, DeonticTone> = {};
		for (const v of topStatements) {
			const score = scores.deonticScore.get(v.id) ?? 0;
			const tone = scores.toneByDeontic.get(v.id) ?? 'burden';
			for (const span of evidenceLabels(v, spanOwners)) add(span, `kg-${v.id}`, v.kind);
			const clause = v.clauseId ? clauseById.get(v.clauseId) : undefined;
			if (clause?.ref) add(clause.ref, `kg-${clause.id}`, 'clause');
			for (const pid of v.paragraphIds) {
				if (!nodesById.has(pid)) continue;
				paragraphSet.add(pid);
				scoreByParagraph[pid] = Math.max(scoreByParagraph[pid] ?? 0, score);
				// Burden takes precedence when a paragraph mixes both.
				if (toneByParagraph[pid] !== 'burden') toneByParagraph[pid] = tone;
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
			nodeScores: importanceByNode ?? Object.fromEntries(scores.nodeScore),
			scoreByParagraph,
			toneByParagraph,
			ledger: scores.ledger,
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
