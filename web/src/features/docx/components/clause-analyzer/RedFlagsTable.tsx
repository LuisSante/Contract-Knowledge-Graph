'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { KIND_COLORS, KIND_LABEL } from '@/features/docx/components/clause-analyzer/constants';
import { RankBadge, SectionTag } from '@/features/docx/components/clause-analyzer/parts/table-bits';
import { tint } from '@/features/docx/components/clause-analyzer/parts/table-bits';
import { flagPath, type FlagPath } from '@/features/docx/utils/knowledge/red-flag-path';
import type { EntityHighlight } from '@/features/docx/utils/assistant/entity-marks';
import type { EvidenceParagraph } from '@/types/evidence';
import { cn } from '@/lib/utils';
import { fetchRedFlags } from '@/services/red-flags';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import { useDocumentStore } from '@/stores/document';
import type { Node } from '@/types/document';
import { deonticNodes, type DeonticKind, type KnowledgeGraph } from '@/types/knowledge';
import type { DocumentTarget } from '@/features/docx/utils/knowledge/graph-payload';
import type { RedFlag } from '@/types/red-flags';
import { conditionLead } from '@/features/docx/utils/knowledge/clause-favour';
import {
	detect,
	flagTypeLabel,
	FOUND_AS,
	MIN_SHARED_WORDS,
	paragraphOf,
	wordRuns,
	type Detection,
} from '@/features/docx/utils/knowledge/red-flags';

// Blue, so a flag in the contract never reads as one of the deontic types' colours.
const FLAG_COLOR = '#2563eb';
const FLAG_SOFT = 'rgba(37, 99, 235, 0.18)';

/** A clause as the table shows it: the place in its row's circle and the tag beside it. */
export type PlaceOf = (clauseId: string, kind?: DeonticKind) => ClausePlace | null;

export interface ClausePlace {
	rank: number | undefined;
	section: string | null;
	heading: string;
}

/** The flag's text cut into pieces, `shared` on the words that sit in a run of
 *  MIN_SHARED_WORDS the graph texts also hold: the words the match rests on. */
function sharedPieces(text: string, matched: string[]): Array<{ text: string; shared: boolean }> {
	const lower = text.toLowerCase();
	// Lowercasing that changes the length would shift the offsets: show the text unmarked.
	if (matched.length === 0 || lower.length !== text.length) return [{ text, shared: false }];
	const words = [...lower.matchAll(/[a-z0-9]+/g)];
	const graphRuns = new Set(matched.flatMap((m) => [...wordRuns(m)]));
	const marked = new Array<boolean>(words.length).fill(false);
	for (let i = 0; i + MIN_SHARED_WORDS <= words.length; i++) {
		const run = words.slice(i, i + MIN_SHARED_WORDS).map((w) => w[0]);
		if (graphRuns.has(run.join(' '))) marked.fill(true, i, i + MIN_SHARED_WORDS);
	}

	const pieces: Array<{ text: string; shared: boolean }> = [];
	let cursor = 0;
	for (let i = 0; i < words.length; i++) {
		if (!marked[i]) continue;
		let last = i;
		while (last + 1 < words.length && marked[last + 1]) last++;
		const start = words[i].index;
		const end = words[last].index + words[last][0].length;
		if (start > cursor) pieces.push({ text: text.slice(cursor, start), shared: false });
		pieces.push({ text: text.slice(start, end), shared: true });
		cursor = end;
		i = last;
	}
	if (cursor < text.length) pieces.push({ text: text.slice(cursor), shared: false });
	return pieces;
}

/** The rows of the table a type's matches sit in: each clause once, with its place and number. */
function Places({
	clauseIds,
	kind,
	placeOf,
}: {
	clauseIds: Array<string | null>;
	/** The tab whose numbers the places take; none for a condition. */
	kind?: DeonticKind;
	placeOf?: PlaceOf;
}) {
	const places = [...new Set(clauseIds)].map((id) => (id && placeOf ? placeOf(id, kind) : null));
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
function DetectionCells({ detection, placeOf }: { detection: Detection; placeOf?: PlaceOf }) {
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
									<Places
										clauseIds={clauseIds}
										kind={kind === 'condition' ? undefined : kind}
										placeOf={placeOf}
									/>
								</span>
							</span>
						) : null
					)}
				</span>
			</td>
		</>
	);
}

const CONDITION_COLOR = '#e7298a';

function sectionLabel(kg: KnowledgeGraph, clauseId: string | null, placeOf?: PlaceOf): string {
	if (!clauseId) return '—';
	const section = placeOf?.(clauseId)?.section;
	const ref = kg.clauses.find((c) => c.id === clauseId)?.ref;
	return section ?? (ref ? `§${ref}` : '—');
}

