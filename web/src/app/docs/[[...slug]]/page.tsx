import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDocs, readDoc } from '@/features/docs/lib/catalog';
import { renderDoc } from '@/features/docs/lib/render';

// A label is the title cut at its first dash, so only the rest of the title is new.
function subtitle(doc: { title: string; label: string }): string {
	if (doc.title === doc.label) return '';
	if (!doc.title.startsWith(doc.label)) return doc.title;
	return doc.title.slice(doc.label.length).replace(/^\s*[—–-]\s*/, '');
}

export async function generateStaticParams() {
	const docs = await getDocs();
	return [{ slug: [] as string[] }, ...docs.map((doc) => ({ slug: doc.slug.split('/') }))];
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
	const { slug } = await params;
	if (!slug?.length) return { title: 'Documentación' };
	const doc = (await getDocs()).find((entry) => entry.slug === slug.join('/'));
	return { title: doc ? `${doc.title} · Documentación` : 'Documentación' };
}

export default async function DocsPage({ params }: { params: Promise<{ slug?: string[] }> }) {
	const { slug } = await params;
	const docs = await getDocs();

	if (!slug?.length) {
		const groups = [...new Set(docs.map((doc) => doc.group))];
		return (
			<article className="docs-markdown">
				<h1>Documentación</h1>
				<p>{docs.length} documentos del repositorio, renderizados desde su Markdown de origen.</p>
				{groups.map((group) => (
					<section key={group}>
						<h2>{group}</h2>
						<ul>
							{docs
								.filter((doc) => doc.group === group)
								.map((doc) => {
									const rest = subtitle(doc);
									return (
										<li key={doc.slug}>
											<Link href={`/docs/${doc.slug}`}>{doc.label}</Link>
											{rest && <span className="text-muted-foreground"> — {rest}</span>}
										</li>
									);
								})}
						</ul>
					</section>
				))}
			</article>
		);
	}

	const doc = docs.find((entry) => entry.slug === slug.join('/'));
	if (!doc) notFound();

	const { html, headings } = await renderDoc(await readDoc(doc), doc.sourcePath, docs);
	// The layout marks the docs as Spanish; the repository guides outside docs/ are English.
	const lang = doc.sourcePath.startsWith('docs/') ? undefined : 'en';

	return (
		<div className="flex min-w-0 gap-8">
			<article
				lang={lang}
				className="docs-markdown min-w-0 flex-1"
				dangerouslySetInnerHTML={{ __html: html }}
			/>
			{headings.length > 2 && (
				<nav className="sticky top-8 hidden h-fit w-52 shrink-0 self-start text-sm xl:block">
					<p className="mb-2 font-medium text-muted-foreground">En esta página</p>
					<ul lang={lang} className="space-y-1.5 border-l border-border pl-3">
						{headings.map((heading) => (
							<li key={heading.id} className={heading.level === 3 ? 'pl-3' : ''}>
								<a
									href={`#${heading.id}`}
									className="block truncate text-muted-foreground transition-colors hover:text-foreground"
									title={heading.text}
								>
									{heading.text}
								</a>
							</li>
						))}
					</ul>
				</nav>
			)}
		</div>
	);
}
