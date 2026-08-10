import { parsePxValue, normalizeEditableText } from './dom';

const DOCX_DEFAULT_TAB_INTERVAL_PX = 48;

export type DocxTabStop = {
	positionPx: number;
	style: string;
	leader: string;
};

function normalizeDocxTabStyle(rawStyle: string | undefined): string {
	const style = (rawStyle ?? 'left').toLowerCase();
	switch (style) {
		case 'start':
			return 'left';
		case 'end':
			return 'right';
		default:
			return style;
	}
}

function isIgnorableTextNode(node: Node): boolean {
	return node.nodeType === Node.TEXT_NODE && !(node.textContent ?? '').trim();
}

function isPageChromeNode(node: Node): boolean {
	return node instanceof HTMLElement && node.dataset.docxPageChrome === 'true';
}

export function isIgnorablePageNode(node: Node): boolean {
	return isIgnorableTextNode(node) || isPageChromeNode(node);
}

export function getLastMeaningfulNode(parent: HTMLElement): Node | null {
	const children = Array.from(parent.childNodes);
	for (let i = children.length - 1; i >= 0; i -= 1) {
		const node = children[i];
		if (isIgnorablePageNode(node)) continue;
		return node;
	}
	return null;
}

export function getLastMeaningfulElement(parent: HTMLElement): HTMLElement | null {
	const node = getLastMeaningfulNode(parent);
	return node instanceof HTMLElement ? node : null;
}

function parseDocxTabStops(rawStops: string | undefined): DocxTabStop[] {
	if (!rawStops) return [];
	return rawStops
		.split(/[;,]/)
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const [rawPos, rawStyle, rawLeader] = entry.split('|');
			const positionPx = Number.parseFloat(rawPos);
			if (!Number.isFinite(positionPx) || positionPx < 0) return null;
			return {
				positionPx,
				style: normalizeDocxTabStyle(rawStyle),
				leader: (rawLeader ?? 'none').toLowerCase()
			} as DocxTabStop;
		})
		.filter((stop): stop is DocxTabStop => stop !== null)
		.sort((left, right) => left.positionPx - right.positionPx);
}

function splitNodesByDocxTabs(container: HTMLElement): Node[][] {
	const segments: Node[][] = [[]];
	for (const node of Array.from(container.childNodes)) {
		if (node instanceof HTMLElement && node.dataset.docxTab === '1') {
			segments.push([]);
			continue;
		}
		segments[segments.length - 1].push(node);
	}
	return segments;
}

function segmentText(nodes: Node[]): string {
	return normalizeEditableText(nodes.map((node) => node.textContent ?? '').join('')).trim();
}

function buildDocxTabGridTemplate(stops: DocxTabStop[], segmentsCount: number): string {
	const requiredFixedCols = Math.max(segmentsCount - 1, 1);
	const fixedCols: number[] = [];
	let previousStop = 0;
	for (const stop of stops) {
		const width = Math.max(stop.positionPx - previousStop, 2);
		fixedCols.push(width);
		previousStop = stop.positionPx;
		if (fixedCols.length >= requiredFixedCols) break;
	}
	while (fixedCols.length < requiredFixedCols) {
		fixedCols.push(DOCX_DEFAULT_TAB_INTERVAL_PX);
	}
	const fixedTemplate = fixedCols.map((width) => `${Math.round(width)}px`).join(' ');
	return `${fixedTemplate} minmax(0, 1fr)`;
}

function shouldUseDocxTabGridLayout(
	container: HTMLElement,
	stops: DocxTabStop[],
	segments: Node[][]
): boolean {
	if (container.dataset.docxListItem === 'true') return false;
	if (stops.length === 0 || segments.length < 2) return false;
	if (stops[0].positionPx < 120) return false;
	if (stops.some((stop) => stop.style === 'right' || stop.style === 'center')) return false;

	const leadingText = segmentText(segments[0]);
	const rightText = segmentText(segments[1]);
	if (!leadingText && !rightText) return false;

	const tabCount = segments.length - 1;
	if (tabCount > 10) return false;
	return true;
}

