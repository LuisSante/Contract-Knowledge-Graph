'use client';

import type { ReactNode } from 'react';
import { KIND_LABEL } from '@/features/docx/components/clause-analyzer/constants';
import {
	ConditionLine,
	FLAG_COLOR,
	flagTypes,
	InferredBox,
	KindSquare,
	LinkChip,
	Missing,
	missingLines,
	PartyChip,
	PathKey,
	ROLE_LABEL,
	TimingText,
	clauseGist,
	clauseLabel,
	type PathCtx,
} from '@/features/docx/components/clause-analyzer/flag-path/path-bits';
import {
	KIND_COLORS,
	KIND_TEXT_COLORS,
} from '@/features/docx/components/clause-analyzer/constants';
import { tint } from '@/features/docx/components/clause-analyzer/parts/table-bits';
import {
	valuePhrase,
	type FlagHopPath,
	type HopLink,
	type HopStatement,
} from '@/features/docx/utils/knowledge/red-flag-hops';

/** A step of the path: its hop in grey, what it is, what it holds, and the edge or field it
 *  is read from. */
function Step({
	hop,
	label,
	source,
	children,
}: {
	hop: string;
	label: string;
	source?: string;
	children: ReactNode;
}) {
	return (
		<div className="grid grid-cols-[12px_84px_1fr_auto] items-start gap-x-2 py-1.5 text-xs">
			<span className="pt-0.5 text-[9px] font-semibold text-muted-foreground/50 tabular-nums">
				{hop}
			</span>
			<span className="pt-0.5 text-[11px] font-semibold text-muted-foreground">{label}</span>
			<div className="min-w-0 space-y-1">{children}</div>
			{source ? (
				<span className="pt-0.5 text-[9px] text-muted-foreground/60 italic">{source}</span>
			) : (
				<span />
			)}
		</div>
	);
}

/** Another statement of the path, a line: its type, words, owner, and its own conditions and
 *  values (hop 3). */
function StatementLine({ hop, ctx }: { hop: HopStatement; ctx: PathCtx }) {
	return (
		<div className="space-y-0.5">
			<div className="flex flex-wrap items-start gap-x-1.5 gap-y-0.5">
				<KindSquare kind={hop.statement.kind} flagged={hop.flagged} />
				<span className="text-foreground/90">{hop.statement.action}</span>
				<PartyChip id={hop.ownerId} ctx={ctx} />
				<TimingText hop={hop} />
			</div>
			{hop.conditions.map((c) => (
				<div key={c.condition.id} className="pl-4">
					<ConditionLine hop={c} ctx={ctx} />
				</div>
			))}
		</div>
	);
}

function LinkLine({ link, ctx, own }: { link: HopLink; ctx: PathCtx; own?: boolean }) {
	return (
		<div className="space-y-1">
			<div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
				<LinkChip link={link} ctx={ctx} />
				<span className="text-foreground/90">
					{own ? clauseGist(ctx.kg, link.toClauseId) : clauseGist(ctx.kg, link.fromClauseId)}
				</span>
			</div>
			{!own && link.statement && (
				<div className="pl-3">
					<StatementLine hop={link.statement} ctx={ctx} />
				</div>
			)}
		</div>
	);
}

/**
 * Version 1: why a flagged statement is a red flag, under its line in the row's detail. Hop 1
 * as steps, hop 2 as the rest of the clause and its links, and what is inferred in a dashed box.
 */
