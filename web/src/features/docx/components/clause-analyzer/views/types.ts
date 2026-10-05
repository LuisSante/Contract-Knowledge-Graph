import type { KnowledgeGraph } from '@/types/knowledge';
import type { StatementGrid } from '@/features/docx/utils/knowledge/statement-grid';
import type { Side } from '@/features/docx/utils/knowledge/mirror';

export interface ViewProps {
	docId: string;
	kg: KnowledgeGraph;
	aId: string;
	bId: string;
	names: Record<Side, string>;
	reader: Side;
	row: string | null;
	onRow: (id: string | null) => void;
	grid: StatementGrid;
	shareOf: (clauseId: string | null) => { a: number; b: number } | null;
	/** Opens a graph node in the document. */
	onOpen: (nodeId: string) => void;
	/** Opens paragraphs the graph has no node for. */
	onOpenParas: (paragraphIds: string[]) => void;
	onAsk?: (question: string) => void;
	onTable: () => void;
}