function applyDocxTabGridLayout(
	container: HTMLElement,
	stops: DocxTabStop[],
	segments: Node[][]
) {
	const totalColumns = Math.max(segments.length, 2);
	const fragment = document.createDocumentFragment();
	for (let index = 0; index < totalColumns; index += 1) {
		const cell = document.createElement('span');
		cell.dataset.docxTabCell = String(index + 1);
		cell.style.display = 'block';
		cell.style.minWidth = '0';
		cell.style.whiteSpace = 'pre-wrap';
		cell.style.wordBreak = 'break-word';
		cell.style.gridColumn = String(index + 1);
		const nodes = segments[index] ?? [];
		for (const node of nodes) {
			cell.appendChild(node);
		}
		fragment.appendChild(cell);
	}

	container.replaceChildren(fragment);
	container.dataset.docxTabLayout = 'grid';
	container.style.display = 'grid';
	container.style.gridTemplateColumns = buildDocxTabGridTemplate(stops, segments.length);
	container.style.columnGap = '0px';
	container.style.alignItems = 'start';
}

function applyDocxTabLeaderStyle(tab: HTMLElement, leader: string) {
	tab.style.textDecoration = 'inherit';
	tab.style.textDecorationStyle = '';
	switch (leader) {
		case 'dot':
		case 'middledot':
			tab.style.textDecoration = 'underline';
			tab.style.textDecorationStyle = 'dotted';
			break;
		case 'hyphen':
		case 'heavy':
		case 'underscore':
			tab.style.textDecoration = 'underline';
			break;
	}
}

function collectDocxTabContainers(targetViewer: HTMLElement): HTMLElement[] {
	const containers = new Set<HTMLElement>();
	const tabs = targetViewer.querySelectorAll<HTMLElement>('span[data-docx-tab="1"]');
	for (const tab of tabs) {
		const container = tab.closest<HTMLElement>(
			'[data-docx-editable-root="true"], [data-node-id]'
		);
		if (container) containers.add(container);
	}
	return Array.from(containers);
}

export function applyDocxTabStops(targetViewer: HTMLElement): void {
	const containers = collectDocxTabContainers(targetViewer);
	for (const container of containers) {
		const stops = parseDocxTabStops(container.dataset.docxTabStops);

		const tabs = container.querySelectorAll<HTMLElement>('span[data-docx-tab="1"]');
		if (tabs.length === 0) continue;

		const segments = splitNodesByDocxTabs(container);
		if (shouldUseDocxTabGridLayout(container, stops, segments)) {
			applyDocxTabGridLayout(container, stops, segments);
			continue;
		}

		const containerRect = container.getBoundingClientRect();
		const containerStyle = window.getComputedStyle(container);
		const marginLeftPx = parsePxValue(containerStyle.marginLeft) ?? 0;
		const textFrameStart = containerRect.left + marginLeftPx;
		const tabSequence = Array.from(tabs);
		for (const tab of tabs) {
			tab.style.display = 'inline-block';
			tab.style.minWidth = '0';
			tab.style.width = '0';
			tab.style.verticalAlign = 'baseline';

			const tabRect = tab.getBoundingClientRect();
			const currentX = Math.max(0, tabRect.left - textFrameStart);
			const targetStop = stops.find(
				(stop) => stop.style !== 'clear' && stop.positionPx > currentX + 0.5
			);
			let targetX =
				targetStop?.positionPx ??
				(Math.floor(currentX / DOCX_DEFAULT_TAB_INTERVAL_PX) + 1) * DOCX_DEFAULT_TAB_INTERVAL_PX;

			if (targetStop && (targetStop.style === 'right' || targetStop.style === 'center')) {
				const tabIndex = tabSequence.indexOf(tab);
				const nextTab = tabIndex >= 0 ? tabSequence[tabIndex + 1] : null;
				const measureRange = document.createRange();
				measureRange.setStartAfter(tab);
				if (nextTab && nextTab.parentNode === container) {
					measureRange.setEndBefore(nextTab);
				} else {
					measureRange.setEnd(container, container.childNodes.length);
				}
				const measured = measureRange.getBoundingClientRect();
				const textWidth = Math.max(0, measured.width);
				if (targetStop.style === 'center') {
					targetX = targetStop.positionPx - textWidth / 2;
				} else {
					targetX = targetStop.positionPx - textWidth;
				}
			}

			const width = Math.max(1, targetX - currentX);
			tab.style.width = `${width}px`;
			tab.style.minWidth = `${width}px`;
			tab.textContent = ' ';
			applyDocxTabLeaderStyle(tab, targetStop?.leader ?? 'none');
		}
	}
}
