'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
	KIND_COLORS,
	KIND_LABEL,
	KIND_TEXT_COLORS,
	NEUTRAL_COLOR,
	textColorOf,
} from '@/features/docx/components/clause-analyzer/constants';
import { short } from '@/features/docx/components/clause-analyzer/parts/bits';
import { LINK_COLOR, tint } from '@/features/docx/components/clause-analyzer/parts/table-bits';
import { conditionLead, sectionOf } from '@/features/docx/utils/knowledge/clause-favour';
import { flagTypeLabel } from '@/features/docx/utils/knowledge/red-flags';
import type {
	FlagHopPath,
	HopCondition,
	HopLink,
	HopStatement,
	Inferred,
	LinkType,
} from '@/features/docx/utils/knowledge/red-flag-hops';
import type { DeonticKind, KnowledgeGraph } from '@/types/knowledge';

/** Blue, so a red flag never reads as one of the statement types' colours. */
export const FLAG_COLOR = '#2563eb';
/** Slate, for what the system infers by comparing fields: never one of the graph's colours. */
export const INFERRED_COLOR = '#64748b';

/** How a path names and paints what it shows. */
export interface PathCtx {
	kg: KnowledgeGraph;
	/** A party as the analyzer's columns paint it; grey when it is in neither. */
	colorOf: (partyId: string) => string;
}

export const LINK_STYLE: Record<LinkType, { color: string; verb: string }> = {
	modifies: { color: LINK_COLOR.modifies, verb: 'modifies' },
	depends_on: { color: LINK_COLOR.dependsOn, verb: 'depends on' },
	references: { color: LINK_COLOR.refersTo, verb: 'refers to' },
};

/** Who a statement belongs to and who is on the other side, in words per type. */
export const ROLE_LABEL: Record<DeonticKind, { owner: string; other: string }> = {
	right: { owner: 'Holds it', other: 'Held against' },
	obligation: { owner: 'Must do it', other: 'Owed to' },
	prohibition: { owner: 'Must not', other: 'Protects' },
};

const PLURAL: Record<DeonticKind, string> = {
	obligation: 'obligations',
	right: 'rights',
	prohibition: 'prohibitions',
};

/** «§2», or the heading when the clause has no number. */
export function clauseLabel(kg: KnowledgeGraph, clauseId: string | null): string {
	if (!clauseId) return 'no clause';
	const clause = kg.clauses.find((c) => c.id === clauseId);
	return sectionOf(clause?.ref) ?? clause?.heading ?? clauseId;
}

/** What a clause is about: its heading, or what its statements say when it has none. */
export function clauseGist(kg: KnowledgeGraph, clauseId: string): string {
	const clause = kg.clauses.find((c) => c.id === clauseId);
	if (clause?.heading?.trim()) return clause.heading.trim();
	const actions = [...kg.obligations, ...kg.rights, ...kg.prohibitions]
		.filter((s) => s.clauseId === clauseId)
		.map((s) => s.action);
	return actions.slice(0, 2).join(' · ') || 'no statement extracted';
}

export function PartyChip({ id, ctx }: { id: string | null; ctx: PathCtx }) {
	if (!id) return <span className="text-muted-foreground italic">no party named</span>;
	const party = ctx.kg.parties.find((p) => p.id === id);
	const color = ctx.colorOf(id) ?? NEUTRAL_COLOR;
	return (
		<span
			className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-px text-xs font-semibold"
			style={{ color: textColorOf(color), backgroundColor: tint(color, 12) }}
			title={party?.name}
		>
			<span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
			{party ? short(party.name) : id}
		</span>
	);
}

export function KindSquare({ kind, flagged = false }: { kind: DeonticKind; flagged?: boolean }) {
	return (
		<span
			className={cn(
				'mt-[3px] inline-block size-2.5 shrink-0 rounded-[2px]',
				flagged && 'outline-2 outline-black dark:outline-white'
			)}
			style={{ backgroundColor: KIND_COLORS[kind] }}
			title={`${KIND_LABEL[kind]}${flagged ? ' — a red flag of the dataset' : ''}`}
		/>
	);
}

export function FlagTag({ label = 'red flag' }: { label?: string }) {
	return (
		<span
			className="inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] font-semibold"
			style={{ color: FLAG_COLOR, backgroundColor: tint(FLAG_COLOR, 12) }}
			title="Annotated as a red flag in the lease dataset (Leivaditi et al. 2020)"
		>
			{label}
		</span>
	);
}

