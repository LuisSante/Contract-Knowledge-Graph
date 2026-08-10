import { parsePxValue } from './dom';
import {
	getLastMeaningfulElement,
	getLastMeaningfulNode,
	isIgnorablePageNode
} from './tab-stops';

const PAGE_OVERFLOW_TOLERANCE_PX = 10;
const PAGE_SPLIT_GUARD_LIMIT = 180;
const PAGE_SOFT_OVERFLOW_ALLOWANCE_PX = 24;

function getMeaningfulNodes(parent: HTMLElement): Node[] {
	return Array.from(parent.childNodes).filter((child) => !isIgnorablePageNode(child));
}

function countMeaningfulChildren(parent: HTMLElement): number {
	let count = 0;
	for (const child of Array.from(parent.childNodes)) {
		if (isIgnorablePageNode(child)) continue;
		count += 1;
	}
	return count;
}

function getPreviousMeaningfulSibling(node: Node | null): HTMLElement | null {
	let current = node?.previousSibling ?? null;
	while (current) {
		if (!isIgnorablePageNode(current)) {
			return current instanceof HTMLElement ? current : null;
		}
		current = current.previousSibling;
	}
	return null;
}

function lockSectionHeight(section: HTMLElement, pageHeight: number) {
	section.style.height = `${pageHeight}px`;
	section.style.minHeight = `${pageHeight}px`;
	section.style.maxHeight = `${pageHeight}px`;
	section.style.overflow = 'hidden';
}

function createContinuationSection(section: HTMLElement): HTMLElement {
	const continuation = section.cloneNode(false) as HTMLElement;
	continuation.replaceChildren();
	for (const chromeNode of section.querySelectorAll<HTMLElement>(
		':scope > [data-docx-page-chrome="true"]'
	)) {
		continuation.appendChild(chromeNode.cloneNode(true));
	}
	return continuation;
}

function splitSingleOversizedTableSection(
	section: HTMLElement,
	pageHeight: number
): HTMLElement | null {
	const meaningfulNodes = getMeaningfulNodes(section);
	if (meaningfulNodes.length !== 1) return null;
	const soleNode = meaningfulNodes[0];
	if (!(soleNode instanceof HTMLTableElement)) return null;

	const sourceTable = soleNode;
	const sourceBodies = Array.from(sourceTable.tBodies);
	if (sourceBodies.length === 0) return null;
	const initialBodyRows = sourceBodies.reduce((sum, body) => sum + body.rows.length, 0);
	if (initialBodyRows <= 1) return null;

	const continuationSection = createContinuationSection(section);
	lockSectionHeight(continuationSection, pageHeight);

	const continuationTable = sourceTable.cloneNode(false) as HTMLTableElement;
	const continuationBodyBySource = new Map<HTMLTableSectionElement, HTMLTableSectionElement>();
	for (const child of Array.from(sourceTable.children)) {
		if (!(child instanceof HTMLElement)) continue;
		const tag = child.tagName.toLowerCase();
		if (tag === 'tbody') {
			const clonedBody = child.cloneNode(false) as HTMLTableSectionElement;
			continuationTable.appendChild(clonedBody);
			continuationBodyBySource.set(child as HTMLTableSectionElement, clonedBody);
			continue;
		}
		if (tag === 'tfoot') continue;
		continuationTable.appendChild(child.cloneNode(true));
	}

	const targetBodies = Array.from(continuationTable.tBodies);
	if (targetBodies.length === 0) {
		const fallbackBody = document.createElement('tbody');
		continuationTable.appendChild(fallbackBody);
		const firstSourceBody = sourceBodies[0];
		if (firstSourceBody) {
			continuationBodyBySource.set(firstSourceBody, fallbackBody);
		}
	}

	continuationSection.appendChild(continuationTable);
	section.insertAdjacentElement('afterend', continuationSection);

	let movedAny = false;
	while (section.scrollHeight - section.clientHeight > PAGE_OVERFLOW_TOLERANCE_PX) {
		const remainingRows = sourceBodies.reduce((sum, body) => sum + body.rows.length, 0);
		if (remainingRows <= 1) break;

		let sourceBodyToMove: HTMLTableSectionElement | null = null;
		for (let i = sourceBodies.length - 1; i >= 0; i -= 1) {
			if (sourceBodies[i].rows.length > 0) {
				sourceBodyToMove = sourceBodies[i];
				break;
			}
		}
		if (!sourceBodyToMove) break;

		const rowToMove = sourceBodyToMove.rows.item(sourceBodyToMove.rows.length - 1);
		if (!rowToMove) break;

		const targetBody = continuationBodyBySource.get(sourceBodyToMove);
		if (!targetBody) break;

		targetBody.prepend(rowToMove);
		movedAny = true;
	}

	if (!movedAny) {
		continuationSection.remove();
		return null;
	}

	return continuationSection;
}

