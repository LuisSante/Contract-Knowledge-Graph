import type { XmlNode } from './types';
import {
	findChild,
	getAttr,
	isOn,
	localName,
	normalizeColor,
	toBorderPx,
	toNumber,
	toTwipsPx
} from './xml';

// `w:highlight` colors (OOXML text highlighting). Pure docx knowledge,
// internal to the render engine.
const highlightMap: Record<string, string> = {
	yellow: '#fff59d',
	green: '#a5d6a7',
	cyan: '#80deea',
	magenta: '#f48fb1',
	blue: '#90caf9',
	red: '#ef9a9a',
	darkblue: '#5c6bc0',
	darkcyan: '#26a69a',
	darkgreen: '#43a047',
	darkmagenta: '#ab47bc',
	darkred: '#e53935',
	darkyellow: '#f9a825',
	lightgray: '#e0e0e0',
	darkgray: '#757575',
	black: '#000000',
	white: '#ffffff',
	none: 'transparent'
};

const MIN_RUN_FONT_SIZE_PT = 6;
const MIN_SUP_SUB_RUN_FONT_SIZE_PT = 5;
const MAX_RUN_FONT_SIZE_PT = 72;
// OOXML's "auto" line spacing is relative to the font's NATURAL line height
// (not the em). Word uses the font metrics; for Times/Liberation
// Serif that natural height ≈ 1.15× em, so `line=240` (single) lands at ~normal.
const FONT_NATURAL_LINE_RATIO = 1.15;
const GENERIC_SERIF = 'serif';
const GENERIC_SANS = 'sans-serif';
const GENERIC_MONO = 'monospace';

// Default stack when a run does not specify a font (contracts are serif).
const WORD_DEFAULT_FONT_FAMILY = `'Times New Roman', 'Liberation Serif', 'Tinos', ${GENERIC_SERIF}`;

// METRICALLY compatible equivalents: same glyph widths as the Microsoft
// font, so the browser can substitute without changing where each line breaks.
// Liberation = system clones (Linux); Tinos/Arimo/Carlito/Caladea/Cousine = Google clones.
const METRIC_FALLBACKS: Record<string, string[]> = {
	'times new roman': ["'Liberation Serif'", "'Tinos'", GENERIC_SERIF],
	timesnewroman: ["'Liberation Serif'", "'Tinos'", GENERIC_SERIF],
	times: ["'Liberation Serif'", "'Tinos'", GENERIC_SERIF],
	georgia: ["'Tinos'", "'Liberation Serif'", GENERIC_SERIF],
	cambria: ["'Caladea'", "'Liberation Serif'", GENERIC_SERIF],
	arial: ["'Liberation Sans'", "'Arimo'", GENERIC_SANS],
	helvetica: ["'Liberation Sans'", "'Arimo'", GENERIC_SANS],
	calibri: ["'Carlito'", "'Liberation Sans'", GENERIC_SANS],
	tahoma: ["'DejaVu Sans'", "'Liberation Sans'", GENERIC_SANS],
	verdana: ["'DejaVu Sans'", "'Liberation Sans'", GENERIC_SANS],
	'courier new': ["'Liberation Mono'", "'Cousine'", GENERIC_MONO],
	consolas: ["'Liberation Mono'", "'Cousine'", GENERIC_MONO]
};

// Office theme fonts (theme1.xml). The renderer does not parse the theme, so
// we assume Office's default theme (majorFont=Cambria, minorFont=Calibri),
// the one in the vast majority of documents, and map them to metric stacks.
const THEME_FONT_STACK_BY_KEY: Record<string, string> = {
	majorhansi: `'Cambria', 'Caladea', 'Liberation Serif', ${GENERIC_SERIF}`,
	minorhansi: `'Calibri', 'Carlito', 'Liberation Sans', ${GENERIC_SANS}`,
	majoreastasia: `'Liberation Serif', ${GENERIC_SERIF}`,
	minoreastasia: `'Liberation Sans', ${GENERIC_SANS}`,
	majorbidi: WORD_DEFAULT_FONT_FAMILY,
	minorbidi: WORD_DEFAULT_FONT_FAMILY
};

export type ParagraphTabStop = {
	positionPx: number;
	style: string;
	leader: string;
};

function clampRunFontSizePt(rawHalfPointSize: number, isSuperOrSub: boolean): number {
	const resolvedPt = rawHalfPointSize / 2;
	const minPt = isSuperOrSub ? MIN_SUP_SUB_RUN_FONT_SIZE_PT : MIN_RUN_FONT_SIZE_PT;
	return Math.min(Math.max(resolvedPt, minPt), MAX_RUN_FONT_SIZE_PT);
}

function sanitizeFontFamilyName(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const trimmed = raw.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith("'") || trimmed.startsWith('"')) return trimmed;
	return /[\s,]/.test(trimmed) ? `'${trimmed}'` : trimmed;
}

