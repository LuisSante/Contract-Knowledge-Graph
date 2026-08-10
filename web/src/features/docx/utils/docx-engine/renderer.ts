import type {
	ParagraphNode,
	ParagraphEditState,
	ParagraphKind,
	XmlNode
} from './types';
import { ensureNodeEditState } from './edit-state';
import { getRelationsCount, updateRelationBadge } from './docx-page';
import { appendChildren, normalizeEditableText, setStyles, toNodeList } from './dom';
import { getAttr, findChild, localName, toTwipsPx, toNumber } from './xml';
import {
	getParagraphTabStops,
	getParagraphStyleId,
	getParagraphStyles,
	getRunStyles,
	getSectionLayout,
	hasOnlySectionBreak,
	parseBorder
} from './styles';

export type DocxRendererCallbacks = {
	onNodeUpsert: (node: ParagraphNode) => void;
	onNodeFocus: (node: ParagraphNode) => void;
	onNodeCommit: (node: ParagraphNode) => void;
	onNodeRemove: (nodeId: string) => void;
};

export type DocxRendererDeps = {
	nodeEditStateById: Map<string, ParagraphEditState>;
	paragraphElementById: Map<string, HTMLElement>;
	paragraphRelationHostById: Map<string, HTMLElement>;
	relationsCountByNodeId: Map<string, number>;
	getSelectedNodeId: () => string | null;
};

export type DocxRendererOptions = {
	renderExternalPart?: (part: unknown, rootLocalName: 'hdr' | 'ftr') => unknown;
};

