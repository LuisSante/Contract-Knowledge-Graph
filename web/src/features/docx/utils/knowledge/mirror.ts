import type { KgDeontic, KnowledgeGraph } from '@/types/knowledge';
import { finePrint, overlap, termOf, tokens } from '@/features/docx/utils/knowledge/fine-print';

export type Side = 'a' | 'b';

// Only what either party could plausibly hold. Making, delivering and paying are
// the roles themselves: pairing them would flag half the contract as a gap.
export const FAMILIES = [
	{ id: 'renewal', label: 'Renewal', rx: /renew|extend (?:the )?term/i },
	{ id: 'exit', label: 'Leaving the contract', rx: /terminat|cancel the agreement/i },
	{ id: 'assign', label: 'Assignment', rx: /assign|transfer|pledge|security interest/i },
	{ id: 'audit', label: 'Audits and control', rx: /audit|inspect/i },
	{ id: 'liability', label: 'Liability', rx: /liab|indemn|damages|injunct|equitable relief/i },
] as const;

export type FamilyId = (typeof FAMILIES)[number]['id'];

// Fine print that decides who is favoured; the rest is noted but does not split a pair.
const DECISIVE = new Set(['sole discretion', 'without cause', 'needs consent', 'capped']);

export const MATCH = 0.5;

export interface Hold {
	s: KgDeontic;
	marks: string[];
	term: string | null;
}

export type Status = 'same' | 'onlyA' | 'onlyB' | 'fine';

export interface MirrorRow {
	id: string;
	family: FamilyId;
	label: string;
	a: Hold | null;
	b: Hold | null;
	status: Status;
	/** Best candidate on the missing side, even when it fell short of a match. */
	nearest: { s: KgDeontic; score: number } | null;
	pool: number;
}

export interface Mirror {
	rows: MirrorRow[];
	counts: Record<Status, number>;
}

function familyOf(s: KgDeontic): FamilyId | null {
	const text = `${s.action} ${s.summary}`;
	return FAMILIES.find((f) => f.rx.test(text))?.id ?? null;
}

const hold = (s: KgDeontic): Hold => ({ s, marks: finePrint(s.text ?? ''), term: termOf(s) });

export function buildMirror(kg: KnowledgeGraph, aId: string, bId: string): Mirror {
	const names = kg.parties
		.filter((p) => p.id === aId || p.id === bId)
		.flatMap((p) => [p.name, ...p.aliases]);
	const bag = new Map<string, Set<string>>();
	const bagOf = (s: KgDeontic) => {
		let t = bag.get(s.id);
		if (!t) bag.set(s.id, (t = tokens(`${s.action} ${s.summary}`, names)));
		return t;
	};

	const rows: MirrorRow[] = [];
	for (const fam of FAMILIES) {
		const own = (side: string) =>
			kg.rights.filter((r) => r.benefitPartyId === side && familyOf(r) === fam.id);
		const as = own(aId);
		const bs = own(bId);

		const pairs = as
			.flatMap((x) => bs.map((y) => ({ x, y, score: overlap(bagOf(x), bagOf(y)) })))
			.sort((p, q) => q.score - p.score);
		const usedA = new Set<string>();
		const usedB = new Set<string>();
		for (const { x, y, score } of pairs) {
			if (score < MATCH || usedA.has(x.id) || usedB.has(y.id)) continue;
			usedA.add(x.id);
			usedB.add(y.id);
			const a = hold(x);
			const b = hold(y);
			const split = [...a.marks, ...b.marks].some(
				(m) => DECISIVE.has(m) && !(a.marks.includes(m) && b.marks.includes(m))
			);
			rows.push({
				id: `${x.id}~${y.id}`,
				family: fam.id,
				label: x.action,
				a,
				b,
				status: split ? 'fine' : 'same',
				nearest: null,
				pool: 0,
			});
		}

		const lonely = (list: KgDeontic[], used: Set<string>, others: KgDeontic[], side: Side) => {
			for (const s of list) {
				if (used.has(s.id)) continue;
				const best = others
					.map((o) => ({ s: o, score: overlap(bagOf(s), bagOf(o)) }))
					.sort((p, q) => q.score - p.score)[0];
				rows.push({
					id: s.id,
					family: fam.id,
					label: s.action,
					a: side === 'a' ? hold(s) : null,
					b: side === 'b' ? hold(s) : null,
					status: side === 'a' ? 'onlyA' : 'onlyB',
					nearest: best ?? null,
					pool: kg.rights.filter((r) => r.benefitPartyId === (side === 'a' ? bId : aId)).length,
				});
			}
		};
		lonely(as, usedA, bs, 'a');
		lonely(bs, usedB, as, 'b');
	}

	const rank: Record<Status, number> = { onlyA: 0, onlyB: 0, fine: 1, same: 2 };
	const famRank = new Map(FAMILIES.map((f, i) => [f.id, i]));
	rows.sort(
		(x, y) =>
			rank[x.status] - rank[y.status] || (famRank.get(x.family) ?? 0) - (famRank.get(y.family) ?? 0)
	);
	const counts: Record<Status, number> = { same: 0, onlyA: 0, onlyB: 0, fine: 0 };
	for (const r of rows) counts[r.status]++;
	return { rows, counts };
}
