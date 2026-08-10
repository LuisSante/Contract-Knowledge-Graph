// Clones a paragraph container to static HTML for the collapsed cards
// of the overlays (related bridge and contradiction evidence compression).
// Editing attributes and transient classes are stripped so the
// clone renders at full opacity/color, and it is marked as a cloned node.

const TRANSIENT_CLASSES = [
	'docx-paragraph-explanation-related',
	'docx-paragraph-explanation-source-hidden',
	'docx-paragraph-explanation-muted',
	'docx-related-context',
	'docx-related-linked',
	'docx-related-selected',
	'docx-contradiction-source-hidden',
];

export function cloneParagraphForCard(container: HTMLElement): string {
	const clone = container.cloneNode(true) as HTMLElement;
	clone.removeAttribute('contenteditable');
	clone.removeAttribute('spellcheck');
	delete clone.dataset.nodeId;
	delete clone.dataset.paragraphKind;
	delete clone.dataset.docxEditableRoot;
	clone.classList.remove(...TRANSIENT_CLASSES);
	clone.classList.add('docx-paragraph-explanation-cloned-node');
	return clone.outerHTML;
}
