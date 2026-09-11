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

export interface ParagraphNode {
	id: string;
	documentId: string;
	text: string;
	paragraph_enum: number;
	page: number;
}

export type ParagraphKind = 'paragraph' | 'heading' | 'list';

export type ParagraphEditState = {
	committed: string;
	current: string;
	editedSinceCommit: boolean;
};
