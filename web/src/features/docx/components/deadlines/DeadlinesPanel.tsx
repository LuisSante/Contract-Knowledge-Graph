'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
	KIND_TEXT_COLORS,
	NEUTRAL_COLOR,
	PAIR_SECOND_COLOR,
	PARTY_COLOR,
	textColorOf,
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
		chip: 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-indigo-300',
		key: 'a number of days',
		title: 'A count of hours, days or months',
	},
	vague: {
		chip: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
		key: 'vague',
		title: 'A word that fixes no day, such as «promptly» or «in advance»',
	},
	event: {
		chip: 'bg-muted text-foreground/80',
		key: 'a date or an event',
		title: 'A date, or something that has to happen first, such as «upon termination»',
	},
};

/** The `frequency` field, drawn apart from any deadline: it says how often or for how long. */
const FREQUENCY_STYLE = {
	chip: 'border border-dashed border-foreground/30 bg-card text-foreground/70 dark:border-foreground/40',
	key: 'how often or how long',
	title: 'How often or for how long («per month», «during the term»): not a deadline',
};

type Who = 'all' | 'a' | 'b';
const WHO_OPTIONS: Who[] = ['all', 'a', 'b'];
const ARROW_STEP: Record<string, number> = {
	ArrowRight: 1,
	ArrowDown: 1,
	ArrowLeft: -1,
	ArrowUp: -1,
};

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

	const { viewKg, status, retry } = useKnowledgeGraphData(docId);
	const { aId, bId } = useComparedPair(viewKg, true);
	const groups = useMemo(() => (viewKg ? deadlineGroups(viewKg) : []), [viewKg]);
	const nameOf = useMemo(
		() => new Map((viewKg?.parties ?? []).map((p) => [p.id, short(p.name)] as const)),
		[viewKg]
	);

	// Until the reader picks here, start from the party they said they are in the Clause Analyzer.
	const me = useClauseAnalyzerStore((s) => (s.me?.docId === docId ? s.me.partyId : null));
	const [picks, setWho] = useState<Who | null>(null);
	const who: Who = picks ?? (me && me === aId ? 'a' : me && me === bId ? 'b' : 'all');
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

	// A radio group: one stop on Tab, and the arrows move the choice, as native radios do.
	const onWhoKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
		const step = ARROW_STEP[event.key];
		const last = WHO_OPTIONS.length - 1;
		const at = WHO_OPTIONS.indexOf(who);
		const next =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? last
					: step !== undefined
						? (at + step + WHO_OPTIONS.length) % WHO_OPTIONS.length
						: null;
		if (next === null) return;
		event.preventDefault();
		setWho(WHO_OPTIONS[next]);
		event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
	};

	const open = (duty: TimedDuty) => {
		setPicked(duty.ids[0]);
		if (viewKg) setDocumentTarget(buildDocumentTarget(viewKg, duty.ids[0], nodesById));
	};

	if (status === 'loading')
		return (
			<p
				role="status"
				className="flex h-full items-center justify-center text-sm text-muted-foreground"
			>
				Loading knowledge graph…
			</p>
		);
	if (status === 'error')
		return (
			<div
				role="alert"
				className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground"
			>
				<p>The knowledge graph of this contract could not be loaded: the server did not answer.</p>
				<Button variant="outline" size="sm" onClick={retry}>
					Try again
				</Button>
			</div>
		);
	if (status !== 'ready' || !viewKg)
		return (
			<p className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
				No knowledge graph generated for this document yet.
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
							onKeyDown={onWhoKey}
							className="inline-flex rounded-md border border-border bg-secondary p-0.5"
						>
							{WHO_OPTIONS.map((option) => {
								const id = option === 'a' ? aId : option === 'b' ? bId : null;
								return (
									<button
										key={option}
										type="button"
										role="radio"
										aria-checked={who === option}
										tabIndex={who === option ? 0 : -1}
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
											style={{ color: KIND_TEXT_COLORS[duty.kind] }}
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
			<span className="truncate text-xs font-semibold" style={{ color: textColorOf(colorOf(id)) }}>
				{nameOf.get(id) ?? 'Party'}
			</span>
		</>
	);
}
