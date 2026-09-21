/** Section hierarchy derived from the document's own numbering, server-side.
 *  Mirrors `build_clause_tree` in services/documents/processing.py. */
export interface ClauseTreeNode {
	ref: string;
	heading: string;
	level: number;
	paragraphId: string;
	children: ClauseTreeNode[];
}
