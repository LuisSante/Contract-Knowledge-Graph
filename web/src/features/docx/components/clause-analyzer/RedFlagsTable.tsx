'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { KIND_COLORS, KIND_LABEL } from '@/features/docx/components/clause-analyzer/constants';
import { RankBadge, SectionTag } from '@/features/docx/components/clause-analyzer/parts/table-bits';
import { cn } from '@/lib/utils';
import { fetchRedFlags } from '@/services/red-flags';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import { useDocumentStore } from '@/stores/document';
import type { Node } from '@/types/document';
import { deonticNodes, type KnowledgeGraph } from '@/types/knowledge';
import type { RedFlag } from '@/types/red-flags';

// Blue, so a flag in the contract never reads as one of the deontic types' colours.
const FLAG_COLOR = '#2563eb';
const FLAG_SOFT = 'rgba(37, 99, 235, 0.18)';

function squash(text: string): string {
	return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** The paragraph holding the flagged text; when several do, the nearest to its DOCX position. */
function paragraphOf(paragraphs: Node[], flag: RedFlag): Node | null {
	const needle = squash(flag.text);
	const holders = paragraphs.filter((p) => squash(p.text).includes(needle));
	if (holders.length === 0) return null;
	const distance = (p: Node) => Math.abs(p.paragraph_enum - flag.docxParagraph);
	return holders.reduce((best, p) => (distance(p) < distance(best) ? p : best));
}

// A flag counts as found when a statement's evidence, or failing that a condition's trigger,
// shares this many consecutive words with it: the criterion fixed for the evaluation.
const MIN_SHARED_WORDS = 6;
const FOUND_AS = ['obligation', 'right', 'prohibition', 'condition'] as const;
type FoundAs = (typeof FOUND_AS)[number];

/** What the graph holds for a flag: by type, the clause of each match (null when it has none),
 *  `null` when nothing matches, or `short` when it has fewer words than the criterion needs. */
type Detection = Partial<Record<FoundAs, Array<string | null>>> | null | 'short';

/** A clause as the table shows it: the place in its row's circle and the tag beside it. */
export interface ClausePlace {
	rank: number | undefined;
	section: string | null;
	heading: string;
}

function wordRuns(text: string): Set<string> {
	const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
	const runs = new Set<string>();
	for (let i = 0; i + MIN_SHARED_WORDS <= words.length; i++) {
		runs.add(words.slice(i, i + MIN_SHARED_WORDS).join(' '));
	}
	return runs;
}

function detect(kg: KnowledgeGraph, flag: RedFlag): Detection {
	const runs = wordRuns(flag.text);
	if (runs.size === 0) return 'short';
	const shares = (text: string) => [...wordRuns(text)].some((run) => runs.has(run));

	const found: Partial<Record<FoundAs, Array<string | null>>> = {};
	const statements = deonticNodes(kg);
	for (const statement of statements) {
		if ((statement.evidenceSpans ?? []).some(shares)) {
			(found[statement.kind] ??= []).push(statement.clauseId ?? null);
		}
	}
	if (Object.keys(found).length > 0) return found;
	// A condition sits in the clause of the statement it gates.
	const clauseOfStatement = new Map(statements.map((s) => [s.id, s.clauseId ?? null] as const));
	const conditions = kg.conditions
		.filter((condition) => shares(condition.trigger ?? ''))
		.map((condition) =>
			condition.gatesId ? (clauseOfStatement.get(condition.gatesId) ?? null) : null
		);
	return conditions.length > 0 ? { condition: conditions } : null;
}

/** `right_of_first_refusal_to_lease` → «Right of first refusal to lease»; the dataset's spelling is kept. */
function typeLabel(type: string | null): string {
	if (!type) return '—';
	const words = type.replace(/_/g, ' ');
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The rows of the table a type's matches sit in: each clause once, with its place and number. */
function Places({
	clauseIds,
	placeOf,
}: {
	clauseIds: Array<string | null>;
	placeOf?: (clauseId: string) => ClausePlace | null;
}) {
	const places = [...new Set(clauseIds)].map((id) => (id && placeOf ? placeOf(id) : null));
	if (places.every((place) => place === null)) {
		return <span className="text-muted-foreground">No clause assigned</span>;
	}
	return (
		<span className="flex flex-wrap items-center gap-x-2 gap-y-1">
			{places.map((place, i) =>
				place ? (
					<span key={i} className="inline-flex items-center gap-1" title={place.heading}>
						{place.rank !== undefined && <RankBadge rank={place.rank} className="size-5" />}
						{place.section ? (
							<SectionTag section={place.section} />
						) : (
							<span className="max-w-32 truncate text-muted-foreground">{place.heading}</span>
						)}
					</span>
				) : (
					<span key={i} className="text-muted-foreground">
						No clause assigned
					</span>
				)
			)}
		</span>
	);
}

/** «Detected» and «Found as» for one flag: each type the graph holds it as, with the analyzer's
 *  square, and the rows of the table it is in. */
function DetectionCells({
	detection,
	placeOf,
}: {
	detection: Detection;
	placeOf?: (clauseId: string) => ClausePlace | null;
}) {
	if (detection === 'short') {
		return (
			<>
				<td
					className="px-3 py-1.5 text-muted-foreground"
					title="Shorter than the six words the match needs"
				>
					—
				</td>
				<td className="px-3 py-1.5" />
			</>
		);
	}
	if (detection === null) {
		return (
			<>
				<td className="px-3 py-1.5 font-semibold text-foreground">No</td>
				<td className="px-3 py-1.5 text-muted-foreground">—</td>
			</>
		);
	}
	return (
		<>
			<td className="px-3 py-1.5 text-foreground/70">Yes</td>
			<td className="px-3 py-1.5">
				<span className="flex flex-col gap-1.5">
					{FOUND_AS.map((kind) => [kind, detection[kind]] as const).map(([kind, clauseIds]) =>
						clauseIds ? (
							<span key={kind} className="flex flex-col gap-1">
								<span className="inline-flex items-center gap-1.5 text-foreground/80">
									<span
										className="size-2.5 shrink-0 rounded-[2px]"
										style={{ backgroundColor: KIND_COLORS[kind] }}
									/>
									{KIND_LABEL[kind]}
									{clauseIds.length > 1 && (
										<span className="text-muted-foreground">×{clauseIds.length}</span>
									)}
								</span>
								<span className="pl-4">
									<Places clauseIds={clauseIds} placeOf={placeOf} />
								</span>
							</span>
						) : null
					)}
				</span>
			</td>
		</>
	);
}

/** The dataset's red flags under the analyzer, as a reference to set against the table above. */
export function RedFlagsTable({
	docId,
	kg,
	placeOf,
}: {
	docId: string;
	kg: KnowledgeGraph | null;
	/** A clause's place and number in the table. */
	placeOf?: (clauseId: string) => ClausePlace | null;
}) {
	// Kept with the document they belong to, so another contract never shows them while it loads.
	const [loaded, setLoaded] = useState<{ docId: string; flags: RedFlag[] } | null>(null);

	useEffect(() => {
		if (!docId) return;
		let cancelled = false;
		fetchRedFlags(docId)
			.then((flags) => {
				if (!cancelled) setLoaded({ docId, flags });
			})
			.catch(() => {
				if (!cancelled) setLoaded({ docId, flags: [] });
			});
		return () => {
			cancelled = true;
		};
	}, [docId]);

	const paragraphs = useDocumentStore((s) => s.paragraphs);
	const setDocumentTarget = useClauseAnalyzerStore((s) => s.setDocumentTarget);
	const [opened, setOpened] = useState<{ docId: string; index: number } | null>(null);
	// Folded into its bar by default, so the analyzer keeps the panel; the arrow lifts it up.
	const [expanded, setExpanded] = useState(false);

	const flags = useMemo(() => (loaded?.docId === docId ? loaded.flags : []), [loaded, docId]);
	const openedIndex = opened?.docId === docId ? opened.index : null;
	// Worked out from the graph on every load, never stored: a new extraction shows its own.
	const detections = useMemo(
		() => (kg ? flags.map((flag) => detect(kg, flag)) : null),
		[kg, flags]
	);
	const detectedCount = detections?.filter((d) => d !== null && d !== 'short').length ?? null;

	/** Paints the flag blue in the contract and scrolls to it, as a clause row does. */
	const openInDocument = (flag: RedFlag, index: number) => {
		const paragraph = paragraphOf(paragraphs, flag);
		if (!paragraph) return;
		const key = `red-flag-${index}`;
		setDocumentTarget({
			anchorParagraphId: paragraph.id,
			anchorLabel: null,
			relatedParagraphs: [],
			entities: [{ label: flag.text, key: `kg-${key}`, color: FLAG_COLOR, softColor: FLAG_SOFT }],
			paragraphIds: [paragraph.id],
			// One focused id: the viewer lands on the flag's words, not the paragraph's top.
			focusNodeIds: [key],
			scoreByParagraph: {},
			toneByParagraph: {},
		});
		setOpened({ docId, index });
	};

	// Most contracts are not in the dataset: no flags, no table.
	if (flags.length === 0) return null;

	return (
		<section
			className={cn(
				'shrink-0 border-t border-border/60 transition-[max-height] duration-200 ease-out',
				expanded ? 'max-h-[38%] overflow-auto' : 'max-h-8 overflow-hidden'
			)}
		>
			{/* h-8 is the folded height: closed, the bar is all that shows. */}
			<button
				type="button"
				onClick={() => setExpanded((open) => !open)}
				aria-expanded={expanded}
				title={expanded ? 'Hide the red flags' : 'Show the red flags'}
				className="sticky top-0 z-10 flex h-8 w-full items-center gap-2 border-b border-border/60 bg-background/95 px-3 text-left text-2xs backdrop-blur hover:bg-muted/60"
			>
				<span className="font-medium text-muted-foreground/70">
					RED FLAGS <span className="font-normal opacity-70">· {flags.length}</span>
					{detectedCount !== null && (
						<span className="font-normal opacity-70"> · {detectedCount} detected</span>
					)}
				</span>
				<ChevronDownIcon
					className={cn(
						'ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-200',
						!expanded && 'rotate-180'
					)}
				/>
			</button>
			<table className="w-full table-fixed text-xs">
				<thead className="text-2xs text-muted-foreground/70">
					<tr className="border-b border-border/40">
						<th className="w-[20%] px-3 py-1 text-left font-medium">Article</th>
						<th className="w-[14%] px-3 py-1 text-left font-medium">Type</th>
						{detections && (
							<>
								<th className="w-[8%] px-3 py-1 text-left font-medium">Detected</th>
								<th className="w-[20%] px-3 py-1 text-left font-medium">Found as</th>
							</>
						)}
						<th className="px-3 py-1 text-left font-medium">Text</th>
					</tr>
				</thead>
				<tbody>
					{flags.map((flag, index) => (
						<tr
							key={index}
							onClick={() => openInDocument(flag, index)}
							title="Show in the contract"
							className={cn(
								'cursor-pointer border-b border-border/30 align-top last:border-b-0 hover:bg-muted/60',
								openedIndex === index && 'bg-blue-50 hover:bg-blue-50 dark:bg-blue-950/40'
							)}
						>
							<td className="truncate px-3 py-1.5 text-foreground/70" title={flag.article}>
								{flag.article || '—'}
							</td>
							<td className="px-3 py-1.5 font-medium text-foreground/85">{typeLabel(flag.type)}</td>
							{detections && <DetectionCells detection={detections[index]} placeOf={placeOf} />}
							<td className="px-3 py-1.5 text-foreground/80">
								<span className="line-clamp-2" title={flag.text}>
									{flag.text}
								</span>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</section>
	);
}