export function PathLadder({ path, ctx }: { path: FlagHopPath; ctx: PathCtx }) {
	const s = path.root.statement;
	const roles = ROLE_LABEL[s.kind];
	const here = clauseLabel(ctx.kg, path.clauseId);
	const missing = missingLines(path, ctx);
	const byOwner = new Map<string | null, HopStatement[]>();
	for (const x of path.siblings) byOwner.set(x.ownerId, [...(byOwner.get(x.ownerId) ?? []), x]);
	const links = [...path.incoming, ...path.clauseOutgoing];

	return (
		<div
			className="mt-1 space-y-1 rounded-md border bg-card px-3 py-2"
			style={{ borderColor: tint(FLAG_COLOR, 35) }}
		>
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-1.5">
				<span
					className="text-[10px] font-bold tracking-wide uppercase"
					style={{ color: FLAG_COLOR }}
				>
					Why it is a red flag · {flagTypes(path)}
				</span>
				<PathKey />
			</div>
			{path.flags.length > 1 && (
				<p className="text-[11px] text-muted-foreground">
					{path.flags.length} red flags of the dataset lead here: this sentence or its conditions.
				</p>
			)}

			<div className="divide-y divide-border/40">
				<Step
					hop="1"
					label={roles.owner}
					source={s.kind === 'right' ? 'grants_right_to' : 'assigns_obligation_to'}
				>
					{path.root.ownerId ? (
						<PartyChip id={path.root.ownerId} ctx={ctx} />
					) : (
						<Missing>no party named</Missing>
					)}
				</Step>
				<Step
					hop="1"
					label={roles.other}
					source={s.kind === 'right' ? 'burdenPartyId' : 'benefitPartyId'}
				>
					{path.root.otherId ? (
						<PartyChip id={path.root.otherId} ctx={ctx} />
					) : (
						<Missing>no party named</Missing>
					)}
				</Step>
				{path.root.conditions.length > 0 && (
					<Step hop="1" label="Only if" source={`Condition ×${path.root.conditions.length}`}>
						{path.root.conditions.map((c) => (
							<div
								key={c.condition.id}
								className="border-l-2 pl-2"
								style={{ borderColor: KIND_COLORS.condition }}
							>
								<ConditionLine hop={c} ctx={ctx} />
							</div>
						))}
					</Step>
				)}
				{path.root.timing && (
					<Step hop="1" label="When / how much" source="deadline · frequency · Value">
						<TimingText hop={path.root} />
					</Step>
				)}
				{path.outgoing.map((link, i) => (
					<Step key={`out-${i}`} hop="1" label="Changes" source={`${link.type} →`}>
						<LinkLine link={link} ctx={ctx} own />
					</Step>
				))}
				{path.clauseValues.length > 0 && (
					<Step hop="1" label={`Value of ${here}`} source="Value">
						<span className="flex flex-wrap gap-1.5">
							{path.clauseValues.map((v) => (
								<span
									key={v.id}
									className="rounded px-1.5 py-px text-[11px] font-semibold"
									style={{
										color: KIND_TEXT_COLORS.value,
										backgroundColor: tint(KIND_COLORS.value, 16),
									}}
								>
									{valuePhrase(v)}
								</span>
							))}
						</span>
					</Step>
				)}
				{(path.cites.length > 0 || path.terms.length > 0) && (
					<Step hop="1" label="Cites" source="Reference · uses">
						{path.cites.map((r) => (
							<span key={r.id} className="block text-foreground/90">
								{r.name || r.citation}
							</span>
						))}
						{path.terms.map((t) => (
							<span key={t.id} className="block text-foreground/90">
								«{t.term}»: {t.definition}
							</span>
						))}
					</Step>
				)}
				{missing.length > 0 && (
					<Step hop="1" label="Not recorded">
						{missing.map((m) => (
							<Missing key={m}>{m}</Missing>
						))}
					</Step>
				)}

				<Step hop="2" label={`Rest of ${here}`} source="is_part_of">
					{path.siblings.length === 0 ? (
						<Missing>No other statement in {here}: it stands alone.</Missing>
					) : (
						[...byOwner.entries()].map(([owner, list]) => (
							<div key={owner ?? 'none'} className="space-y-1">
								<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
									<PartyChip id={owner} ctx={ctx} />
									{list.length} {list.length === 1 ? 'statement' : 'statements'}
								</span>
								<div className="space-y-1 pl-2">
									{list.map((x) => (
										<StatementLine key={x.statement.id} hop={x} ctx={ctx} />
									))}
								</div>
							</div>
						))
					)}
				</Step>
				<Step hop="2" label="Linked clauses" source="modifies · depends_on">
					{links.length === 0 ? (
						<Missing>
							Nothing modifies {here}, and {here} depends on or refers to no other clause.
						</Missing>
					) : (
						links.map((link, i) => <LinkLine key={i} link={link} ctx={ctx} />)
					)}
				</Step>
			</div>

			<InferredBox path={path} ctx={ctx} />
			<p className="text-[10px] text-muted-foreground/70">
				{KIND_LABEL[s.kind]} {s.id} · hop 3 is each statement’s own conditions and values.
			</p>
		</div>
	);
}
