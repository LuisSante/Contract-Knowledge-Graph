import type { AssistantChatMessage } from '@/types/document';

export type ReferenceTextSegment = {
	text: string;
	isReference: boolean;
	isEntity?: boolean;
	entityKey?: string;
	entityColor?: string;
	entitySoftColor?: string;
};

export const PARAGRAPH_REFERENCE_PATTERN = /\S+-p-\d+(?=$|[\s.,;:!?\)\]])/g;

/**
 * Short, human-friendly label for a paragraph reference id. The full id (e.g.
 * `target:ACME_INC_..-Supply_Agreement-p-228`) is kept for click handling and
 * tooltips; only the visible chip text is shortened — to `¶ 228`.
 */
export function shortReferenceLabel(reference: string): string {
	const paragraph = reference.match(/-p-(\d+)\s*$/);
	if (paragraph) return `¶ ${paragraph[1]}`;
	const tail = reference.split(/[-_/:]+/).filter(Boolean).pop();
	return tail ?? reference;
}

export function splitReferenceText(value: string): ReferenceTextSegment[] {
	if (!value) return [];
	const segments: ReferenceTextSegment[] = [];
	let lastIndex = 0;
	for (const match of value.matchAll(PARAGRAPH_REFERENCE_PATTERN)) {
		const start = match.index ?? 0;
		const matchedText = match[0] ?? '';
		if (!matchedText) continue;
		if (start > lastIndex) {
			segments.push({ text: value.slice(lastIndex, start), isReference: false });
		}
		segments.push({ text: matchedText, isReference: true });
		lastIndex = start + matchedText.length;
	}
	if (lastIndex < value.length) {
		segments.push({ text: value.slice(lastIndex), isReference: false });
	}
	if (segments.length === 0) {
		segments.push({ text: value, isReference: false });
	}
	return segments;
}

export function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeEntityKey(value: string): string {
	return value
		.toLocaleLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function splitReferenceAndEntityText(
	value: string,
	entities: NonNullable<AssistantChatMessage['entityHighlights']>
): ReferenceTextSegment[] {
	const baseSegments = splitReferenceText(value);
	if (!entities.length) return baseSegments;
	const labels = entities
		.map((entity) => entity.label.trim())
		.filter((label) => label.length >= 2)
		.sort((a, b) => b.length - a.length);
	if (!labels.length) return baseSegments;
	const entityMap = new Map(entities.map((entity) => [normalizeEntityKey(entity.label), entity]));
	const pattern = new RegExp(labels.map((label) => escapeRegex(label)).join('|'), 'gi');

	const merged: ReferenceTextSegment[] = [];
	for (const segment of baseSegments) {
		if (segment.isReference) {
			merged.push(segment);
			continue;
		}
		let cursor = 0;
		const text = segment.text;
		for (const match of text.matchAll(pattern)) {
			const found = match[0] ?? '';
			const index = match.index ?? 0;
			if (!found) continue;
			if (index > cursor) merged.push({ text: text.slice(cursor, index), isReference: false });
			const entity = entityMap.get(normalizeEntityKey(found));
			merged.push({
				text: found,
				isReference: false,
				isEntity: true,
				entityKey: entity?.key ?? normalizeEntityKey(found),
				entityColor: entity?.color,
				entitySoftColor: entity?.softColor
			});
			cursor = index + found.length;
		}
		if (cursor < text.length) merged.push({ text: text.slice(cursor), isReference: false });
	}
	return merged;
}
