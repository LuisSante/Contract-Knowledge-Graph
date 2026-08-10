/**
 * docx-engine — render engine for `.docx` documents faithful to Word.
 *
 * Self-contained and app-agnostic: parses (docx4js), applies OOXML styles
 * (metric fonts, line spacing, indents), paginates (incl. `continuous`
 * sections) and mounts editable DOM. Only external dependency: `docx4js`.
 *
 * Typical consumption flow:
 *   1. `loadBrowserDocx4js()` → parse the `.docx` ArrayBuffer.
 *   2. `createRenderer(docId, callbacks, deps, options)` → DOM node factory.
 *   3. mount the DOM in a container and `paginateRenderedSections(viewer)`.
 *   4. optional: `detectDocxNoiseNodeIds(viewer)` to exclude repeated
 *      headers/footers and page numbers from any later analysis.
 *
 * The app features (editing, badges, contradictions) plug in via the
 * `callbacks`/`deps` injected into `createRenderer` — the engine does not know them.
 */

// Engine types (paragraph model, XML, docx4js).
export type {
	XmlNode,
	Docx4jsDocument,
	Docx4jsBrowserModule,
	ParagraphNode,
	ParagraphKind,
	ParagraphEditState
} from './types';

// Rendering.
export {
	createRenderer,
	type DocxRendererCallbacks,
	type DocxRendererDeps,
	type DocxRendererOptions
} from './renderer';

// Binary parsing.
export { loadBrowserDocx4js } from './docx-page';

// Pagination (faithful page splitting + merging of continuous sections).
export { paginateRenderedSections } from './pagination';

// Noise detection (repeated headers/footers, page numbers).
export { detectDocxNoiseNodeIds } from './noise';

// Per-paragraph edit state (model helper).
export { ensureNodeEditState } from './edit-state';
