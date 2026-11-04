import {
	deonticNodes,
	type KgCondition,
	type KgDefinedTerm,
	type KgDeonticNode,
	type KgReference,
	type KgValue,
	type KnowledgeGraph,
} from '@/types/knowledge';
import {
	conditionParty,
	reciprocalStatements,
} from '@/features/docx/utils/knowledge/graph-payload';
import {
	statementTiming,
	type StatementTiming,
} from '@/features/docx/utils/knowledge/statement-timing';
import type { FlagMatch } from '@/features/docx/utils/knowledge/red-flags';
import type { RedFlag } from '@/types/red-flags';

/**
 * Why a statement a red flag matched is risky, read from the graph by hops, each hop along
 * the edges fixed for it and never «everything k steps away»:
 *
 * - hop 0: the statement;
 * - hop 1: what hangs from it: its clause, who carries it and who gains, its conditions
 *   (`gatesId`), its values and deadline, and the edges that leave it for another clause;
 * - hop 2: the other statements of its clause, and the clauses joined to it by `modifies`,
 *   `depends_on` or `references`, each edge read in its own direction;
 * - hop 3: the conditions and values of those statements.
 *
 * Next to that, what is inferred by comparing fields (who sets it off, what the other party
 * gets in return, what could protect the exposed party, figures that disagree), kept apart
 * so it is never shown as extracted; and what the graph lacks, said instead of filled in.
 * No model and no score.
 */

export type LinkType = 'modifies' | 'depends_on' | 'references';
const LINK_TYPES = new Set<string>(['modifies', 'depends_on', 'references']);

export interface HopCondition {
	condition: KgCondition;
	/** The one party its trigger names: its conduct sets it off. */
	partyId: string | null;
	/** A red flag of the dataset matched this condition. */
	flagged: boolean;
}

export interface HopStatement {
	statement: KgDeonticNode;
	/** Whose it is: the party an obligation or prohibition binds, a right's holder. */
	ownerId: string | null;
	/** The other side: who gains from an obligation or prohibition, who bears a right. */
	otherId: string | null;
	conditions: HopCondition[];
	timing: StatementTiming | undefined;
	flagged: boolean;
}

/** An edge between two clauses, read in its own direction: `from` modifies, depends on or
 *  refers to `to`. */
export interface HopLink {
	type: LinkType;
	fromClauseId: string;
	toClauseId: string;
	/** The statement the edge leaves from, when it names one, with its conditions and values. */
	statement: HopStatement | null;
	evidence: string;
}

export type Inferred =
	/** The conditions that set it off name one party. */
	| { kind: 'conduct'; partyId: string; count: number; own: boolean }
	/** How many statements of the same type each party has of its own in the clause; `shared`
	 *  counts the pairs both have word for word, set aside as they bind or entitle both alike. */
	| {
			kind: 'counterpart';
			ownerId: string;
			otherId: string;
			owner: number;
			other: number;
			shared: number;
	  }
	/** Rights of the exposed party, in the clause or a linked one, that might limit it. */
	| { kind: 'safeguard'; partyId: string; candidates: HopStatement[] }
	| { kind: 'no-safeguard'; partyId: string }
	/** Two figures of the same unit that differ, between it and a neighbour. */
	| { kind: 'amounts'; unit: string; mine: string; theirs: string; withId: string }
	/** The same action twice in the clause, with a different deadline or frequency. */
	| { kind: 'timing'; action: string; mine: string; theirs: string; withId: string };

export interface FlagHopPath {
	/** Hop 0. */
	root: HopStatement;
	/** The dataset's flags that lead here: the statement's own, or its conditions'. */
	flags: RedFlag[];
	/** Hop 1. */
	clauseId: string | null;
	/** The values that quantify the clause as a whole («15 years»). */
	clauseValues: KgValue[];
	/** Edges leaving the statement for another clause: «§2 modifies §1». */
	outgoing: HopLink[];
	/** External texts it cites, and defined terms it uses: they explain a word, not the risk. */
	cites: KgReference[];
	terms: KgDefinedTerm[];
	/** Hop 2 (their conditions and values are hop 3). */
	siblings: HopStatement[];
	/** Other statements the same flags matched: they share the annotation, not an edge. */
	sameFlag: string[];
	/** Edges from another clause into this one: «§7 modifies §3», «§6 depends on §4». */
	incoming: HopLink[];
	/** Edges from the clause's other statements to another clause. */
	clauseOutgoing: HopLink[];
	/** What the graph does not hold, said rather than filled in. */
	missing: {
		owner: boolean;
		other: boolean;
		condition: boolean;
		timing: boolean;
		links: boolean;
	};
	/** The party that carries it: the one an obligation or prohibition binds, the one a right
	 *  is held against. */
	exposedId: string | null;
	inferred: Inferred[];
}

