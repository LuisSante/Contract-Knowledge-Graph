import type {
	DeonticKind,
	KgCondition,
	KgDefinedTerm,
	KgDeonticNode,
	KnowledgeGraph,
} from '@/types/knowledge';
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
import { conditionLead, sectionOf } from '@/features/docx/utils/knowledge/clause-favour';
import { escapeRegex } from '@/features/docx/utils/text';

type EntityKind = 'party' | 'clause' | 'definedTerm' | 'condition' | DeonticKind;

const KIND_COLORS: Record<EntityKind, { color: string; soft: string }> = {
	party: { color: '#7c3aed', soft: 'rgba(124, 58, 237, 0.16)' },
	clause: { color: '#0ea5e9', soft: 'rgba(14, 165, 233, 0.16)' },
	definedTerm: { color: '#a65628', soft: 'rgba(166, 86, 40, 0.16)' },
	obligation: { color: '#ef4444', soft: 'rgba(239, 68, 68, 0.16)' },
	right: { color: '#22c55e', soft: 'rgba(34, 197, 94, 0.16)' },
	prohibition: { color: '#f59e0b', soft: 'rgba(245, 158, 11, 0.16)' },
	condition: { color: '#e7298a', soft: 'rgba(231, 41, 138, 0.14)' },
};

