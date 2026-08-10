import { normalizeEditableText } from '@/features/docx/utils/docx-engine/dom';

export type SimplifyTarget = {
	paragraphId: string;
	paragraphText: string;
	selectionStart: number;
	selectionEnd: number;
	originalSnippet: string;
	anchorRect: DOMRect;
};

export function getParagraphTextElement(paragraphElement: HTMLElement): HTMLElement {
	if (paragraphElement.matches('[data-docx-editable-root="true"]')) return paragraphElement;
	return (
		paragraphElement.querySelector<HTMLElement>('[data-docx-editable-root="true"]') ??
		paragraphElement
	);
}

export function normalizeBounds(start: number, end: number, totalLength: number) {
	const clampedStart = Math.max(0, Math.min(start, totalLength));
	const clampedEnd = Math.max(0, Math.min(end, totalLength));
	if (clampedEnd < clampedStart) {
		return { start: clampedEnd, end: clampedStart };
	}
	return { start: clampedStart, end: clampedEnd };
}

export function buildTargetForWholeParagraph(
	paragraphId: string,
	paragraphElementById: Map<string, HTMLElement>
): SimplifyTarget | null {
	const paragraphElement = paragraphElementById.get(paragraphId);
	if (!paragraphElement) return null;

	const textElement = getParagraphTextElement(paragraphElement);
	const paragraphText = normalizeEditableText(textElement.innerText ?? '');
	const anchorRect = paragraphElement.getBoundingClientRect();
	return {
		paragraphId,
		paragraphText,
		selectionStart: 0,
		selectionEnd: paragraphText.length,
		originalSnippet: paragraphText,
		anchorRect
	};
}

export function buildTargetFromSelectionRange(options: {
	viewer: HTMLElement | null;
}): SimplifyTarget | null {
	const { viewer } = options;
	if (!viewer) return null;

	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

	const range = selection.getRangeAt(0);
	if (!viewer.contains(range.commonAncestorContainer)) return null;

	const startElement = getClosestParagraphElement(range.startContainer);
	const endElement = getClosestParagraphElement(range.endContainer);
	if (!startElement || !endElement || startElement !== endElement) return null;

	const paragraphId = startElement.dataset.nodeId;
	if (!paragraphId) return null;

	const textElement = getParagraphTextElement(startElement);
	if (!textElement.contains(range.startContainer) || !textElement.contains(range.endContainer)) {
		return null;
	}

	const paragraphText = normalizeEditableText(textElement.innerText ?? '');

	const startRange = document.createRange();
	startRange.selectNodeContents(textElement);
	startRange.setEnd(range.startContainer, range.startOffset);

	const endRange = document.createRange();
	endRange.selectNodeContents(textElement);
	endRange.setEnd(range.endContainer, range.endOffset);

	const bounds = normalizeBounds(
		startRange.toString().length,
		endRange.toString().length,
		paragraphText.length
	);
	if (bounds.start === bounds.end) return null;

	const originalSnippet = paragraphText.slice(bounds.start, bounds.end);
	if (!originalSnippet) return null;

	// Keep the tools anchored to the paragraph block so the toolbar stays stable
	// while the user changes text selection inside the same paragraph.
	const anchorRect = startElement.getBoundingClientRect();

	return {
		paragraphId,
		paragraphText,
		selectionStart: bounds.start,
		selectionEnd: bounds.end,
		originalSnippet,
		anchorRect
	};
}

export function computeSimplifyToolbarPosition(
	anchorRect: DOMRect,
	viewportWidth: number,
	viewportHeight: number
) {
	const toolbarWidth = 208;
	const estimatedToolbarHeight = 150;
	const margin = 12;
	const gap = 10;

	const left = Math.max(margin, Math.min(viewportWidth - toolbarWidth - margin, anchorRect.left));

	const preferredTop = anchorRect.top - estimatedToolbarHeight - gap;
	const fallbackTop = anchorRect.bottom + gap;
	const maxTop = Math.max(margin, viewportHeight - estimatedToolbarHeight - margin);
	const top = preferredTop >= margin ? preferredTop : Math.min(maxTop, fallbackTop);

	return { left, top };
}

export function preserveBoundaryWhitespace(
	originalSnippet: string,
	simplifiedSnippet: string
): string {
	const leadingWhitespace = originalSnippet.match(/^\s*/)?.[0] ?? '';
	const trailingWhitespace = originalSnippet.match(/\s*$/)?.[0] ?? '';
	const core = simplifiedSnippet.trim();
	if (!core) return originalSnippet;
	return `${leadingWhitespace}${core}${trailingWhitespace}`;
}