const ownerOf = (s: KgDeonticNode) => (s.kind === 'right' ? s.benefitPartyId : s.burdenPartyId);
const otherOf = (s: KgDeonticNode) => (s.kind === 'right' ? s.burdenPartyId : s.benefitPartyId);
const norm = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

/** «USD 35.00», «15 years»: a value as one short phrase. */
export function valuePhrase(value: KgValue): string {
	const amount = value.amount.trim();
	const unit = value.unit.trim();
	if (!unit) return amount;
	return value.valueType === 'Currency' ? `${unit} ${amount}` : `${amount} ${unit}`;
}

/** The flags that lead to a statement, by its own words or by a condition gating it. */
export function flagsOfStatement(
	kg: KnowledgeGraph,
	flags: RedFlag[],
	matches: FlagMatch[],
	statementId: string
): RedFlag[] {
	const gated = new Set(kg.conditions.filter((c) => c.gatesId === statementId).map((c) => c.id));
	return flags.filter((_, i) => {
		const m = matches[i];
		return (
			m && (m.statementIds.includes(statementId) || m.conditionIds.some((id) => gated.has(id)))
		);
	});
}

export function flagHopPath(
	kg: KnowledgeGraph,
	statementId: string,
	flags: RedFlag[],
	matches: FlagMatch[]
): FlagHopPath | null {
	const statements = deonticNodes(kg);
	const byId = new Map(statements.map((s) => [s.id, s] as const));
	const root = byId.get(statementId);
	if (!root) return null;

	const flaggedStatements = new Set(matches.flatMap((m) => m.statementIds));
	const flaggedConditions = new Set(matches.flatMap((m) => m.conditionIds));
	const named = conditionParty(kg);
	const timing = statementTiming(kg);
	const around = (s: KgDeonticNode): HopStatement => ({
		statement: s,
		ownerId: ownerOf(s),
		otherId: otherOf(s),
		conditions: kg.conditions
			.filter((c) => c.gatesId === s.id)
			.map((condition) => ({
				condition,
				partyId: named.get(condition.id) ?? null,
				flagged: flaggedConditions.has(condition.id),
			})),
		timing: timing.get(s.id),
		flagged: flaggedStatements.has(s.id),
	});

	const clauseId = root.clauseId;
	const clauseIds = new Set(kg.clauses.map((c) => c.id));
	// Where an edge's end lives: a statement's clause, or the clause itself.
	const clauseOf = (id: string) => byId.get(id)?.clauseId ?? (clauseIds.has(id) ? id : null);
	const link = (type: LinkType, from: string, to: string, sourceId: string, evidence: string) => {
		const source = byId.get(sourceId);
		return {
			type,
			fromClauseId: from,
			toClauseId: to,
			statement: source ? around(source) : null,
			evidence,
		};
	};

	const outgoing: HopLink[] = [];
	const incoming: HopLink[] = [];
	const clauseOutgoing: HopLink[] = [];
	const seen = new Set<string>();
	for (const edge of kg.edges) {
		if (!LINK_TYPES.has(edge.type)) continue;
		const type = edge.type as LinkType;
		const from = clauseOf(edge.source);
		const to = clauseOf(edge.target);
		// Only between different clauses: a clause that changes itself says nothing new here.
		if (!from || !to || from === to) continue;
		const key = `${type}|${edge.source}|${to}`;
		if (seen.has(key)) continue;
		seen.add(key);
		if (edge.source === root.id) outgoing.push(link(type, from, to, edge.source, edge.evidence));
		else if (clauseId && to === clauseId)
			incoming.push(link(type, from, to, edge.source, edge.evidence));
		else if (clauseId && from === clauseId)
			clauseOutgoing.push(link(type, from, to, edge.source, edge.evidence));
	}

	const usedTerms = new Set(
		kg.edges.filter((e) => e.type === 'uses' && e.source === root.id).map((e) => e.target)
	);
	const siblingNodes = clauseId
		? statements.filter((s) => s.clauseId === clauseId && s.id !== root.id)
		: [];
	const siblings = siblingNodes.map(around);
	const rootHop = around(root);
	const clauseValues = clauseId ? kg.values.filter((v) => v.quantifiesId === clauseId) : [];
	const leading = flagsOfStatement(kg, flags, matches, root.id);
	const sameFlag = [
		...new Set(
			flags.flatMap((f, i) => (leading.includes(f) ? (matches[i]?.statementIds ?? []) : []))
		),
	].filter((id) => id !== root.id);

	return {
		root: rootHop,
		flags: leading,
		clauseId,
		clauseValues,
		outgoing,
		cites: kg.references.filter((r) => r.citedById === root.id),
		terms: kg.definedTerms.filter((t) => usedTerms.has(t.id)),
		siblings,
		sameFlag,
		incoming,
		clauseOutgoing,
		missing: {
			owner: rootHop.ownerId === null,
			other: rootHop.otherId === null,
			condition: rootHop.conditions.length === 0,
			timing: !root.deadline?.trim() && !root.frequency?.trim(),
			links: outgoing.length === 0 && incoming.length === 0 && clauseOutgoing.length === 0,
		},
		exposedId: root.burdenPartyId,
		inferred: infer(kg, rootHop, siblings, incoming, outgoing, clauseOutgoing, clauseValues),
	};
}

