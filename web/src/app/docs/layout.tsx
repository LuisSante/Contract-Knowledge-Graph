import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getDocs } from '@/features/docs/lib/catalog';
import './docs.css';
// KaTeX's stylesheet is loaded here and not in `globals.css`: only these pages
// render math, and the root layout should not carry it.
import 'katex/dist/katex.min.css';

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
	const docs = await getDocs();
	const groups = [...new Set(docs.map((doc) => doc.group))];

	return (
		<div className="mx-auto flex min-h-screen w-full max-w-350 gap-8 px-6 py-8">
			<aside className="sticky top-8 hidden h-fit w-60 shrink-0 self-start lg:block">
				<Link
					href="/"
					className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-4" />
					Volver
				</Link>
				<Link href="/docs" className="mb-4 block text-lg font-medium">
					Documentación
				</Link>
				{groups.map((group) => (
					<div key={group} className="mb-5">
						<p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{group}
						</p>
						<ul className="space-y-0.5">
							{docs
								.filter((doc) => doc.group === group)
								.map((doc) => (
									<li key={doc.slug}>
										<Link
											href={`/docs/${doc.slug}`}
											className="block truncate rounded-md px-2 py-1 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
											title={doc.title}
										>
											{doc.label}
										</Link>
									</li>
								))}
						</ul>
					</div>
				))}
			</aside>
			<main className="min-w-0 flex-1">{children}</main>
		</div>
	);
}
