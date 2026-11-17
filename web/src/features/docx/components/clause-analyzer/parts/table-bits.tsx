'use client';

import {
	Fragment as ReactFragment,
	useId,
	useState,
	type KeyboardEvent,
	type ReactElement,
	type ReactNode,
} from 'react';
import {
	ArrowUpRightIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	ClockIcon,
	CoinsIcon,
	EqualIcon,
	InfoIcon,
	RepeatIcon,
	TriangleAlertIcon,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { KgCondition } from '@/types/knowledge';
import { cn } from '@/lib/utils';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import {
	KIND_COLORS,
	KIND_TEXT_COLORS,
	MUTED_LANE_OPACITY,
	textColorOf,
} from '@/features/docx/components/clause-analyzer/constants';
import { pairShort, SIDE_COLOR } from '@/features/docx/components/clause-analyzer/parts/bits';
import {
	DEONTIC_KINDS,
	type Favour,
	type Served,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { StatementTiming } from '@/features/docx/utils/knowledge/statement-timing';
import type { DeonticKind } from '@/types/knowledge';
import { flagTypeLabel } from '@/features/docx/utils/knowledge/red-flags';
import type { ContractRisk } from '@/types/risks';

export const KIND_LABEL: Record<DeonticKind, string> = {
	obligation: 'Obligations',
	right: 'Rights',
	prohibition: 'Prohibitions',
};

export const tint = (color: string, percent: number) =>
	`color-mix(in oklab, ${color} ${percent}%, transparent)`;

function roveOptions<T extends string | number>(
	event: KeyboardEvent<HTMLElement>,
	options: readonly T[],
	current: T,
	onPick: (option: T) => void
) {
	const at = options.indexOf(current);
	const next =
		event.key === 'ArrowRight' || event.key === 'ArrowDown'
			? options[(at + 1) % options.length]
			: event.key === 'ArrowLeft' || event.key === 'ArrowUp'
				? options[(at - 1 + options.length) % options.length]
				: event.key === 'Home'
					? options[0]
					: event.key === 'End'
						? options[options.length - 1]
						: null;
	if (next === null) return;
	event.preventDefault();
	onPick(next);
	event.currentTarget.querySelector<HTMLElement>(`[data-option="${next}"]`)?.focus();
}

export function KindTabs({
	id,
	kind,
	onPick,
	counts,
	names,
	labels = KIND_LABEL,
	aside,
	shared = null,
}: {
	id: string;
	kind: DeonticKind;
	onPick: (kind: DeonticKind) => void;
	counts: Record<DeonticKind, Record<Side, number>> | null;
	names: Record<Side, string>;
	labels?: Record<DeonticKind, string>;
	aside?: ReactNode;
	shared?: Record<DeonticKind, number> | null;
}) {
	return (
		<div className="flex flex-wrap items-end gap-x-8 border-b border-border/60 px-6">
			<div
				role="tablist"
				aria-label="Type shown"
				className="flex flex-wrap gap-x-8"
				onKeyDown={(event) => roveOptions(event, DEONTIC_KINDS, kind, onPick)}
			>
				{DEONTIC_KINDS.map((k) => {
					const active = kind === k;
					const count = counts?.[k];
					const said = count
						? shared
							? `${count.a} for ${names.a}, ${shared[k]} shared by both and ${count.b} for ${names.b}`
							: `${count.a} for ${names.a} and ${count.b} for ${names.b}`
						: '';
					return (
						<button
							key={k}
							id={`${id}-tab-${k}`}
							type="button"
							role="tab"
							data-option={k}
							aria-selected={active}
							aria-controls={`${id}-panel`}
							aria-label={count ? `${labels[k]}, ${said}` : undefined}
							tabIndex={active ? 0 : -1}
							onClick={() => onPick(k)}
							title={said || undefined}
							className={cn(
								'-mb-px inline-flex items-center gap-0.5 border-b-2 pt-3 pb-2.5 text-sm',
								active
									? 'font-semibold text-foreground'
									: 'border-transparent font-medium text-muted-foreground hover:text-foreground'
							)}
							style={active ? { borderBottomColor: KIND_COLORS[k] } : undefined}
						>
							<span
								className="size-2.5 rounded-[2px]"
								style={{ backgroundColor: KIND_COLORS[k] }}
							/>
							{labels[k]}
							{count && (
								<span className="inline-flex gap-1.5 text-xs font-bold tabular-nums">
									<span style={{ color: textColorOf(SIDE_COLOR.a) }}>{count.a}</span>
									{shared && (
										<span
											className="text-slate-500 dark:text-slate-400"
											title={`${shared[k]} shared by both parties, word for word: they count for neither`}
										>
											{shared[k]}
										</span>
									)}
									<span style={{ color: textColorOf(SIDE_COLOR.b) }}>{count.b}</span>
								</span>
							)}
						</button>
					);
				})}
			</div>
			{aside && <div className="ml-auto self-center py-1.5">{aside}</div>}
		</div>
	);
}

const FIRM_NOTE = 'Firm: applies always. Conditional: only if something happens.';

export function FirmKey({ color, className }: { color: string; className?: string }) {
	return (
		<span
			className={cn(
				'flex items-center gap-3 text-2xs whitespace-nowrap text-muted-foreground',
				className
			)}
			title={FIRM_NOTE}
		>
			<span className="flex items-center gap-1.5">
				<span className="size-2.5 rounded-[2px]" style={{ backgroundColor: color }} />
				firm
			</span>
			<span className="flex items-center gap-1.5">
				<span
					className="size-2.5 rounded-[2px]"
					style={{ boxShadow: `inset 0 0 0 1.5px ${color}` }}
				/>
				conditional
			</span>
		</span>
	);
}

export function AxisMark({
	favour,
	title,
	muted,
	className,
}: {
	favour: Favour;
	title?: string;
	muted?: boolean;
	className?: string;
}) {
	const Icon = favour === 'a' ? ChevronLeftIcon : favour === 'b' ? ChevronRightIcon : EqualIcon;
	return (
		<span
			role={title ? 'img' : undefined}
			aria-label={title}
			aria-hidden={title ? undefined : true}
			title={title}
			className={cn(
				'flex size-4 shrink-0 items-center justify-center rounded-full transition-opacity',
				favour === 'tie' && 'bg-muted ring-1 ring-border ring-inset',
				className
			)}
			style={{
				backgroundColor: favour === 'tie' ? undefined : SIDE_COLOR[favour],
				opacity: muted ? MUTED_LANE_OPACITY : 1,
			}}
		>
			<Icon
				className={cn('size-3', favour === 'tie' ? 'text-muted-foreground' : 'text-white')}
				strokeWidth={3}
				aria-hidden="true"
			/>
		</span>
	);
}

export type ConditionMode = 'all' | 'mark' | 'firm';

const CONDITION_MODES: Array<{ mode: ConditionMode; label: string; hint: string }> = [
	{ mode: 'all', label: 'All', hint: 'Every statement, firm or conditional, drawn the same' },
	{ mode: 'mark', label: 'Mark conditional', hint: 'Conditional statements drawn as outlines' },
	{ mode: 'firm', label: 'Only firm', hint: 'Only the statements that apply always' },
];

const MODE_ORDER = CONDITION_MODES.map((option) => option.mode);

export function ConditionModePicker({
	mode,
	onPick,
}: {
	mode: ConditionMode;
	onPick: (mode: ConditionMode) => void;
}) {
	return (
		<div
			role="radiogroup"
			aria-label="Conditional statements"
			title={FIRM_NOTE}
			className="inline-flex rounded-md border border-border bg-secondary p-0.5"
			onKeyDown={(event) => roveOptions(event, MODE_ORDER, mode, onPick)}
		>
			{CONDITION_MODES.map((option) => (
				<button
					key={option.mode}
					type="button"
					role="radio"
					data-option={option.mode}
					aria-checked={mode === option.mode}
					tabIndex={mode === option.mode ? 0 : -1}
					onClick={() => onPick(option.mode)}
					title={option.hint}
					className={cn(
						'rounded px-2 py-0.5 text-2xs font-medium whitespace-nowrap',
						mode === option.mode
							? 'bg-card text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground'
					)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

export function YouArePicker({
	names,
	me,
	onPick,
}: {
	names: Record<Side, string>;
	me: Side | null;
	onPick: (side: Side | null) => void;
}) {
	return (
		<div className="flex items-center gap-2" role="group" aria-label="You are">
			<span className="text-xs font-medium text-muted-foreground">You are</span>
			<div className="inline-flex rounded-md border border-border bg-secondary p-0.5">
				{(['a', 'b'] as const).map((side) => (
					<button
						key={side}
						type="button"
						aria-pressed={me === side}
						onClick={() => onPick(me === side ? null : side)}
						title={
							me === side ? 'Pick again to leave it unset' : `Read the table as ${names[side]}`
						}
						className={cn(
							'inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs whitespace-nowrap',
							me === side
								? 'bg-card font-semibold text-foreground shadow-sm'
								: 'font-medium text-muted-foreground hover:text-foreground'
						)}
					>
						<span className="size-2 rounded-full" style={{ backgroundColor: SIDE_COLOR[side] }} />
						{pairShort(names)[side]}
					</button>
				))}
			</div>
		</div>
	);
}

export function AgainstFilter({
	on,
	onChange,
	disabled,
}: {
	on: boolean;
	onChange: (on: boolean) => void;
	disabled: boolean;
}) {
	return (
		<label
			className={cn(
				'flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs',
				disabled ? 'cursor-default' : 'cursor-pointer text-foreground'
			)}
			title={
				disabled
					? 'Pick which party you are first'
					: 'Only the clauses that go against you in this type: you carry more obligations or prohibitions, or the other party holds more rights'
			}
		>
			<Checkbox
				checked={on && !disabled}
				disabled={disabled}
				onCheckedChange={(value) => onChange(value === true)}
				className="size-3.5"
			/>
			<span className={cn('font-medium whitespace-nowrap', disabled && 'text-muted-foreground/60')}>
				Only against you
			</span>
		</label>
	);
}

export function WithHint({ hint, children }: { hint: string; children: ReactElement }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent
				side="top"
				sideOffset={6}
				className="max-w-72 border border-border bg-card text-card-foreground shadow-sm [&_svg]:bg-card [&_svg]:fill-card"
			>
				{hint}
			</TooltipContent>
		</Tooltip>
	);
}

/** A row's place in a circle; `hint` says what the place stands on. */
export function RankBadge({
	rank,
	hint,
	className,
}: {
	rank: number | string | undefined;
	hint?: string;
	className?: string;
}) {
	const badge = (
		<span
			className={cn(
				'flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-2xs font-medium text-muted-foreground tabular-nums',
				hint && 'cursor-help',
				className
			)}
		>
			{rank}
		</span>
	);
	return hint ? <WithHint hint={hint}>{badge}</WithHint> : badge;
}

export function SectionTag({ section }: { section: string }) {
	return (
		// A section mark beside the name, no box around it.
		<span className="mr-1.5 font-normal text-muted-foreground tabular-nums">{section}</span>
	);
}

const MODIFIES_NOTE =
	'One clause changes what another says: it can limit it, add an exception or cancel it. Read them together.';

const DEPENDS_ON_NOTE =
	'Whether this clause applies is subject to another one: what that one says decides it. Read them together.';

const REFERS_TO_NOTE =
	'This clause points to another one, without making anything depend on it: what that one says helps to read this one.';

const USES_NOTE =
	'This clause uses a word whose meaning is written in another clause, in the linked paragraph.';

const DEFINES_NOTE =
	'This clause defines a word that the linked clause uses: its meaning is written here.';

const CONDITION_NOTE =
	'The condition is written in this paragraph, apart from the statement it gates: that statement only applies under it.';

export function ModifiesInfo({ about, inverse }: { about?: string; inverse?: boolean }) {
	return (
		<RelationInfo
			about={about}
			note={MODIFIES_NOTE}
			label="What modifies means"
			inverse={inverse}
		/>
	);
}

export function DependsOnInfo({ about, inverse }: { about?: string; inverse?: boolean }) {
	return (
		<RelationInfo
			about={about}
			note={DEPENDS_ON_NOTE}
			label="What depends on means"
			inverse={inverse}
		/>
	);
}

export function RefersToInfo({ about, inverse }: { about?: string; inverse?: boolean }) {
	return (
		<RelationInfo
			about={about}
			note={REFERS_TO_NOTE}
			label="What refers to means"
			inverse={inverse}
		/>
	);
}

export function UsesInfo({ about, inverse }: { about?: string; inverse?: boolean }) {
	return <RelationInfo about={about} note={USES_NOTE} label="What uses means" inverse={inverse} />;
}

export function DefinesInfo({ about, inverse }: { about?: string; inverse?: boolean }) {
	return (
		<RelationInfo about={about} note={DEFINES_NOTE} label="What defines means" inverse={inverse} />
	);
}

function RelationInfo({
	about,
	note,
	label,
	inverse = false,
}: {
	about?: string;
	note: string;
	label: string;
	inverse?: boolean;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					className={cn(
						'relative z-10 inline-flex shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-ring',
						inverse
							? 'text-white/80 hover:text-white'
							: 'text-muted-foreground hover:text-foreground'
					)}
				>
					<InfoIcon className="size-3.5" aria-hidden="true" />
				</button>
			</TooltipTrigger>
			<TooltipContent
				side="top"
				sideOffset={6}
				className="max-w-64 border border-border bg-card text-card-foreground shadow-sm [&_svg]:bg-card [&_svg]:fill-card"
			>
				{about && <p className="mb-1 font-semibold">{about}</p>}
				{note}
			</TooltipContent>
		</Tooltip>
	);
}

export function afterLead(lead: string, trigger: string): string {
	const word = lead.trim().split(/\s+/).pop()?.toLowerCase() ?? '';
	return word && trigger.toLowerCase().startsWith(`${word} `)
		? trigger.slice(word.length + 1)
		: trigger;
}

export function ConditionTag({ lead, trigger }: { lead: string; trigger: string }) {
	return (
		<span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-1.5 py-0.5 text-2xs font-medium whitespace-nowrap text-foreground shadow-sm">
			<span className="size-2 rounded-[2px]" style={{ backgroundColor: KIND_COLORS.condition }} />
			{lead.toLowerCase()}
			<RelationInfo
				about={`${lead} ${afterLead(lead, trigger)}`}
				note={CONDITION_NOTE}
				label="What this condition means"
			/>
		</span>
	);
}

export function ClauseAnchorTag({ label }: { label: string }) {
	return (
		<span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-2xs font-semibold whitespace-nowrap text-primary-foreground shadow-sm">
			{label}
		</span>
	);
}

export const LINK_COLOR = {
	modifies: '#6d28d9',
	dependsOn: '#0e7490',
	refersTo: '#475569',
	uses: '#a65628',
	defines: '#facc15',
} as const;

function LinkTag({
	color,
	label,
	dark = false,
	children,
}: {
	color: string;
	label: string;
	dark?: boolean;
	children: ReactNode;
}) {
	return (
		<span
			title={label}
			className={cn(
				'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap shadow-sm',
				dark ? 'text-foreground' : 'text-white'
			)}
			style={{ backgroundColor: color }}
		>
			<span className="min-w-0 truncate">{label}</span>
			{children}
		</span>
	);
}

export function ModifiedByTag({ clause, by }: { clause: string; by: string[] }) {
	return (
		<LinkTag color={LINK_COLOR.modifies} label={`modified by ${by.join(', ')}`}>
			<ModifiesInfo about={`${clause} is modified by ${by.join(', ')}`} inverse />
		</LinkTag>
	);
}

export function DependsOnTag({ clause, on }: { clause: string; on: string[] }) {
	return (
		<LinkTag color={LINK_COLOR.dependsOn} label={`depends on ${on.join(', ')}`}>
			<DependsOnInfo about={`${clause} depends on ${on.join(', ')}`} inverse />
		</LinkTag>
	);
}

export function RefersToTag({ clause, to }: { clause: string; to: string[] }) {
	return (
		<LinkTag color={LINK_COLOR.refersTo} label={`refers to ${to.join(', ')}`}>
			<RefersToInfo about={`${clause} refers to ${to.join(', ')}`} inverse />
		</LinkTag>
	);
}

export function UsesTag({
	terms,
	definedIn,
	more,
}: {
	terms: string[];
	definedIn: string;
	more: number;
}) {
	const words = terms.map((t) => `“${t}”`).join(', ');
	return (
		<LinkTag color={LINK_COLOR.uses} label={`uses ${words}${more > 0 ? ` +${more} more` : ''}`}>
			<UsesInfo about={`${words}: defined in ${definedIn}`} inverse />
		</LinkTag>
	);
}

export function DefinesTag({
	terms,
	usedIn,
	more,
}: {
	terms: string[];
	usedIn: string;
	more: number;
}) {
	const words = terms.map((t) => `“${t}”`).join(', ');
	return (
		<LinkTag
			color={LINK_COLOR.defines}
			label={`defines ${words} → ${usedIn}${more > 0 ? ` +${more} more` : ''}`}
			dark
		>
			<DefinesInfo about={`${words}: used in ${usedIn}`} />
		</LinkTag>
	);
}

export function GraphLink({
	onClick,
	heading,
	className,
}: {
	onClick: () => void;
	/** The clause's name, for screen readers. */
	heading: string;
	className?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				'relative z-10 ml-1 inline-flex rounded p-0.5 align-[-3px] text-primary hover:bg-muted',
				className
			)}
			title="See this clause in the knowledge graph"
			aria-label={`See ${heading} in the knowledge graph`}
		>
			<ArrowUpRightIcon className="size-3.5" />
		</button>
	);
}

function conditionText(condition: KgCondition): string {
	const operator = (condition.operator || 'IF').toLowerCase();
	const trigger = condition.trigger;
	return trigger.toLowerCase().startsWith(`${operator} `) ? trigger : `${operator} ${trigger}`;
}

function ConditionChip({ conditions }: { conditions: KgCondition[] }) {
	if (conditions.length === 0) return null;
	return (
		<span
			className="ml-auto shrink-0 rounded-full px-1.5 py-px text-2xs font-medium"
			style={{
				color: KIND_TEXT_COLORS.condition,
				backgroundColor: `color-mix(in srgb, ${KIND_TEXT_COLORS.condition} 12%, transparent)`,
			}}
			title={`Only ${conditions.map(conditionText).join('; ')}`}
		>
			only if
		</span>
	);
}

function TimingFields({ timing }: { timing: StatementTiming }) {
	const fields = [
		{ key: 'when', Icon: ClockIcon, label: 'When', value: timing.deadline, money: false },
		{ key: 'often', Icon: RepeatIcon, label: 'How often', value: timing.frequency, money: false },
		{
			key: 'much',
			Icon: CoinsIcon,
			label: 'How much',
			value: timing.amounts.join(', '),
			money: true,
		},
	].filter((field) => field.value);
	return (
		<div className="pr-3 pb-2 pl-8">
			<dl className="grid grid-cols-[auto_auto_1fr] items-baseline gap-x-2 gap-y-1 rounded-md bg-muted/60 px-2.5 py-1.5">
				{fields.map(({ key, Icon, label, value, money }) => (
					<ReactFragment key={key}>
						<Icon className="size-3 translate-y-0.5 self-start text-muted-foreground" aria-hidden />
						<dt className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
							{label}
						</dt>
						<dd
							className={cn('text-xs', money ? 'font-semibold' : 'text-foreground')}
							style={money ? { color: KIND_TEXT_COLORS.value } : undefined}
						>
							{value}
						</dd>
					</ReactFragment>
				))}
			</dl>
		</div>
	);
}

export function Fragment({
	served,
	section,
	tag,
	tagColor,
	conditions = [],
	reciprocal = false,
	conditionParty,
	timing,
	onOpen,
	risk,
	flagged = false,
}: {
	served: Served;
	section: string | null;
	tag?: string;
	tagColor?: string;
	conditions?: KgCondition[];
	reciprocal?: boolean;
	conditionParty?: (condition: KgCondition) => { name: string; color: string } | null;
	timing?: StatementTiming;
	onOpen: (nodeId: string) => void;
	risk?: ContractRisk;
	flagged?: boolean;
}) {
	const shown = useClauseAnalyzerStore(
		(s) => s.focusNodeIds.length === 1 && s.focusNodeIds[0] === served.mark.id
	);
	const [open, setOpen] = useState(false);
	const [evidenceOpen, setEvidenceOpen] = useState(false);
	const bodyId = useId();
	const evidenceId = useId();
	// "§1 ¶2": the clause's number and, when it runs over several paragraphs, which one.
	const place =
		[section, served.paragraph ? `¶${served.paragraph}` : null].filter(Boolean).join(' ') || 'View';
	return (
		<article
			className={cn('text-left', shown && 'bg-accent')}
			style={shown ? { boxShadow: `inset 3px 0 0 ${tagColor ?? 'var(--primary)'}` } : undefined}
		>
			<button
				type="button"
				onClick={() => setOpen((was) => !was)}
				aria-expanded={open}
				aria-controls={bodyId}
				className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-left hover:bg-muted/40"
			>
				<span className="flex min-w-0 flex-1 items-center gap-1.5">
					<ChevronRightIcon
						className={cn(
							'size-3.5 shrink-0 text-muted-foreground transition-transform',
							open && 'rotate-90'
						)}
						aria-hidden
					/>
					<span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
						<span className="min-w-0 text-sm text-foreground">{served.mark.label}</span>
						{risk && (
							<span
								className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-px text-[10px] font-semibold text-foreground ring-1 ring-black/80 dark:ring-white/80"
								title="The system judged this statement risky"
							>
								<TriangleAlertIcon className="size-3" aria-hidden />
								risk · {flagTypeLabel(risk.type)}
							</span>
						)}
						{flagged && (
							<span
								className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-muted-foreground"
								title="A red flag of the lease dataset: it validates what the system marks"
							>
								<span className="size-[5px] rounded-full bg-black dark:bg-white" aria-hidden />
								red flag
							</span>
						)}
						{reciprocal && (
							<span
								className="shrink-0 rounded-full bg-muted px-1.5 py-px text-2xs font-medium text-foreground/70"
								title={`The other party has the same ${served.kind}, word for word: it binds or entitles both alike.`}
							>
								reciprocal
							</span>
						)}
					</span>
				</span>
				<ConditionChip conditions={conditions} />
			</button>
			{risk?.reason && (
				<p className="pr-3 pb-2 pl-8 text-xs leading-relaxed text-muted-foreground">
					<span className="font-medium text-foreground/80">Why: </span>
					{risk.reason}
				</p>
			)}
			{timing && <TimingFields timing={timing} />}
			{open && (
				<div id={bodyId} className="space-y-2 pr-3 pb-3 pl-8">
					{tag && (
						<p
							className={cn('text-xs font-medium', !tagColor && 'text-foreground/80')}
							style={tagColor ? { color: textColorOf(tagColor) } : undefined}
						>
							{tag}
						</p>
					)}
					{conditions.map((condition) => {
						const party = conditionParty?.(condition) ?? null;
						return (
							<p key={condition.id} className="text-xs text-foreground/90">
								<span className="font-medium">Condition: </span>
								{conditionText(condition)}
								{party && (
									<span
										className="ml-1.5 inline-flex items-center gap-1 align-[1px] font-medium whitespace-nowrap"
										style={{ color: textColorOf(party.color) }}
										title={`The condition names ${party.name}: it turns on what ${party.name} does or what happens to it.`}
									>
										<span
											className="size-1.5 rounded-full"
											style={{ backgroundColor: party.color }}
										/>
										{party.name}
									</span>
								)}
							</p>
						);
					})}
					<div className="flex items-center gap-2 text-xs font-medium">
						<button
							type="button"
							onClick={() => setEvidenceOpen((was) => !was)}
							aria-expanded={evidenceOpen}
							aria-controls={evidenceId}
							className="inline-flex items-center gap-1 text-primary hover:underline"
						>
							<ChevronRightIcon
								className={cn('size-3 transition-transform', evidenceOpen && 'rotate-90')}
								aria-hidden
							/>
							View evidence
						</button>
						<span className="text-muted-foreground" aria-hidden>
							·
						</span>
						<button
							type="button"
							onClick={() => onOpen(served.mark.id)}
							aria-current={shown || undefined}
							aria-label={`Show ${served.mark.label} in the document`}
							className="inline-flex items-center gap-1 text-primary hover:underline"
						>
							{place === 'View' ? 'Document' : place}
							<ArrowUpRightIcon className="size-3" />
						</button>
					</div>
					{evidenceOpen && (
						<blockquote
							id={evidenceId}
							className="border-l-2 border-border pl-3 text-xs leading-relaxed text-foreground/90"
						>
							{served.text}
						</blockquote>
					)}
				</div>
			)}
		</article>
	);
}
