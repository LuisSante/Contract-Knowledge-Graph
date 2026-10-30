'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import { BRAND_NAME, TOP_HEADER_HEIGHT } from '@/constants/brand';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/common/ThemeToggle';

interface DocxPageHeaderProps {
	documentName: string | null;
	/** The document is still on its way: say so instead of "No document selected". */
	loading?: boolean;
}

function displayName(name: string | null): string {
	return (name ?? '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
}

export function DocxPageHeader({ documentName, loading = false }: DocxPageHeaderProps) {
	const title = displayName(documentName);

	return (
		<header
			className={cn(
				'relative flex flex-none items-center border-b border-border bg-header px-4',
				TOP_HEADER_HEIGHT
			)}
		>
			<Link
				href="/"
				className="shrink-0 text-sm font-medium text-primary transition-opacity hover:opacity-75"
			>
				{BRAND_NAME}
			</Link>

			<div className="pointer-events-none absolute top-1/2 left-1/2 flex max-w-[58%] -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 shadow-sm">
				<FileText className="size-3.5 shrink-0 text-primary" />
				{/* The page's heading: the contract being read. */}
				<h1 className="truncate text-[13px] text-header-foreground" title={title || undefined}>
					{title || (loading ? 'Loading document…' : 'No document selected')}
				</h1>
			</div>

			<ThemeToggle className="ml-auto size-7" />
		</header>
	);
}
