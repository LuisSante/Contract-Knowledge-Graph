const TRANSIENT_CLASSES = [
	'docx-paragraph-explanation-related',
	'docx-paragraph-explanation-source-hidden',
	'docx-paragraph-explanation-muted',
	'docx-related-context',
	'docx-related-linked',
	'docx-related-selected',
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
