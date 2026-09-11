import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDocs, readDoc } from '@/features/docs/lib/catalog';
import { renderDoc } from '@/features/docs/lib/render';

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
								.map((doc) => (
									<li key={doc.slug}>
										<Link href={`/docs/${doc.slug}`}>{doc.label}</Link>
										{doc.title !== doc.label && <span className="docs-ref"> — {doc.title}</span>}
									</li>
								))}
						</ul>
					</section>
				))}
			</article>
		);
	}

	const doc = docs.find((entry) => entry.slug === slug.join('/'));
	if (!doc) notFound();

	const { html, headings } = await renderDoc(await readDoc(doc), doc.sourcePath, docs);

	return (
		<div className="flex min-w-0 gap-8">
			<article
				className="docs-markdown min-w-0 flex-1"
				dangerouslySetInnerHTML={{ __html: html }}
			/>
			{headings.length > 2 && (
				<nav className="sticky top-8 hidden h-fit w-52 shrink-0 self-start text-sm xl:block">
					<p className="mb-2 font-medium text-muted-foreground">En esta página</p>
					<ul className="space-y-1.5 border-l border-border pl-3">
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
