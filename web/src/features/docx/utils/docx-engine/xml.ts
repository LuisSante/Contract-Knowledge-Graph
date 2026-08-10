import type { XmlNode } from './types';

export function localName(tag?: string): string {
	return tag?.split(':').pop()?.toLowerCase() ?? '';
}

export function toNumber(value: unknown): number | null {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

export function toTwipsPx(value: unknown): number | null {
	const parsed = toNumber(value);
	if (parsed == null) return null;
	return parsed / 15;
}

export function toBorderPx(value: unknown): number | null {
	const parsed = toNumber(value);
	if (parsed == null) return null;
	return parsed / 6;
}

export function getAttr(node: XmlNode | null | undefined, attr: string): string | undefined {
	const attribs =
		node &&
		typeof node === 'object' &&
		node.attribs &&
		typeof node.attribs === 'object' &&
		!Array.isArray(node.attribs)
			? node.attribs
			: null;

	if (!attribs) return undefined;
	if (attribs[attr] !== undefined) return attribs[attr];

	for (const [key, value] of Object.entries(attribs)) {
		if (localName(key) === localName(attr)) return value;
	}

	return undefined;
}

export function findChild(node: XmlNode | null | undefined, name: string): XmlNode | undefined {
	return node?.children?.find((child) => localName(child.name) === name.toLowerCase());
}

export function isOn(node?: XmlNode | null): boolean {
	if (!node) return false;
	const raw = (getAttr(node, 'val') ?? '').toLowerCase();
	return raw === '' || !['0', 'false', 'off', 'none', 'nil'].includes(raw);
}

export function normalizeColor(raw?: string): string | null {
	if (!raw) return null;
	const value = raw.trim();
	if (!value || value.toLowerCase() === 'auto' || value.toLowerCase() === 'none') return null;
	if (value.startsWith('#')) return value;
	if (/^[0-9a-f]{6}$/i.test(value)) return `#${value}`;
	return value;
}
