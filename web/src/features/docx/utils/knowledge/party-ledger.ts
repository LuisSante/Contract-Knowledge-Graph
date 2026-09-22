import type { DeonticKind, KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';

/**
 * Party-centric ledger over the deontic KG.
 *
 *   magnitude(v|P) = severity(kind)                unsigned, every statement — visual weight
 *   impact(v|P)    = magnitude · sign(tone(v,P))   signed, P's statements only — the ledger
 *
 * Ranking is NOT computed here. Clause importance is the personalized PageRank seeded on
 * clauses that the server returns from `/clause_importance`; a second walk seeded on the
 * party node used to run here and was retired — it ordered by size (rho = 0.882 against
 * counting statements) and left four clauses at exactly zero.
 */

export type DeonticTone = 'burden' | 'benefit';

export interface KgLedgerClause {
	id: string;
	label: string;
	/** Summed magnitude of this clause's provisions that burden the party. */
	burden: number;
	/** ...and of the ones that benefit it. */
	benefit: number;
}

export interface KgLedger {
	partyId: string;
	partyName: string;
	obligations: number;
	rights: number;
	prohibitions: number;
	burdenWeight: number;
	benefitWeight: number;
	burdenCount: number;
	benefitCount: number;
	topClauses: KgLedgerClause[];
}

export interface PartyScores {
	deonticScore: Map<string, number>;
	clauseScore: Map<string, number>;
	nodeScore: Map<string, number>;
	toneByDeontic: Map<string, DeonticTone>;
	ledger: KgLedger;
}

export type DeonticSeverity = Record<DeonticKind, number>;

export const DEFAULT_SEVERITY: DeonticSeverity = {
	prohibition: 1.0,
	obligation: 0.7,
	right: 0.3,
};

const TOP_CLAUSES = 5;

function normalize(values: Map<string, number>): Map<string, number> {
	let peak = 0;
	for (const value of values.values()) peak = Math.max(peak, Math.abs(value));
	if (peak <= 0) return new Map(values);
	return new Map([...values].map(([id, value]) => [id, value / peak] as const));
}

export function computePartyScores(
	kg: KnowledgeGraph,
	partyId: string,
	severity: DeonticSeverity = DEFAULT_SEVERITY
): PartyScores {
	const deontic = deonticNodes(kg);

	// 2. Which statements concern this party (tone from obligor/beneficiary).
	const toneByDeontic = new Map<string, DeonticTone>();
	for (const v of deontic) {
		if (v.kind !== 'right' && v.burdenPartyId === partyId) {
			toneByDeontic.set(v.id, 'burden');
		} else if (v.benefitPartyId === partyId) {
			toneByDeontic.set(v.id, 'benefit'); // a right it holds, or a duty owed to it
		}
	}

	// 3. Magnitude = severity for every statement.
	const deonticMagnitude = new Map<string, number>();
	for (const v of deontic) deonticMagnitude.set(v.id, severity[v.kind]);

	// 4. Roll up to the clause: total magnitude, plus the burden/benefit split.
	const clauseMagnitude = new Map<string, number>();
	const clauseBurden = new Map<string, number>();
	const clauseBenefit = new Map<string, number>();
	for (const v of deontic) {
		if (!v.clauseId) continue;
		const magnitude = deonticMagnitude.get(v.id) ?? 0;
		clauseMagnitude.set(v.clauseId, (clauseMagnitude.get(v.clauseId) ?? 0) + magnitude);
		const tone = toneByDeontic.get(v.id);
		if (tone === 'burden')
			clauseBurden.set(v.clauseId, (clauseBurden.get(v.clauseId) ?? 0) + magnitude);
		else if (tone === 'benefit')
			clauseBenefit.set(v.clauseId, (clauseBenefit.get(v.clauseId) ?? 0) + magnitude);
	}

	// 5. Each quantity against its own peak.
	const deonticScore = normalize(deonticMagnitude);
	const clauseScore = normalize(clauseMagnitude);

	const nodeScore = new Map<string, number>();
	for (const [id, s] of deonticScore) nodeScore.set(id, s);
	for (const [id, s] of clauseScore) nodeScore.set(id, s);
	nodeScore.set(partyId, 1);

	// 6. Party-level tallies (counts + the burden/benefit bar).
	const kindById = new Map(deontic.map((v) => [v.id, v.kind]));
	let obligations = 0;
	let rights = 0;
	let prohibitions = 0;
	let burdenWeight = 0;
	let benefitWeight = 0;
	let burdenCount = 0;
	let benefitCount = 0;
	for (const [statementId, tone] of toneByDeontic) {
		const kind = kindById.get(statementId);
		if (!kind) continue;
		if (kind === 'obligation') obligations += 1;
		else if (kind === 'right') rights += 1;
		else prohibitions += 1;
		const magnitude = deonticMagnitude.get(statementId) ?? 0;
		if (tone === 'burden') {
			burdenWeight += magnitude;
			burdenCount += 1;
		} else {
			benefitWeight += magnitude;
			benefitCount += 1;
		}
	}

	// 7. Heaviest clauses, ranked by total involvement (burden + benefit).
	const clauseLabel = (id: string): string => {
		const clause = kg.clauses.find((c) => c.id === id);
		return clause?.ref || clause?.heading || id;
	};
	const topClauses: KgLedgerClause[] = [
		...new Set([...clauseBurden.keys(), ...clauseBenefit.keys()]),
	]
		.map((id) => ({
			id,
			label: clauseLabel(id),
			burden: clauseBurden.get(id) ?? 0,
			benefit: clauseBenefit.get(id) ?? 0,
		}))
		.sort((a, b) => b.burden + b.benefit - (a.burden + a.benefit))
		.slice(0, TOP_CLAUSES);

	const party = kg.parties.find((p) => p.id === partyId);
	const ledger: KgLedger = {
		partyId,
		partyName: party?.name ?? partyId,
		obligations,
		rights,
		prohibitions,
		burdenWeight,
		benefitWeight,
		burdenCount,
		benefitCount,
		topClauses,
	};

	return {
		deonticScore,
		clauseScore,
		nodeScore,
		toneByDeontic,
		ledger,
	};
}
