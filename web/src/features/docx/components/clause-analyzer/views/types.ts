import type { KnowledgeGraph } from '@/types/knowledge';
import type { Side, StatementGrid } from '@/features/docx/utils/knowledge/statement-grid';

export interface ViewProps {
	docId: string;
	kg: KnowledgeGraph;
	names: Record<Side, string>;
	grid: StatementGrid;
	/** Clause importance, to order rows; null until the server answers. */
	importance: Record<string, number> | null;
	/** Opens a graph node in the document. */
	onOpen: (nodeId: string) => void;
	/** Selects the clause and switches to the knowledge graph tab; absent when there is none. */
	onOpenGraph?: (clauseId: string) => void;
}
