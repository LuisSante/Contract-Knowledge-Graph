'use client';

import type { ReactNode } from 'react';
import {
	KIND_COLORS,
	KIND_LABEL,
	NEUTRAL_COLOR,
	textColorOf,
} from '@/features/docx/components/clause-analyzer/constants';
import { short } from '@/features/docx/components/clause-analyzer/parts/bits';
import { RankBadge, tint } from '@/features/docx/components/clause-analyzer/parts/table-bits';
import type { PlaceOf } from '@/features/docx/components/clause-analyzer/RedFlagsTable';
import { conditionLead } from '@/features/docx/utils/knowledge/clause-favour';
import type { FlagPath, PathStatement } from '@/features/docx/utils/knowledge/red-flag-path';
import type { StatementTiming } from '@/features/docx/utils/knowledge/statement-timing';
import type { KgDeonticNode, KnowledgeGraph } from '@/types/knowledge';

/** A party as the analyzer colours it: by its column when the pair is picked, grey otherwise. */
export type PartyColorOf = (partyId: string) => string;

interface Ctx {
	kg: KnowledgeGraph;
	colorOf: PartyColorOf;
	placeOf?: PlaceOf;
	/** Conditions that are red flags of the dataset themselves. */
	flaggedConditionIds: ReadonlySet<string>;
}

function PartyChip({ id, ctx }: { id: string | null; ctx: Ctx }) {
	if (!id) return <span className="text-muted-foreground italic">no party named</span>;
	const party = ctx.kg.parties.find((p) => p.id === id);
	const color = ctx.colorOf(id) ?? NEUTRAL_COLOR;
	return (
		<span
			className="inline-flex items-center gap-1 font-semibold"
			style={{ color: textColorOf(color) }}
			title={party?.name}
		>
			<span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
			{party ? short(party.name) : id}
		</span>
	);
}

function KindSquare({ statement }: { statement: KgDeonticNode }) {
	return (
		<span
			className="mt-[3px] size-2.5 shrink-0 rounded-[2px]"
			style={{ backgroundColor: KIND_COLORS[statement.kind] }}
			title={KIND_LABEL[statement.kind]}
		/>
	);
}

function ClauseName({
	clauseId,
	kind,
	ctx,
}: {
	clauseId: string | null;
	kind?: KgDeonticNode['kind'];
	ctx: Ctx;
}) {
	if (!clauseId) return <span className="text-muted-foreground italic">no clause</span>;
	const place = ctx.placeOf?.(clauseId, kind);
	const clause = ctx.kg.clauses.find((c) => c.id === clauseId);
	const section = place?.section ?? (clause?.ref ? `§${clause.ref}` : null);
	const heading = place?.heading ?? clause?.heading ?? '';
	return (
		<span className="inline-flex items-center gap-1.5">
			{place?.rank !== undefined && <RankBadge rank={place.rank} className="size-5" />}
			{section && <span className="text-muted-foreground tabular-nums">{section}</span>}
			{heading && <span className="font-medium text-foreground/85">{heading}</span>}
		</span>
	);
}

function Amounts({ timing }: { timing: StatementTiming | undefined }) {
	if (!timing) return null;
	const bits = [
		...timing.amounts,
		...(timing.deadline ? [timing.deadline] : []),
		...(timing.frequency && timing.frequency !== timing.deadline ? [timing.frequency] : []),
	];
	if (bits.length === 0) return null;
	return (
		<span className="inline-flex flex-wrap gap-1">
			{bits.map((bit, i) => (
				<span key={i} className="rounded bg-muted px-1.5 font-medium text-foreground tabular-nums">
					{bit}
				</span>
			))}
		</span>
	);
}

/** One statement: its type, its action, whose it is and who is on the other side, then what
 *  sets it off and how much it is. */
function StatementLine({ path, ctx }: { path: PathStatement; ctx: Ctx }) {
	const { statement, ownerId, otherId } = path;
	return (
		<div className="space-y-1">
			<div className="flex items-start gap-1.5">
				<KindSquare statement={statement} />
				<span className="flex flex-wrap items-center gap-x-1.5">
					<PartyChip id={ownerId} ctx={ctx} />
					<span className="text-muted-foreground">
						{statement.kind === 'right'
							? 'may'
							: statement.kind === 'prohibition'
								? 'must not'
								: 'must'}
					</span>
					<span className="font-medium text-foreground">{statement.action}</span>
					{otherId && (
						<>
							<span className="text-muted-foreground">
								{statement.kind === 'right' ? '— borne by' : '— for'}
							</span>
							<PartyChip id={otherId} ctx={ctx} />
						</>
					)}
					<Amounts timing={path.timing} />
				</span>
			</div>
			{path.conditions.map(({ condition, partyId }) => (
				<div key={condition.id} className="flex items-start gap-1.5 pl-4">
					<span
						className="shrink-0 rounded px-1 text-[10px] font-semibold tracking-wide uppercase"
						style={{ color: '#be185d', backgroundColor: tint('#e7298a', 12) }}
					>
						{conditionLead(condition.operator)}
					</span>
					<span className="text-foreground/80">
						{condition.trigger}
						{partyId && (
							<span className="ml-1.5 inline-flex">
								<PartyChip id={partyId} ctx={ctx} />
							</span>
						)}
						{ctx.flaggedConditionIds.has(condition.id) && (
							<span className="ml-1.5 rounded border border-blue-600/50 px-1 text-[10px] text-blue-700 dark:text-blue-300">
								red flag too
							</span>
						)}
					</span>
				</div>
			))}
		</div>
	);
}