/** The path in the contract, beside the flag: its statements and conditions painted in their
 *  colours, and the paragraphs of the other steps linked to the flag's by the margin line. */
function pathInDocument(
	kg: KnowledgeGraph,
	path: FlagPath,
	paragraphs: Node[],
	anchorId: string,
	placeOf?: PlaceOf
): { entities: EntityHighlight[]; related: EvidenceParagraph[] } {
	const nodeById = new Map(paragraphs.map((p) => [p.id, p] as const));
	const entities: EntityHighlight[] = [];
	const related = new Map<string, EvidenceParagraph>();
	const link = (pid: string, relation?: EvidenceParagraph['relation']) => {
		const node = nodeById.get(pid);
		if (!node || pid === anchorId || related.has(pid)) return;
		related.set(pid, { node, ...(relation && { relation }) });
	};
	const paint = (s: FlagPath['statements'][number]) => {
		const color = KIND_COLORS[s.statement.kind];
		for (const span of s.statement.evidenceSpans ?? []) {
			entities.push({
				label: span,
				key: `kg-${s.statement.id}`,
				color,
				softColor: tint(color, 16),
			});
		}
		for (const { condition } of s.conditions) {
			entities.push({
				label: condition.trigger,
				key: `kg-${condition.id}`,
				color: CONDITION_COLOR,
				softColor: tint(CONDITION_COLOR, 14),
			});
		}
	};
	const home = sectionLabel(kg, path.clauseIds[0] ?? null, placeOf);
	for (const s of path.statements) {
		paint(s);
		s.statement.paragraphIds.forEach((pid) => link(pid));
		for (const { condition } of s.conditions) {
			condition.paragraphIds.forEach((pid) =>
				link(pid, {
					kind: 'condition',
					lead: conditionLead(condition.operator),
					trigger: condition.trigger,
				})
			);
		}
	}
	for (const c of path.consequences) {
		paint(c);
		const from = sectionLabel(kg, c.clauseId, placeOf);
		c.statement.paragraphIds.forEach((pid) => link(pid, { kind: 'depends_on', from, to: home }));
	}
	for (const m of path.modifiers) {
		const from = sectionLabel(kg, m.clauseId, placeOf);
		const pids =
			m.statement?.paragraphIds ??
			kg.clauses.find((c) => c.id === m.clauseId)?.paragraphIds.slice(0, 1) ??
			[];
		pids.forEach((pid) => link(pid, { kind: 'modifies', from, to: home }));
	}
	return { entities, related: [...related.values()] };
}