function splitSectionIntoPages(section: HTMLElement, pageHeight: number) {
	lockSectionHeight(section, pageHeight);

	let current = section;
	let guard = 0;

	while (
		current.scrollHeight - current.clientHeight > PAGE_OVERFLOW_TOLERANCE_PX &&
		guard < PAGE_SPLIT_GUARD_LIMIT
	) {
		const overflowPx = current.scrollHeight - current.clientHeight;
		let softAllowancePx = PAGE_SOFT_OVERFLOW_ALLOWANCE_PX;
		const lastMeaningfulElement = getLastMeaningfulElement(current);
		if (lastMeaningfulElement && lastMeaningfulElement.tagName.toLowerCase() === 'p') {
			const lastParagraphHeight = Math.ceil(lastMeaningfulElement.getBoundingClientRect().height);
			softAllowancePx = Math.min(
				Math.max(PAGE_SOFT_OVERFLOW_ALLOWANCE_PX, lastParagraphHeight + 12),
				48
			);
		}
		if (overflowPx <= softAllowancePx) {
			lockSectionHeight(current, pageHeight + overflowPx);
			break;
		}

		guard += 1;

		if (countMeaningfulChildren(current) <= 1) {
			const continuationFromTableSplit = splitSingleOversizedTableSection(current, pageHeight);
			if (continuationFromTableSplit) {
				current = continuationFromTableSplit;
				continue;
			}
			// A single oversized block (usually a large table/image) cannot be split safely here.
			current.style.height = 'auto';
			current.style.maxHeight = 'none';
			current.style.overflow = 'visible';
			break;
		}

		const continuation = createContinuationSection(current);
		current.insertAdjacentElement('afterend', continuation);
		lockSectionHeight(continuation, pageHeight);

		let movedAny = false;
		let keptCurrentPageByAllowance = false;
		while (current.scrollHeight - current.clientHeight > PAGE_OVERFLOW_TOLERANCE_PX) {
			if (countMeaningfulChildren(current) <= 1) break;
			const lastNode = getLastMeaningfulNode(current);
			if (!lastNode) break;
			if (lastNode instanceof HTMLElement) {
				const overflowPx = current.scrollHeight - current.clientHeight;
				const isListItem = lastNode.dataset.docxListItem === 'true';
				if (isListItem) {
					const listItemHeight = Math.ceil(lastNode.getBoundingClientRect().height);
					const keepListItemAllowance = Math.min(
						Math.max(PAGE_SOFT_OVERFLOW_ALLOWANCE_PX, listItemHeight + 56),
						120
					);
					if (overflowPx <= keepListItemAllowance) {
						lockSectionHeight(current, pageHeight + overflowPx);
						keptCurrentPageByAllowance = true;
						break;
					}
				}

				const previousMeaningful = getPreviousMeaningfulSibling(lastNode);
				const isListContinuationBoundary =
					lastNode.tagName.toLowerCase() === 'p' &&
					previousMeaningful?.dataset.docxListItem === 'true';
				if (isListContinuationBoundary) {
					const continuationHeight = Math.ceil(lastNode.getBoundingClientRect().height);
					const keepWithMarkerAllowance = Math.min(
						Math.max(PAGE_SOFT_OVERFLOW_ALLOWANCE_PX, continuationHeight + 28),
						96
					);
					if (overflowPx <= keepWithMarkerAllowance) {
						lockSectionHeight(current, pageHeight + overflowPx);
						keptCurrentPageByAllowance = true;
						break;
					}
				}
			}
			continuation.prepend(lastNode);
			movedAny = true;
		}

		if (!movedAny) {
			continuation.remove();
			if (keptCurrentPageByAllowance) {
				break;
			}
			current.style.height = 'auto';
			current.style.maxHeight = 'none';
			current.style.overflow = 'visible';
			break;
		}

		current = continuation;
	}
}

export function paginateRenderedSections(targetViewer: HTMLElement): void {
	const root = targetViewer.firstElementChild;
	if (!(root instanceof HTMLElement)) return;

	const collectSections = () =>
		Array.from(root.children).filter(
			(node): node is HTMLElement =>
				node instanceof HTMLElement && node.tagName.toLowerCase() === 'section'
		);

	// Pre-pass: a `continuous` section break does NOT start a new page (change of
	// columns/format on the same sheet). We dump its content (without the page
	// chrome) at the end of the previous section and remove it, so that
	// height-based pagination decides the real breaks. Without this, each
	// continuous section turned into a nearly empty page (e.g. the signature block).
	for (const section of collectSections()) {
		if (section.dataset.docxSectionType !== 'continuous') continue;
		const previous = section.previousElementSibling;
		if (!(previous instanceof HTMLElement) || previous.tagName.toLowerCase() !== 'section') {
			continue;
		}
		for (const child of Array.from(section.childNodes)) {
			if (child instanceof HTMLElement && child.dataset.docxPageChrome === 'true') continue;
			previous.appendChild(child);
		}
		section.remove();
	}

	const sections = collectSections();

	for (const section of sections) {
		const declaredHeight =
			parsePxValue(section.style.height) ?? parsePxValue(section.style.minHeight);
		const measuredHeight = Math.round(section.getBoundingClientRect().height);
		const pageHeight =
			declaredHeight != null && declaredHeight > 0
				? declaredHeight
				: measuredHeight > 0
					? measuredHeight
					: null;
		if (!pageHeight) continue;
		// Real docx page height (pgSz). With metrically correct fonts and
		// `line-height` there is no need to calibrate: pagination matches
		// Word naturally (soft-overflow already prevents premature breaks).
		splitSectionIntoPages(section, pageHeight);
	}
}
