'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, FileText, Scale, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocuments } from '@/hooks/useDocuments';
import type { DocumentMeta } from '@/types/document';

/** Derive a short, readable title from a CUAD filename (the agreement type). */
function agreementTitle(name: string): string {
	const base = name.replace(/\.docx$/i, '');
	const match = base.match(/EX-[\d.]+[-_](?:.*EX-[\d.]+[-_])?(.+)$/);
	const tail = match ? match[1] : base;
	return tail.replace(/_/g, ' ').trim() || base;
}

/** First segment of the filename (the company), lightly title-cased. */
function companyHint(name: string): string {
	const head = name.split(/_\d/)[0]?.replace(/_/g, ' ').trim() ?? '';
	return head
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.toLowerCase()
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

function titleCase(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function DocumentCard({ doc }: { doc: DocumentMeta }) {
	const group = doc.group_label || 'other';
	return (
		<Link href={`/docx?id=${encodeURIComponent(doc.id)}`} title={doc.name} className="group block">
			<Card className="flex-row items-start gap-3 rounded-xl p-3 shadow-none transition-colors group-hover:border-primary/40 group-hover:bg-accent">
				<span className="flex size-9 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
					<FileText className="size-[18px]" />
				</span>
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-medium">{agreementTitle(doc.name)}</p>
					<p className="truncate text-xs text-muted-foreground">{companyHint(doc.name)}</p>
					<div className="mt-2 flex items-center gap-2">
						<Badge variant="secondary" className="rounded-full font-normal">
							{group}
						</Badge>
						<span className="text-2xs text-muted-foreground">.docx</span>
					</div>
				</div>
				<ArrowRight className="size-4 flex-none text-muted-foreground transition-colors group-hover:text-primary" />
			</Card>
		</Link>
	);
}

function GroupChip({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<Button
			type="button"
			size="sm"
			variant={active ? 'default' : 'outline'}
			onClick={onClick}
			className={
				active
					? 'h-7 rounded-full px-3 text-xs'
					: 'h-7 rounded-full px-3 text-xs text-muted-foreground'
			}
		>
			{children}
		</Button>
	);
}

export default function Home() {
	const { data, isPending, isError } = useDocuments();
	const documents = useMemo(() => data ?? [], [data]);
	const [searchTerm, setSearchTerm] = useState('');
	const [activeGroup, setActiveGroup] = useState('all');

	const groups = useMemo(() => {
		const counts = new Map<string, number>();
		for (const doc of documents) {
			const group = doc.group_label || 'other';
			counts.set(group, (counts.get(group) ?? 0) + 1);
		}
		return Array.from(counts.entries());
	}, [documents]);

	const filteredDocuments = useMemo(() => {
		const query = searchTerm.trim().toLowerCase();
		return documents.filter((doc) => {
			const group = doc.group_label || 'other';
			if (activeGroup !== 'all' && group !== activeGroup) return false;
			if (!query) return true;
			return [doc.name, doc.group_label, doc.relative_path, doc.display_name].some((value) =>
				(value ?? '').toLowerCase().includes(query)
			);
		});
	}, [documents, searchTerm, activeGroup]);

	return (
		<main className="mx-auto w-full max-w-5xl px-6 py-12">
			<header className="mb-8 flex items-center gap-3">
				<span className="flex size-10 flex-none items-center justify-center rounded-xl bg-primary text-primary-foreground">
					<Scale className="size-5" />
				</span>
				<div>
					<h1 className="text-xl leading-tight font-medium">ContraVis</h1>
					<p className="text-sm text-muted-foreground">Contradiction review in legal contracts</p>
				</div>
			</header>

			<div className="relative mb-4">
				<Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={searchTerm}
					onChange={(event) => setSearchTerm(event.target.value)}
					className="h-12 rounded-xl pl-12"
					placeholder="Search contracts…"
				/>
			</div>

			<div className="mb-6 flex flex-wrap items-center gap-2">
				<GroupChip active={activeGroup === 'all'} onClick={() => setActiveGroup('all')}>
					All · {documents.length}
				</GroupChip>
				{groups.map(([group, count]) => (
					<GroupChip
						key={group}
						active={activeGroup === group}
						onClick={() => setActiveGroup(group)}
					>
						{titleCase(group)} · {count}
					</GroupChip>
				))}
				<span className="ml-auto text-sm text-muted-foreground">
					{filteredDocuments.length} contracts
				</span>
			</div>

			{isPending || isError ? (
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{Array.from({ length: 6 }).map((_, index) => (
						<Card key={index} className="flex-row items-start gap-3 p-3 shadow-none">
							<Skeleton className="size-9 flex-none rounded-lg" />
							<div className="flex-1 space-y-2 py-1">
								<Skeleton className="h-3 w-3/4" />
								<Skeleton className="h-2.5 w-1/2" />
							</div>
						</Card>
					))}
				</div>
			) : filteredDocuments.length === 0 ? (
				<div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
					<Search className="size-6" />
					<p className="text-sm">No contracts match your search.</p>
				</div>
			) : (
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{filteredDocuments.map((doc) => (
						<DocumentCard key={doc.id} doc={doc} />
					))}
				</div>
			)}
		</main>
	);
}