export function replaceParagraphTextRange(
	paragraphElement: HTMLElement,
	selectionStart: number,
	selectionEnd: number,
	replacementText: string
) {
	const range = document.createRange();
	const startPoint = resolveDomPointByOffset(paragraphElement, selectionStart);
	const endPoint = resolveDomPointByOffset(paragraphElement, selectionEnd);
	range.setStart(startPoint.node, startPoint.offset);
	range.setEnd(endPoint.node, endPoint.offset);

	const replacementNode = createStyledReplacementNode(
		paragraphElement,
		startPoint.node,
		startPoint.offset,
		replacementText
	);

	range.deleteContents();

	range.insertNode(replacementNode);
	range.setStartAfter(replacementNode);
	range.collapse(true);

	const selection = window.getSelection();
	if (selection) {
		selection.removeAllRanges();
		selection.addRange(range);
	}

	paragraphElement.normalize();
}

function getClosestParagraphElement(node: Node | null): HTMLElement | null {
	if (!node) return null;
	if (node instanceof HTMLElement) return node.closest<HTMLElement>('[data-node-id]');
	if (node instanceof Text)
		return node.parentElement?.closest<HTMLElement>('[data-node-id]') ?? null;
	return null;
}

function resolveDomPointByOffset(
	root: HTMLElement,
	offset: number
): { node: Node; offset: number } {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
		acceptNode: (node) => {
			if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
			if (node instanceof HTMLBRElement) return NodeFilter.FILTER_ACCEPT;
			return NodeFilter.FILTER_SKIP;
		}
	});

	let remaining = Math.max(0, offset);
	let current = walker.nextNode();
	let fallbackTextNode: Text | null = null;
	while (current) {
		if (current.nodeType === Node.TEXT_NODE) {
			const textNode = current as Text;
			const length = textNode.data.length;
			fallbackTextNode = textNode;
			if (remaining <= length) {
				return { node: textNode, offset: remaining };
			}
			remaining -= length;
		} else if (current instanceof HTMLBRElement) {
			const parent = current.parentNode ?? root;
			const childIndex = Array.prototype.indexOf.call(parent.childNodes, current);
			if (remaining === 0) return { node: parent, offset: childIndex };
			remaining -= 1;
			if (remaining === 0) return { node: parent, offset: childIndex + 1 };
		}
		current = walker.nextNode();
	}

	if (fallbackTextNode) {
		return { node: fallbackTextNode, offset: fallbackTextNode.data.length };
	}
	return { node: root, offset: root.childNodes.length };
}

function createStyledReplacementNode(
	root: HTMLElement,
	startNode: Node,
	startOffset: number,
	replacementText: string
): Node {
	const anchorNode = resolveStyleAnchorNode(root, startNode, startOffset);
	if (!anchorNode) return document.createTextNode(replacementText);

	const styleChain = collectInlineStyleChain(root, anchorNode);
	if (styleChain.length === 0) return document.createTextNode(replacementText);

	let current: Node = document.createTextNode(replacementText);
	for (let idx = styleChain.length - 1; idx >= 0; idx -= 1) {
		const wrapper = styleChain[idx].cloneNode(false) as HTMLElement;
		wrapper.appendChild(current);
		current = wrapper;
	}

	return current;
}

function resolveStyleAnchorNode(root: HTMLElement, node: Node, offset: number): Node | null {
	if (node.nodeType === Node.TEXT_NODE) return node;
	if (!(node instanceof Element)) return root;

	const index = Math.max(0, Math.min(offset, node.childNodes.length));
	const before = index > 0 ? node.childNodes[index - 1] : null;
	const after = index < node.childNodes.length ? node.childNodes[index] : null;

	return (
		findDeepTextNode(before, 'right') ??
		findDeepTextNode(after, 'left') ??
		findDeepTextNode(root, 'left') ??
		root
	);
}

function findDeepTextNode(node: Node | null, direction: 'left' | 'right'): Text | null {
	if (!node) return null;
	if (node.nodeType === Node.TEXT_NODE) return node as Text;

	if (!(node instanceof Element) || node.childNodes.length === 0) {
		return null;
	}

	if (direction === 'left') {
		for (let idx = 0; idx < node.childNodes.length; idx += 1) {
			const found = findDeepTextNode(node.childNodes[idx], direction);
			if (found) return found;
		}
		return null;
	}

	for (let idx = node.childNodes.length - 1; idx >= 0; idx -= 1) {
		const found = findDeepTextNode(node.childNodes[idx], direction);
		if (found) return found;
	}
	return null;
}

function collectInlineStyleChain(root: HTMLElement, anchorNode: Node): HTMLElement[] {
	const chain: HTMLElement[] = [];
	let current: HTMLElement | null =
		anchorNode instanceof Text
			? anchorNode.parentElement
			: anchorNode instanceof HTMLElement
				? anchorNode
				: null;

	while (current && current !== root) {
		if (isInlineStyleContainer(current)) {
			chain.push(current);
		}
		current = current.parentElement;
	}

	return chain;
}

function isInlineStyleContainer(element: HTMLElement): boolean {
	const tag = element.tagName.toLowerCase();
	return (
		tag === 'span' ||
		tag === 'a' ||
		tag === 'strong' ||
		tag === 'b' ||
		tag === 'em' ||
		tag === 'i' ||
		tag === 'u' ||
		tag === 's' ||
		tag === 'sub' ||
		tag === 'sup' ||
		tag === 'mark' ||
		tag === 'code'
	);
}