export function createRenderer(
	docId: string,
	callbacks: DocxRendererCallbacks,
	deps: DocxRendererDeps,
	options: DocxRendererOptions = {}
) {
	const { onNodeUpsert, onNodeFocus, onNodeCommit, onNodeRemove } = callbacks;
	const {
		nodeEditStateById,
		paragraphElementById,
		paragraphRelationHostById,
		relationsCountByNodeId,
		getSelectedNodeId
	} = deps;

	type ListLevelDefinition = {
		numFmt: string;
		lvlText: string;
		start: number;
	};
	type ParagraphStyleDefinition = {
		basedOn: string | null;
		pPr: XmlNode | null;
		runPr: XmlNode | null;
		linked: string | null;
	};
	type CharacterStyleDefinition = {
		basedOn: string | null;
		runPr: XmlNode | null;
	};
	type TextSegmentRange = {
		start: number;
		end: number;
	};
	type ParagraphIndent = {
		left: number | null;
		right: number | null;
		firstLine: number | null;
		hanging: number | null;
	};
	type ParagraphNumberingInfo = {
		numId: string;
		level: number;
	};

	const listState = new Map<string, number[]>();
	const listDefinitionsByNumId = new Map<string, Map<number, ListLevelDefinition>>();
	const paragraphStyleDefinitionsById = new Map<string, ParagraphStyleDefinition>();
	const characterStyleDefinitionsById = new Map<string, CharacterStyleDefinition>();
	const paragraphStyleCache = new Map<string, Record<string, string>>();
	const paragraphRunStyleCache = new Map<string, Record<string, string>>();
	const characterRunStyleCache = new Map<string, Record<string, string>>();
	let defaultRunPr: XmlNode | null = null;
	let defaultParagraphStyleId: string | null = null;
	let defaultCharacterStyleId: string | null = null;
	let paragraphCounter = 0;
	let readOnlyDepth = 0;
	let inheritedHeaders: Map<string, unknown> | null = null;
	let inheritedFooters: Map<string, unknown> | null = null;
	const htmlEntityDecoder = document.createElement('textarea');
	const EMU_PER_PX = 9525;
	const INTERACTIVE_PARAGRAPH_CLASSES = [
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
	const ENTITY_RE = /&(?:#\d+|#x[\da-f]+|[a-z][\w-]+);/i;
	const DEFINITION_BOUNDARY_RE =
		/\.\s*(?=[“"][^”"]{1,120}[”"](?:\s+(?:and|or)\s+[“"][^”"]{1,120}[”"])?\s+(?:means|mean|shall|has|is|are|refers|includes)\b)/gi;

	const decodeDocxText = (value: string): string => {
		if (!value.includes('&') || !ENTITY_RE.test(value)) return value;

		let decoded = value;
		for (let i = 0; i < 2; i += 1) {
			htmlEntityDecoder.innerHTML = decoded;
			const next = htmlEntityDecoder.value;
			if (!next || next === decoded) break;
			decoded = next;
		}
		return decoded;
	};

	const getXmlText = (node?: XmlNode | null): string => {
		if (!node) return '';
		if (node.type === 'text') return node.data ?? '';
		return node.children?.map((child) => getXmlText(child)).join('') ?? '';
	};

	const emuToPx = (value: unknown): number | null => {
		const parsed = toNumber(value);
		if (parsed == null) return null;
		return parsed / EMU_PER_PX;
	};

	const trimTextRange = (text: string, start: number, end: number): TextSegmentRange => {
		let trimmedStart = start;
		let trimmedEnd = end;
		while (trimmedStart < trimmedEnd && /\s/.test(text[trimmedStart] ?? '')) {
			trimmedStart += 1;
		}
		while (trimmedEnd > trimmedStart && /\s/.test(text[trimmedEnd - 1] ?? '')) {
			trimmedEnd -= 1;
		}
		return { start: trimmedStart, end: trimmedEnd };
	};

	const getDefinitionParagraphSplitRanges = (text: string): TextSegmentRange[] => {
		const firstVisibleIndex = text.search(/\S/);
		if (firstVisibleIndex < 0) return [];
		const firstVisible = text[firstVisibleIndex];
		if (!(firstVisible === '“' || firstVisible === '"')) return [];

		const firstDefinitionProbe = text.slice(firstVisibleIndex, firstVisibleIndex + 220);
		if (!/\b(?:means|mean|shall|has|is|are|refers|includes)\b/i.test(firstDefinitionProbe)) {
			return [];
		}

		DEFINITION_BOUNDARY_RE.lastIndex = 0;
		const boundaries: number[] = [];
		let match: RegExpExecArray | null;
		while ((match = DEFINITION_BOUNDARY_RE.exec(text)) !== null) {
			boundaries.push(match.index + 1);
		}
		if (boundaries.length === 0) return [];

		const points = [0, ...boundaries, text.length];
		const ranges = points
			.slice(0, -1)
			.map((start, index) => trimTextRange(text, start, points[index + 1]))
			.filter((range) => range.end > range.start);

		return ranges.length > 1 ? ranges : [];
	};

	const resolveDomPointByTextOffset = (
		root: HTMLElement,
		offset: number
	): { node: Node; offset: number } => {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let remaining = Math.max(offset, 0);
		let lastTextNode: Text | null = null;

		while (walker.nextNode()) {
			const node = walker.currentNode as Text;
			lastTextNode = node;
			const length = node.data.length;
			if (remaining <= length) {
				return { node, offset: remaining };
			}
			remaining -= length;
		}

		if (lastTextNode) {
			return { node: lastTextNode, offset: lastTextNode.data.length };
		}
		return { node: root, offset: root.childNodes.length };
	};

	const cloneInlineContentRange = (
		root: HTMLElement,
		range: TextSegmentRange
	): DocumentFragment => {
		const selectionRange = document.createRange();
		const start = resolveDomPointByTextOffset(root, range.start);
		const end = resolveDomPointByTextOffset(root, range.end);
		selectionRange.setStart(start.node, start.offset);
		selectionRange.setEnd(end.node, end.offset);
		return selectionRange.cloneContents();
	};

	const splitDefinitionParagraph = (paragraph: HTMLElement): HTMLElement[] => {
		const text = paragraph.textContent ?? '';
		const ranges = getDefinitionParagraphSplitRanges(text);
		if (ranges.length === 0) return [];

		return ranges.map((range) => {
			const splitParagraph = paragraph.cloneNode(false) as HTMLElement;
			splitParagraph.appendChild(cloneInlineContentRange(paragraph, range));
			return splitParagraph;
		});
	};

	const toAlphabetic = (value: number, uppercase: boolean): string => {
		if (value <= 0 || !Number.isFinite(value)) return String(value);
		let remaining = Math.trunc(value);
		let output = '';
		const base = uppercase ? 65 : 97;
		while (remaining > 0) {
			remaining -= 1;
			output = String.fromCharCode(base + (remaining % 26)) + output;
			remaining = Math.floor(remaining / 26);
		}
		return output;
	};

	const toRoman = (value: number, uppercase: boolean): string => {
		if (value <= 0 || !Number.isFinite(value)) return String(value);
		const table: Array<[number, string]> = [
			[1000, 'M'],
			[900, 'CM'],
			[500, 'D'],
			[400, 'CD'],
			[100, 'C'],
			[90, 'XC'],
			[50, 'L'],
			[40, 'XL'],
			[10, 'X'],
			[9, 'IX'],
			[5, 'V'],
			[4, 'IV'],
			[1, 'I']
		];
		let remaining = Math.trunc(value);
		let output = '';
		for (const [step, symbol] of table) {
			while (remaining >= step) {
				output += symbol;
				remaining -= step;
			}
		}
		return uppercase ? output : output.toLowerCase();
	};

	const formatCounter = (value: number, numFmt: string): string => {
		switch (numFmt.toLowerCase()) {
			case 'upperletter':
				return toAlphabetic(value, true);
			case 'lowerletter':
				return toAlphabetic(value, false);
			case 'upperroman':
				return toRoman(value, true);
			case 'lowerroman':
				return toRoman(value, false);
			case 'decimalzero':
				return String(value).padStart(2, '0');
			default:
				return String(value);
		}
	};

	const parseStylesNode = (stylesNode?: XmlNode | null) => {
		defaultRunPr = null;
		defaultParagraphStyleId = null;
		defaultCharacterStyleId = null;
		paragraphStyleDefinitionsById.clear();
		characterStyleDefinitionsById.clear();
		paragraphStyleCache.clear();
		paragraphRunStyleCache.clear();
		characterRunStyleCache.clear();
		if (!stylesNode?.children) return;

		const docDefaults = stylesNode.children.find(
			(child) => localName(child.name) === 'docdefaults'
		);
		const rPrDefault = findChild(docDefaults, 'rprdefault');
		const runDefaults = findChild(rPrDefault, 'rpr');
		if (runDefaults) {
			defaultRunPr = runDefaults;
		}

		for (const child of stylesNode.children) {
			if (localName(child.name) !== 'style') continue;
			const styleType = (getAttr(child, 'type') ?? '').toLowerCase();
			const styleId = getAttr(child, 'styleId');
			if (!styleId || (styleType !== 'paragraph' && styleType !== 'character')) continue;
			const isDefault = (getAttr(child, 'default') ?? '').toLowerCase() === '1';
			if (styleType === 'paragraph' && isDefault) {
				defaultParagraphStyleId = styleId;
			}
			if (styleType === 'character' && isDefault) {
				defaultCharacterStyleId = styleId;
			}
			const basedOn = getAttr(findChild(child, 'basedon'), 'val') ?? null;
			const pPr = findChild(child, 'ppr') ?? null;
			const runPr = findChild(child, 'rpr') ?? null;
			const linked = getAttr(findChild(child, 'link'), 'val') ?? null;
			if (styleType === 'paragraph') {
				paragraphStyleDefinitionsById.set(styleId, { basedOn, pPr, runPr, linked });
				continue;
			}
			characterStyleDefinitionsById.set(styleId, { basedOn, runPr });
		}
	};

	const parseNumberingNode = (numberingNode?: XmlNode | null) => {
		listState.clear();
		listDefinitionsByNumId.clear();
		if (!numberingNode?.children) return;

		const abstractLevelsById = new Map<string, Map<number, ListLevelDefinition>>();
		const numNodesById = new Map<string, XmlNode>();

		for (const child of numberingNode.children) {
			const tag = localName(child.name);

			if (tag === 'abstractnum') {
				const abstractId = getAttr(child, 'abstractNumId');
				if (!abstractId) continue;
				const levels = new Map<number, ListLevelDefinition>();
				for (const levelNode of child.children ?? []) {
					if (localName(levelNode.name) !== 'lvl') continue;
					const rawLevel = toNumber(getAttr(levelNode, 'ilvl'));
					const level = rawLevel != null ? Math.max(Math.trunc(rawLevel), 0) : 0;
					const numFmt = getAttr(findChild(levelNode, 'numfmt'), 'val') ?? 'decimal';
					const lvlText = decodeDocxText(
						getAttr(findChild(levelNode, 'lvltext'), 'val') ?? `%${level + 1}`
					);
					const rawStart = toNumber(getAttr(findChild(levelNode, 'start'), 'val'));
					const start = rawStart != null ? Math.trunc(rawStart) : 1;
					levels.set(level, { numFmt, lvlText, start });
				}
				abstractLevelsById.set(abstractId, levels);
				continue;
			}

			if (tag === 'num') {
				const numId = getAttr(child, 'numId');
				if (!numId) continue;
				numNodesById.set(numId, child);
			}
		}

		for (const [numId, numNode] of numNodesById.entries()) {
			const abstractId = getAttr(findChild(numNode, 'abstractNumId'), 'val');
			const baseLevels = abstractId ? abstractLevelsById.get(abstractId) : undefined;
			const resolvedLevels = new Map<number, ListLevelDefinition>();
			for (const [level, levelDef] of baseLevels?.entries() ?? []) {
				resolvedLevels.set(level, { ...levelDef });
			}

			for (const overrideNode of numNode.children ?? []) {
				if (localName(overrideNode.name) !== 'lvloverride') continue;
				const rawLevel = toNumber(getAttr(overrideNode, 'ilvl'));
				const level = rawLevel != null ? Math.max(Math.trunc(rawLevel), 0) : 0;
				const existingLevel = resolvedLevels.get(level) ?? {
					numFmt: 'decimal',
					lvlText: `%${level + 1}`,
					start: 1
				};
				const mergedLevel = { ...existingLevel };

				const startOverrideRaw = toNumber(getAttr(findChild(overrideNode, 'startoverride'), 'val'));
				if (startOverrideRaw != null) {
					mergedLevel.start = Math.trunc(startOverrideRaw);
				}

				const inlineLevel = findChild(overrideNode, 'lvl');
				if (inlineLevel) {
					const numFmt = getAttr(findChild(inlineLevel, 'numfmt'), 'val');
					const lvlText = getAttr(findChild(inlineLevel, 'lvltext'), 'val');
					const startRaw = toNumber(getAttr(findChild(inlineLevel, 'start'), 'val'));

					if (numFmt) mergedLevel.numFmt = numFmt;
					if (lvlText != null) mergedLevel.lvlText = decodeDocxText(lvlText);
					if (startRaw != null) mergedLevel.start = Math.trunc(startRaw);
				}

				resolvedLevels.set(level, mergedLevel);
			}

			if (resolvedLevels.size > 0) {
				listDefinitionsByNumId.set(numId, resolvedLevels);
			}
		}
	};

	const getParagraphInheritedRunStyles = (pr?: XmlNode | null): Record<string, string> => {
		const styleId = getParagraphStyleId(pr) ?? defaultParagraphStyleId ?? '__default__';
		const cached = paragraphRunStyleCache.get(styleId);
		if (cached) return cached;

		const inherited: Record<string, string> = {};
		if (defaultRunPr) {
			Object.assign(inherited, getRunStyles(defaultRunPr));
		}

		const visited = new Set<string>();
		const applyStyleChain = (id: string | null) => {
			if (!id || visited.has(id)) return;
			visited.add(id);
			const styleDef = paragraphStyleDefinitionsById.get(id);
			if (!styleDef) return;
			applyStyleChain(styleDef.basedOn);
			if (styleDef.runPr) {
				Object.assign(inherited, getRunStyles(styleDef.runPr));
			}
			if (styleDef.linked) {
				Object.assign(inherited, getCharacterStyleRunStyles(styleDef.linked));
			}
		};
		applyStyleChain(styleId === '__default__' ? null : styleId);
		if (defaultCharacterStyleId) {
			Object.assign(inherited, getCharacterStyleRunStyles(defaultCharacterStyleId));
		}

		paragraphRunStyleCache.set(styleId, inherited);
		return inherited;
	};

	const getCharacterStyleRunStyles = (styleId: string | null): Record<string, string> => {
		if (!styleId) return {};
		const cached = characterRunStyleCache.get(styleId);
		if (cached) return cached;

		const inherited: Record<string, string> = {};
		const visited = new Set<string>();
		const applyStyleChain = (id: string | null) => {
			if (!id || visited.has(id)) return;
			visited.add(id);
			const styleDef = characterStyleDefinitionsById.get(id);
			if (!styleDef) return;
			applyStyleChain(styleDef.basedOn);
			if (styleDef.runPr) {
				Object.assign(inherited, getRunStyles(styleDef.runPr));
			}
		};
		applyStyleChain(styleId);

		characterRunStyleCache.set(styleId, inherited);
		return inherited;
	};

	const getRunInheritedCharacterStyles = (pr?: XmlNode | null): Record<string, string> => {
		const runStyleId = getAttr(findChild(pr, 'rstyle'), 'val') ?? null;
		if (!runStyleId) return {};
		return getCharacterStyleRunStyles(runStyleId);
	};

	const getParagraphInheritedParagraphStyles = (pr?: XmlNode | null): Record<string, string> => {
		const styleId = getParagraphStyleId(pr) ?? defaultParagraphStyleId;
		if (!styleId) return {};

		const cached = paragraphStyleCache.get(styleId);
		if (cached) return cached;

		const inherited: Record<string, string> = {};
		const visited = new Set<string>();
		const applyStyleChain = (id: string | null) => {
			if (!id || visited.has(id)) return;
			visited.add(id);
			const styleDef = paragraphStyleDefinitionsById.get(id);
			if (!styleDef) return;
			applyStyleChain(styleDef.basedOn);
			if (styleDef.pPr) {
				Object.assign(inherited, getParagraphStyles(styleDef.pPr));
			}
		};
		applyStyleChain(styleId);

		paragraphStyleCache.set(styleId, inherited);
		return inherited;
	};

	const getParagraphDirectRunStyles = (pr?: XmlNode | null): Record<string, string> =>
		getRunStyles(findChild(pr, 'rpr'));

	const getParagraphIndentPx = (pr?: XmlNode | null): ParagraphIndent => {
		const indent = findChild(pr, 'ind');
		return {
			left: toTwipsPx(getAttr(indent, 'left') ?? getAttr(indent, 'start')),
			right: toTwipsPx(getAttr(indent, 'right') ?? getAttr(indent, 'end')),
			firstLine: toTwipsPx(getAttr(indent, 'firstLine')),
			hanging: toTwipsPx(getAttr(indent, 'hanging'))
		};
	};

	const getHangingListLayout = (pr?: XmlNode | null): { left: number; hanging: number } | null => {
		const indent = getParagraphIndentPx(pr);
		const left = indent.left ?? 0;
		const hanging = indent.hanging ?? 0;
		if (left <= 0 || hanging <= 0 || left < hanging) return null;

		const tabStop = getParagraphTabStops(pr)[0]?.positionPx;
		if (tabStop == null || Math.abs(tabStop - left) > 3) return null;
		if (left < 24 || hanging < 12) return null;

		return { left, hanging };
	};

	const shouldShrinkParagraphBox = (element: HTMLElement, pr?: XmlNode | null): boolean => {
		if (element.querySelector('table,img,svg,canvas,video,audio,object,iframe')) return false;
		if (getParagraphTabStops(pr).length > 0) return false;

		const directAlignment = getAttr(findChild(pr, 'jc'), 'val')?.toLowerCase();
		const inheritedAlignment = element.style.textAlign?.toLowerCase();
		const alignment = inheritedAlignment || directAlignment;
		if (alignment && alignment !== 'left' && alignment !== 'start') return false;

		const text = normalizeEditableText(element.textContent ?? '').trim();
		if (!text || text.length > 140) return false;
		return true;
	};

	const applyShrinkToTextBox = (element: HTMLElement) => {
		element.dataset.docxShrinkToText = 'true';
		// Block level (not inline): the box hugs the text width but still
		// stacks vertically like a Word paragraph. With inline-block, two
		// consecutive short paragraphs flowed on the SAME line (e.g. "products."
		// next to "NOW, THEREFORE…"), breaking the 1:1 layout.
		element.style.display =
			element.dataset.docxListLayout === 'hanging-grid' ? 'grid' : 'block';
		element.style.width = 'fit-content';
		element.style.maxWidth = '100%';
		element.style.verticalAlign = 'top';
	};

	const removeLeadingDocxTab = (element: HTMLElement) => {
		const firstChild = element.firstElementChild;
		if (firstChild instanceof HTMLElement && firstChild.dataset.docxTab === '1') {
			firstChild.remove();
		}
	};

	const applyParagraphTabStopMetadata = (element: HTMLElement, pr?: XmlNode | null) => {
		const stops = getParagraphTabStops(pr);
		if (stops.length === 0) {
			delete element.dataset.docxTabStops;
			return;
		}
		element.dataset.docxTabStops = stops
			.map(
				(stop) =>
					`${Math.round(stop.positionPx * 100) / 100}|${stop.style.toLowerCase()}|${stop.leader.toLowerCase()}`
			)
			.join(';');
	};

	const nextListMarker = (numId: string | undefined, level: number): string => {
		if (!numId) return '•';
		const key = String(numId);
		const counters = listState.get(key) ?? [];
		const levels = listDefinitionsByNumId.get(key);
		const levelDef = levels?.get(level);
		const start = levelDef?.start ?? 1;
		counters[level] = (counters[level] ?? start - 1) + 1;
		counters.length = level + 1;
		listState.set(key, counters);

		if (!levelDef) return `${counters[level]}.`;
		if (levelDef.numFmt.toLowerCase() === 'bullet') return levelDef.lvlText || '•';

		const marker = (levelDef.lvlText || `%${level + 1}`).replace(
			/%(\d+)/g,
			(_, rawIndex: string) => {
				const levelIndex = Math.max(Number(rawIndex) - 1, 0);
				const referencedLevel = levels?.get(levelIndex);
				const levelValue = counters[levelIndex] ?? referencedLevel?.start ?? 1;
				const numberFormat = referencedLevel?.numFmt ?? levelDef.numFmt;
				return formatCounter(levelValue, numberFormat);
			}
		);

		return marker || `${formatCounter(counters[level], levelDef.numFmt)}.`;
	};

	const getParagraphNumberingInfo = (pr?: XmlNode | null): ParagraphNumberingInfo | null => {
		const numPr = findChild(pr, 'numpr');
		if (!numPr) return null;

		const numId = getAttr(findChild(numPr, 'numid'), 'val');
		if (!numId) return null;

		const rawLevel = toNumber(getAttr(findChild(numPr, 'ilvl'), 'val'));
		const level = rawLevel != null ? Math.max(Math.trunc(rawLevel), 0) : 0;
		return { numId, level };
	};

	const clearRelationBadge = (host: HTMLElement) => {
		host.classList.remove('docx-relations-badge-host');
		delete host.dataset.relationsCount;
		delete host.dataset.relationsTone;
	};

	const isReadOnlyRender = () => readOnlyDepth > 0;

	const isHeaderOrFooterStyle = (pr?: XmlNode | null): boolean => {
		const styleId = getParagraphStyleId(pr)?.toLowerCase();
		if (!styleId) return false;
		return styleId.includes('header') || styleId.includes('footer');
	};

	const attachParagraphEditor = (
		element: HTMLElement,
		kind: ParagraphKind,
		relationHost: HTMLElement = element,
		options: { disabled?: boolean; visualElement?: HTMLElement; textPrefix?: string } = {}
	) => {
		const visualElement = options.visualElement ?? element;
		const textPrefix = normalizeEditableText(options.textPrefix ?? '').trim();

		if (options.disabled || isReadOnlyRender()) {
			visualElement.dataset.ignoredParagraph = 'true';
			element.dataset.ignoredParagraph = 'true';
			element.setAttribute('contenteditable', 'false');
			element.setAttribute('spellcheck', 'false');
			return;
		}

		paragraphCounter += 1;
		const paragraphEnum = paragraphCounter;
		const nodeId = `${docId}-p-${paragraphEnum}`;

		const baseNode: ParagraphNode = {
			id: nodeId,
			documentId: docId,
			text: '',
			paragraph_enum: paragraphEnum,
			page: 1,
			relationsCount: 0
		};

		visualElement.dataset.nodeId = nodeId;
		visualElement.dataset.paragraphKind = kind;
		element.dataset.docxEditableRoot = 'true';
		element.setAttribute('contenteditable', 'true');
		element.setAttribute('spellcheck', 'false');
		paragraphElementById.set(nodeId, visualElement);
		paragraphRelationHostById.set(nodeId, relationHost);
		visualElement.classList.add(...INTERACTIVE_PARAGRAPH_CLASSES);

		let hasNodeInStore = false;

		const syncText = (): ParagraphNode | null => {
			const editableText = normalizeEditableText(element.innerText ?? '').trim();
			const text = editableText
				? textPrefix
					? `${textPrefix} ${editableText}`
					: editableText
				: '';
			if (!text) {
				if (hasNodeInStore) {
					onNodeRemove(nodeId);
					hasNodeInStore = false;
				}
				clearRelationBadge(relationHost);
				return null;
			}

			updateRelationBadge(paragraphRelationHostById, relationsCountByNodeId, nodeId, relationHost);
			const node = {
				...baseNode,
				text,
				relationsCount: getRelationsCount(relationsCountByNodeId, nodeId)
			};
			onNodeUpsert(node);
			hasNodeInStore = true;
			return node;
		};

		element.addEventListener('input', () => {
			const node = syncText();
			if (!node) return;
			const state = ensureNodeEditState(nodeEditStateById, nodeId, node.text);
			state.editedSinceCommit = true;
			if (getSelectedNodeId() === node.id || document.activeElement === element) {
				onNodeFocus(node);
			}
		});

		element.addEventListener('focus', () => {
			const node = syncText();
			if (!node) return;
			const state = ensureNodeEditState(nodeEditStateById, node.id, node.text);
			if (!state.editedSinceCommit && state.committed !== state.current) {
				state.committed = state.current;
			}
			onNodeFocus(node);
		});

		element.addEventListener('keydown', (event: KeyboardEvent) => {
			if (!(event.key === 'Enter' && (event.ctrlKey || event.metaKey))) return;
			event.preventDefault();
			const node = syncText();
			if (!node) return;
			onNodeCommit(node);
		});

		if (visualElement !== element) {
			visualElement.addEventListener('click', (event: MouseEvent) => {
				const target = event.target;
				if (!(target instanceof Node) || !visualElement.contains(target)) return;
				const node = syncText();
				if (!node) return;
				onNodeFocus(node);
				if (
					!(target instanceof HTMLElement && target.closest('[data-docx-editable-root="true"]'))
				) {
					element.focus();
				}
			});
		}

		const node = syncText();
		if (node && getSelectedNodeId() === node.id) {
			onNodeFocus(node);
		}
	};

	const getPartMap = (value: unknown): Map<string, unknown> | null => {
		if (!(value instanceof Map) || value.size === 0) return null;
		return value as Map<string, unknown>;
	};

	const selectHeaderFooterPart = (
		current: Map<string, unknown> | null,
		inherited: Map<string, unknown> | null
	): unknown => {
		const source = current && current.size > 0 ? current : inherited;
		return source?.get('default') ?? source?.get('first') ?? source?.values().next().value;
	};

	const renderHeaderFooterPart = (part: unknown, rootLocalName: 'hdr' | 'ftr'): unknown => {
		if (!part || !options.renderExternalPart) return null;
		readOnlyDepth += 1;
		try {
			return options.renderExternalPart(part, rootLocalName);
		} finally {
			readOnlyDepth -= 1;
		}
	};

	const createPageChromeLayer = (headerPart: unknown, footerPart: unknown): HTMLElement | null => {
		const chrome = document.createElement('div');
		chrome.dataset.docxPageChrome = 'true';
		chrome.className = 'pointer-events-none absolute inset-0 overflow-hidden text-gray-900';
		chrome.setAttribute('contenteditable', 'false');
		chrome.setAttribute('aria-hidden', 'true');
		chrome.style.zIndex = '2';

		appendChildren(chrome, renderHeaderFooterPart(headerPart, 'hdr'));
		appendChildren(chrome, renderHeaderFooterPart(footerPart, 'ftr'));

		if (chrome.childNodes.length === 0) return null;
		return chrome;
	};

	const applyAnchorPositionStyles = (element: HTMLElement, anchorNode?: XmlNode | null) => {
		const positionH = findChild(anchorNode, 'positionh');
		const positionV = findChild(anchorNode, 'positionv');
		const x = emuToPx(getXmlText(findChild(positionH, 'posoffset')).trim());
		const y = emuToPx(getXmlText(findChild(positionV, 'posoffset')).trim());
		const extent = findChild(anchorNode, 'extent');
		const width = emuToPx(getAttr(extent, 'cx'));
		const height = emuToPx(getAttr(extent, 'cy'));

		if (x != null || y != null) {
			element.style.position = 'absolute';
			element.style.left = `${x ?? 0}px`;
			element.style.top = `${y ?? 0}px`;
			element.style.margin = '0';
		}
		if (width != null) element.style.width = `${width}px`;
		if (height != null) element.style.height = `${height}px`;
	};

	return (type: string, props: Record<string, unknown> = {}, children: unknown) => {
		const safeProps =
			props && typeof props === 'object' && !Array.isArray(props)
				? (props as Record<string, unknown>)
				: {};

		try {
			switch (type) {
				case 'styles': {
					parseStylesNode((safeProps.node as XmlNode) ?? null);
					return document.createDocumentFragment();
				}
				case 'numbering': {
					parseNumberingNode((safeProps.node as XmlNode) ?? null);
					return document.createDocumentFragment();
				}
				case 'document': {
					const root = document.createElement('div');
					root.className = 'mx-auto flex w-full max-w-max flex-col items-center gap-4';
					appendChildren(root, children);
					return root;
				}
				case 'section': {
					const section = document.createElement('section');
					section.className =
						'overflow-hidden bg-white text-gray-900 shadow-[0_8px_24px_rgba(17,24,39,0.1)]';
					const layout = getSectionLayout((safeProps.node as XmlNode) ?? null);
					const currentHeaders = getPartMap(safeProps.headers);
					const currentFooters = getPartMap(safeProps.footers);
					const headerPart = selectHeaderFooterPart(currentHeaders, inheritedHeaders);
					const footerPart = selectHeaderFooterPart(currentFooters, inheritedFooters);
					if (currentHeaders) inheritedHeaders = currentHeaders;
					if (currentFooters) inheritedFooters = currentFooters;

					section.style.width = `${layout.width}px`;
					section.style.height = `${layout.height}px`;
					section.style.minHeight = `${layout.height}px`;
					section.style.padding = `${layout.marginTop}px ${layout.marginRight}px ${layout.marginBottom}px ${layout.marginLeft}px`;
					section.style.position = 'relative';
					section.dataset.docxPageWidthPx = String(layout.width);
					section.dataset.docxPageHeightPx = String(layout.height);
					// Section break type: `continuous` does NOT start a new page
					// (change of columns/format on the same sheet); pagination
					// merges these sections with the previous one.
					const sectionType = getAttr(
						findChild((safeProps.node as XmlNode) ?? null, 'type'),
						'val'
					)?.toLowerCase();
					if (sectionType) section.dataset.docxSectionType = sectionType;
					const pageChrome = createPageChromeLayer(headerPart, footerPart);
					if (pageChrome) section.appendChild(pageChrome);
					appendChildren(section, children);
					return section;
				}
				case 'heading': {
					const level = Math.min(Math.max(toNumber(safeProps.outline) ?? 1, 1), 6);
					const pr = (safeProps.pr as XmlNode) ?? null;
					const heading = document.createElement(`h${level}`);
					heading.className = 'font-bold whitespace-pre-wrap break-words [tab-size:4]';
					const content = document.createElement('span');
					content.className = 'inline whitespace-pre-wrap break-words outline-none [tab-size:4]';
					appendChildren(content, children);

					let headingTextPrefix = '';
					let headingMarker: HTMLSpanElement | null = null;
					const numberingInfo = getParagraphNumberingInfo(pr);
					if (numberingInfo) {
						const markerText = nextListMarker(numberingInfo.numId, numberingInfo.level);
						if (markerText) {
							const marker = document.createElement('span');
							marker.className = 'inline-block whitespace-nowrap';
							marker.textContent = markerText;
							marker.dataset.docxListMarker = markerText;
							marker.style.whiteSpace = 'nowrap';
							marker.style.overflow = 'visible';
							marker.style.fontSize = 'inherit';
							marker.style.fontWeight = '400';
							marker.style.lineHeight = 'inherit';
							marker.style.display = 'inline-block';
							marker.style.marginRight = '4px';
							marker.style.verticalAlign = 'baseline';
							marker.setAttribute('contenteditable', 'false');
							heading.dataset.docxListMarker = markerText;
							heading.appendChild(marker);
							headingMarker = marker;
							headingTextPrefix = markerText;
						}
					}

					heading.appendChild(content);
					setStyles(heading, getParagraphInheritedParagraphStyles(pr));
					setStyles(heading, getParagraphStyles(pr));
					setStyles(heading, getParagraphInheritedRunStyles(pr));
					setStyles(heading, getParagraphDirectRunStyles(pr));
					applyParagraphTabStopMetadata(heading, pr);

					const hangingLayout = getHangingListLayout(pr);
					if (headingMarker && hangingLayout) {
						heading.style.marginLeft = `${Math.max(hangingLayout.left - hangingLayout.hanging, 0)}px`;
						heading.style.display = 'grid';
						heading.style.gridTemplateColumns = `${hangingLayout.hanging}px minmax(0, 1fr)`;
						heading.style.columnGap = '0';
						heading.style.alignItems = 'baseline';
						heading.style.paddingLeft = '0';
						heading.style.textIndent = '0';
						heading.dataset.docxListLayout = 'hanging-grid';
						heading.dataset.docxListMarkerColumnPx = String(hangingLayout.hanging);
						headingMarker.style.gridColumn = '1';
						headingMarker.style.width = '100%';
						headingMarker.style.marginRight = '0';
						content.style.display = 'block';
						content.style.gridColumn = '2';
						content.style.minWidth = '0';
						removeLeadingDocxTab(content);
					}

					if (shouldShrinkParagraphBox(heading, pr)) {
						applyShrinkToTextBox(heading);
					}
					attachParagraphEditor(content, 'heading', heading, {
						visualElement: heading,
						disabled: isHeaderOrFooterStyle(pr),
						textPrefix: headingTextPrefix
					});
					return heading;
				}
				case 'list': {
					const item = document.createElement('p');
					item.dataset.docxListItem = 'true';
					item.className = 'whitespace-pre-wrap break-words [tab-size:4]';
					const level = Math.max(toNumber(safeProps.level) ?? 0, 0);
					const pr = (safeProps.pr as XmlNode) ?? null;
					const markerText = nextListMarker(
						typeof safeProps.numId === 'string' ? safeProps.numId : undefined,
						level
					);
					const hangingLayout = getHangingListLayout(pr);

					const marker = document.createElement('span');
					marker.className = 'inline-block whitespace-nowrap';
					marker.textContent = markerText;
					marker.dataset.docxListMarker = markerText;
					marker.style.whiteSpace = 'nowrap';
					marker.style.overflow = 'visible';
					marker.style.fontSize = 'inherit';
					marker.style.fontWeight = '400';
					marker.style.lineHeight = 'inherit';
					marker.style.display = 'inline-block';
					marker.style.marginRight = '4px';
					marker.style.verticalAlign = 'baseline';
					marker.setAttribute('contenteditable', 'false');

					const content = document.createElement('span');
					content.className = 'inline whitespace-pre-wrap break-words outline-none [tab-size:4]';
					appendChildren(content, children);

					setStyles(item, getParagraphInheritedParagraphStyles(pr));
					setStyles(item, getParagraphStyles(pr));
					setStyles(item, getParagraphInheritedRunStyles(pr));
					setStyles(item, getParagraphDirectRunStyles(pr));
					applyParagraphTabStopMetadata(item, pr);
					item.style.paddingLeft = '0';
					item.style.textIndent = '0';
					if (hangingLayout) {
						item.style.marginLeft = `${Math.max(hangingLayout.left - hangingLayout.hanging, 0)}px`;
						item.style.display = 'grid';
						item.style.gridTemplateColumns = `${hangingLayout.hanging}px minmax(0, 1fr)`;
						item.style.columnGap = '0';
						item.style.alignItems = 'baseline';
						item.style.paddingLeft = '0';
						item.style.textIndent = '0';
						item.dataset.docxListLayout = 'hanging-grid';
						item.dataset.docxListMarkerColumnPx = String(hangingLayout.hanging);
						marker.style.gridColumn = '1';
						marker.style.width = '100%';
						marker.style.marginRight = '0';
						content.style.display = 'block';
						content.style.gridColumn = '2';
						content.style.minWidth = '0';
						removeLeadingDocxTab(content);
					}
					item.dataset.docxListMarker = markerText;

					item.appendChild(marker);
					item.appendChild(content);
					if (shouldShrinkParagraphBox(item, pr)) {
						applyShrinkToTextBox(item);
					}
					attachParagraphEditor(content, 'list', item, {
						visualElement: item,
						disabled: isHeaderOrFooterStyle(pr),
						textPrefix: markerText
					});
					return item;
				}
				case 'p': {
					const paragraph = document.createElement('p');
					const pr = (safeProps.pr as XmlNode) ?? null;
					paragraph.className = 'whitespace-pre-wrap break-words [tab-size:4]';
					setStyles(paragraph, getParagraphInheritedParagraphStyles(pr));
					setStyles(paragraph, getParagraphStyles(pr));
					setStyles(paragraph, getParagraphInheritedRunStyles(pr));
					setStyles(paragraph, getParagraphDirectRunStyles(pr));
					applyParagraphTabStopMetadata(paragraph, pr);
					if (hasOnlySectionBreak(pr) && toNodeList(children).length === 0) {
						paragraph.classList.add('min-h-[1px]');
					}
					appendChildren(paragraph, children);
					// Word: an empty paragraph takes up a line (its paragraph mark). In HTML
					// an empty <p> collapses to height 0, which sticks neighboring paragraphs
					// together (e.g. definitions separated by blank paragraphs). We give it
					// the height of a line to reproduce the document's spacing.
					if (
						!hasOnlySectionBreak(pr) &&
						(paragraph.textContent ?? '').trim() === '' &&
						!paragraph.querySelector(
							'img,table,svg,canvas,video,audio,object,iframe,br'
						)
					) {
						paragraph.style.minHeight = '1lh';
					}
					if (shouldShrinkParagraphBox(paragraph, pr)) {
						applyShrinkToTextBox(paragraph);
					}
					const splitParagraphs = splitDefinitionParagraph(paragraph);
					if (splitParagraphs.length > 0) {
						const fragment = document.createDocumentFragment();
						for (const splitParagraph of splitParagraphs) {
							if (shouldShrinkParagraphBox(splitParagraph, pr)) {
								applyShrinkToTextBox(splitParagraph);
							}
							attachParagraphEditor(splitParagraph, 'paragraph', splitParagraph, {
								disabled: isHeaderOrFooterStyle(pr)
							});
							fragment.appendChild(splitParagraph);
						}
						return fragment;
					}
					attachParagraphEditor(paragraph, 'paragraph', paragraph, {
						disabled: isHeaderOrFooterStyle(pr)
					});
					return paragraph;
				}
				case 'r': {
					const run = document.createElement('span');
					run.className = 'whitespace-pre-wrap';
					const pr = (safeProps.pr as XmlNode) ?? null;
					setStyles(run, getRunInheritedCharacterStyles(pr));
					setStyles(run, getRunStyles(pr));
					appendChildren(run, children);
					return run;
				}
				case 't':
					return document.createTextNode(
						decodeDocxText(
							toNodeList(children)
								.map((n) => n.textContent ?? '')
								.join('')
						)
					);
				case 'instrText':
					return document.createDocumentFragment();
				case 'tab': {
					const tab = document.createElement('span');
					tab.dataset.docxTab = '1';
					tab.style.display = 'inline-block';
					tab.style.minWidth = '1ch';
					tab.style.width = '1ch';
					tab.style.verticalAlign = 'baseline';
					tab.textContent = '\u00a0';
					return tab;
				}
				case 'br':
					return document.createElement('br');
				case 'hyperlink': {
					const link = document.createElement('a');
					link.className = 'text-blue-700 underline';
					const rawUrl = safeProps.url as { url?: string } | string | undefined;
					const href = typeof rawUrl === 'string' ? rawUrl : rawUrl?.url;
					if (href) {
						link.href = href;
						if (!href.startsWith('#')) {
							link.target = '_blank';
							link.rel = 'noreferrer noopener';
						}
					}
					appendChildren(link, children);
					return link;
				}
				case 'tbl': {
					const table = document.createElement('table');
					table.className = 'my-1 border-collapse';
					const tblPr = safeProps.pr as XmlNode | undefined;
					const width = findChild(tblPr, 'tblw');
					const widthValue = toNumber(getAttr(width, 'w'));
					const widthType = getAttr(width, 'type')?.toLowerCase();
					if (widthValue != null && widthType === 'dxa') {
						table.style.width = `${toTwipsPx(widthValue) ?? widthValue}px`;
					}
					const cols = Array.isArray(safeProps.cols) ? (safeProps.cols as XmlNode[]) : [];
					if (cols.length > 0) {
						const colgroup = document.createElement('colgroup');
						for (const colNode of cols) {
							const col = document.createElement('col');
							const colWidth = toNumber(getAttr(colNode, 'w'));
							if (colWidth != null) {
								col.style.width = `${toTwipsPx(colWidth) ?? colWidth}px`;
							}
							colgroup.appendChild(col);
						}
						table.style.tableLayout = 'fixed';
						table.appendChild(colgroup);
					} else {
						table.style.tableLayout = 'auto';
						table.style.width = table.style.width || '100%';
					}
					appendChildren(table, children);
					return table;
				}
				case 'tr': {
					const row = document.createElement('tr');
					appendChildren(row, children);
					return row;
				}
				case 'tc': {
					const cell = document.createElement('td');
					cell.className = 'align-top';
					const tcPr = safeProps.pr as XmlNode | undefined;
					const cellWidthNode = findChild(tcPr, 'tcw');
					const cellWidthRaw = toNumber(getAttr(cellWidthNode, 'w'));
					const cellWidthType = getAttr(cellWidthNode, 'type')?.toLowerCase();
					if (cellWidthRaw != null) {
						if (cellWidthType === 'dxa') {
							cell.style.width = `${toTwipsPx(cellWidthRaw) ?? cellWidthRaw}px`;
						}
						if (cellWidthType === 'pct') {
							cell.style.width = `${cellWidthRaw / 50}%`;
						}
					}
					const gridSpan = toNumber(getAttr(findChild(tcPr, 'gridspan'), 'val'));
					if (gridSpan != null && gridSpan > 1) {
						cell.colSpan = Math.trunc(gridSpan);
					}
					const borders = findChild(tcPr, 'tcborders');
					const top = parseBorder(findChild(borders, 'top'));
					const right = parseBorder(findChild(borders, 'right'));
					const bottom = parseBorder(findChild(borders, 'bottom'));
					const left = parseBorder(findChild(borders, 'left'));
					if (top) cell.style.borderTop = top;
					if (right) cell.style.borderRight = right;
					if (bottom) cell.style.borderBottom = bottom;
					if (left) cell.style.borderLeft = left;
					appendChildren(cell, children);
					return cell;
				}
				case 'drawing':
				case 'drawing.anchor': {
					const drawing = document.createElement('span');
					drawing.className = 'inline-block';
					if (type === 'drawing.anchor') {
						applyAnchorPositionStyles(drawing, (safeProps.node as XmlNode) ?? null);
					}
					appendChildren(drawing, children);
					return drawing;
				}
				case 'drawing.inline': {
					const drawing = document.createElement('span');
					drawing.className = 'inline-block max-w-full';
					appendChildren(drawing, children);
					return drawing;
				}
				case 'shape': {
					const shape = document.createElement('span');
					shape.className = 'block overflow-visible';
					const xfrm = safeProps.xfrm as { width?: number; height?: number } | undefined;
					if (xfrm?.width != null) shape.style.width = `${xfrm.width}px`;
					if (xfrm?.height != null) shape.style.height = `${xfrm.height}px`;
					appendChildren(shape, children);
					return shape;
				}
				case 'picture': {
					const img = document.createElement('img');
					img.className = 'block h-auto max-w-full object-contain';
					const shape = safeProps as {
						xfrm?: { width?: number; height?: number };
						blipFill?: { blip?: { url?: string } };
					};
					const src = shape.blipFill?.blip?.url;
					if (src) img.src = src;
					appendChildren(img, children);
					return img;
				}
				default: {
					const fragment = document.createDocumentFragment();
					appendChildren(fragment, children);
					return fragment;
				}
			}
		} catch (renderErr) {
			console.error('DOCX render node error:', type, safeProps, renderErr);
			return document.createDocumentFragment();
		}
	};
}