function infer(
	kg: KnowledgeGraph,
	root: HopStatement,
	siblings: HopStatement[],
	incoming: HopLink[],
	outgoing: HopLink[],
	clauseOutgoing: HopLink[],
	clauseValues: KgValue[]
): Inferred[] {
	const out: Inferred[] = [];
	const s = root.statement;

	// Who sets it off: every condition naming a party names the same one.
	const namers = new Set(root.conditions.map((c) => c.partyId).filter(Boolean));
	if (namers.size === 1) {
		const partyId = [...namers][0] as string;
		out.push({
			kind: 'conduct',
			partyId,
			count: root.conditions.filter((c) => c.partyId === partyId).length,
			own: partyId === root.ownerId,
		});
	}

	// In return: the same type, each party's own, in this clause, with the reciprocal pairs set
	// aside (they bind or entitle both alike). Counts, not weights.
	if (root.ownerId && root.otherId && root.ownerId !== root.otherId) {
		const twins = reciprocalStatements(kg);
		const sameKind = [root, ...siblings].filter((x) => x.statement.kind === s.kind);
		const own = sameKind.filter((x) => !twins.has(x.statement.id));
		out.push({
			kind: 'counterpart',
			ownerId: root.ownerId,
			otherId: root.otherId,
			owner: own.filter((x) => x.ownerId === root.ownerId).length,
			other: own.filter((x) => x.ownerId === root.otherId).length,
			shared: sameKind.filter((x) => twins.has(x.statement.id) && x.ownerId === root.ownerId)
				.length,
		});
	}

	// What could protect the party that carries it: its own rights here or in a linked clause.
	// A right is held against its burden party; an obligation or prohibition binds it.
	const exposed = s.burdenPartyId;
	if (exposed) {
		const linked = [...incoming, ...outgoing, ...clauseOutgoing].flatMap((l) =>
			l.statement ? [l.statement] : []
		);
		const candidates = [...siblings, ...linked].filter(
			(x, i, all) =>
				x.statement.kind === 'right' &&
				x.ownerId === exposed &&
				all.findIndex((y) => y.statement.id === x.statement.id) === i
		);
		out.push(
			candidates.length > 0
				? { kind: 'safeguard', partyId: exposed, candidates }
				: { kind: 'no-safeguard', partyId: exposed }
		);
	}

	// Figures of the same unit that differ, between it and its clause's.
	const valuesOf = (id: string) => kg.values.filter((v) => v.quantifiesId === id);
	const mine = valuesOf(s.id);
	const theirs: Array<{ value: KgValue; withId: string }> = [
		...siblings.flatMap((x) =>
			valuesOf(x.statement.id).map((value) => ({ value, withId: x.statement.id }))
		),
		...clauseValues.map((value) => ({ value, withId: value.quantifiesId ?? '' })),
	];
	for (const a of mine) {
		const unit = norm(a.unit);
		if (!unit) continue;
		const other = theirs.find(
			(b) => norm(b.value.unit) === unit && norm(b.value.amount) !== norm(a.amount)
		);
		if (other)
			out.push({
				kind: 'amounts',
				unit: a.unit.trim(),
				mine: valuePhrase(a),
				theirs: valuePhrase(other.value),
				withId: other.withId,
			});
	}

	// The same action twice in the clause, timed differently.
	const when = (x: KgDeonticNode) =>
		[x.deadline, x.frequency]
			.map((t) => t?.trim())
			.filter(Boolean)
			.join(', ');
	for (const x of siblings) {
		if (norm(x.statement.action) !== norm(s.action)) continue;
		const a = when(s);
		const b = when(x.statement);
		if (a && b && norm(a) !== norm(b))
			out.push({ kind: 'timing', action: s.action, mine: a, theirs: b, withId: x.statement.id });
	}
	return out;
}
