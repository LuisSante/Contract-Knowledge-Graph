import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DOCS_DIR = path.resolve(process.cwd(), '..', 'docs');

const TYPES: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',
};

/** The images the documentation links with a relative path (see `rewriteImage`). */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
	const { path: parts } = await params;
	const file = path.resolve(DOCS_DIR, ...parts);
	const type = TYPES[path.extname(file).toLowerCase()];
	if (!type || !file.startsWith(DOCS_DIR + path.sep)) {
		return new Response('Not found', { status: 404 });
	}
	try {
		const body = await readFile(file);
		return new Response(new Uint8Array(body), {
			headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=300' },
		});
	} catch {
		return new Response('Not found', { status: 404 });
	}
}
