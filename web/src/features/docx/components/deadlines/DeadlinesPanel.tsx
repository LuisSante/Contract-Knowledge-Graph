'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDocumentStore } from '@/stores/document';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import { useKnowledgeGraphData } from '@/features/docx/hooks/useKnowledgeGraphData';
import { useComparedPair } from '@/features/docx/hooks/useAnalyzerPair';
import {
	buildDocumentTarget,
	type DocumentTarget,
} from '@/features/docx/utils/knowledge/graph-payload';
import {
	deadlineGroups,
	type DeadlineGroup,
	type DeadlineKind,
	type TimedDuty,
} from '@/features/docx/utils/knowledge/deadlines';
import { short } from '@/features/docx/components/clause-analyzer/parts/bits';
import {
	KIND_COLORS,
	NEUTRAL_COLOR,
	PAIR_SECOND_COLOR,
	PARTY_COLOR,
} from '@/features/docx/components/clause-analyzer/constants';

/** Nothing painted: what another tab left in the document is not about deadlines. */
const NOTHING: DocumentTarget = {
	anchorParagraphId: null,
	anchorLabel: null,
	relatedParagraphs: [],
	entities: [],
	paragraphIds: [],
	focusNodeIds: [],
	scoreByParagraph: {},
	toneByParagraph: {},
};

/** How each kind of deadline is drawn, and what its key says. */
const KIND_STYLE: Record<DeadlineKind, { chip: string; key: string; title: string }> = {
	exact: {
		chip: 'bg-primary/10 text-primary',
		key: 'with a number',
		title: 'A count of hours, days or months',
	},
	vague: {
		chip: 'bg-amber-100 text-amber-800',
		key: 'vague',
		title: 'A word that fixes no day, such as «promptly» or «in advance»',
	},
	event: {
		chip: 'bg-muted text-foreground/80',
		key: 'at an event',
		title: 'Waits for something to happen, such as «upon termination»',
	},
};

/** The `frequency` field, drawn apart from any deadline: it says how often or for how long. */
const FREQUENCY_STYLE = {
	chip: 'border border-dashed border-foreground/30 bg-card text-foreground/70',
	key: 'frequency',
	title: 'How often or for how long («per month», «during the term»): not a deadline',
};

type Who = 'all' | 'a' | 'b';

/** Said before each action in its type's colour, so a prohibition does not read as a duty. */
const TYPE_NAME: Record<TimedDuty['kind'], string> = {
	obligation: 'obligation',
	right: 'right',
	prohibition: 'prohibition',
};

/**
 * The contract's deadlines, grouped by the clause they belong to. Everything comes from what
 * the graph already holds; a line opens its sentence in the document.
 */
