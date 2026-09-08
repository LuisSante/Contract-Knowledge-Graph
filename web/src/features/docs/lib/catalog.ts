import 'server-only';

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { cache } from 'react';

const REPO_ROOT = path.resolve(process.cwd(), '..');
const DOCS_DIR = path.join(REPO_ROOT, 'docs');

const GUIDES: Array<{ file: string; slug: string; label: string }> = [
	{ file: 'README.md', slug: 'guias/proyecto', label: 'El proyecto' },
	{ file: 'INSTALL.md', slug: 'guias/instalacion', label: 'Instalación' },
	{ file: 'CONFIG.md', slug: 'guias/configuracion', label: 'Configuración' },
	{ file: 'server/README.md', slug: 'guias/backend', label: 'Backend' },
	{ file: 'web/README.md', slug: 'guias/frontend', label: 'Frontend' },
	{ file: 'scripts/windows/README.md', slug: 'guias/windows', label: 'Windows' },
];

const SHELVES: Array<{ folder: string; group: string; order: number }> = [
	{ folder: 'ontologia', group: 'Ontología', order: 10 },
	{ folder: 'metricas', group: 'Métricas', order: 20 },
	{ folder: 'medidas', group: 'Medidas', order: 30 },
	{ folder: '', group: 'Documentación', order: 40 },
];

const WITHIN: Record<string, number> = {
	'ontologia/esquema': 1,
	'metricas/burden-benefit': 1,
	'metricas/pagerank': 2,
	'medidas/corpus': 1,
	'marco-conceptual': 1,
	tasks: 2,
};

function shelfOf(slug: string) {
	const folder = slug.includes('/') ? slug.slice(0, slug.indexOf('/')) : '';
	const known = SHELVES.find((shelf) => shelf.folder === folder);
	if (known) return known;
	return { folder, group: folder.charAt(0).toUpperCase() + folder.slice(1), order: 35 };
}

export interface DocEntry {
	slug: string;
	sourcePath: string;
	title: string;
	label: string;
	group: string;
	order: number;
}

function titleOf(source: string, fallback: string): string {
	const heading = source.match(/^#\s+(.+)$/m)?.[1];
	return heading ? heading.replace(/[*`]/g, '').trim() : fallback;
}

async function markdownUnder(directory: string): Promise<string[]> {
	const entries = await readdir(path.join(DOCS_DIR, directory), { withFileTypes: true });
	const nested = await Promise.all(
		entries
			.filter((entry) => !entry.name.startsWith('.'))
			.map(async (entry) => {
				const relative = path.posix.join(directory, entry.name);
				if (entry.isDirectory()) return markdownUnder(relative);
				return entry.isFile() && entry.name.endsWith('.md') ? [relative] : [];
			})
	);
	return nested.flat();
}

function fileOf(entry: DocEntry): string {
	return path.join(REPO_ROOT, entry.sourcePath);
}

export const getDocs = cache(async (): Promise<DocEntry[]> => {
	const files = await markdownUnder('').catch(() => [] as string[]);

	const fromDocs = await Promise.all(
		files.map(async (relative) => {
			const slug = relative.replace(/\.md$/, '');
			const source = await readFile(path.join(DOCS_DIR, relative), 'utf8');
			const shelf = shelfOf(slug);
			const title = titleOf(source, path.posix.basename(slug).replace(/[-_]/g, ' '));
			return {
				slug,
				sourcePath: path.posix.join('docs', relative),
				title,
				label: title.split(/\s+[—–-]\s+/)[0],
				group: shelf.group,
				order: shelf.order * 100 + (WITHIN[slug] ?? 50),
			};
		})
	);

	const fromGuides = await Promise.all(
		GUIDES.map(async ({ file, slug, label }, index) => {
			const source = await readFile(path.join(REPO_ROOT, file), 'utf8').catch(() => null);
			if (source === null) return null;
			return {
				slug,
				sourcePath: file,
				title: titleOf(source, label),
				label,
				group: 'Guías del proyecto',
				order: 9000 + index,
			};
		})
	);

	return [...fromDocs, ...fromGuides.filter((entry) => entry !== null)].sort(
		(a, b) => a.order - b.order || a.label.localeCompare(b.label, 'es')
	);
});

export async function readDoc(entry: DocEntry): Promise<string> {
	return readFile(fileOf(entry), 'utf8');
}