/** The dataset's types for the flags that lead here, as they are written there. */
export function flagTypes(path: FlagHopPath): string {
	const types = [...new Set(path.flags.map((f) => flagTypeLabel(f.type)))];
	return types.join(' · ') || 'untyped';
}

export function ConditionLine({ hop, ctx }: { hop: HopCondition; ctx: PathCtx }) {
	return (
		// Inline flow, so a long trigger wraps under its tags instead of squeezing beside them.
		<span className="block min-w-0 leading-relaxed">
			<span
				className="mr-1.5 rounded px-1 align-[1px] text-[10px] font-bold"
				style={{
					color: KIND_TEXT_COLORS.condition,
					backgroundColor: tint(KIND_COLORS.condition, 18),
				}}
			>
				{conditionLead(hop.condition.operator)
					.replace(/^Only /, '')
					.toUpperCase()}
			</span>
			<span className="text-foreground/90">{hop.condition.trigger}</span>
			{hop.partyId && (
				<span className="ml-1.5 inline-flex align-middle" title="The condition names this party">
					<PartyChip id={hop.partyId} ctx={ctx} />
				</span>
			)}
			{hop.flagged && (
				<span className="ml-1.5 inline-flex align-middle">
					<FlagTag />
				</span>
			)}
		</span>
	);
}

/** «When: …», «How often: …», «How much: …», when the graph has them. */
export function TimingText({ hop }: { hop: HopStatement }) {
	const t = hop.timing;
	if (!t) return null;
	const parts = [
		t.deadline && `when: ${t.deadline}`,
		t.frequency && `how often: ${t.frequency}`,
		t.amounts.length > 0 && `how much: ${t.amounts.join(', ')}`,
	].filter(Boolean);
	return <span className="text-muted-foreground">{parts.join(' · ')}</span>;
}

/** A link chip read in the edge's own direction: «§2 modifies §1». */
export function LinkChip({ link, ctx }: { link: HopLink; ctx: PathCtx }) {
	const { color, verb } = LINK_STYLE[link.type];
	return (
		<span
			className="inline-flex shrink-0 items-center rounded px-1.5 py-px text-[11px] font-semibold text-white"
			style={{ backgroundColor: color }}
			title={link.evidence || undefined}
		>
			{clauseLabel(ctx.kg, link.fromClauseId)} {verb} {clauseLabel(ctx.kg, link.toClauseId)}
		</span>
	);
}

/** A line of what the graph lacks: grey, with ∅, never filled in from a neighbour. */
export function Missing({ children }: { children: ReactNode }) {
	return (
		<span className="flex items-start gap-1.5 text-muted-foreground/80 italic">
			<span aria-hidden className="not-italic">
				∅
			</span>
			<span>{children}</span>
		</span>
	);
}

/** What the graph does not hold around the statement, as short lines. */
export function missingLines(path: FlagHopPath, ctx: PathCtx): string[] {
	const out: string[] = [];
	const kind = path.root.statement.kind;
	if (path.missing.owner)
		out.push(`No party named who ${kind === 'right' ? 'holds' : 'carries'} it`);
	if (path.missing.other) out.push('No party named on the other side');
	if (path.missing.condition) out.push('No condition recorded: it always applies');
	if (path.missing.timing) out.push('No deadline, notice period or frequency recorded');
	if (path.missing.links)
		out.push(`No edge joins ${clauseLabel(ctx.kg, path.clauseId)} to another clause`);
	return out;
}

