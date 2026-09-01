import { escapeRegex, normalizeEntityKey } from '@/features/docx/utils/text';

/**
 * Entity highlighting within the document body (not only in the chat).
 * Wraps each entity occurrence in a `<span.docx-entity-mark>`
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
	const marks = element.querySelectorAll<HTMLElement>('span.docx-entity-mark');
	for (const mark of marks) {
		const parent = mark.parentNode;
		if (!parent) continue;
		while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
		parent.removeChild(mark);
	}
}

/**
 * Wraps the entities found in the element's text.
 *
 * Matching runs over the element's *concatenated* text, not node by node. A rendered
 * DOCX paragraph is split into one text node per formatting run — 28 of them in a single
 * paragraph of the reference contract — so any quote crossing a bold or italic span had
 * no node containing it whole, and simply never matched. A run of whitespace in a label
 * matches any run in the document for the same reason: the renderer decides where the
 * line breaks and the non-breaking spaces go, the extraction does not.
 */
export function highlightEntitiesInElement(
	element: HTMLElement,
	entities: DocumentEntityHighlight[]
) {
	const labels = entities
		.map((entity) => entity.label.trim())
		.filter((entity) => entity.length >= 2)
		// Longest first: a label that contains another must win the overlap.
		.sort((left, right) => right.length - left.length);
	if (labels.length === 0) return;

	const entityByNormalizedLabel = new Map(
		entities.map((entity) => [normalizeEntityKey(entity.label), entity])
	);
	const entityPattern = new RegExp(
		labels.map((label) => escapeRegex(label).replace(/\s+/g, '\\s+')).join('|'),
		'gi'
	);

	// Whitespace-only nodes are kept: they carry the space between two runs, and dropping
	// them would glue the words either side together and break the match.
	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
	const nodes: Array<{ node: Text; start: number }> = [];
	let text = '';
	let current = walker.nextNode();
	while (current) {
		const textNode = current as Text;
		const parentElement = textNode.parentElement;
		if (
			parentElement &&
			!parentElement.closest('.docx-entity-mark')
		) {
			nodes.push({ node: textNode, start: text.length });
			text += textNode.nodeValue ?? '';
		}
		current = walker.nextNode();
	}
	if (nodes.length === 0) return;

	// Cut every match into the slices falling inside each node *before* touching the DOM:
	// wrapping one node invalidates the offsets the rest were computed from.
	type Slice = { start: number; end: number; meta?: DocumentEntityHighlight };
	const slicesByNode = new Map<Text, Slice[]>();
	for (const match of text.matchAll(entityPattern)) {
		const value = match[0] ?? '';
		if (!value) continue;
		const from = match.index ?? 0;
		const to = from + value.length;
		const meta = entityByNormalizedLabel.get(normalizeEntityKey(value));
		for (const { node, start } of nodes) {
			const length = node.nodeValue?.length ?? 0;
			const sliceStart = Math.max(from, start);
			const sliceEnd = Math.min(to, start + length);
			if (sliceEnd <= sliceStart) continue;
			const slices = slicesByNode.get(node) ?? [];
			slices.push({ start: sliceStart - start, end: sliceEnd - start, meta });
			slicesByNode.set(node, slices);
		}
	}

	for (const [textNode, slices] of slicesByNode) {
		const originalText = textNode.nodeValue ?? '';
		const fragment = document.createDocumentFragment();
		let cursor = 0;
		for (const slice of slices.sort((left, right) => left.start - right.start)) {
			if (slice.start < cursor) continue; // an overlap the longer label already took
			if (slice.start > cursor) {
				fragment.appendChild(document.createTextNode(originalText.slice(cursor, slice.start)));
			}
			const marker = document.createElement('span');
			marker.className = 'docx-entity-mark';
			if (slice.meta) {
				marker.dataset.entityKey = slice.meta.key;
				marker.style.setProperty('--entity-color', slice.meta.color);
				marker.style.setProperty('--entity-color-soft', slice.meta.softColor);
			}
			marker.textContent = originalText.slice(slice.start, slice.end);
			fragment.appendChild(marker);
			cursor = slice.end;
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
