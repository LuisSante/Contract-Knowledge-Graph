import { deonticNodes, type DeonticKind, type KnowledgeGraph } from '@/types/knowledge';
import type { Node } from '@/types/document';
import type { RedFlag } from '@/types/red-flags';

/**
 * Where the graph holds each red flag of the dataset: the statements, or failing that the
 * conditions, that share a run of words with it. Worked out on every load, never stored.
 */

// A flag counts as found when a statement's evidence, or failing that a condition's trigger,
// shares this many consecutive words with it: the criterion fixed for the evaluation.
export const MIN_SHARED_WORDS = 6;
export const FOUND_AS = ['obligation', 'right', 'prohibition', 'condition'] as const;
export type FoundAs = (typeof FOUND_AS)[number];

/** What the graph holds for a flag: by type, the clause of each match (null when it has none),
 *  `null` when nothing matches, or `short` when it has fewer words than the criterion needs. */
export type Detection = Partial<Record<FoundAs, Array<string | null>>> | null | 'short';

/** A flag's detection plus the graph texts that matched it, to mark the shared words. */
export interface FlagMatch {
	detection: Detection;
	matched: string[];
	/** The statements whose squares stand for the flag: the ones that matched, or the ones
	 *  the matching conditions gate. */
	statementIds: string[];
	/** The conditions it matched, when it was found as one. */
	conditionIds: string[];
}

export function squash(text: string): string {
	return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** The paragraph holding the flagged text; when several do, the nearest to its DOCX position. */
export function paragraphOf(paragraphs: Node[], flag: RedFlag): Node | null {
	const needle = squash(flag.text);
	const holders = paragraphs.filter((p) => squash(p.text).includes(needle));
	if (holders.length === 0) return null;
	const distance = (p: Node) => Math.abs(p.paragraph_enum - flag.docxParagraph);
	return holders.reduce((best, p) => (distance(p) < distance(best) ? p : best));
}

export function wordRuns(text: string): Set<string> {
	const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
	const runs = new Set<string>();
	for (let i = 0; i + MIN_SHARED_WORDS <= words.length; i++) {
		runs.add(words.slice(i, i + MIN_SHARED_WORDS).join(' '));
	}
	return runs;
}

export function detect(kg: KnowledgeGraph, flag: RedFlag): FlagMatch {
	const runs = wordRuns(flag.text);
	if (runs.size === 0)
		return { detection: 'short', matched: [], statementIds: [], conditionIds: [] };
	const shares = (text: string) => [...wordRuns(text)].some((run) => runs.has(run));

	const found: Partial<Record<FoundAs, Array<string | null>>> = {};
	const matched: string[] = [];
	const statementIds: string[] = [];
	const statements = deonticNodes(kg);
	for (const statement of statements) {
		const spans = (statement.evidenceSpans ?? []).filter(shares);
		if (spans.length > 0) {
			(found[statement.kind as DeonticKind] ??= []).push(statement.clauseId ?? null);
			matched.push(...spans);
			statementIds.push(statement.id);
		}
	}
	if (Object.keys(found).length > 0)
		return { detection: found, matched, statementIds, conditionIds: [] };
	// A condition sits in the clause of the statement it gates.
	const clauseOfStatement = new Map(statements.map((s) => [s.id, s.clauseId ?? null] as const));
	const conditions = kg.conditions.filter((condition) => shares(condition.trigger ?? ''));
	return {
		detection:
			conditions.length > 0
				? {
						condition: conditions.map((condition) =>
							condition.gatesId ? (clauseOfStatement.get(condition.gatesId) ?? null) : null
						),
					}
				: null,
		matched: conditions.map((condition) => condition.trigger ?? ''),
		statementIds: conditions.flatMap((condition) => (condition.gatesId ? [condition.gatesId] : [])),
		conditionIds: conditions.map((condition) => condition.id),
	};
}

/** `right_of_first_refusal_to_lease` → «Right of first refusal to lease»; the dataset's spelling is kept. */
export function flagTypeLabel(type: string | null): string {
	if (!type) return '—';
	const words = type.replace(/_/g, ' ');
	return words.charAt(0).toUpperCase() + words.slice(1);
}
