import type { DeonticKind, KgDeonticNode, KnowledgeGraph } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';
import type { Node as ParagraphNode } from '@/types/document';
import { countSpanOwners, evidenceLabels } from './kg-bridge';
import type { GridLane } from './statement-grid';

/**
 * The zoomed copy of one clause: its own paragraphs, verbatim, with each located
 * evidence fragment carrying the lane of its statement. The grid's marks say *that*
 * a clause pulls toward a side; this says *which words* do the pulling — in two
 * colours instead of the seven-kind palette, because at this range the question is
 * no longer "what kind of provision" but "whose".
 */

export interface ClauseFragment {
	/** A slice of the paragraph's text, verbatim — painted when `lane` is set. */
	text: string;
	/** Null for the connective tissue between located fragments. */
	lane: GridLane | null;
	statementId?: string;
	kind?: DeonticKind;
	ownerName?: string | null;
	detail?: string;
}

export interface ClauseDetailParagraph {
	id: string;
	fragments: ClauseFragment[];
}

export interface ClauseUnlocatedStatement {
	id: string;
	lane: GridLane;
	kind: DeonticKind;
	label: string;
	detail: string;
	ownerName: string | null;
}

export interface ClauseDetail {
	paragraphs: ClauseDetailParagraph[];
	/**
	 * Filed under the clause but with no fragment found in its text — an evidence
	 * span that drifted, or one that lives in a paragraph the clause doesn't own.
	 * Shown rather than dropped, so the copy never silently under-reports a side.
	 */
	unlocated: ClauseUnlocatedStatement[];
}

/**
 * Where a fragment sits in the paragraph. Extraction and docx text drift in case and
 * whitespace, so the literal search is retried with both relaxed before giving up.
 */
function findSpan(haystack: string, needle: string): { start: number; end: number } | null {
	const trimmed = needle.trim();
	if (trimmed.length < 4) return null;
	const direct = haystack.indexOf(trimmed);
	if (direct >= 0) return { start: direct, end: direct + trimmed.length };
	const pattern = new RegExp(
		trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'),
		'i'
	);
	const match = pattern.exec(haystack);
	return match ? { start: match.index, end: match.index + match[0].length } : null;
}

export function buildClauseDetail(
	kg: KnowledgeGraph,
	clauseId: string,
	partyAId: string,
	partyBId: string | null,
	nodesById: Map<string, ParagraphNode>
): ClauseDetail | null {
	const clause = kg.clauses.find((c) => c.id === clauseId);
	if (!clause) return null;

	const partyName = new Map(kg.parties.map((p) => [p.id, p.name] as const));
	const statements = deonticNodes(kg).filter((v) => v.clauseId === clauseId);
	const spanOwners = countSpanOwners(kg);

	// Same reading as the grid: a duty binds its obligor, a right belongs to its holder.
	const ownerIdOf = (statement: KgDeonticNode): string | null =>
		statement.kind === 'right' ? statement.benefitPartyId : statement.burdenPartyId;
	const laneOf = (statement: KgDeonticNode): GridLane => {
		const ownerId = ownerIdOf(statement);
		return ownerId === partyAId ? 'a' : partyBId && ownerId === partyBId ? 'b' : 'shared';
	};

	const orderedParagraphIds = [...new Set(clause.paragraphIds)]
		.filter((pid) => nodesById.has(pid))
		.sort(
			(x, y) =>
				(nodesById.get(x)?.paragraph_enum ?? 0) - (nodesById.get(y)?.paragraph_enum ?? 0)
		);

	const located = new Set<string>();
	const paragraphs: ClauseDetailParagraph[] = [];
	for (const pid of orderedParagraphIds) {
		const text = nodesById.get(pid)?.text ?? '';
		if (!text) continue;
		// The heading paragraph would just repeat the zoom's own title line.
		if (text.trim().toLowerCase() === clause.heading.trim().toLowerCase()) continue;

		interface Interval {
			start: number;
			end: number;
			statement: KgDeonticNode;
			lane: GridLane;
		}
		const intervals: Interval[] = [];
		for (const statement of statements) {
			const lane = laneOf(statement);
			for (const span of evidenceLabels(statement, spanOwners)) {
				const hit = findSpan(text, span);
				if (!hit) continue;
				intervals.push({ ...hit, statement, lane });
				located.add(statement.id);
			}
		}

		// Earliest first, longest on a tie; whatever overlaps an accepted fragment is
		// dropped — two statements claiming the same words would paint it twice.
		intervals.sort((x, y) => x.start - y.start || y.end - x.end);
		const fragments: ClauseFragment[] = [];
		let cursor = 0;
		for (const interval of intervals) {
			if (interval.start < cursor) continue;
			if (interval.start > cursor) fragments.push({ text: text.slice(cursor, interval.start), lane: null });
			fragments.push({
				text: text.slice(interval.start, interval.end),
				lane: interval.lane,
				statementId: interval.statement.id,
				kind: interval.statement.kind,
				ownerName: (() => {
					const ownerId = ownerIdOf(interval.statement);
					return ownerId ? (partyName.get(ownerId) ?? null) : null;
				})(),
				detail:
					interval.statement.summary || interval.statement.action || interval.statement.text,
			});
			cursor = interval.end;
		}
		if (cursor < text.length) fragments.push({ text: text.slice(cursor), lane: null });
		paragraphs.push({ id: pid, fragments });
	}

	const unlocated: ClauseUnlocatedStatement[] = statements
		.filter((v) => !located.has(v.id))
		.map((v) => {
			const ownerId = ownerIdOf(v);
			return {
				id: v.id,
				lane: laneOf(v),
				kind: v.kind,
				label: v.action || v.kind,
				detail: v.summary || v.text || v.action,
				ownerName: ownerId ? (partyName.get(ownerId) ?? null) : null,
			};
		});

	return { paragraphs, unlocated };
}
