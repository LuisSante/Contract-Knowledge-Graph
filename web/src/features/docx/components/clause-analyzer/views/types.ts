import type { KnowledgeGraph } from '@/types/knowledge';
import type { GridLane, Side, StatementGrid } from '@/features/docx/utils/knowledge/statement-grid';

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
	/** Clause importance, to order rows; null until the server answers. */
	importance: Record<string, number> | null;
	/** The lanes the Table counts: the reciprocal one only with "Both parties" on. */
	lanes: GridLane[];
	showShared: boolean;
	onShowShared: (on: boolean) => void;
	/** Opens a graph node in the document. */
	onOpen: (nodeId: string) => void;
	/** Opens paragraphs the graph has no node for. */
	onOpenParas: (paragraphIds: string[]) => void;
	onAsk?: (question: string) => void;
	onTable: () => void;
}
