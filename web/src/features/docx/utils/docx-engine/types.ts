/**
 * The docx render engine's own types. Standalone (no app dependencies)
 * so the engine is portable to another project. They are structurally identical
 * to those in `@/types`, so TS accepts them at the boundary (render callbacks).
 */

/** Node of the OOXML XML tree, as exposed by docx4js. */
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

/** Paragraph model the engine exposes to its consumer. */
export interface ParagraphNode {
	id: string;
	documentId: string;
	text: string;
	paragraph_enum: number;
	page: number;
	relationsCount: number;
}

export type ParagraphKind = 'paragraph' | 'heading' | 'list';

/** Per-paragraph edit state (used by the app's editing plugin). */
export type ParagraphEditState = {
	committed: string;
	current: string;
	editedSinceCommit: boolean;
};
