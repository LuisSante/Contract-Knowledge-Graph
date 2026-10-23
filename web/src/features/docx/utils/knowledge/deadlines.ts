import type { DeonticKind, KgDeontic, KnowledgeGraph } from '@/types/knowledge';
import { clauseTitle, sectionOf } from '@/features/docx/utils/knowledge/clause-favour';

/**
 * How precise a deadline is: a count of hours, days or months; a word that fixes no day
 * («promptly», «in advance»); or a fact it waits for («upon termination»).
 */
export type DeadlineKind = 'exact' | 'vague' | 'event';

/** One duty with a time in it. The same duty written once per party is one entry. */
export interface TimedDuty {
	/** The statements it stands for, in document order; the first is the one shown. */
	ids: string[];
	kind: DeonticKind;
	action: string;
	/** Who has to act: the party an obligation or prohibition binds, or a right's holder. */
	actors: string[];
	deadline: string;
	frequency: string;
	/** Null when the duty has a frequency and no deadline. */
	deadlineKind: DeadlineKind | null;
	section: string | null;
}

export type DeadlineGroupKind = 'clause' | 'repeated' | 'term';

export interface DeadlineGroup {
	id: string;
	kind: DeadlineGroupKind;
	title: string;
	section: string | null;
	duties: TimedDuty[];
}

// A number with a unit of time: «30 days», «thirty (30) days», «12 calendar months».
const COUNT =
	/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|forty-five|sixty|ninety)\s*(?:\(\d+\)\s*)?(?:business\s+|calendar\s+|working\s+|consecutive\s+)?(hours?|days?|weeks?|months?|years?|quarters?)\b/i;
const VAGUE =
	/\b(promptly|immediately|as soon as|forthwith|without (?:undue )?delay|reasonabl[ey]|in advance|timely|without notice)\b/i;
// A frequency that holds for as long as the contract does, rather than one that repeats.
const WHOLE_TERM = /\b(term|agreement|in effect|at all times|throughout|as long as)\b/i;

export function deadlineKind(deadline: string, hasDuration: boolean): DeadlineKind {
	if (hasDuration || COUNT.test(deadline)) return 'exact';
	if (VAGUE.test(deadline)) return 'vague';
	return 'event';
}

/** Who has to do something for a statement to hold. */
const actorOf = (kind: DeonticKind, s: KgDeontic) =>
	kind === 'right' ? s.benefitPartyId : s.burdenPartyId;

const paragraphOrder = (s: KgDeontic) => Number(s.paragraphIds[0]?.match(/-p-(\d+)$/)?.[1] ?? 0);

/**
 * The contract's timed duties, read from what the graph already holds: each statement's
 * `deadline` and `frequency`, and the `Duration` values that quantify it. Duties with a
 * deadline are grouped by their top-level clause, in document order; those with only a
 * frequency go to «Again and again» or, when they last the whole contract, «While the
 * contract lasts».
 */
export function deadlineGroups(kg: KnowledgeGraph): DeadlineGroup[] {
	const timed = new Set(
		kg.values.flatMap((v) => (v.valueType === 'Duration' && v.quantifiesId ? [v.quantifiesId] : []))
	);
	const clauseById = new Map(kg.clauses.map((c) => [c.id, c] as const));
	const clauseByRef = new Map(kg.clauses.map((c) => [sectionOf(c.ref), c] as const));

	// The same duty, written once per party, is merged so it reads «Both parties».
	const duties = new Map<string, TimedDuty & { order: number; clauseId: string | null }>();
	for (const kind of ['obligation', 'right', 'prohibition'] as const) {
		const list =
			kind === 'obligation' ? kg.obligations : kind === 'right' ? kg.rights : kg.prohibitions;
		for (const s of list) {
			const deadline = s.deadline?.trim() ?? '';
			const frequency = s.frequency?.trim() ?? '';
			if (!deadline && !frequency) continue;
			const action = (s.action || s.summary || '').trim();
			const key = [kind, s.clauseId, action.toLowerCase(), deadline, frequency].join('|');
			const actor = actorOf(kind, s);
			const found = duties.get(key);
			if (found) {
				found.ids.push(s.id);
				if (actor && !found.actors.includes(actor)) found.actors.push(actor);
				continue;
			}
			const clause = s.clauseId ? clauseById.get(s.clauseId) : undefined;
			duties.set(key, {
				ids: [s.id],
				kind,
				action,
				actors: actor ? [actor] : [],
				deadline,
				frequency,
				deadlineKind: deadline ? deadlineKind(deadline, timed.has(s.id)) : null,
				section: clauseTitle(clause, '', kg.clauses).section,
				order: paragraphOrder(s),
				clauseId: s.clauseId,
			});
		}
	}

	const groups = new Map<string, DeadlineGroup & { order: number }>();
	const put = (id: string, make: () => DeadlineGroup & { order: number }, duty: TimedDuty) => {
		const group = groups.get(id) ?? make();
		group.duties.push(duty);
		groups.set(id, group);
	};
	const sorted = [...duties.values()].sort((x, y) => x.order - y.order);
	for (const { clauseId, ...duty } of sorted) {
		if (!duty.deadline) {
			const term = WHOLE_TERM.test(duty.frequency);
			const id = term ? 'term' : 'repeated';
			put(
				id,
				() => ({
					id,
					kind: term ? 'term' : 'repeated',
					title: term ? 'While the contract lasts' : 'Again and again',
					section: null,
					duties: [],
					// After every clause: what repeats, then what lasts the whole contract.
					order: term ? 1e9 + 1 : 1e9,
				}),
				duty
			);
			continue;
		}
		// A subclause's duty goes under its top-level section: §7.2 and §7.4 under §7.
		const clause = clauseId ? clauseById.get(clauseId) : undefined;
		const topRef = clause?.ref?.replace(/^(?:section|article)\s+/i, '').split('.')[0] ?? null;
		const top = topRef ? (clauseByRef.get(`§${topRef}`) ?? clause) : clause;
		const id = top?.id ?? 'unfiled';
		put(
			id,
			() => ({
				id,
				kind: 'clause',
				title: top
					? clauseTitle(top, top.heading || 'Clause', kg.clauses).heading
					: 'Not in a clause',
				section: topRef ? `§${topRef}` : null,
				duties: [],
				order: top ? kg.clauses.indexOf(top) : Number.MAX_SAFE_INTEGER,
			}),
			duty
		);
	}
	return [...groups.values()]
		.sort((x, y) => x.order - y.order)
		.map(({ id, kind, title, section, duties }) => ({ id, kind, title, section, duties }));
}
