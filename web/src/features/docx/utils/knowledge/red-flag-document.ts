import type { Node as ParagraphNode, EvidenceParagraph } from '@/types/document';
import type { KnowledgeGraph } from '@/types/knowledge';
import {
	buildDocumentTarget,
	type DocumentTarget,
} from '@/features/docx/utils/knowledge/graph-payload';
import { sectionOf } from '@/features/docx/utils/knowledge/clause-favour';
import type { FlagHopPath, HopLink } from '@/features/docx/utils/knowledge/red-flag-hops';

/**
 * A red flag's path in the contract: the flagged statement painted with its conditions, as a
 * picked statement is, and the margin line joining it to the clauses its edges reach, each
 * labelled in the edge's own direction («modified by §2» beside §1 when §2 modifies §1).
 */
export function flagPathTarget(
	kg: KnowledgeGraph,
	path: FlagHopPath,
	nodesById: Map<string, ParagraphNode>
): DocumentTarget {
	const base = buildDocumentTarget(kg, path.root.statement.id, nodesById, { withConditions: true });
	const label = (clauseId: string) => {
		const clause = kg.clauses.find((c) => c.id === clauseId);
		return sectionOf(clause?.ref) ?? clause?.heading ?? clauseId;
	};
	const related = new Map(base.relatedParagraphs.map((p) => [p.node.id, p] as const));
	const add = (link: HopLink, far: string) => {
		// The far end: the statement the edge leaves from, or the first paragraph of the clause.
		const pids =
			far === link.fromClauseId && link.statement
				? link.statement.statement.paragraphIds
				: (kg.clauses.find((c) => c.id === far)?.paragraphIds.slice(0, 1) ?? []);
		for (const pid of pids) {
			const node = nodesById.get(pid);
			if (!node || pid === base.anchorParagraphId || related.has(pid)) continue;
			const relation: EvidenceParagraph['relation'] = {
				kind: link.type,
				from: label(link.fromClauseId),
				to: label(link.toClauseId),
			};
			related.set(pid, { node, relation });
		}
	};
	for (const link of path.outgoing) add(link, link.toClauseId);
	for (const link of path.incoming) add(link, link.fromClauseId);
	for (const link of path.clauseOutgoing) add(link, link.toClauseId);
	const relatedParagraphs = [...related.values()];
	const clause = kg.clauses.find((c) => c.id === path.clauseId);
	return {
		...base,
		anchorLabel: sectionOf(clause?.ref) ?? null,
		relatedParagraphs,
		paragraphIds: [...new Set([...base.paragraphIds, ...relatedParagraphs.map((p) => p.node.id)])],
	};
}
