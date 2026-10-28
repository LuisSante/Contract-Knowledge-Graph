'use client';

import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/parts/bits';
import {
	Fragment,
	KIND_LABEL,
	tint,
	type StatementAside,
} from '@/features/docx/components/clause-analyzer/parts/table-bits';
import {
	DEONTIC_KINDS,
	type ClauseTally,
	type Served,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { GridRow, Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind, KgCondition } from '@/types/knowledge';

const SIDES: Side[] = ['a', 'b'];

/** What the detail adds to each statement from the graph, without changing any count. */
export interface StatementHints {
	/** Statements the other party has word for word. */
	reciprocal: ReadonlySet<string>;
	/** The other party's statements of the other type in the same paragraph. */
	counterparts: Map<string, Array<{ id: string; kind: DeonticKind; label: string; side: Side }>>;
	/** The side a condition's trigger names, when it names just one of the two. */
	conditionSide: Map<string, Side>;
}

/** A clause's statements that belong to one party in the types shown: the obligations and
 *  prohibitions that bind it and the rights it holds, a type at a time. */
const ownedBy = (t: ClauseTally, side: Side, kinds: DeonticKind[]): Served[] =>
	t.served
		.filter((s) => {
			const owner = s.kind === 'right' ? s.to : s.by;
			return kinds.includes(s.kind) && (owner === side || owner === 'both');
		})
		.sort((x, y) => DEONTIC_KINDS.indexOf(x.kind) - DEONTIC_KINDS.indexOf(y.kind));

/** The tag over a statement: whose it is and its type, «National's obligation». A
 *  reciprocal statement is both parties'. */
function originOf(s: Served, names: Record<Side, string>): { text: string; side: Side | null } {
	const side = s.kind === 'right' ? s.to : s.by;
	if (side !== 'a' && side !== 'b') return { text: `Both parties’ ${s.kind}`, side: null };
	return { text: `${short(names[side])}'s ${s.kind}`, side };
}

/** Each party's own statements in the clause, side by side, in the contract's own words. */
export function PartyStatements({
	tally,
	kinds,
	names,
	conditions,
	hints,
	onOpen,
}: {
	tally: ClauseTally;
	kinds: DeonticKind[];
	names: Record<Side, string>;
	conditions: KgCondition[];
	hints?: StatementHints;
	onOpen: (nodeId: string) => void;
}) {
	const asides = (id: string): StatementAside[] =>
		(hints?.counterparts.get(id) ?? []).map((other) => ({
			id: other.id,
			tag: `${short(names[other.side])}'s ${other.kind}`,
			color: SIDE_COLOR[other.side],
			label: other.label,
		}));
	const conditionParty = (condition: KgCondition) => {
		const side = hints?.conditionSide.get(condition.id);
		return side ? { name: short(names[side]), color: SIDE_COLOR[side] } : null;
	};
	const column = (side: Side) => {
		const gets = ownedBy(tally, side, kinds);
		return (
			<div
				key={side}
				className="overflow-hidden rounded-lg border"
				style={{ borderColor: tint(SIDE_COLOR[side], 35) }}
			>
				<div
					className="flex items-center gap-2 px-3 py-2 text-xs font-semibold"
					style={{ backgroundColor: tint(SIDE_COLOR[side], 10), color: SIDE_COLOR[side] }}
				>
					<span className="size-2 rounded-full" style={{ backgroundColor: SIDE_COLOR[side] }} />
					{short(names[side])}
					<span
						className="rounded-full px-1.5 text-[10px] text-white tabular-nums"
						style={{ backgroundColor: SIDE_COLOR[side] }}
					>
						{gets.length}
					</span>
				</div>
				{gets.length === 0 ? (
					<p className="px-3 py-3 text-2xs text-muted-foreground">
						{short(names[side])} has no{' '}
						{kinds.length === 1 ? KIND_LABEL[kinds[0]].toLowerCase() : 'statements of these types'}{' '}
						here.
					</p>
				) : (
					<div className="divide-y divide-border/60 bg-card">
						{gets.map((s) => {
							const origin = originOf(s, names);
							return (
								<Fragment
									key={`${s.mark.id}-${s.to}`}
									served={s}
									section={tally.section}
									tag={origin.text}
									tagColor={SIDE_COLOR[side]}
									conditions={conditions.filter((c) => c.gatesId === s.mark.id)}
									reciprocal={hints?.reciprocal.has(s.mark.id) ?? false}
									counterparts={asides(s.mark.id)}
									conditionParty={conditionParty}
									onOpen={onOpen}
								/>
							);
						})}
					</div>
				)}
			</div>
		);
	};

	return <div className="grid grid-cols-2 gap-3">{SIDES.map(column)}</div>;
}

/** What the picked row unfolds: which party has more of the open type, by the same count its
 *  squares show, then each party's own statements. */
export function ClauseDetail({
	row,
	tally,
	kind,
	names,
	conditions,
	hints,
	onOpen,
}: {
	row: GridRow;
	tally: ClauseTally;
	kind: DeonticKind;
	names: Record<Side, string>;
	conditions: KgCondition[];
	hints?: StatementHints;
	onOpen: (nodeId: string) => void;
}) {
	const count = (side: Side) => row.marks[side].filter((mark) => mark.kind === kind).length;
	const a = count('a');
	const b = count('b');
	const label = KIND_LABEL[kind].toLowerCase();
	const lead = a === b ? null : a > b ? 'a' : 'b';
	return (
		<div className="space-y-3">
			<p className="text-sm font-medium text-foreground">
				{lead
					? `${short(names[lead])} has more ${label} (${Math.max(a, b)} vs ${Math.min(a, b)}).`
					: `As many ${label} for each party (${a} each).`}
			</p>
			<PartyStatements
				tally={tally}
				kinds={[kind]}
				names={names}
				conditions={conditions}
				hints={hints}
				onOpen={onOpen}
			/>
		</div>
	);
}
