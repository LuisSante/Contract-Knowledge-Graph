// Classes the editing plugin adds to an editable paragraph; they are removed when
// "freezing" an ignored paragraph. Internal to the engine so it stays self-contained.
const EDITABLE_PARAGRAPH_CLASSES = [
	'rounded-[2px]',
	'-mx-[2px]',
	'px-[2px]',
	'outline-none',
	'transition-all',
	'hover:ring-1',
	'hover:ring-blue-300',
	'focus:ring-2',
	'focus:ring-blue-700'
] as const;

function getEditableRootElement(element: HTMLElement): HTMLElement {
	if (element.matches('[data-docx-editable-root="true"]')) return element;
	return element.querySelector<HTMLElement>('[data-docx-editable-root="true"]') ?? element;
}

export function clearRelationBadgeHost(host: HTMLElement): void {
	host.classList.remove('docx-relations-badge-host');
	delete host.dataset.relationsCount;
	delete host.dataset.relationsTone;
}

export function freezeIgnoredParagraphElement(element: HTMLElement): void {
	const editableRoot = getEditableRootElement(element);
	element.dataset.ignoredParagraph = 'true';
	editableRoot.dataset.ignoredParagraph = 'true';
	for (const target of new Set([element, editableRoot])) {
		target.removeAttribute('contenteditable');
		target.removeAttribute('spellcheck');
		target.removeAttribute('data-node-id');
		target.removeAttribute('data-paragraph-kind');
		target.removeAttribute('data-docx-editable-root');
		target.classList.remove(...EDITABLE_PARAGRAPH_CLASSES);
	}
}