const EMPTY: GraphPayload = {
	anchorParagraphId: null,
	anchorLabel: null,
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
	const add = (rawLabel: string, key: string, kind: EntityKind, note?: string) => {
		const label = rawLabel.trim();
		if (label.length < 2) return;
		const dedupe = label.toLowerCase();
		if (seen.has(dedupe)) return;
		seen.add(dedupe);
		const palette = KIND_COLORS[kind];
		entities.push({ label, key, color: palette.color, softColor: palette.soft, note });
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

/** The conditions that gate each statement (their `gatesId`). */
function conditionsByStatement(kg: KnowledgeGraph): Map<string, KgCondition[]> {
	const byStatement = new Map<string, KgCondition[]>();
	for (const condition of kg.conditions) {
		if (!condition.gatesId || !condition.trigger) continue;
		const list = byStatement.get(condition.gatesId) ?? [];
		list.push(condition);
		byStatement.set(condition.gatesId, list);
	}
	return byStatement;
}

/** Shorter pieces of a statement left beside its condition are dropped: a word or two
 *  would match anywhere else in the paragraph. */
const MIN_PIECE = 12;

/**
 * The parts of `span` outside the given phrases. The document's highlighter lets the
 * longer match win where two overlap, so a condition written inside its statement's
 * sentence only shows in its own colour if the statement is painted around it.
 */
function partsOutside(span: string, phrases: string[]): string[] {
	let parts = [span];
	for (const phrase of phrases) {
		const needle = phrase.trim().toLowerCase();
		if (needle.length < 2) continue;
		parts = parts.flatMap((part) => {
			const at = part.toLowerCase().indexOf(needle);
			return at < 0 ? [part] : [part.slice(0, at), part.slice(at + needle.length)];
		});
	}
	return parts.map((part) => part.trim()).filter((part) => part.length >= MIN_PIECE);
}

/** Paints a statement, and its conditions in their own colour inside or beside it. Phrases in
 *  `apart` (a defined term) are left out of the statement so they show in their own. */
function paintStatement(
	add: (label: string, key: string, kind: EntityKind) => void,
	statement: KgDeonticNode,
	spanOwners: Map<string, number>,
	conditions: KgCondition[],
	apart: string[] = []
) {
	const triggers = [...conditions.map((c) => c.trigger), ...apart];
	for (const span of evidenceLabels(statement, spanOwners)) {
		for (const part of triggers.length ? partsOutside(span, triggers) : [span]) {
			add(part, `kg-${statement.id}`, statement.kind);
		}
	}
	for (const condition of conditions) add(condition.trigger, `kg-${condition.id}`, 'condition');
}

/** A statement's conditions written in other paragraphs than its own, to link them to it. */
function conditionsElsewhere(
	statement: KgDeonticNode,
	conditions: KgCondition[]
): Array<{ paragraphId: string; lead: string; trigger: string }> {
	const own = new Set(statement.paragraphIds);
	return conditions.flatMap((condition) =>
		condition.paragraphIds.some((pid) => own.has(pid))
			? []
			: condition.paragraphIds.map((paragraphId) => ({
					paragraphId,
					lead: conditionLead(condition.operator),
					trigger: condition.trigger,
				}))
	);
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
	| 'anchorLabel'
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
	nodesById: Map<string, ParagraphNode>,
	/** A statement also shows its conditions: painted, and linked when written apart. */
	{ withConditions = false }: { withConditions?: boolean } = {}
): DocumentTarget {
	const { entities, add } = makeEntityCollector();
	let paragraphIds: string[] = [];
	let apart: ReturnType<typeof conditionsElsewhere> = [];

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
		const conditions = withConditions ? (conditionsByStatement(kg).get(statement.id) ?? []) : [];
		paintStatement(add, statement, countSpanOwners(kg), conditions);
		apart = conditionsElsewhere(statement, conditions);
		paragraphIds = [...statement.paragraphIds, ...apart.map((c) => c.paragraphId)];
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
	// A statement anchors on its own paragraph, so its condition written apart is the one linked.
	const anchorParagraphId =
		(statement?.paragraphIds ?? []).find((pid) => nodesById.has(pid)) ?? ordered[0] ?? null;
	const conditionAt = new Map(apart.map((c) => [c.paragraphId, c] as const));

	return {
		anchorParagraphId,
		anchorLabel: null,
		relatedParagraphs: ordered
			.filter((pid) => pid !== anchorParagraphId)
			.map((pid) => {
				const condition = conditionAt.get(pid);
				return {
					node: nodesById.get(pid) as ParagraphNode,
					...(condition && {
						relation: {
							kind: 'condition' as const,
							lead: condition.lead,
							trigger: condition.trigger,
						},
					}),
				};
			}),
		entities,
		paragraphIds: ordered,
		focusNodeIds: [nodeId],
		scoreByParagraph: Object.fromEntries(ordered.map((pid) => [pid, 1] as const)),
		toneByParagraph: {},
	};
}

/** A `modifies`, `depends_on` or `references` edge between two different clauses: `from` holds
 *  the statement that changes, depends or refers (or is that clause), `to` is the clause it
 *  points to. */
interface ClauseLink {
	from: string;
	to: string;
	statementId: string | null;
	/** The sentence's type at `from`; null when a whole clause is the source. */
	kind: DeonticKind | null;
	/** Where the link is written: the edge's own evidence, else its source's paragraphs. */
	paragraphIds: string[];
}

type ClauseLinkType = 'modifies' | 'depends_on' | 'references';

function clauseLinks(kg: KnowledgeGraph, type: ClauseLinkType): ClauseLink[] {
	const statementById = new Map(deonticNodes(kg).map((v) => [v.id, v] as const));
	const clauseById = new Map(kg.clauses.map((c) => [c.id, c] as const));
	const out: ClauseLink[] = [];
	for (const edge of kg.edges) {
		if (edge.type !== type || !clauseById.has(edge.target)) continue;
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
	for (const m of clauseLinks(kg, 'modifies')) {
		const list = by.get(m.to) ?? [];
		if (!list.some((x) => x.clauseId === m.from)) list.push({ clauseId: m.from, kind: m.kind });
		by.set(m.to, list);
	}
	return by;
}

/** For each clause, the clauses it depends on: what has to be read to know whether it applies.
 *  The edge points to a whole clause, never to one of its sentences, so there is no type. */
export function clauseDependsOn(kg: KnowledgeGraph): Map<string, string[]> {
	return clauseTargets(kg, 'depends_on');
}

/** For each clause, the clauses it refers to (`references`): a neutral cross-reference, such as
 *  «as described in Section 1.4», that makes nothing conditional. */
export function clauseRefersTo(kg: KnowledgeGraph): Map<string, string[]> {
	return clauseTargets(kg, 'references');
}

/**
 * The one party a condition's trigger names («If the return is delayed by Party B»), by its
 * name or an alias: what sets the condition off turns on that party. A trigger that names
 * both parties, or neither, has none. A reading of the text, not an edge of the graph.
 */
export function conditionParty(kg: KnowledgeGraph): Map<string, string> {
	const patterns = kg.parties.map((party) => ({
		id: party.id,
		names: [party.name, ...party.aliases]
			.map((name) => name.trim())
			.filter((name) => name.length > 1)
			.map((name) => new RegExp(`(?<![\\w])${escapeRegex(name)}(?![\\w])`, 'i')),
	}));
	const out = new Map<string, string>();
	for (const condition of kg.conditions) {
		const trigger = condition.trigger ?? '';
		const named = patterns.filter((p) => p.names.some((re) => re.test(trigger)));
		if (named.length === 1) out.set(condition.id, named[0].id);
	}
	return out;
}

/** Whose a statement is: the party an obligation or prohibition binds, or a right's holder. */
const ownerOf = (v: KgDeonticNode) => (v.kind === 'right' ? v.benefitPartyId : v.burdenPartyId);

/**
 * Statements written once per party with the same words in the same clause: the clause binds
 * (or entitles) both alike, so the pair weighs nothing for either side.
 */
export function reciprocalStatements(kg: KnowledgeGraph): Set<string> {
	const owners = new Map<string, Set<string>>();
	const key = (v: KgDeonticNode) => [v.kind, v.clauseId, (v.text ?? '').trim()].join('|');
	for (const v of deonticNodes(kg)) {
		const owner = ownerOf(v);
		if (!owner || !(v.text ?? '').trim()) continue;
		const set = owners.get(key(v)) ?? new Set<string>();
		set.add(owner);
		owners.set(key(v), set);
	}
	return new Set(
		deonticNodes(kg)
			.filter((v) => (owners.get(key(v))?.size ?? 0) > 1)
			.map((v) => v.id)
	);
}

/**
 * For each obligation, the other party's rights written in the same paragraph, and for each
 * right, the other party's obligations there. Only that they sit together: the graph has no
 * edge saying one is the price of the other.
 */
export function sameParagraphCounterparts(kg: KnowledgeGraph): Map<string, KgDeonticNode[]> {
	const statements = deonticNodes(kg).filter((v) => v.kind !== 'prohibition' && ownerOf(v));
	const out = new Map<string, KgDeonticNode[]>();
	for (const v of statements) {
		const own = new Set(v.paragraphIds);
		const across = statements.filter(
			(w) =>
				w.kind !== v.kind && ownerOf(w) !== ownerOf(v) && w.paragraphIds.some((pid) => own.has(pid))
		);
		if (across.length > 0) out.set(v.id, across);
	}
	return out;
}

function clauseTargets(kg: KnowledgeGraph, type: 'depends_on' | 'references') {
	const on = new Map<string, string[]>();
	for (const d of clauseLinks(kg, type)) {
		const list = on.get(d.from) ?? [];
		if (!list.includes(d.to)) list.push(d.to);
		on.set(d.from, list);
	}
	return on;
}

interface LinkPartner {
	paragraphId: string;
	statementId: string | null;
	from: string;
	to: string;
	kind: ClauseLinkType;
}

/**
 * What a clause is read with: the sentences in other clauses that modify it, where the edge
 * says they are written, and the start of each clause it depends on or refers to. Only those
 * directions, as the table says them («modified by», «depends on», «refers to»); never
 * itself, and never a chain.
 */
function linkPartners(
	kg: KnowledgeGraph,
	clauseId: string,
	nodesById: Map<string, ParagraphNode>
): LinkPartner[] {
	const modifiers = clauseLinks(kg, 'modifies')
		.filter((m) => m.to === clauseId)
		.flatMap((m) =>
			m.paragraphIds.map((paragraphId) => ({ paragraphId, ...m, kind: 'modifies' as const }))
		);
	// The edge is written in the picked clause; what it leans on or points at is the other
	// clause, whole, so the line reaches that clause's first paragraph.
	const clauseById = new Map(kg.clauses.map((c) => [c.id, c] as const));
	const outgoing = (type: 'depends_on' | 'references') =>
		clauseLinks(kg, type)
			.filter((d) => d.from === clauseId)
			.flatMap((d) => {
				const first = (clauseById.get(d.to)?.paragraphIds ?? [])
					.filter((pid) => nodesById.has(pid))
					.sort((a, b) => paragraphEnum(a, nodesById) - paragraphEnum(b, nodesById))[0];
				return first
					? [{ paragraphId: first, statementId: null, from: d.from, to: d.to, kind: type }]
					: [];
			});
	return [...modifiers, ...outgoing('depends_on'), ...outgoing('references')];
}

/** Most lines a clause draws to the paragraphs that define the words it uses. */
const USES_SHOWN = 5;

/**
 * The defined terms a clause uses whose definition is written in another clause: the reader
 * meets the word here and its meaning elsewhere. Two edges, one step each: `uses` (from the
 * clause or one of its statements to the term) says which words, `defines` (from a clause to
 * the term) says where each is defined.
 */
function termsDefinedElsewhere(
	kg: KnowledgeGraph,
	clauseId: string
): Array<{ term: KgDefinedTerm; definedIn: string }> {
	const own = new Set([
		clauseId,
		...deonticNodes(kg)
			.filter((v) => v.clauseId === clauseId)
			.map((v) => v.id),
	]);
	const used = new Set(
		kg.edges.filter((e) => e.type === 'uses' && own.has(e.source)).map((e) => e.target)
	);
	const clauseIds = new Set(kg.clauses.map((c) => c.id));
	const definedIn = new Map<string, string>();
	for (const e of kg.edges) {
		if (e.type === 'defines' && clauseIds.has(e.source) && !definedIn.has(e.target)) {
			definedIn.set(e.target, e.source);
		}
	}
	// A «term» with no letter is not a word: Bellicum's redactions («[...***...]») were
	// extracted as defined terms.
	return kg.definedTerms.flatMap((term) => {
		const at = definedIn.get(term.id);
		return used.has(term.id) &&
			at &&
			at !== clauseId &&
			/\p{L}/u.test(term.term) &&
			term.definition.trim()
			? [{ term, definedIn: at }]
			: [];
	});
}

/**
 * For each clause, the clauses that define words it uses (`uses`, then `defines`), with those
 * words, in the order of the clauses. The same reading as the glossary and the margin lines.
 */
/**
 * The terms a clause defines (`defines`, clause → term), as the graph says them, in the
 * order of the graph. Read straight from the edge, so a term no other clause uses counts too.
 */
export function clauseDefines(kg: KnowledgeGraph): Map<string, string[]> {
	const clauseIds = new Set(kg.clauses.map((c) => c.id));
	const termById = new Map(kg.definedTerms.map((t) => [t.id, t] as const));
	const out = new Map<string, string[]>();
	for (const e of kg.edges) {
		const term = termById.get(e.target);
		if (e.type !== 'defines' || !clauseIds.has(e.source) || !term) continue;
		if (!/\p{L}/u.test(term.term)) continue;
		const list = out.get(e.source) ?? [];
		if (!list.includes(term.term.trim())) list.push(term.term.trim());
		out.set(e.source, list);
	}
	return out;
}

/**
 * Where the terms a clause defines are used in other clauses: `defines` (this clause → the
 * term), then `uses` (another clause or one of its statements → the term). For each using
 * clause, the terms and the first paragraph that uses them.
 */
function termsUsedElsewhere(
	kg: KnowledgeGraph,
	clauseId: string,
	nodesById: Map<string, ParagraphNode>
): Array<{ clauseId: string; terms: KgDefinedTerm[]; paragraphId: string }> {
	const termById = new Map(kg.definedTerms.map((t) => [t.id, t] as const));
	const defined = new Set(
		kg.edges
			.filter((e) => e.type === 'defines' && e.source === clauseId && termById.has(e.target))
			.map((e) => e.target)
	);
	const statementById = new Map(deonticNodes(kg).map((v) => [v.id, v] as const));
	const clauseById = new Map(kg.clauses.map((c) => [c.id, c] as const));
	const users = new Map<string, { terms: KgDefinedTerm[]; paragraphIds: string[] }>();
	for (const e of kg.edges) {
		if (e.type !== 'uses' || !defined.has(e.target)) continue;
		const term = termById.get(e.target) as KgDefinedTerm;
		if (!/\p{L}/u.test(term.term) || !term.definition.trim()) continue;
		const statement = statementById.get(e.source);
		const user = statement?.clauseId ?? (clauseById.has(e.source) ? e.source : null);
		if (!user || user === clauseId) continue;
		const where = (statement?.paragraphIds ?? clauseById.get(user)?.paragraphIds ?? []).filter(
			(pid) => nodesById.has(pid)
		);
		const entry = users.get(user) ?? { terms: [], paragraphIds: [] };
		if (!entry.terms.includes(term)) entry.terms.push(term);
		entry.paragraphIds.push(...where);
		users.set(user, entry);
	}
	return [...users].flatMap(([user, entry]) => {
		const first = [...entry.paragraphIds].sort(
			(a, b) => paragraphEnum(a, nodesById) - paragraphEnum(b, nodesById)
		)[0];
		return first ? [{ clauseId: user, terms: entry.terms, paragraphId: first }] : [];
	});
}

export function clauseUsesFrom(
	kg: KnowledgeGraph
): Map<string, Array<{ clauseId: string; terms: string[] }>> {
	const out = new Map<string, Array<{ clauseId: string; terms: string[] }>>();
	const order = new Map(kg.clauses.map((c, i) => [c.id, i] as const));
	for (const clause of kg.clauses) {
		const byClause = new Map<string, string[]>();
		for (const { term, definedIn: at } of termsDefinedElsewhere(kg, clause.id)) {
			byClause.set(at, [...(byClause.get(at) ?? []), term.term.trim()]);
		}
		if (byClause.size === 0) continue;
		out.set(
			clause.id,
			[...byClause]
				.sort(([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
				.map(([clauseId, terms]) => ({ clauseId, terms }))
		);
	}
	return out;
}

export function buildPairPayload(
	kg: KnowledgeGraph,
	pair: PairScores,
	nodesById: Map<string, ParagraphNode>,
	statementIds?: readonly string[],
	/** The clause picked in the table. The document links its paragraphs only to the sentences
	 *  that modify it (`modifies`) and the clauses it depends on (`depends_on`); with no clause
	 *  picked, nothing is linked. */
	clauseId?: string | null,
	/** Paint each statement's conditions too, and link the ones written apart. */
	withConditions = false
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
	const conditionsOf = withConditions
		? conditionsByStatement(kg)
		: new Map<string, KgCondition[]>();
	// A glossary: the picked clause's words whose meaning is written in another clause, marked
	// in its sentences, with the definition on hover.
	const terms = clauseId ? termsDefinedElsewhere(kg, clauseId) : [];
	const termWords = terms.map((t) => t.term.term);
	for (const v of statements) {
		const score = pair.nodeScores[v.id] ?? 0;
		paintStatement(add, v, spanOwners, conditionsOf.get(v.id) ?? [], termWords);
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

	for (const { term, definedIn } of terms) {
		const where = clauseById.get(definedIn);
		const place = sectionOf(where?.ref) ?? where?.heading;
		add(
			term.term,
			`kg-${term.id}`,
			'definedTerm',
			`${term.definition.trim()}${place ? ` (defined in ${place})` : ''}`
		);
	}

	// The line in the margin means "read these together", so it only joins what the graph
	// joins. Paragraphs that merely hold statements of the pair stay painted, unlinked.
	const partners = clauseId ? linkPartners(kg, clauseId, nodesById) : [];
	for (const id of new Set(partners.flatMap((p) => (p.statementId ? [p.statementId] : [])))) {
		const v = byId.get(id);
		if (v) for (const span of evidenceLabels(v, spanOwners)) add(span, `kg-${v.id}`, v.kind);
	}
	const partnerAt = new Map<string, LinkPartner>();
	for (const p of partners) {
		if (!nodesById.has(p.paragraphId) || p.paragraphId === anchorParagraphId) continue;
		if (!partnerAt.has(p.paragraphId)) partnerAt.set(p.paragraphId, p);
	}
	for (const pid of partnerAt.keys()) paragraphSet.add(pid);
	// Each word the clause uses with its meaning written in another clause is linked to the
	// paragraph that defines it (`uses`), in the order those paragraphs come. Terms defined in
	// one paragraph share its line. At most USES_SHOWN lines; the last says how many more.
	const usesAt = new Map<string, { terms: string[]; definedIn: string }>();
	let usesHidden = 0;
	const byDefinition = terms
		.map(({ term, definedIn }) => ({
			term,
			definedIn,
			paragraphId: term.paragraphIds
				.filter((pid) => nodesById.has(pid))
				.sort((a, b) => paragraphEnum(a, nodesById) - paragraphEnum(b, nodesById))[0],
		}))
		.filter((t): t is { term: KgDefinedTerm; definedIn: string; paragraphId: string } =>
			Boolean(t.paragraphId)
		)
		.sort(
			(a, b) => paragraphEnum(a.paragraphId, nodesById) - paragraphEnum(b.paragraphId, nodesById)
		);
	for (const { term, definedIn, paragraphId } of byDefinition) {
		if (paragraphId === anchorParagraphId || partnerAt.has(paragraphId)) continue;
		const found = usesAt.get(paragraphId);
		if (found) found.terms.push(term.term.trim());
		else if (usesAt.size < USES_SHOWN)
			usesAt.set(paragraphId, {
				terms: [term.term.trim()],
				definedIn,
			});
		else usesHidden += 1;
	}
	for (const pid of usesAt.keys()) paragraphSet.add(pid);
	const lastUses = [...usesAt.keys()].at(-1);
	// The other way round: the words this clause defines, linked to the first paragraph of each
	// clause that uses them (`defines`, then `uses`). The same cap, and the words are marked
	// with their definition wherever the lines reach.
	const definesAt = new Map<string, { terms: string[]; usedIn: string }>();
	let definesHidden = 0;
	const usedElsewhere = clauseId
		? termsUsedElsewhere(kg, clauseId, nodesById).sort(
				(a, b) => paragraphEnum(a.paragraphId, nodesById) - paragraphEnum(b.paragraphId, nodesById)
			)
		: [];
	for (const use of usedElsewhere) {
		for (const term of use.terms) {
			add(term.term, `kg-${term.id}`, 'definedTerm', term.definition.trim());
			for (const pid of term.paragraphIds) if (nodesById.has(pid)) paragraphSet.add(pid);
		}
		const pid = use.paragraphId;
		if (pid === anchorParagraphId || partnerAt.has(pid) || usesAt.has(pid)) continue;
		const names = use.terms.map((t) => t.term.trim());
		if (definesAt.size < USES_SHOWN) definesAt.set(pid, { terms: names, usedIn: use.clauseId });
		else definesHidden += 1;
	}
	for (const pid of definesAt.keys()) paragraphSet.add(pid);
	const lastDefines = [...definesAt.keys()].at(-1);
	// A condition written apart from its statement is linked to it as well.
	const conditionAt = new Map<string, { lead: string; trigger: string }>();
	for (const v of statements) {
		for (const c of conditionsElsewhere(v, conditionsOf.get(v.id) ?? [])) {
			const pid = c.paragraphId;
			if (!nodesById.has(pid) || pid === anchorParagraphId) continue;
			if (partnerAt.has(pid) || usesAt.has(pid) || definesAt.has(pid) || conditionAt.has(pid))
				continue;
			conditionAt.set(pid, c);
		}
	}
	for (const pid of conditionAt.keys()) paragraphSet.add(pid);
	const numberOf = (id: string) => {
		const clause = clauseById.get(id);
		return sectionOf(clause?.ref) ?? clause?.heading ?? id;
	};
	const present = [...paragraphSet].sort(
		(a, b) => paragraphEnum(a, nodesById) - paragraphEnum(b, nodesById)
	);

	return {
		anchorParagraphId,
		anchorLabel: clauseId ? numberOf(clauseId) : null,
		relatedParagraphs: [
			...[...partnerAt.values()].map((p) => ({
				node: nodesById.get(p.paragraphId) as ParagraphNode,
				relation: { kind: p.kind, from: numberOf(p.from), to: numberOf(p.to) },
			})),
			...[...usesAt].map(([pid, u]) => ({
				node: nodesById.get(pid) as ParagraphNode,
				relation: {
					kind: 'uses' as const,
					terms: u.terms,
					definedIn: numberOf(u.definedIn),
					more: pid === lastUses ? usesHidden : 0,
				},
			})),
			...[...definesAt].map(([pid, d]) => ({
				node: nodesById.get(pid) as ParagraphNode,
				relation: {
					kind: 'defines' as const,
					terms: d.terms,
					usedIn: numberOf(d.usedIn),
					more: pid === lastDefines ? definesHidden : 0,
				},
			})),
			...[...conditionAt].map(([pid, c]) => ({
				node: nodesById.get(pid) as ParagraphNode,
				relation: { kind: 'condition' as const, lead: c.lead, trigger: c.trigger },
			})),
		].sort((a, b) => paragraphEnum(a.node.id, nodesById) - paragraphEnum(b.node.id, nodesById)),
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
			anchorLabel: null,
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