/** The dataset's red flags under the analyzer, as a reference to set against the table above. */
export function RedFlagsTable({
	docId,
	kg,
	placeOf,
	onFlagged,
	onReveal,
}: {
	docId: string;
	kg: KnowledgeGraph | null;
	/** A clause's place and number in the table. */
	placeOf?: PlaceOf;
	/** Hands up the statements some flag matched, so the table above can mark their squares. */
	onFlagged?: (docId: string, statementIds: ReadonlySet<string>) => void;
	/** A row was picked: the analyzer opens the tab and row of the statement it matched, marks its
	 *  square and paints the contract with `target` once the row is selected. Absent, the table
	 *  paints the contract itself. */
	onReveal?: (statementIds: string[], target: DocumentTarget) => void;
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
	const matches = useMemo(() => (kg ? flags.map((flag) => detect(kg, flag)) : null), [kg, flags]);
	const detections = matches?.map((m) => m.detection) ?? null;
	const detectedCount = detections?.filter((d) => d !== null && d !== 'short').length ?? null;
	// The flags with a square in the table above come first, in the dataset's order; the ones
	// without (not found, or found only in statements no party carries) go at the end.
	const order = useMemo(() => {
		const all = flags.map((_, index) => index);
		if (!kg || !matches) return { withSquare: all, without: [] };
		const parties = new Set(kg.parties.map((p) => p.id));
		const owned = new Set(
			deonticNodes(kg)
				.filter((s) => {
					const owner = s.kind === 'right' ? s.benefitPartyId : s.burdenPartyId;
					return owner !== null && parties.has(owner);
				})
				.map((s) => s.id)
		);
		const hasSquare = (index: number) => matches[index].statementIds.some((id) => owned.has(id));
		return { withSquare: all.filter(hasSquare), without: all.filter((i) => !hasSquare(i)) };
	}, [flags, kg, matches]);

	// The other flags that lead to the opened flag's statements: their rows are marked.
	const opening = useMemo(() => {
		if (!kg || !matches || openedIndex === null) return null;
		const flag = flags[openedIndex];
		const match = matches[openedIndex];
		const path = flagPath(kg, match.statementIds, paragraphOf(paragraphs, flag)?.id ?? null);
		if (!path) return null;
		const ids = new Set(path.statements.map((s) => s.statement.id));
		const sharing = new Set(
			matches.flatMap((m, i) =>
				i !== openedIndex && m.statementIds.some((id) => ids.has(id)) ? [i] : []
			)
		);
		return { sharing };
	}, [kg, matches, openedIndex, flags, paragraphs]);

	useEffect(() => {
		onFlagged?.(docId, new Set(matches?.flatMap((m) => m.statementIds) ?? []));
	}, [onFlagged, docId, matches]);

	/** Paints the flag blue in the contract and scrolls to it, as a clause row does. */
	const openInDocument = (flag: RedFlag, index: number) => {
		const paragraph = paragraphOf(paragraphs, flag);
		if (!paragraph) return;
		const key = `red-flag-${index}`;
		const path = kg && matches ? flagPath(kg, matches[index].statementIds, paragraph.id) : null;
		const around = path && kg ? pathInDocument(kg, path, paragraphs, paragraph.id, placeOf) : null;
		const target: DocumentTarget = {
			anchorParagraphId: paragraph.id,
			anchorLabel: null,
			relatedParagraphs: around?.related ?? [],
			// The flag first: where its words and a statement's overlap, the longer one shows.
			entities: [
				{ label: flag.text, key: `kg-${key}`, color: FLAG_COLOR, softColor: FLAG_SOFT },
				...(around?.entities ?? []),
			],
			paragraphIds: [paragraph.id, ...(around?.related.map((p) => p.node.id) ?? [])],
			// One focused id: the viewer lands on the flag's words, not the paragraph's top.
			focusNodeIds: [key],
			scoreByParagraph: {},
			toneByParagraph: {},
		};
		// The statement written in the flag's own paragraph first: a twin elsewhere comes after.
		const ids = matches?.[index].statementIds ?? [];
		const byId = new Map(kg ? deonticNodes(kg).map((s) => [s.id, s] as const) : []);
		const ordered = [
			...ids.filter((id) => byId.get(id)?.paragraphIds.includes(paragraph.id)),
			...ids.filter((id) => !byId.get(id)?.paragraphIds.includes(paragraph.id)),
		];
		if (onReveal) onReveal(ordered, target);
		else setDocumentTarget(target);
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
				<span className="font-medium text-muted-foreground">
					RED FLAGS <span className="font-normal">· {flags.length}</span>
					{detectedCount !== null && (
						<span className="font-normal"> · {detectedCount} detected</span>
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
				<thead className="text-2xs text-muted-foreground">
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
					{[...order.withSquare, ...order.without].map((index) => {
						const flag = flags[index];
						return (
							<Fragment key={index}>
								{index === order.without[0] && order.withSquare.length > 0 && (
									<tr className="border-b border-border/40">
										<td
											colSpan={detections ? 5 : 3}
											className="px-3 pt-3 pb-1 text-2xs font-medium text-muted-foreground"
										>
											No square in the table above · {order.without.length}
										</td>
									</tr>
								)}
								<tr
									onClick={() => openInDocument(flag, index)}
									title="Show in the contract"
									className={cn(
										'cursor-pointer border-b border-border/30 align-top last:border-b-0 hover:bg-muted/60',
										openedIndex === index && 'bg-blue-50 hover:bg-blue-50 dark:bg-blue-950/40',
										opening?.sharing.has(index) && 'bg-blue-50/50 shadow-[inset_3px_0_0_#2563eb]'
									)}
								>
									<td className="truncate px-3 py-1.5 text-foreground/70" title={flag.article}>
										{flag.article || '—'}
									</td>
									<td className="px-3 py-1.5 font-medium text-foreground/85">
										{flagTypeLabel(flag.type)}
									</td>
									{detections && <DetectionCells detection={detections[index]} placeOf={placeOf} />}
									<td className="px-3 py-1.5 text-foreground/80">
										{/* The opened flag shows whole, so its marked words are never cut off. */}
										<span className={cn(openedIndex !== index && 'line-clamp-2')} title={flag.text}>
											{sharedPieces(flag.text, matches?.[index].matched ?? []).map((piece, i) =>
												piece.shared ? (
													<span key={i} className="font-semibold text-blue-700 dark:text-blue-300">
														{piece.text}
													</span>
												) : (
													piece.text
												)
											)}
										</span>
									</td>
								</tr>
							</Fragment>
						);
					})}
				</tbody>
			</table>
		</section>
	);
}
