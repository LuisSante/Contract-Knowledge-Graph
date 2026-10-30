'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import {
	ArrowUpRightIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	EqualIcon,
	InfoIcon,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { KgCondition } from '@/types/knowledge';
import { cn } from '@/lib/utils';
import { useClauseAnalyzerStore } from '@/stores/clause-analyzer';
import {
	KIND_COLORS,
	MUTED_LANE_OPACITY,
	textColorOf,
} from '@/features/docx/components/clause-analyzer/constants';
import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/parts/bits';
import {
	DEONTIC_KINDS,
	type Favour,
	type Served,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind } from '@/types/knowledge';

/**
 * The types by their plain names, as the table shows them. Each sits with the party it
 * belongs to: a right with its holder, an obligation or prohibition with the party it binds.
 */
export const KIND_LABEL: Record<DeonticKind, string> = {
	obligation: 'Obligations',
	right: 'Rights',
	prohibition: 'Prohibitions',
};

/** A colour washed out to a background, for hex and CSS variables alike. */
export const tint = (color: string, percent: number) =>
	`color-mix(in oklab, ${color} ${percent}%, transparent)`;

/**
 * Arrow keys, Home and End over a row of options where only the picked one is a tab stop
 * (tabs, radios): picks the next one and moves focus to it.
 */