function metricFallbacksFor(name: string): string[] {
	const key = name.trim().toLowerCase().replace(/^['"]|['"]$/g, '');
	return METRIC_FALLBACKS[key] ?? [];
}

function resolveThemeFontFamily(rawThemeValue: string | undefined): string | null {
	if (!rawThemeValue) return null;
	const key = rawThemeValue.trim().toLowerCase();
	if (!key) return null;
	return THEME_FONT_STACK_BY_KEY[key] ?? WORD_DEFAULT_FONT_FAMILY;
}

function buildRunFontFamily(fontsNode?: XmlNode | null): string | null {
	if (!fontsNode) return null;

	const entries: string[] = [];
	const seen = new Set<string>();
	const appendToken = (token: string | null) => {
		if (!token) return;
		const normalized = token.toLowerCase();
		if (seen.has(normalized)) return;
		seen.add(normalized);
		entries.push(token);
	};
	// An explicit font drags its metric clone right after it, so the
	// browser substitutes with the same widths if it lacks the original.
	const appendNamed = (raw: string | null | undefined) => {
		const name = sanitizeFontFamilyName(raw);
		if (!name) return;
		appendToken(name);
		for (const fallback of metricFallbacksFor(name)) appendToken(fallback);
	};

	appendToken(resolveThemeFontFamily(getAttr(fontsNode, 'asciiTheme')));
	appendToken(resolveThemeFontFamily(getAttr(fontsNode, 'hAnsiTheme')));
	appendNamed(getAttr(fontsNode, 'ascii'));
	appendNamed(getAttr(fontsNode, 'hAnsi'));
	appendToken(resolveThemeFontFamily(getAttr(fontsNode, 'eastAsiaTheme')));
	appendNamed(getAttr(fontsNode, 'eastAsia'));
	appendToken(
		resolveThemeFontFamily(getAttr(fontsNode, 'csTheme') ?? getAttr(fontsNode, 'cstheme'))
	);
	appendNamed(getAttr(fontsNode, 'cs'));

	if (entries.length === 0) return null;

	// Ensure a trailing generic in case the last entry is not one.
	const joined = entries.join(', ');
	return /(?:serif|sans-serif|monospace)$/.test(joined)
		? joined
		: `${joined}, ${WORD_DEFAULT_FONT_FAMILY}`;
}

export function hasOnlySectionBreak(pr?: XmlNode | null): boolean {
	if (!pr?.children || pr.children.length !== 1) return false;
	return localName(pr.children[0].name) === 'sectpr';
}

export function getParagraphStyleId(pr?: XmlNode | null): string | null {
	if (!pr) return null;
	return getAttr(findChild(pr, 'pstyle'), 'val') ?? null;
}

export function getParagraphStyles(pr?: XmlNode | null): Record<string, string> {
	const style: Record<string, string> = {
		'margin-top': '0',
		'margin-bottom': '0',
		'line-height': '1',
		'white-space': 'pre-wrap',
		'word-break': 'break-word'
	};

	if (!pr) return style;

	const alignment = getAttr(findChild(pr, 'jc'), 'val')?.toLowerCase();
	if (alignment) {
		switch (alignment) {
			case 'start':
			case 'left':
				style['text-align'] = 'left';
				break;
			case 'end':
			case 'right':
				style['text-align'] = 'right';
				break;
			case 'center':
				style['text-align'] = 'center';
				break;
			case 'both':
			case 'distribute':
				style['text-align'] = 'justify';
				break;
			default:
				style['text-align'] = alignment;
		}
	}

	const spacing = findChild(pr, 'spacing');
	const before = toTwipsPx(getAttr(spacing, 'before'));
	const after = toTwipsPx(getAttr(spacing, 'after'));
	const line = toNumber(getAttr(spacing, 'line'));
	const lineRule = getAttr(spacing, 'lineRule')?.toLowerCase();

	// Real Word values, unscaled (previously multiplied by a 0.62 fudge).
	if (before != null) style['margin-top'] = `${Math.max(before, 0)}px`;
	if (after != null) style['margin-bottom'] = `${Math.max(after, 0)}px`;
	if (line != null) {
		if (lineRule === 'auto') {
			style['line-height'] = `${Math.max((line / 240) * FONT_NATURAL_LINE_RATIO, 1)}`;
		} else {
			const linePx = toTwipsPx(line);
			if (linePx != null) style['line-height'] = `${Math.max(linePx, 1)}px`;
		}
	}

	const indent = findChild(pr, 'ind');
	const left = toTwipsPx(getAttr(indent, 'left') ?? getAttr(indent, 'start'));
	const right = toTwipsPx(getAttr(indent, 'right') ?? getAttr(indent, 'end'));
	const firstLine = toTwipsPx(getAttr(indent, 'firstLine'));
	const hanging = toTwipsPx(getAttr(indent, 'hanging'));

	if (left != null) style['margin-left'] = `${left}px`;
	if (right != null) style['margin-right'] = `${right}px`;
	if (firstLine != null) style['text-indent'] = `${firstLine}px`;
	if (hanging != null) style['text-indent'] = `${-hanging}px`;

	return style;
}

export function getRunStyles(pr?: XmlNode | null): Record<string, string> {
	const style: Record<string, string> = {};
	if (!pr) return style;

	const bold = findChild(pr, 'b') ?? findChild(pr, 'bcs');
	const italic = findChild(pr, 'i') ?? findChild(pr, 'ics');
	const underline = findChild(pr, 'u');
	const strike = findChild(pr, 'strike') ?? findChild(pr, 'dstrike');
	const caps = findChild(pr, 'caps');
	const smallCaps = findChild(pr, 'smallcaps');
	const verticalAlign = findChild(pr, 'vertalign');
	const color = findChild(pr, 'color');
	const size = findChild(pr, 'sz');
	const fonts = findChild(pr, 'rfonts');
	const highlight = findChild(pr, 'highlight');
	const characterSpacing = toNumber(getAttr(findChild(pr, 'spacing'), 'val'));

	if (isOn(bold)) style['font-weight'] = '700';
	if (isOn(italic)) style['font-style'] = 'italic';
	if (underline && (getAttr(underline, 'val') ?? 'single').toLowerCase() !== 'none') {
		style['text-decoration-line'] = 'underline';
	}
	if (isOn(strike)) style['text-decoration-line'] = 'line-through';
	if (isOn(caps)) style['text-transform'] = 'uppercase';
	if (isOn(smallCaps)) style['font-variant'] = 'small-caps';

	const va = getAttr(verticalAlign, 'val')?.toLowerCase();
	if (va === 'superscript') style['vertical-align'] = 'super';
	if (va === 'subscript') style['vertical-align'] = 'sub';

	const colorValue = normalizeColor(getAttr(color, 'val'));
	if (colorValue) style.color = colorValue;

	const fontSize = toNumber(getAttr(size, 'val'));
	if (fontSize != null) {
		const isSuperOrSub = va === 'superscript' || va === 'subscript';
		style['font-size'] = `${clampRunFontSizePt(fontSize, isSuperOrSub)}pt`;
	}

	const fontFamily = buildRunFontFamily(fonts);
	if (fontFamily) style['font-family'] = fontFamily;
	if (characterSpacing != null && characterSpacing !== 0) {
		style['letter-spacing'] = `${characterSpacing / 20}pt`;
	}

	const highlightKey = getAttr(highlight, 'val')?.toLowerCase();
	if (highlightKey) {
		style['background-color'] = highlightMap[highlightKey] ?? highlightKey;
	}

	return style;
}

export function getSectionLayout(sectPr?: XmlNode | null) {
	const defaultLayout = {
		width: 793,
		height: 1122,
		marginTop: 96,
		marginRight: 96,
		marginBottom: 96,
		marginLeft: 96
	};

	if (!sectPr) return defaultLayout;

	const pgSz = findChild(sectPr, 'pgsz');
	const pgMar = findChild(sectPr, 'pgmar');

	let width = toTwipsPx(getAttr(pgSz, 'w')) ?? defaultLayout.width;
	let height = toTwipsPx(getAttr(pgSz, 'h')) ?? defaultLayout.height;
	const orient = getAttr(pgSz, 'orient')?.toLowerCase();
	if (orient === 'landscape' && width < height) {
		[width, height] = [height, width];
	}

	return {
		width,
		height,
		marginTop: toTwipsPx(getAttr(pgMar, 'top')) ?? defaultLayout.marginTop,
		marginRight: toTwipsPx(getAttr(pgMar, 'right')) ?? defaultLayout.marginRight,
		marginBottom: toTwipsPx(getAttr(pgMar, 'bottom')) ?? defaultLayout.marginBottom,
		marginLeft: toTwipsPx(getAttr(pgMar, 'left')) ?? defaultLayout.marginLeft
	};
}

export function getParagraphTabStops(pr?: XmlNode | null): ParagraphTabStop[] {
	const tabsNode = findChild(pr, 'tabs');
	if (!tabsNode?.children) return [];

	const stops: ParagraphTabStop[] = [];
	for (const tabNode of tabsNode.children) {
		if (localName(tabNode.name) !== 'tab') continue;
		const positionPx = toTwipsPx(getAttr(tabNode, 'pos'));
		if (positionPx == null || positionPx < 0) continue;
		stops.push({
			positionPx,
			style: (getAttr(tabNode, 'val') ?? 'left').toLowerCase(),
			leader: (getAttr(tabNode, 'leader') ?? 'none').toLowerCase()
		});
	}

	return stops.sort((left, right) => left.positionPx - right.positionPx);
}

export function parseBorder(border?: XmlNode): string | null {
	if (!border) return null;
	const val = (getAttr(border, 'val') ?? 'single').toLowerCase();
	if (val === 'none' || val === 'nil') return 'none';

	const width = Math.max(toBorderPx(getAttr(border, 'sz')) ?? 0.5, 0.5);
	const color = normalizeColor(getAttr(border, 'color')) ?? '#000000';
	const cssType = val.includes('dot') ? 'dotted' : val.includes('dash') ? 'dashed' : 'solid';
	return `${width}px ${cssType} ${color}`;
}
