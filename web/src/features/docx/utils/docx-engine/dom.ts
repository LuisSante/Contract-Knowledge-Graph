export function normalizeEditableText(raw: string): string {
	return raw.replace(/\u00a0/g, ' ').replace(/\r/g, '');
}

/** Parsea un valor en px (de `style`/`dataset`) a n\u00famero, o `null` si no es finito. */
export function parsePxValue(rawValue?: string | null): number | null {
	if (!rawValue) return null;
	const parsed = Number.parseFloat(rawValue);
	return Number.isFinite(parsed) ? parsed : null;
}

export function setStyles(el: HTMLElement, styles: unknown) {
	if (!styles || typeof styles !== 'object' || Array.isArray(styles)) return;
	for (const [key, value] of Object.entries(styles as Record<string, string | undefined | null>)) {
		if (value == null || value === '') continue;
		el.style.setProperty(key, value);
	}
}

export function toNodeList(children: unknown): Node[] {
	if (children == null) return [];
	if (children instanceof Node) return [children];
	if (Array.isArray(children)) return children.flatMap((child) => toNodeList(child));
	if (typeof children === 'string' || typeof children === 'number') {
		return [document.createTextNode(String(children))];
	}
	return [];
}

export function appendChildren(parent: Node, children: unknown) {
	for (const child of toNodeList(children)) {
		parent.appendChild(child);
	}
}
