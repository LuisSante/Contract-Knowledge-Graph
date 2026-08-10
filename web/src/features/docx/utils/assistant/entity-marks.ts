import { escapeRegex } from '@/features/docx/utils/text';
import { normalizeParagraphExplanationEntityKey } from '@/features/docx/utils/assistant/paragraph-explanation';

/**
 * Entity highlighting within the document body (not only in the chat).
 * Wraps each entity occurrence in a `<span.docx-paragraph-explanation-entity-link>`
 * with its `data-entity-key` and color, so they match the entities in the
 * panel/chat and sync on hover. Port of
 * `highlightParagraphExplanationEntitiesInElement` / `clearParagraphExplanationEntityMarks`
 * / `setHoveredParagraphExplanationEntityKey` from the Svelte `+page.svelte`.
 */

export type DocumentEntityHighlight = {
	label: string;
	key: string;
	color: string;
	softColor: string;
};

/** Removes entity markers from an element, restoring the text. */
export function clearEntityMarks(element: HTMLElement) {
	const marks = element.querySelectorAll<HTMLElement>('span.docx-paragraph-explanation-entity-link');
	for (const mark of marks) {
		const parent = mark.parentNode;
		if (!parent) continue;
		while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
		parent.removeChild(mark);
	}
}

/** Wraps the entities found in the element's text. */
export function highlightEntitiesInElement(
	element: HTMLElement,
	entities: DocumentEntityHighlight[]
) {
	const normalizedEntities = entities
		.map((entity) => entity.label.trim())
		.filter((entity) => entity.length >= 2)
		.sort((left, right) => right.length - left.length);
	if (normalizedEntities.length === 0) return;

	const entityByNormalizedLabel = new Map(
		entities.map((entity) => [normalizeParagraphExplanationEntityKey(entity.label), entity])
	);
	const entityPattern = new RegExp(
		normalizedEntities.map((entity) => escapeRegex(entity)).join('|'),
		'gi'
	);

	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	let current = walker.nextNode();
	while (current) {
		const textNode = current as Text;
		const parentElement = textNode.parentElement;
		const rawText = textNode.nodeValue ?? '';
		if (
			parentElement &&
			!parentElement.closest('.docx-paragraph-explanation-entity-link') &&
			!parentElement.closest('mark.docx-contradiction-snippet') &&
			rawText.trim()
		) {
			nodes.push(textNode);
		}
		current = walker.nextNode();
	}

	for (const textNode of nodes) {
		const originalText = textNode.nodeValue ?? '';
		entityPattern.lastIndex = 0;
		if (!entityPattern.test(originalText)) continue;

		entityPattern.lastIndex = 0;
		const fragment = document.createDocumentFragment();
		let cursor = 0;
		for (const match of originalText.matchAll(entityPattern)) {
			const value = match[0] ?? '';
			if (!value) continue;
			const start = match.index ?? 0;
			if (start > cursor) {
				fragment.appendChild(document.createTextNode(originalText.slice(cursor, start)));
			}
			const marker = document.createElement('span');
			marker.className = 'docx-paragraph-explanation-entity-link';
			const matchKey = normalizeParagraphExplanationEntityKey(value);
			const entityMeta = entityByNormalizedLabel.get(matchKey);
			if (entityMeta) {
				marker.dataset.entityKey = entityMeta.key;
				marker.style.setProperty('--entity-color', entityMeta.color);
				marker.style.setProperty('--entity-color-soft', entityMeta.softColor);
			}
			marker.textContent = value;
			fragment.appendChild(marker);
			cursor = start + value.length;
		}
		if (cursor < originalText.length) {
			fragment.appendChild(document.createTextNode(originalText.slice(cursor)));
		}
		textNode.parentNode?.replaceChild(fragment, textNode);
	}
}

/** Syncs an entity's hover state across the ENTIRE document and the chat. */
export function syncHoveredEntityKey(nextKey: string | null) {
	if (typeof document === 'undefined') return;
	for (const element of document.querySelectorAll<HTMLElement>('[data-entity-key]')) {
		const isActive = Boolean(nextKey) && element.dataset.entityKey === nextKey;
		element.classList.toggle('is-entity-hovered', isActive);
	}
}
