export interface DocumentMeta {
	id: string;
	name: string;
	full_path: string;
	relative_path?: string;
	group_label?: string;
	display_name?: string;
	origin: 'dataset' | 'upload';
	processed: boolean;
}

export interface Node {
	id: string;
	documentId: string;
	text: string;
	paragraph_enum: number;
	page: number;
	relationsCount: number;
}

export interface Edge {
	source: string;
	target: string;
	type: 'reference' | 'semantic_similarity';
	score?: number;
	ref_label?: string;
	ref_value?: string;
}

export interface Graph {
	nodes: Node[];
	edges: Edge[];
}

export interface ProcessDocumentResponse {
	status: 'success' | 'error';
	documentId: string;
	graph: Graph;
}

export type XmlNode = {
	name?: string;
	attribs?: Record<string, string>;
	children?: XmlNode[];
	type?: string;
	data?: string;
};

export type Docx4jsDocument = {
	render: (
		factory: (type: string, props: Record<string, unknown>, children: unknown) => unknown,
		identify?: (
			node: XmlNode,
			officeDocument: {
				constructor: { identify: (node: XmlNode, officeDocument: unknown) => unknown };
			}
		) => unknown
	) => unknown;
	release?: () => void;
};

export type Docx4jsBrowserModule = {
	docx: {
		load: (file: ArrayBuffer) => Promise<Docx4jsDocument>;
	};
};

export type ParagraphKind = 'paragraph' | 'heading' | 'list';
export type RelationKind = 'semantic_similarity' | 'reference';
