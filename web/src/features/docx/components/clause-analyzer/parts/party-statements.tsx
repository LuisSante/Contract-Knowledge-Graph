'use client';

import { pairShort, SIDE_COLOR } from '@/features/docx/components/clause-analyzer/parts/bits';
import { textColorOf } from '@/features/docx/components/clause-analyzer/constants';
import {
	Fragment,
	KIND_LABEL,
	tint,
} from '@/features/docx/components/clause-analyzer/parts/table-bits';
import {
	DEONTIC_KINDS,
	type ClauseTally,
	type Served,
} from '@/features/docx/utils/knowledge/clause-favour';
import type { GridRow, Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { StatementTiming } from '@/features/docx/utils/knowledge/statement-timing';
import { cn } from '@/lib/utils';
import type { DeonticKind, KgCondition } from '@/types/knowledge';

/** What the detail adds to each statement from the graph, without changing any count. */
export interface StatementHints {
	/** Statements the other party has word for word. */
	reciprocal: ReadonlySet<string>;
	/** The side a condition's trigger names, when it names just one of the two. */
	conditionSide: Map<string, Side>;
	/** Each statement's deadline, frequency and values, for the end of its line. */
	timing: Map<string, StatementTiming>;
}

/** Flagged lines are marked, and their «red flag» tag shows the path in the graph tab. */
export interface FlagLines {
	flaggedIds: ReadonlySet<string>;
	onPick: (statementId: string) => void;
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
	return { text: `${pairShort(names)[side]}'s ${s.kind}`, side };
}

/** The Both column's head colour: slate, never a party's or a statement type's. */
const BOTH_COLOR = '#64748b';

/** Each party's own statements in the clause, side by side, a line each with its deadline,
 *  frequency and values; a line opens the contract's own words. With «Set shared aside» the
 *  reciprocal pairs sit in a Both column between them, one line per pair. */
export function PartyStatements({
	tally,
	kinds,
	names,
	conditions,
	hints,
	onOpen,
	flags,
	sharedAside = false,
}: {
	tally: ClauseTally;
	kinds: DeonticKind[];
	names: Record<Side, string>;
	conditions: KgCondition[];
	hints?: StatementHints;
	onOpen: (nodeId: string) => void;
	flags?: FlagLines;
	sharedAside?: boolean;
}) {
	const conditionParty = (condition: KgCondition) => {
		const side = hints?.conditionSide.get(condition.id);
		return side ? { name: pairShort(names)[side], color: SIDE_COLOR[side] } : null;
	};
	const aside = sharedAside && hints ? hints.reciprocal : null;
	const own = (side: Side) => ownedBy(tally, side, kinds).filter((s) => !aside?.has(s.mark.id));
	// One line per pair, standing for the flagged twin when one of them is a red flag.
	const shared = (() => {
		if (!aside) return [];
		const byKey = new Map<string, Served[]>();
		for (const s of tally.served) {
			if (!kinds.includes(s.kind) || !aside.has(s.mark.id)) continue;
			const key = `${s.kind}|${s.text.trim()}`;
			byKey.set(key, [...(byKey.get(key) ?? []), s]);
		}
		return [...byKey.values()].map(
			(twins) => twins.find((t) => flags?.flaggedIds.has(t.mark.id)) ?? twins[0]
		);
	})();
	const noun =
		kinds.length === 1 ? KIND_LABEL[kinds[0]].toLowerCase() : 'statements of these types';

	const column = (
		key: string,
		head: string,
		color: string,
		gets: Served[],
		empty: string,
		tagColor?: string
	) => (
		// No border of its own: the band it unfolds in is the one frame, the tinted head and the
		// white list set the columns apart.
		<div key={key} className="overflow-hidden rounded-lg">
			<div
				className="flex items-center gap-2 px-3 py-2 text-xs font-semibold"
				style={{ backgroundColor: tint(color, 10), color: textColorOf(color) }}
			>
				<span className="size-2 rounded-full" style={{ backgroundColor: color }} />
				{head}
				<span
					className="rounded-full px-1.5 text-[10px] text-white tabular-nums dark:text-neutral-950"
					style={{ backgroundColor: textColorOf(color) }}
				>
					{gets.length}
				</span>
			</div>
			{gets.length === 0 ? (
				<p className="px-3 py-3 text-2xs text-muted-foreground">{empty}</p>
			) : (
				<div className="divide-y divide-border/60 bg-card">
					{gets.map((s) => {
						const origin = originOf(s, names);
						return (
							<Fragment
								key={`${s.mark.id}-${s.to}`}
								served={s}
								section={tally.section}
								// The column and the tab already say whose and which type; only a
								// statement both parties share needs saying, outside the Both column.
								tag={origin.side === null && key !== 'both' ? origin.text : undefined}
								tagColor={tagColor ?? color}
								conditions={conditions.filter((c) => c.gatesId === s.mark.id)}
								// In the Both column the column already says it.
								reciprocal={key !== 'both' && (hints?.reciprocal.has(s.mark.id) ?? false)}
								conditionParty={conditionParty}
								timing={hints?.timing.get(s.mark.id)}
								onOpen={onOpen}
								flagged={flags?.flaggedIds.has(s.mark.id)}
								onPickFlag={flags && (() => flags.onPick(s.mark.id))}
							/>
						);
					})}
				</div>
			)}
		</div>
	);

	const sideColumn = (side: Side) =>
		column(
			side,
			pairShort(names)[side],
			SIDE_COLOR[side],
			own(side),
			`${pairShort(names)[side]} has no ${noun} of its own here.`
		);
	const bothColumn = aside
		? column('both', 'Both', BOTH_COLOR, shared, `Nothing shared in ${noun} here.`)
		: null;

	return (
		<div className={cn('grid gap-3', bothColumn ? 'grid-cols-3' : 'grid-cols-2')}>
			{sideColumn('a')}
			{bothColumn}
			{sideColumn('b')}
		</div>
	);
}

/** What the picked row unfolds: which party has more of the open type, by the same count its
 *  squares show, then each party's own statements (and, set aside, what both share). */
export function ClauseDetail({
	row,
	tally,
	kind,
	names,
	conditions,
	hints,
	onOpen,
	flags,
	sharedAside = false,
}: {
	row: GridRow;
	tally: ClauseTally;
	kind: DeonticKind;
	names: Record<Side, string>;
	conditions: KgCondition[];
	hints?: StatementHints;
	onOpen: (nodeId: string) => void;
	flags?: FlagLines;
	sharedAside?: boolean;
}) {
	const count = (side: Side) => row.marks[side].filter((mark) => mark.kind === kind).length;
	const a = count('a');
	const b = count('b');
	const both = sharedAside ? (row.both ?? []).filter((mark) => mark.kind === kind).length : 0;
	const label = KIND_LABEL[kind].toLowerCase();
	const lead = a === b ? null : a > b ? 'a' : 'b';
	return (
		<div className="space-y-3">
			<p className="text-sm font-medium text-foreground">
				{lead
					? `${pairShort(names)[lead]} has more ${label} (${Math.max(a, b)} vs ${Math.min(a, b)}).`
					: `As many ${label} for each party (${a} each).`}
				{both > 0 && (
					<span className="font-normal text-muted-foreground">
						{' '}
						Both share {both}: {both === 1 ? 'it counts' : 'they count'} for neither.
					</span>
				)}
			</p>
			<PartyStatements
				tally={tally}
				kinds={[kind]}
				names={names}
				conditions={conditions}
				hints={hints}
				onOpen={onOpen}
				flags={flags}
				sharedAside={sharedAside}
			/>
		</div>
	);
}
