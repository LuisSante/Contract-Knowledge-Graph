import { Suspense } from 'react';
import { DocxViewer } from '@/features/docx/components/shell/DocxViewer';
import '@/features/docx/styles/docx-viewer.css';

type DocxSearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * Docx viewer page. Thin Server Component: forwards the `searchParams` promise
 * to the client (Cache Components-ready pattern — no `await searchParams` at the
 * top of the page) and unwraps it inside a `<Suspense>` boundary.
 */
export default function DocxPage({ searchParams }: { searchParams: DocxSearchParams }) {
	return (
		<Suspense fallback={<DocxViewerFallback />}>
			<DocxViewer searchParams={searchParams} />
		</Suspense>
	);
}

function DocxViewerFallback() {
	return (
		<div className="flex min-h-screen items-center justify-center">
			<p className="text-muted-foreground text-sm">Loading document…</p>
		</div>
	);
}