/** One inferred finding as a sentence, with the parties as chips. */
export function InferredLine({
	item,
	path,
	ctx,
}: {
	item: Inferred;
	path: FlagHopPath;
	ctx: PathCtx;
}) {
	const here = clauseLabel(ctx.kg, path.clauseId);
	const kind = path.root.statement.kind;
	const labelOf = (id: string) => {
		const s = [...ctx.kg.obligations, ...ctx.kg.rights, ...ctx.kg.prohibitions].find(
			(x) => x.id === id
		);
		return s ? `«${s.action}» (${clauseLabel(ctx.kg, s.clauseId)})` : `the figure of ${here}`;
	};
	switch (item.kind) {
		case 'conduct':
			return (
				<Sentence>
					{item.own ? 'It turns on what' : 'Set off by what'}
					<PartyChip id={item.partyId} ctx={ctx} />
					{item.own ? 'itself does' : 'does'}:{' '}
					{item.count === 1 ? 'its condition names' : `its ${item.count} conditions name`} it.
				</Sentence>
			);
		case 'counterpart': {
			const kinds = (n: number) => (n === 1 ? KIND_LABEL[kind].toLowerCase() : PLURAL[kind]);
			const shared =
				item.shared > 0
					? ` Both share ${item.shared} more, word for word: ${item.shared === 1 ? 'it counts' : 'they count'} for neither.`
					: '';
			return item.other === 0 ? (
				<Sentence>
					<PartyChip id={item.otherId} ctx={ctx} />
					has no {PLURAL[kind]} of its own in {here} in return;
					<PartyChip id={item.ownerId} ctx={ctx} />
					has {item.owner}.{shared}
				</Sentence>
			) : (
				<Sentence>
					In {here},
					<PartyChip id={item.ownerId} ctx={ctx} />
					has {item.owner} {kinds(item.owner)} of its own and
					<PartyChip id={item.otherId} ctx={ctx} />
					has {item.other}.{shared}
				</Sentence>
			);
		}
		case 'safeguard':
			return (
				<span className="space-y-1">
					<Sentence>
						What might protect
						<PartyChip id={item.partyId} ctx={ctx} />: its own rights, here or in a linked clause.
						Read whether they limit this:
					</Sentence>
					<span className="block space-y-0.5 pl-3">
						{item.candidates.map((c) => (
							<span key={c.statement.id} className="flex flex-wrap items-baseline gap-x-1.5">
								<span>· {c.statement.action}</span>
								<span className="text-muted-foreground">
									({clauseLabel(ctx.kg, c.statement.clauseId)}
									{c.timing?.deadline ? `, when: ${c.timing.deadline}` : ''}
									{c.conditions[0]
										? `, ${conditionLead(c.conditions[0].condition.operator).toLowerCase()} ${c.conditions[0].condition.trigger}`
										: ''}
									)
								</span>
							</span>
						))}
					</span>
				</span>
			);
		case 'no-safeguard':
			return (
				<Sentence>
					Nothing found that protects
					<PartyChip id={item.partyId} ctx={ctx} />: no right of its own in {here} or in a clause
					linked to it.
				</Sentence>
			);
		case 'amounts':
			return (
				<Sentence>
					Figures that differ: {item.mine} here, {item.theirs} in {labelOf(item.withId)}.
				</Sentence>
			);
		case 'timing':
			return (
				<Sentence>
					The same action, timed differently: «{item.mine}» and «{item.theirs}» (
					{labelOf(item.withId)}).
				</Sentence>
			);
	}
}

/** A sentence in inline flow: the party chips sit in the words and the line wraps around them. */
function Sentence({ children }: { children: ReactNode }) {
	return (
		<span className="block leading-relaxed [&>span]:mx-1 [&>span]:align-middle">{children}</span>
	);
}

/** The box that holds what is inferred: dashed, slanted and marked ≈, apart from the graph. */
export function InferredBox({ path, ctx }: { path: FlagHopPath; ctx: PathCtx }) {
	if (path.inferred.length === 0) return null;
	return (
		<div
			className="space-y-1.5 rounded-md border border-dashed px-3 py-2 text-xs text-slate-700 italic dark:text-slate-300"
			style={{ borderColor: INFERRED_COLOR }}
		>
			<p
				className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide not-italic uppercase"
				style={{ color: INFERRED_COLOR }}
			>
				<span aria-hidden className="text-sm">
					≈
				</span>
				Inferred · compared by the system, not written in the graph
			</p>
			{path.inferred.map((item, i) => (
				<InferredLine key={i} item={item} path={path} ctx={ctx} />
			))}
		</div>
	);
}

/** The key under a path: a line from the graph, a dashed one inferred. */
export function PathKey({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				'flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground',
				className
			)}
		>
			<span className="inline-flex items-center gap-1.5">
				<span className="h-px w-5 bg-foreground" /> from the graph
			</span>
			<span className="inline-flex items-center gap-1.5">
				<span className="w-5 border-t border-dashed" style={{ borderColor: INFERRED_COLOR }} />{' '}
				inferred
			</span>
			<span className="inline-flex items-center gap-1.5">
				<span aria-hidden>∅</span> not in the graph
			</span>
		</span>
	);
}
