import type { KgDeontic, KnowledgeGraph } from '@/types/knowledge';
import type { Side } from '@/features/docx/utils/knowledge/mirror';

export interface BenchTopic {
	key: string;
	present: boolean;
	hits: number;
	spans: string[];
	paragraphIds: string[];
}

export interface Bench {
	contractType: string;
	peers: number;
	topics: BenchTopic[];
}

/** rare: here but uncommon · missing: common but absent · absent: rare and absent. */
export type Group = 'rare' | 'missing' | 'usual' | 'absent';

export interface BenchRow extends BenchTopic {
	label: string;
	rate: number;
	group: Group;
	/** Parties the matched statements serve. */
	sides: Side[];
	ids: string[];
	refs: string[];
}

const RARE = 0.5;
const COMMON = 0.25;

const FIXES: Record<string, string> = {
	'Rofr/Rofo/Rofn': 'Right of first refusal / offer',
	'Ip Ownership Assignment': 'IP ownership assignment',
	'Joint Ip Ownership': 'Joint IP ownership',
	'Unlimited/All-You-Can-Eat-License': 'Unlimited license',
};

export function topicLabel(key: string): string {
	if (FIXES[key]) return FIXES[key];
	const lower = key.toLowerCase();
	return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function groupOf(present: boolean, rate: number): Group {
	if (present) return rate < RARE ? 'rare' : 'usual';
	return rate >= COMMON ? 'missing' : 'absent';
}

export function shapeBench(bench: Bench, kg: KnowledgeGraph, aId: string, bId: string): BenchRow[] {
	const stmts: KgDeontic[] = [...kg.obligations, ...kg.rights, ...kg.prohibitions];
	const byPara = new Map<string, KgDeontic[]>();
	for (const s of stmts) {
		for (const pid of s.paragraphIds) byPara.set(pid, [...(byPara.get(pid) ?? []), s]);
	}
	const refOf = new Map(kg.clauses.map((c) => [c.id, c.ref] as const));
	const rightIds = new Set(kg.rights.map((r) => r.id));

	const rows = bench.topics.map((t): BenchRow => {
		const found = [...new Set(t.paragraphIds.flatMap((pid) => byPara.get(pid) ?? []))];
		// Whoever holds the right is who the topic serves; the duties around it are its price.
		const rights = found.filter((s) => rightIds.has(s.id));
		const sides = new Set<Side>();
		for (const s of rights.length ? rights : found) {
			if (s.benefitPartyId === aId) sides.add('a');
			if (s.benefitPartyId === bId) sides.add('b');
		}
		const refs = [...new Set(found.map((s) => refOf.get(s.clauseId ?? '')).filter(Boolean))];
		const rate = bench.peers ? t.hits / bench.peers : 0;
		return {
			...t,
			label: topicLabel(t.key),
			rate,
			group: groupOf(t.present, rate),
			sides: (['a', 'b'] as const).filter((x) => sides.has(x)),
			ids: found.map((s) => s.id),
			refs: refs as string[],
		};
	});

	const order: Record<Group, number> = { rare: 0, missing: 1, usual: 2, absent: 3 };
	return rows.sort(
		(x, y) =>
			order[x.group] - order[y.group] || (x.group === 'rare' ? x.rate - y.rate : y.rate - x.rate)
	);
}
