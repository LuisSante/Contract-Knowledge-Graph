import Link from 'next/link';

export default function DocsNotFound() {
	return (
		<article className="docs-markdown">
			<h1>Documento no encontrado</h1>
			<p>
				Ese documento no está en el catálogo. <Link href="/docs">Ver todos</Link>.
			</p>
		</article>
	);
}
