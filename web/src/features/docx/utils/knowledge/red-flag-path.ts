import {
	deonticNodes,
	type KgCondition,
	type KgDeonticNode,
	type KnowledgeGraph,
} from '@/types/knowledge';
import { conditionParty } from '@/features/docx/utils/knowledge/graph-payload';
import {
	statementTiming,
	type StatementTiming,
} from '@/features/docx/utils/knowledge/statement-timing';

/**
 * Why a red flag of the dataset is one, read from the graph alone: the statements it matched,
 * who carries them and who gains, what sets them off, how much and by when, where they live,
 * what follows if they are not kept and what changes them. Fields and edges as they are, no
 * model and no score. One step from each statement, never a chain.
 */

/** A condition of a statement, with the one party its trigger names (its conduct sets it off). */
export interface PathCondition {
	condition: KgCondition;
	partyId: string | null;
}

/** A statement of the path with what the graph says around it. */
export interface PathStatement {
	statement: KgDeonticNode;
	/** Whose it is: the party an obligation or prohibition binds, a right's holder. */
	ownerId: string | null;
	/** The other side: who gains from an obligation or prohibition, who bears a right. */
	otherId: string | null;
	conditions: PathCondition[];
	timing: StatementTiming | undefined;
}

/** A statement of another clause that `depends_on` this one's clause: what follows from it,
 *  such as the damages owed when the clause is not kept. */
export interface PathConsequence extends PathStatement {
	clauseId: string | null;
}

/** A clause that `modifies` the statement's clause, by the statement that does it when the edge
 *  names one. */
export interface PathModifier {
	clauseId: string;
	statement: KgDeonticNode | null;
}

export interface FlagPath {
	statements: PathStatement[];
	/** The clause the path's statements live in, in their order; usually one. */
	clauseIds: string[];
	consequences: PathConsequence[];
	modifiers: PathModifier[];
	/** The other party's statements of the same type in the same clause: what it gets in return,
	 *  or nothing. Only when the path's statements belong to a single party. */
	counterpart: { partyId: string; statements: KgDeonticNode[] } | null;
}

const ownerOf = (s: KgDeonticNode) => (s.kind === 'right' ? s.benefitPartyId : s.burdenPartyId);
const otherOf = (s: KgDeonticNode) => (s.kind === 'right' ? s.burdenPartyId : s.benefitPartyId);

/**
 * The path of a flag from the statements `detect` found for it. A statement written in another
 * paragraph than the flag's, a twin of another clause that shares six words with it, is left
 * out; when none is in the flag's paragraph they all stay.
 */
export function flagPath(
	kg: KnowledgeGraph,
	statementIds: string[],
	flagParagraphId: string | null
): FlagPath | null {
	const byId = new Map(deonticNodes(kg).map((s) => [s.id, s] as const));
	const found = [...new Set(statementIds)].flatMap((id) => byId.get(id) ?? []);
	const inParagraph = flagParagraphId
		? found.filter((s) => s.paragraphIds.includes(flagParagraphId))
		: [];
	const chosen = inParagraph.length > 0 ? inParagraph : found;
	if (chosen.length === 0) return null;

	const named = conditionParty(kg);
	const timing = statementTiming(kg);
	const around = (s: KgDeonticNode): PathStatement => ({
		statement: s,
		ownerId: ownerOf(s),
		otherId: otherOf(s),
		conditions: kg.conditions
			.filter((c) => c.gatesId === s.id)
			.map((condition) => ({ condition, partyId: named.get(condition.id) ?? null })),
		timing: timing.get(s.id),
	});

	const clauseIds = [...new Set(chosen.flatMap((s) => (s.clauseId ? [s.clauseId] : [])))];
	const home = new Set(clauseIds);
	const clauseExists = new Set(kg.clauses.map((c) => c.id));

	const consequences: PathConsequence[] = [];
	const modifiers: PathModifier[] = [];
	for (const edge of kg.edges) {
		if (!home.has(edge.target)) continue;
		const source = byId.get(edge.source);
		const from = source?.clauseId ?? (clauseExists.has(edge.source) ? edge.source : null);
		// Only between different clauses: a clause that changes itself says nothing new here.
		if (!from || home.has(from)) continue;
		if (
			edge.type === 'depends_on' &&
			source &&
			!consequences.some((c) => c.statement.id === source.id)
		) {
			consequences.push({ ...around(source), clauseId: source.clauseId });
		}
		if (edge.type === 'modifies' && !modifiers.some((m) => m.clauseId === from)) {
			modifiers.push({ clauseId: from, statement: source ?? null });
		}
	}

	const owners = new Set(chosen.map(ownerOf));
	const owner = owners.size === 1 ? [...owners][0] : null;
	const otherParty = owner ? (kg.parties.find((p) => p.id !== owner)?.id ?? null) : null;
	const kinds = new Set(chosen.map((s) => s.kind));
	const counterpart =
		owner && otherParty && kg.parties.length === 2
			? {
					partyId: otherParty,
					statements: [...byId.values()].filter(
						(s) =>
							s.clauseId !== null &&
							home.has(s.clauseId) &&
							kinds.has(s.kind) &&
							ownerOf(s) === otherParty
					),
				}
			: null;

	return { statements: chosen.map(around), clauseIds, consequences, modifiers, counterpart };
}
