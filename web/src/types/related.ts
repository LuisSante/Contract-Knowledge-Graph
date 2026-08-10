import type { Edge, Node, RelationKind } from './graph';

export type ReferenceMatch = {
	label: string;
	value: string;
};

export type RelatedParagraph = {
	node: Node;
	relationTypes: RelationKind[];
	semanticScore?: number;
	references: ReferenceMatch[];
};

export type BuildRelatedOptions = {
	nodes: Node[];
	edges: Edge[];
	maxRelatedParagraphs?: number;
};
