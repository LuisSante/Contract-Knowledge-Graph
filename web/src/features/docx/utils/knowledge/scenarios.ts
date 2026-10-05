import type { DeonticKind, KgCondition, KgDeontic, KnowledgeGraph } from '@/types/knowledge';
import { termOf } from '@/features/docx/utils/knowledge/fine-print';
import type { Side } from '@/features/docx/utils/knowledge/mirror';

// A situation is the event a condition waits for. A trigger can belong to more than
// one: "if the rejected shipment is not paid" is both a defect and a payment.
export const EVENTS = [
	{
		id: 'defect',
		title: 'A delivery is defective',
		rx: /non-?conform|defect|reject|latent|warrant/i,
	},
	{
		id: 'breach',
		title: 'A party breaches',
		rx: /breach|default|fails? to (?:perform|comply|cure)/i,
	},
	{ id: 'payment', title: 'A payment is late', rx: /\bpay|invoice|\bfees?\b/i },
	{
		id: 'supply',
		title: 'Supply falls short',
		rx: /shortage|supply failure|unable to supply|second.source|firm zone|forecast/i,
	},
	{ id: 'change', title: 'The product changes', rx: /\bchange|modif/i },
	{ id: 'exit', title: 'The contract ends', rx: /terminat|expir/i },
	{ id: 'insolvency', title: 'A party goes insolvent', rx: /insolv|bankrupt|receiver|liquidat/i },
] as const;

export type EventId = (typeof EVENTS)[number]['id'];

const LIMIT =
	/sole and exclusive remedy|shall not be (?:liable|responsible)|in no event|shall not exceed|free from responsibility|no liability/i;

export type Stmt = KgDeontic & { kind: DeonticKind };

export interface Step {
	s: Stmt;
	cond: KgCondition;
	side: Side | null;
	ref: string | null;
	term: string | null;
	/** A power the other side gets over the reader. */
	risk: boolean;
}

export interface Scenario {
	id: EventId;
	title: string;
	steps: Step[];
	limits: Array<{ s: Stmt; side: Side | null; ref: string | null }>;
	/** noParty: the text names nobody · noTerm: the other side owes it with no deadline. */
	gaps: Array<{ kind: 'noParty' | 'noTerm'; action: string; paragraphId: string | null }>;
	clauseIds: string[];
}

const holderOf = (s: Stmt) => (s.kind === 'right' ? s.benefitPartyId : s.burdenPartyId);
const paraNo = (pid: string | undefined) => Number(/-p-(\d+)$/.exec(pid ?? '')?.[1] ?? 1e9);
const sections = (text: string) =>
	[...text.matchAll(/(?:section|article)s?\s+(\d+(?:\.\d+)*)/gi)].map((m) => m[1]);
const topOf = (ref: string | null) => /(\d+)/.exec(ref ?? '')?.[1] ?? null;

export function buildScenarios(
	kg: KnowledgeGraph,
	aId: string,
	bId: string,
	reader: Side
): Scenario[] {
	const stmts: Stmt[] = [
		...kg.obligations.map((s) => ({ ...s, kind: 'obligation' as const })),
		...kg.rights.map((s) => ({ ...s, kind: 'right' as const })),
		...kg.prohibitions.map((s) => ({ ...s, kind: 'prohibition' as const })),
	];
	const byId = new Map(stmts.map((s) => [s.id, s]));
	const refOf = (s: KgDeontic) => kg.clauses.find((c) => c.id === s.clauseId)?.ref ?? null;
	const sideOf = (s: Stmt): Side | null => {
		const holder = holderOf(s);
		return holder === aId ? 'a' : holder === bId ? 'b' : null;
	};
	const other: Side = reader === 'a' ? 'b' : 'a';

	const out: Scenario[] = [];
	for (const ev of EVENTS) {
		const seen = new Set<string>();
		const steps: Step[] = [];
		for (const cond of kg.conditions) {
			const s = cond.gatesId ? byId.get(cond.gatesId) : undefined;
			if (!s || seen.has(s.id) || !ev.rx.test(cond.trigger)) continue;
			seen.add(s.id);
			const side = sideOf(s);
			steps.push({
				s,
				cond,
				side,
				ref: refOf(s),
				term: termOf(s),
				risk: s.kind === 'right' && side === other,
			});
		}
		if (steps.length < 2) continue;
		// Document order: clause ids are numbered as extracted, not as they appear.
		steps.sort((x, y) => paraNo(x.s.paragraphIds[0]) - paraNo(y.s.paragraphIds[0]));

		const clauseIds = [...new Set(steps.map((st) => st.s.clauseId).filter(Boolean))] as string[];
		const tops = new Set(steps.map((st) => topOf(st.ref)).filter(Boolean));
		const limits = stmts
			.filter((s) => !seen.has(s.id) && LIMIT.test(`${s.action} ${s.text}`))
			.filter(
				(s) =>
					clauseIds.includes(s.clauseId ?? '') ||
					tops.has(topOf(refOf(s))) ||
					sections(s.text ?? '').some((n) => tops.has(n.split('.')[0]))
			)
			.map((s) => ({ s, side: sideOf(s), ref: refOf(s) }));

		const gaps: Scenario['gaps'] = [];
		for (const st of steps) {
			const at = { action: st.s.action, paragraphId: st.s.paragraphIds[0] ?? null };
			if (st.side === null) gaps.push({ kind: 'noParty', ...at });
			else if (st.side === other && st.s.kind === 'obligation' && !st.term)
				gaps.push({ kind: 'noTerm', ...at });
		}

		out.push({ id: ev.id, title: ev.title, steps, limits, gaps, clauseIds });
	}
	return out;
}
