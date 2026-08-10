export type ExplanationEntity = {
	label: string;
	key: string;
	color: string;
	softColor: string;
};

export function parseParagraphExplanationVariants(answer: string): {
	shortText: string;
	detailedText: string;
	entities: string[];
} {
	const normalized = answer.trim();
	if (!normalized) {
		return { shortText: '', detailedText: '', entities: [] };
	}

	const normalizeEntities = (values: string[]): string[] => {
		const unique = new Set<string>();
		for (const value of values) {
			const cleaned = value.replace(/^[-*•]\s*/, '').trim();
			if (!cleaned) continue;
			if (cleaned.length < 2) continue;
			unique.add(cleaned);
		}
		return Array.from(unique).slice(0, 12);
	};

	const readExplanationField = (record: Record<string, unknown>, keys: string[]): string => {
		for (const key of keys) {
			const value = record[key];
			if (typeof value === 'string' && value.trim()) return value.trim();
		}
		return '';
	};

	const tryParseJsonExplanation = (
		raw: string
	): { shortText: string; detailedText: string; entities: string[] } | null => {
		const tryCandidates: string[] = [raw];
		const jsonBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
		if (jsonBlockMatch?.[1]) tryCandidates.unshift(jsonBlockMatch[1].trim());

		for (const candidate of tryCandidates) {
			try {
				const parsed = JSON.parse(candidate) as unknown;
				if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
				const record = parsed as Record<string, unknown>;
				const shortText = readExplanationField(record, [
					'SHORT_EXPLANATION',
					'short_explanation',
					'shortExplanation',
					'summary',
					'short'
				]);
				const detailedText = readExplanationField(record, [
					'DETAILED_EXPLANATION',
					'detailed_explanation',
					'detailedExplanation',
					'detail',
					'detailed'
				]);
				const entitiesRaw = record.ENTITIES ?? record.entities ?? record.entity_list;
				const entities = Array.isArray(entitiesRaw)
					? normalizeEntities(
							entitiesRaw.filter((entry): entry is string => typeof entry === 'string')
						)
					: typeof entitiesRaw === 'string'
						? normalizeEntities(
								entitiesRaw
									.split('\n')
									.map((line) => line.trim())
									.filter(Boolean)
							)
						: [];
				if (shortText || detailedText) {
					return {
						shortText: shortText || detailedText,
						detailedText: detailedText || shortText,
						entities
					};
				}
			} catch {
				// Keep trying other formats.
			}
		}
		return null;
	};

	const jsonParsed = tryParseJsonExplanation(normalized);
	if (jsonParsed) return jsonParsed;

	const structuredMatch = normalized.match(
		/SHORT_EXPLANATION:\s*([\s\S]*?)\s*DETAILED_EXPLANATION:\s*([\s\S]*)/i
	);
	if (structuredMatch) {
		const shortText = structuredMatch[1]?.trim() ?? '';
		const detailedRaw = structuredMatch[2]?.trim() ?? '';
		const entitiesMatch = detailedRaw.match(/ENTITIES:\s*([\s\S]*)/i);
		const detailedText = entitiesMatch
			? detailedRaw.slice(0, entitiesMatch.index ?? detailedRaw.length).trim()
			: detailedRaw;
		const entities = entitiesMatch
			? normalizeEntities(
					entitiesMatch[1]
						.split('\n')
						.map((line) => line.trim())
						.filter(Boolean)
				)
			: [];
		return { shortText, detailedText, entities };
	}

	const labeledMatch = normalized.match(
		/SHORT[\s_-]*EXPLANATION\s*:\s*([\s\S]*?)\s*DETAILED[\s_-]*EXPLANATION\s*:\s*([\s\S]*)/i
	);
	if (labeledMatch) {
		const shortText = labeledMatch[1]?.trim() ?? '';
		const detailedRaw = labeledMatch[2]?.trim() ?? '';
		const entitiesMatch = detailedRaw.match(/ENTITIES:\s*([\s\S]*)/i);
		const detailedText = entitiesMatch
			? detailedRaw.slice(0, entitiesMatch.index ?? detailedRaw.length).trim()
			: detailedRaw;
		const entities = entitiesMatch
			? normalizeEntities(
					entitiesMatch[1]
						.split('\n')
						.map((line) => line.trim())
						.filter(Boolean)
				)
			: [];
		return { shortText, detailedText, entities };
	}

	const paragraphChunks = normalized
		.split(/\n\s*\n/g)
		.map((chunk) => chunk.trim())
		.filter(Boolean);
	if (paragraphChunks.length >= 2) {
		return {
			shortText: paragraphChunks[0],
			detailedText: paragraphChunks.slice(1).join('\n\n'),
			entities: []
		};
	}

	return {
		shortText: normalized,
		detailedText: normalized,
		entities: []
	};
}