function roveOptions<T extends string>(
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

/** One deontic type on screen at a time, as tabs: obligations, rights and prohibitions are
 *  never shown or counted together. Each tab carries its two counts, the first party's then
 *  the second's, with the larger in bold, so who leads a type shows before opening it. */
export function KindTabs({
	id,
	kind,
	onPick,
	counts,
	names,
	labels = KIND_LABEL,
	aside,
}: {
	/** Names the tabs and their panel: `${id}-tab-<type>` controls `${id}-panel`. */
	id: string;
	kind: DeonticKind;
	onPick: (kind: DeonticKind) => void;
	counts: Record<DeonticKind, Record<Side, number>> | null;
	names: Record<Side, string>;
	labels?: Record<DeonticKind, string>;
	/** A small key at the right end of the tabs' row. */
	aside?: ReactNode;
}) {
	return (
		// The tabs sit on the bottom rule even when the key beside them wraps to two lines; a
		// narrow panel wraps the key, then the tabs, instead of cutting them off.
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
					const said = count ? `${count.a} for ${names.a} and ${count.b} for ${names.b}` : '';
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
								'-mb-px inline-flex items-center gap-2 border-b-2 pt-3 pb-2.5 text-sm',
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
								<span className="inline-flex gap-1.5 text-xs tabular-nums">
									{(['a', 'b'] as const).map((side) => (
										<span
											key={side}
											className={
												count[side] > count[side === 'a' ? 'b' : 'a'] ? 'font-bold' : 'font-normal'
											}
											style={{ color: textColorOf(SIDE_COLOR[side]) }}
										>
											{count[side]}
										</span>
									))}
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

/** What firm and conditional mean, said wherever the words appear. */
const FIRM_NOTE = 'Firm: applies always. Conditional: only if something happens.';

/** The key for the table's squares when conditional ones are marked: filled when the
 *  statement is firm, only an outline when a condition gates it. */
export function FirmKey({ color }: { color: string }) {
	return (
		<span
			className="flex items-center gap-3 text-2xs whitespace-nowrap text-muted-foreground"
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

/** The mark on the rule between the two columns: an arrow, in that party's colour,
 *  towards the column with more squares, or «=» when both have as many. */
export function AxisMark({
	favour,
	title,
	muted,
	className,
}: {
	favour: Favour;
	/** Said on hover and to screen readers; absent, the mark is only decoration (a key). */
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

/** How the table treats statements a condition gates. */
export type ConditionMode = 'all' | 'mark' | 'firm';

const CONDITION_MODES: Array<{ mode: ConditionMode; label: string; hint: string }> = [
	{ mode: 'all', label: 'All', hint: 'Every statement, firm or conditional, drawn the same' },
	{ mode: 'mark', label: 'Mark conditional', hint: 'Conditional statements drawn as outlines' },
	{ mode: 'firm', label: 'Only firm', hint: 'Only the statements that apply always' },
];

const MODE_ORDER = CONDITION_MODES.map((option) => option.mode);

/** One of three views, like the type tabs: nothing is weighted, the reader picks. */
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

/** «You are»: the reader says which party they are, so the table can say what
 *  goes against them. Picking the chosen party again leaves nobody picked, the default. */
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
						{short(names[side])}
					</button>
				))}
			</div>
		</div>
	);
}

/** Leaves only the rows that go against the reader, in the type shown; it needs «You are». */
export function AgainstFilter({
	on,
	onChange,
	count,
	total,
	disabled,
}: {
	on: boolean;
	onChange: (on: boolean) => void;
	count: number;
	total: number;
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
			{/* Said, not only on hover: why it is off and how to turn it on. */}
			{disabled ? (
				<span className="text-muted-foreground">Pick which party you are first</span>
			) : (
				<span className="whitespace-nowrap text-muted-foreground tabular-nums">
					{count} of {total}
				</span>
			)}
		</label>
	);
}

export function RankBadge({ rank, className }: { rank: number | undefined; className?: string }) {
	return (
		<span
			className={cn(
				'flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-card text-2xs font-semibold tabular-nums',
				className
			)}
		>
			{rank}
		</span>
	);
}

export function SectionTag({ section }: { section: string }) {
	return (
		<span className="mr-1.5 inline-block rounded-[5px] border border-border bg-card px-1.5 align-[1px] text-2xs leading-4 font-medium text-muted-foreground tabular-nums">
			{section}
		</span>
	);
}

/** What a `modifies` link means, for the ⓘ beside it. */
const MODIFIES_NOTE =
	'One clause changes what another says: it can limit it, add an exception or cancel it. Read them together.';

/** What a `depends_on` link means, for the ⓘ beside it. */
const DEPENDS_ON_NOTE =
	'Whether this clause applies is subject to another one: what that one says decides it. Read them together.';

/** What a `references` link means, for the ⓘ beside it. */
const REFERS_TO_NOTE =
	'This clause points to another one, without making anything depend on it: what that one says helps to read this one.';

/** What a `uses` link means, for the ⓘ beside it. */
const USES_NOTE =
	'This clause uses a word whose meaning is written in another clause, in the linked paragraph.';

/** What a `defines` link means, for the ⓘ beside it. */
const DEFINES_NOTE =
	'This clause defines a word that the linked clause uses: its meaning is written here.';

/** What a condition written apart from its statement means, for the ⓘ beside it. */
const CONDITION_NOTE =
	'The condition is written in this paragraph, apart from the statement it gates: that statement only applies under it.';

/** The ⓘ that explains a `modifies` link; `about` names the two clauses when known. */
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

/** The ⓘ that explains a `depends_on` link; `about` names the two clauses when known. */
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

/** The ⓘ that explains a `references` link; `about` names the two clauses when known. */
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

/** The ⓘ that explains a `uses` link; `about` names the words and where they are defined. */
export function UsesInfo({ about, inverse }: { about?: string; inverse?: boolean }) {
	return <RelationInfo about={about} note={USES_NOTE} label="What uses means" inverse={inverse} />;
}

/** The ⓘ that explains a `defines` link; `about` names the words and where they are used. */
export function DefinesInfo({ about, inverse }: { about?: string; inverse?: boolean }) {
	return (
		<RelationInfo about={about} note={DEFINES_NOTE} label="What defines means" inverse={inverse} />
	);
}

/** An ⓘ with a short explanation, and what it is about in bold above it. */
function RelationInfo({
	about,
	note,
	label,
	inverse = false,
}: {
	about?: string;
	note: string;
	label: string;
	/** On a filled tag: light, so it reads on the colour. */
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

/** The trigger after its lead, without the word the lead already says: «Only upon» + «upon
 *  the expiration date» reads «Only upon the expiration date». */
export function afterLead(lead: string, trigger: string): string {
	const word = lead.trim().split(/\s+/).pop()?.toLowerCase() ?? '';
	return word && trigger.toLowerCase().startsWith(`${word} `)
		? trigger.slice(word.length + 1)
		: trigger;
}

/** On the contract's margin line, by a paragraph that holds the condition of a statement
 *  written apart from it: «only if ⓘ», «unless ⓘ». */
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

/** On the contract's margin line, where it leaves the picked clause: its number, filled, so the
 *  start of every link stands apart from the white labels along them. */
export function ClauseAnchorTag({ label }: { label: string }) {
	return (
		<span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-2xs font-semibold whitespace-nowrap text-primary-foreground shadow-sm">
			{label}
		</span>
	);
}

/** Each kind of link between clauses has its own fill, so the three tell apart on the margin
 *  line without a legend. None is a statement type's colour, nor the picked clause's blue. */
const LINK_COLOR = {
	modifies: '#6d28d9',
	dependsOn: '#0e7490',
	refersTo: '#475569',
	uses: '#a65628',
	defines: '#facc15',
} as const;

/** A filled tag on the contract's margin line, halfway along its link. It never grows past
 *  the room its holder gives it: a long label is cut with «…» and said whole on hover. */
function LinkTag({
	color,
	label,
	dark = false,
	children,
}: {
	color: string;
	label: string;
	/** Dark text, for a light fill. */
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

/** On the contract's margin line, by the picked clause: the linked sentences modify it. */
export function ModifiedByTag({ clause, by }: { clause: string; by: string[] }) {
	return (
		<LinkTag color={LINK_COLOR.modifies} label={`modified by ${by.join(', ')}`}>
			<ModifiesInfo about={`${clause} is modified by ${by.join(', ')}`} inverse />
		</LinkTag>
	);
}

/** On the contract's margin line, by the picked clause: it depends on the linked clauses. */
export function DependsOnTag({ clause, on }: { clause: string; on: string[] }) {
	return (
		<LinkTag color={LINK_COLOR.dependsOn} label={`depends on ${on.join(', ')}`}>
			<DependsOnInfo about={`${clause} depends on ${on.join(', ')}`} inverse />
		</LinkTag>
	);
}

/** On the contract's margin line, by the picked clause: it refers to the linked clauses. */
export function RefersToTag({ clause, to }: { clause: string; to: string[] }) {
	return (
		<LinkTag color={LINK_COLOR.refersTo} label={`refers to ${to.join(', ')}`}>
			<RefersToInfo about={`${clause} refers to ${to.join(', ')}`} inverse />
		</LinkTag>
	);
}

/** On the contract's margin line, halfway to a paragraph that defines words the picked clause
 *  uses: «uses "Licensee"»; the last such tag also says how many more have no line. */
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

/** On the contract's margin line, halfway to a clause that uses words the picked clause
 *  defines: «defines "IOF" → §11.1», since one word may reach several clauses; the last such
 *  tag also says how many more have no line. */
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

/** Jumps to the clause in the knowledge graph tab: an arrow right after the clause's name,
 *  inline, so it follows the name's last word when the name wraps. */
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

/** «upon the expiration date»: the operator once, in lower case, and not at all when the
 *  trigger already opens with it. */
function conditionText(condition: KgCondition): string {
	const operator = (condition.operator || 'IF').toLowerCase();
	const trigger = condition.trigger;
	return trigger.toLowerCase().startsWith(`${operator} `) ? trigger : `${operator} ${trigger}`;
}

/** One statement in the contract's own words; a click underlines it in the contract, and
 *  the one underlined there stays marked here. */
/** Another party's statement shown beside one: its tag («Anhui's right»), colour and words. */
export interface StatementAside {
	id: string;
	tag: string;
	color: string;
	label: string;
}

export function Fragment({
	served,
	section,
	tag,
	tagColor,
	conditions = [],
	reciprocal = false,
	counterparts = [],
	conditionParty,
	onOpen,
}: {
	served: Served;
	section: string | null;
	/** Said before the title, so the reader knows whose statement it is. */
	tag?: string;
	/** The colour of the party the tag names. */
	tagColor?: string;
	conditions?: KgCondition[];
	/** The other party has the same statement, word for word. */
	reciprocal?: boolean;
	/** The other party's statements of the other type written in the same paragraph. */
	counterparts?: StatementAside[];
	/** The party a condition's trigger names, when it names just one. */
	conditionParty?: (condition: KgCondition) => { name: string; color: string } | null;
	onOpen: (nodeId: string) => void;
}) {
	const shown = useClauseAnalyzerStore(
		(s) => s.focusNodeIds.length === 1 && s.focusNodeIds[0] === served.mark.id
	);
	// "§1 ¶2": the clause's number and, when it runs over several paragraphs, which one.
	const place =
		[section, served.paragraph ? `¶${served.paragraph}` : null].filter(Boolean).join(' ') || 'View';
	return (
		<article
			className={cn('space-y-2 px-3 py-3 text-left', shown && 'bg-accent')}
			style={shown ? { boxShadow: `inset 3px 0 0 ${tagColor ?? 'var(--primary)'}` } : undefined}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 space-y-1">
					{tag && (
						<p
							className={cn('text-xs font-medium', !tagColor && 'text-foreground/80')}
							style={tagColor ? { color: textColorOf(tagColor) } : undefined}
						>
							{tag}
							{reciprocal && (
								<span
									className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-2xs font-medium text-foreground/70"
									title={`The other party has the same ${served.kind}, word for word: it binds or entitles both alike.`}
								>
									reciprocal
								</span>
							)}
						</p>
					)}
					<p className="text-sm font-medium text-foreground">{served.mark.label}</p>
				</div>
				<button
					type="button"
					onClick={() => onOpen(served.mark.id)}
					aria-current={shown || undefined}
					aria-label={`Show ${served.mark.label} in the document`}
					className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
				>
					{place === 'View' ? 'Document' : place}
					<ArrowUpRightIcon className="size-3" />
				</button>
			</div>
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
								<span className="size-1.5 rounded-full" style={{ backgroundColor: party.color }} />
								{party.name}
							</span>
						)}
					</p>
				);
			})}
			{counterparts.map((other) => (
				<p key={other.id} className="text-xs text-muted-foreground">
					<span className="font-medium">Same paragraph: </span>
					<button
						type="button"
						onClick={() => onOpen(other.id)}
						className="text-left hover:underline"
						title="Written in the same paragraph. The graph does not say one is the price of the other."
					>
						<span className="font-medium" style={{ color: textColorOf(other.color) }}>
							{other.tag}
						</span>{' '}
						· {other.label}
					</button>
				</p>
			))}
			<details className="text-xs">
				<summary className="cursor-pointer font-medium text-primary">View evidence</summary>
				<blockquote className="mt-2 border-l-2 border-border pl-3 leading-relaxed text-foreground/90">
					{served.text}
				</blockquote>
			</details>
		</article>
	);
}
