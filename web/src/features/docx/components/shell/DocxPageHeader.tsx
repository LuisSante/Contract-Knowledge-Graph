'use client';

import Link from 'next/link';
import { FileText, ChevronLeft } from 'lucide-react';

interface DocxPageHeaderProps {
	documentName: string | null;
}

/** Top header of the viewer: back link and the document name. */
export function DocxPageHeader({ documentName }: DocxPageHeaderProps) {
	return (
		<header className="flex flex-none items-center gap-3 border-b border-border bg-header px-4 py-2.5">
			<Link
				href="/"
				className="flex size-7 flex-none items-center justify-center rounded-lg text-header-foreground/70 transition-colors hover:bg-header-foreground/15 hover:text-header-foreground"
				aria-label="Back to documents"
				title="Back to documents"
			>
				<ChevronLeft className="size-4" />
			</Link>

			<div className="flex min-w-0 flex-1 items-center gap-2">
				<span className="flex size-7 flex-none items-center justify-center rounded-lg bg-card text-primary shadow-sm">
					<FileText className="size-4" />
				</span>
				<div className="min-w-0 truncate text-sm font-medium text-header-foreground">
					{documentName || 'No document selected'}
				</div>
			</div>
		</header>
	);
}