export const PARAGRAPH_EXPLANATION_ENTITY_COLOR_PALETTE: Array<{
	color: string;
	softColor: string;
}> = [
	{ color: '#2563eb', softColor: 'rgba(37,99,235,0.16)' },
	{ color: '#0d9488', softColor: 'rgba(13,148,136,0.16)' },
	{ color: '#7c3aed', softColor: 'rgba(124,58,237,0.16)' },
	{ color: '#ea580c', softColor: 'rgba(234,88,12,0.16)' },
	{ color: '#0284c7', softColor: 'rgba(2,132,199,0.16)' },
	{ color: '#be185d', softColor: 'rgba(190,24,93,0.16)' },
	{ color: '#15803d', softColor: 'rgba(21,128,61,0.16)' },
	{ color: '#b45309', softColor: 'rgba(180,83,9,0.16)' }
];

export function normalizeParagraphExplanationEntityKey(value: string): string {
	return value
		.toLocaleLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function buildParagraphExplanationEntityHighlights(
	entities: string[]
): ExplanationEntity[] {
	const uniqueByKey = new Map<string, string>();
	for (const rawEntity of entities) {
		const cleaned = rawEntity.trim();
		if (!cleaned) continue;
		const key = normalizeParagraphExplanationEntityKey(cleaned);
		if (!key) continue;
		if (!uniqueByKey.has(key)) uniqueByKey.set(key, cleaned);
	}
	return Array.from(uniqueByKey.entries()).map(([key, label], index) => {
		const palette =
			PARAGRAPH_EXPLANATION_ENTITY_COLOR_PALETTE[
				index % PARAGRAPH_EXPLANATION_ENTITY_COLOR_PALETTE.length
			];
		return {
			label,
			key,
			color: palette.color,
			softColor: palette.softColor
		};
	});
}

export const PARAGRAPH_EXPLANATION_PROMPT: string = [
	'Explain the selected contract paragraph in clear and accessible language.',
	'Use related paragraphs only as supporting context; do not invent facts.',
	'CRITICAL OUTPUT RULES:',
	'- Do NOT return JSON.',
	'- Do NOT use code fences.',
	'- Do NOT include citations, arrays, or metadata.',
	'- Return ONLY these three text blocks, in this exact order and labels:',
	'SHORT_EXPLANATION:',
	'<2-4 sentences, concise, plain language, max ~90 words>',
	'DETAILED_EXPLANATION:',
	'<in-depth explanation, 4-8 sentences, ~180-320 words>',
	'QUALITY REQUIREMENTS FOR DETAILED_EXPLANATION:',
	'1) precise legal meaning of the clause;',
	'2) obligations/duties by party and practical consequences;',
	'3) conditions, exceptions, dependencies, and timeline cues;',
	'4) legal/commercial risks and ambiguities;',
	'5) one concrete real-world scenario showing impact.',
	'Keep legal accuracy while reducing jargon.',
	'ENTITIES:',
	'- list 3 to 8 key legal/business entities or terms copied exactly from the clause/context when possible.',
	'- one entity per line, prefixed with "- ".'
].join('\n');
