import 'server-only';

import path from 'node:path';
import type { Element, Root } from 'hast';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import type { DocEntry } from './catalog';

export interface DocHeading {
	id: string;
	text: string;
	level: 2 | 3;
}

function textOf(node: Root | Element): string {
	return node.children
		.map((child) =>
			child.type === 'text' ? child.value : child.type === 'element' ? textOf(child) : ''
		)
		.join('');
}

function walk(node: Root | Element, visit: (element: Element) => void): void {
	for (const child of node.children) {
		if (child.type !== 'element') continue;
		visit(child);
		walk(child, visit);
	}
}

function rewriteLink(node: Element, sourcePath: string, docs: DocEntry[]): void {
	const href = String(node.properties.href ?? '');
	if (!href || /^(?:[a-z][\w+.-]*:|\/|#)/i.test(href)) return;

	const cut = href.search(/[?#]/);
	const pathname = cut < 0 ? href : href.slice(0, cut);
	const suffix = cut < 0 ? '' : href.slice(cut);

	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return;
	}

	const target = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), decoded));
	const match = docs.find(
		(doc) => doc.sourcePath === target || doc.sourcePath === path.posix.join(target, 'README.md')
	);

	if (match) {
		node.properties.href = `/docs/${match.slug.split('/').map(encodeURIComponent).join('/')}${suffix}`;
		return;
	}
	node.tagName = 'span';
	node.properties = {
		className: ['docs-ref'],
		title: target.endsWith('.md')
			? `Documento no catalogado: ${target}`
			: `Archivo del proyecto: ${target}`,
	};
}

function wrapTables(node: Root | Element): void {
	node.children = node.children.map((child) => {
		if (child.type !== 'element') return child;
		wrapTables(child);
		if (child.tagName !== 'table') return child;
		return {
			type: 'element',
			tagName: 'div',
			properties: { className: ['docs-table'] },
			children: [child],
		} satisfies Element;
	});
}

function normalizeDisplayMath(source: string): string {
	let fence: { char: string; length: number } | null = null;
	return source
		.split('\n')
		.map((line) => {
			const marker = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
			if (marker) {
				if (!fence) fence = { char: marker[1][0], length: marker[1].length };
				else if (
					marker[1][0] === fence.char &&
					marker[1].length >= fence.length &&
					!marker[2].trim()
				)
					fence = null;
				return line;
			}
			return !fence && /^\s*\\[[\]]\s*$/.test(line) ? '$$' : line;
		})
		.join('\n');
}

const SCHEMA: Parameters<typeof rehypeSanitize>[0] = {
	...defaultSchema,
	attributes: {
		...defaultSchema.attributes,
		code: [['className', /^language-./, 'math-inline', 'math-display']],
		div: [...(defaultSchema.attributes?.div ?? []), ['className', 'math', 'math-display']],
		span: [...(defaultSchema.attributes?.span ?? []), ['className', 'math', 'math-inline']],
	},
};

export async function renderDoc(source: string, sourcePath: string, docs: DocEntry[]) {
	const headings: DocHeading[] = [];

	const file = await unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkMath)
		.use(remarkRehype, { footnoteLabel: 'Notas', footnoteBackLabel: 'Volver' })
		.use(rehypeSanitize, SCHEMA)
		.use(rehypeSlug)
		.use(() => (tree: Root) => {
			walk(tree, (node) => {
				if (node.tagName === 'h2' || node.tagName === 'h3') {
					headings.push({
						id: String(node.properties.id ?? ''),
						text: textOf(node),
						level: node.tagName === 'h2' ? 2 : 3,
					});
				}
				if (node.tagName === 'a') rewriteLink(node, sourcePath, docs);
			});
		})
		.use(() => wrapTables)
		.use(rehypeKatex)
		.use(rehypeStringify)
		.process(normalizeDisplayMath(source));

	return { html: String(file), headings };
}