function Step({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="relative grid grid-cols-[6.5rem_1fr] gap-3 py-1.5">
			<span className="pt-px text-2xs font-medium tracking-wide text-muted-foreground uppercase">
				{label}
			</span>
			<div className="min-w-0 space-y-1.5">{children}</div>
		</div>
	);
}

/** «Who is exposed»: whoever bears the statements, the binding party of a duty or the party
 *  a right is held against. Its `burdenPartyId`, as the graph holds it. */
function exposedLine(path: FlagPath, ctx: Ctx): ReactNode {
	const burdens = [...new Set(path.statements.map((s) => s.statement.burdenPartyId))];
	if (burdens.length === 1 && burdens[0] === null) {
		return <span className="text-muted-foreground">The contract names no party who bears it.</span>;
	}
	const named = burdens.filter((b): b is string => b !== null);
	const triggers = new Set(
		path.statements.flatMap((s) => s.conditions.map((c) => c.partyId)).filter(Boolean)
	);
	const conduct = triggers.size === 1 ? [...triggers][0] : null;
	return (
		<span className="flex flex-wrap items-center gap-x-1.5">
			{named.length === 1 ? (
				<>
					<PartyChip id={named[0]} ctx={ctx} />
					<span>bears it.</span>
				</>
			) : (
				<>
					{named.map((id) => (
						<PartyChip key={id} id={id} ctx={ctx} />
					))}
					<span>each bear it.</span>
				</>
			)}
			{conduct && (
				<>
					<span className="text-muted-foreground">It is set off by what</span>
					<PartyChip id={conduct} ctx={ctx} />
					<span className="text-muted-foreground">does.</span>
				</>
			)}
		</span>
	);
}

/** Why a flag is one, as a path through the graph: each step a node or an edge, read as it is. */
export function RedFlagPath({
	path,
	kg,
	colorOf,
	placeOf,
	flaggedConditionIds,
	sharedWith,
}: {
	path: FlagPath;
	kg: KnowledgeGraph;
	colorOf: PartyColorOf;
	placeOf?: PlaceOf;
	flaggedConditionIds: ReadonlySet<string>;
	/** How many other flags lead to the same statements. */
	sharedWith: number;
}) {
	const ctx: Ctx = { kg, colorOf, placeOf, flaggedConditionIds };
	const kind = path.statements[0]?.statement.kind;
	return (
		<div className="rounded-lg border border-blue-600/25 bg-card px-3 py-2 text-xs">
			<div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5">
				<span className="text-2xs font-semibold tracking-wide text-blue-700 uppercase dark:text-blue-300">
					Why it is a red flag
				</span>
				{sharedWith > 0 && (
					<span className="text-2xs text-muted-foreground">
						{sharedWith} more {sharedWith === 1 ? 'flag shares' : 'flags share'} this path
						(outlined)
					</span>
				)}
			</div>
			<div className="divide-y divide-border/40">
				<Step label="Exposed">{exposedLine(path, ctx)}</Step>
				<Step label="What it says">
					{path.statements.map((s) => (
						<StatementLine key={s.statement.id} path={s} ctx={ctx} />
					))}
				</Step>
				<Step label="Where">
					{path.clauseIds.map((id) => (
						<div key={id}>
							<ClauseName clauseId={id} kind={kind} ctx={ctx} />
						</div>
					))}
				</Step>
				{path.consequences.length > 0 && (
					<Step label="If not kept">
						{path.consequences.map((c) => (
							<div key={c.statement.id} className="space-y-1">
								<ClauseName clauseId={c.clauseId} kind={c.statement.kind} ctx={ctx} />
								<StatementLine path={c} ctx={ctx} />
							</div>
						))}
					</Step>
				)}
				{path.modifiers.length > 0 && (
					<Step label="Changed by">
						{path.modifiers.map((m) => (
							<div key={m.clauseId} className="flex flex-wrap items-start gap-x-1.5">
								<ClauseName clauseId={m.clauseId} kind={m.statement?.kind} ctx={ctx} />
								{m.statement && (
									<span className="inline-flex items-start gap-1.5">
										<KindSquare statement={m.statement} />
										<span className="text-foreground/80">{m.statement.action}</span>
									</span>
								)}
							</div>
						))}
					</Step>
				)}
				{path.counterpart && (
					<Step label="In return">
						{path.counterpart.statements.length === 0 ? (
							<span className="flex flex-wrap items-center gap-x-1.5">
								<PartyChip id={path.counterpart.partyId} ctx={ctx} />
								<span className="text-muted-foreground">
									has no {kind ? KIND_LABEL[kind].toLowerCase() : 'statement'} in this clause.
								</span>
							</span>
						) : (
							<span className="flex flex-wrap items-center gap-x-1.5">
								<PartyChip id={path.counterpart.partyId} ctx={ctx} />
								<span className="text-muted-foreground">has:</span>
								{path.counterpart.statements.map((s, i) => (
									<span key={s.id} className="text-foreground/80">
										{s.action}
										{i < path.counterpart!.statements.length - 1 && ' ·'}
									</span>
								))}
							</span>
						)}
					</Step>
				)}
			</div>
		</div>
	);
}
