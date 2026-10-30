import Link from 'next/link';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { getDocs } from '@/features/docs/lib/catalog';
import './docs.css';
// KaTeX's stylesheet is loaded here and not in `globals.css`: only these pages
// render math, and the root layout should not carry it.
import 'katex/dist/katex.min.css';

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
	const docs = await getDocs();
	const groups = [...new Set(docs.map((doc) => doc.group))];

	const backLink = (
		<Link
			href="/"
			className="inline-flex min-h-6 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			<ArrowLeft className="size-4" />
			Volver
		</Link>
	);

	// The same list serves the desktop sidebar and the mobile disclosure; only one
	// of the two is displayed at a time.
	const docList = groups.map((group) => (
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
	));

	// The content is written in Spanish; the root <html> stays English for the app.
	return (
		<div
			lang="es"
			className="mx-auto flex min-h-screen w-full max-w-350 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-8 lg:py-8"
		>
			<div className="space-y-3 lg:hidden">
				{backLink}
				<details className="group w-full">
					<summary className="flex min-h-9 cursor-pointer list-none items-center justify-between rounded-md border border-border px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
						Documentación
						<ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
					</summary>
					<nav aria-label="Documentación" className="pt-3">
						{docList}
					</nav>
				</details>
			</div>
			<aside className="sticky top-8 hidden h-fit w-60 shrink-0 self-start lg:block">
				<div className="mb-5">{backLink}</div>
				<Link href="/docs" className="mb-4 block text-lg font-medium">
					Documentación
				</Link>
				<nav aria-label="Documentación">{docList}</nav>
			</aside>
			<main className="min-w-0 flex-1">{children}</main>
		</div>
	);
}