export function DeadlinesPanel({ docId }: { docId: string }) {
	const setDocumentTarget = useClauseAnalyzerStore((s) => s.setDocumentTarget);
	const paragraphs = useDocumentStore((s) => s.paragraphs);
	const nodesById = useMemo(() => new Map(paragraphs.map((n) => [n.id, n])), [paragraphs]);

	const { viewKg, status } = useKnowledgeGraphData(docId);
	const { aId, bId } = useComparedPair(viewKg, true);
	const groups = useMemo(() => (viewKg ? deadlineGroups(viewKg) : []), [viewKg]);
	const nameOf = useMemo(
		() => new Map((viewKg?.parties ?? []).map((p) => [p.id, short(p.name)] as const)),
		[viewKg]
	);

	const [who, setWho] = useState<Who>('all');
	const [folded, setFolded] = useState<Record<string, boolean>>({});
	const [picked, setPicked] = useState<string | null>(null);
	useEffect(() => setDocumentTarget(NOTHING), [setDocumentTarget]);

	const colorOf = (partyId: string) =>
		partyId === aId ? PARTY_COLOR : partyId === bId ? PAIR_SECOND_COLOR : NEUTRAL_COLOR;
	const shown = (duty: TimedDuty) =>
		who === 'all' || duty.actors.includes((who === 'a' ? aId : bId) ?? '');
	const visible = groups
		.map((g) => ({ ...g, duties: g.duties.filter(shown) }))
		.filter((g) => g.duties.length > 0);

	const open = (duty: TimedDuty) => {
		setPicked(duty.ids[0]);
		if (viewKg) setDocumentTarget(buildDocumentTarget(viewKg, duty.ids[0], nodesById));
	};

	if (status === 'loading')
		return (
			<p className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Loading knowledge graph…
			</p>
		);
	if (status !== 'ready' || !viewKg)
		return (
			<p className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
				{status === 'error'
					? 'Failed to load the knowledge graph.'
					: 'No knowledge graph generated for this document yet.'}
			</p>
		);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/60 px-6 py-2.5">
				{aId && bId && (
					<div className="flex items-center gap-2">
						<span className="text-xs font-medium text-muted-foreground">Who acts</span>
						<div
							role="radiogroup"
							aria-label="Who acts"
							className="inline-flex rounded-md border border-border bg-secondary p-0.5"
						>
							{(['all', 'a', 'b'] as const).map((option) => {
								const id = option === 'a' ? aId : option === 'b' ? bId : null;
								return (
									<button
										key={option}
										type="button"
										role="radio"
										aria-checked={who === option}
										onClick={() => setWho(option)}
										className={cn(
											'inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs whitespace-nowrap',
											who === option
												? 'bg-card font-semibold text-foreground shadow-sm'
												: 'font-medium text-muted-foreground hover:text-foreground'
										)}
									>
										{id && (
											<span
												className="size-2 rounded-full"
												style={{ backgroundColor: colorOf(id) }}
											/>
										)}
										{id ? (nameOf.get(id) ?? 'Party') : 'Everyone'}
									</button>
								);
							})}
						</div>
					</div>
				)}
				<div className="ml-auto flex items-center gap-1.5">
					<span className="text-2xs font-medium text-muted-foreground">Deadline</span>
					{(Object.keys(KIND_STYLE) as DeadlineKind[]).map((kind) => (
						<span
							key={kind}
							title={KIND_STYLE[kind].title}
							className={cn(
								'rounded-full px-2 py-0.5 text-2xs font-semibold',
								KIND_STYLE[kind].chip
							)}
						>
							{KIND_STYLE[kind].key}
						</span>
					))}
					<span className="ml-2 text-2xs font-medium text-muted-foreground">Frequency</span>
					<span
						title={FREQUENCY_STYLE.title}
						className={cn('rounded-full px-2 py-0.5 text-2xs font-semibold', FREQUENCY_STYLE.chip)}
					>
						{FREQUENCY_STYLE.key}
					</span>
				</div>
			</div>

			<div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-6 py-4">
				{visible.length === 0 && (
					<p className="py-6 text-center text-sm text-muted-foreground">
						{groups.length === 0
							? 'The graph of this contract has no deadlines.'
							: 'Nothing with a deadline for this party.'}
					</p>
				)}
				{visible.map((group) => (
					<Group
						key={group.id}
						group={group}
						folded={Boolean(folded[group.id])}
						onToggle={() => setFolded((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
						picked={picked}
						onOpen={open}
						renderActor={(duty) => <Actor duty={duty} nameOf={nameOf} colorOf={colorOf} />}
					/>
				))}
			</div>
		</div>
	);
}

function Group({
	group,
	folded,
	onToggle,
	picked,
	onOpen,
	renderActor,
}: {
	group: DeadlineGroup;
	folded: boolean;
	onToggle: () => void;
	picked: string | null;
	onOpen: (duty: TimedDuty) => void;
	renderActor: (duty: TimedDuty) => React.ReactNode;
}) {
	return (
		<section className="rounded-lg bg-muted/60 p-2.5">
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={!folded}
				className="flex w-full items-center gap-2 px-1.5 py-1 text-left"
			>
				{group.section && (
					<span className="rounded bg-card px-1.5 py-px text-2xs font-medium text-foreground/70">
						{group.section}
					</span>
				)}
				<span className="text-sm font-semibold text-foreground">{group.title}</span>
				<span className="text-xs text-muted-foreground tabular-nums">{group.duties.length}</span>
				{folded && (
					<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
						{group.duties.map((d) => d.action).join(', ')}
					</span>
				)}
				<ChevronDown
					className={cn(
						'ml-auto size-4 shrink-0 text-muted-foreground transition-transform',
						!folded && 'rotate-180'
					)}
				/>
			</button>
			{!folded && (
				<ul className="mt-1.5 space-y-1">
					{group.duties.map((duty) => {
						const active = picked !== null && duty.ids.includes(picked);
						return (
							<li key={duty.ids.join(',')}>
								<button
									type="button"
									onClick={() => onOpen(duty)}
									title="Show this sentence in the document"
									className={cn(
										'flex w-full items-center gap-3 rounded-md bg-card px-3 py-2 text-left transition hover:bg-card/70',
										active && 'ring-1 ring-primary/40 ring-inset'
									)}
								>
									<span className="flex w-32 shrink-0 items-center gap-1.5">
										{renderActor(duty)}
									</span>
									<span className="min-w-0 flex-1 text-sm font-medium text-foreground">
										<span
											className="mr-1.5 text-xs font-semibold"
											style={{ color: KIND_COLORS[duty.kind] }}
										>
											{TYPE_NAME[duty.kind]}
										</span>
										{duty.action}
									</span>
									{duty.frequency && (
										<span
											title={FREQUENCY_STYLE.title}
											className={cn(
												'max-w-[30%] shrink-0 rounded-full px-2 py-0.5 text-right text-2xs leading-snug font-semibold',
												FREQUENCY_STYLE.chip
											)}
										>
											{duty.frequency}
										</span>
									)}
									{duty.deadline && duty.deadlineKind && (
										<span
											title={KIND_STYLE[duty.deadlineKind].title}
											className={cn(
												'max-w-[40%] shrink-0 rounded-full px-2 py-0.5 text-right text-2xs leading-snug font-semibold',
												KIND_STYLE[duty.deadlineKind].chip
											)}
										>
											{duty.deadline}
										</span>
									)}
									{duty.section && (
										<span className="shrink-0 rounded bg-muted px-1.5 py-px text-2xs font-medium text-foreground/70">
											{duty.section}
										</span>
									)}
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}

/** Who has to act: one party, both, or nobody the graph names. */
function Actor({
	duty,
	nameOf,
	colorOf,
}: {
	duty: TimedDuty;
	nameOf: Map<string, string>;
	colorOf: (partyId: string) => string;
}) {
	if (duty.actors.length === 0)
		return <span className="text-xs font-medium text-muted-foreground">No party named</span>;
	if (duty.actors.length > 1)
		return (
			<>
				{duty.actors.slice(0, 2).map((id) => (
					<span
						key={id}
						className="size-2 shrink-0 rounded-full"
						style={{ backgroundColor: colorOf(id) }}
					/>
				))}
				<span className="text-xs font-semibold text-foreground/80">
					{duty.kind === 'right' ? 'Either party' : 'Both parties'}
				</span>
			</>
		);
	const id = duty.actors[0];
	return (
		<>
			<span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(id) }} />
			<span className="truncate text-xs font-semibold" style={{ color: colorOf(id) }}>
				{nameOf.get(id) ?? 'Party'}
			</span>
		</>
	);
}
