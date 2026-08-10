/**
 * Pure (no-DOM) snippet-search helpers.
 *
 * Ported verbatim from the SvelteKit page `client/src/routes/docx/+page.svelte`.
 * All functions are pure: they take strings and return strings/indices and never
 * touch the DOM (no document/window access).
 */

export type SnippetRange = { start: number; end: number };

export function normalizeSnippetChar(char: string): string {
	if (char === ' ') return ' ';
	if (char === '“' || char === '”' || char === '„' || char === '‟') return '"';
	if (char === '’' || char === '‘' || char === '`' || char === '´') return "'";
	return char;
}

export function normalizeSnippetForSearch(value: string): string {
	let normalized = '';
	let previousWasSpace = false;
	for (const rawChar of (value || '').normalize('NFKC')) {
		if (/[​-‍﻿]/.test(rawChar)) continue;
		const char = normalizeSnippetChar(rawChar).toLocaleLowerCase();
		if (char === '"' || char === "'") continue;
		if (/\s/.test(char)) {
			if (!previousWasSpace && normalized.length > 0) {
				normalized += ' ';
			}
			previousWasSpace = true;
			continue;
		}
		normalized += char;
		previousWasSpace = false;
	}
	return normalized.trim();
}

export function stripLeadingSnippetMarker(value: string): string {
	return value
		// Bullets
		.replace(/^(?:[o0•◦▪·\-])\s*/i, '')
		.replace(/^\(\s*(?:[o0•◦▪·\-])\s*\)\s*/i, '')
		// Clause/list markers: (a), (i), (1), a), i), 1), a., i., 1.
		.replace(
			/^(?:\(\s*(?:[a-z]{1,3}|[ivxlcdm]{1,8}|\d{1,3})\s*\)|(?:[a-z]{1,3}|[ivxlcdm]{1,8}|\d{1,3})[.)])\s*/i,
			''
		)
		.trim();
}

export function splitSnippetByEllipsis(value: string): string[] {
	return (value || '')
		.split(/(?:\.\s*){3,}|…+/g)
		.map((part) => part.trim())
		.filter(Boolean);
}

export function findSnippetRangeWithNormalization(
	textContent: string,
	rawSnippet: string
): SnippetRange | null {
	const normalizedRawSnippet = normalizeSnippetForSearch(rawSnippet);
	const normalizedSnippetWithoutBullet = stripLeadingSnippetMarker(normalizedRawSnippet);
	const targets = [normalizedRawSnippet];
	if (
		normalizedSnippetWithoutBullet &&
		normalizedSnippetWithoutBullet !== normalizedRawSnippet
	) {
		targets.push(normalizedSnippetWithoutBullet);
	}

	let normalizedText = '';
	const normalizedToOriginalIndex: number[] = [];
	let previousWasSpace = false;
	for (let index = 0; index < textContent.length; index += 1) {
		const sourceChar = textContent[index];
		if (/[​-‍﻿]/.test(sourceChar)) continue;
		for (const rawNormalizedChar of sourceChar.normalize('NFKC')) {
			const normalizedChar = normalizeSnippetChar(rawNormalizedChar).toLocaleLowerCase();
			if (normalizedChar === '"' || normalizedChar === "'") continue;
			if (/\s/.test(normalizedChar)) {
				if (!previousWasSpace && normalizedText.length > 0) {
					normalizedText += ' ';
					normalizedToOriginalIndex.push(index);
				}
				previousWasSpace = true;
				continue;
			}
			normalizedText += normalizedChar;
			normalizedToOriginalIndex.push(index);
			previousWasSpace = false;
		}
	}

	while (normalizedText.endsWith(' ') && normalizedToOriginalIndex.length > 0) {
		normalizedText = normalizedText.slice(0, -1);
		normalizedToOriginalIndex.pop();
	}

	// Handle abbreviated snippets like "foo ... bar ... baz":
	// match chunks in order while allowing gaps between them.
	const ellipsisParts = splitSnippetByEllipsis(rawSnippet)
		.map((part) => normalizeSnippetForSearch(part))
		.filter((part) => part.length > 0);
	if (ellipsisParts.length >= 2) {
		let scanFrom = 0;
		let firstStart = -1;
		let lastEnd = -1;
		for (const part of ellipsisParts) {
			const idx = normalizedText.indexOf(part, scanFrom);
			if (idx === -1) {
				firstStart = -1;
				break;
			}
			if (firstStart === -1) firstStart = idx;
			lastEnd = idx + part.length - 1;
			scanFrom = idx + part.length;
		}
		if (firstStart >= 0 && lastEnd >= firstStart) {
			const start = normalizedToOriginalIndex[firstStart];
			const end = normalizedToOriginalIndex[lastEnd];
			if (Number.isFinite(start) && Number.isFinite(end)) {
				return { start, end: end + 1 };
			}
		}
	}

	for (const target of targets) {
		if (!target) continue;
		const matchStartInNormalized = normalizedText.indexOf(target);
		if (matchStartInNormalized === -1) continue;
		const matchEndInNormalized = matchStartInNormalized + target.length - 1;
		const start = normalizedToOriginalIndex[matchStartInNormalized];
		const end = normalizedToOriginalIndex[matchEndInNormalized];
		if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
		return { start, end: end + 1 };
	}
	return null;
}

export function containsEllipsisSnippet(value: string): boolean {
	return /(?:\.\s*){3,}|…+/.test(value || '');
}

export function findCaseInsensitiveSnippetInSource(source: string, snippet: string): string | null {
	const haystack = source || '';
	const needle = (snippet || '').trim();
	if (!haystack || !needle) return null;
	const needleWithoutMarker = stripLeadingSnippetMarker(needle);
	const candidates =
		needleWithoutMarker && needleWithoutMarker !== needle
			? [needle, needleWithoutMarker]
			: [needle];
	for (const candidate of candidates) {
		const index = haystack.toLocaleLowerCase().indexOf(candidate.toLocaleLowerCase());
		if (index < 0) continue;
		return haystack.slice(index, index + candidate.length);
	}
	return null;
}

export function expandEllipsisSnippetInSource(source: string, snippet: string): string | null {
	const haystack = source || '';
	const needle = (snippet || '').trim();
	if (!haystack || !needle || !containsEllipsisSnippet(needle)) return null;
	const needleWithoutMarker = stripLeadingSnippetMarker(needle);
	const candidates =
		needleWithoutMarker && needleWithoutMarker !== needle
			? [needle, needleWithoutMarker]
			: [needle];
	for (const candidate of candidates) {
		const range = findSnippetRangeWithNormalization(haystack, candidate);
		if (!range) continue;
		const start = Math.max(0, Math.min(haystack.length, range.start));
		const end = Math.max(start, Math.min(haystack.length, range.end));
		const expanded = haystack.slice(start, end).trim();
		if (expanded) return expanded;
	}
	return null;
}

export function resolveSnippetAgainstSources(snippet: string, sources: string[]): string {
	const cleaned = (snippet || '').trim();
	if (!cleaned) return '';

	for (const source of sources) {
		const exact = findCaseInsensitiveSnippetInSource(source, cleaned);
		if (exact) return exact;
	}

	if (containsEllipsisSnippet(cleaned)) {
		for (const source of sources) {
			const expanded = expandEllipsisSnippetInSource(source, cleaned);
			if (expanded) return expanded;
		}
	}

	return cleaned;
}
