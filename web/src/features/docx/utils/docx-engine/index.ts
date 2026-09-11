export type {
	XmlNode,
	Docx4jsDocument,
	Docx4jsBrowserModule,
	ParagraphNode,
	ParagraphKind,
	ParagraphEditState,
} from './types';

export {
	createRenderer,
	type DocxRendererCallbacks,
	type DocxRendererDeps,
	type DocxRendererOptions,
} from './renderer';

// Binary parsing.
export { loadBrowserDocx4js } from './docx4js';

// Pagination (faithful page splitting + merging of continuous sections).
export { paginateRenderedSections } from './pagination';

// Noise detection (repeated headers/footers, page numbers).
export { detectDocxNoiseNodeIds } from './noise';

// Per-paragraph edit state (model helper).
export { ensureNodeEditState } from './edit-state';
