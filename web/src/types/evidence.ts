import type { Node } from './paragraph';

/**
 * A paragraph that evidences the current knowledge-graph focus. It carries nothing but
 * the node: the relation types and similarity scores it used to hold described the
 * paragraph graph, which no longer exists.
 */
export type EvidenceParagraph = {
	node: Node;
};
