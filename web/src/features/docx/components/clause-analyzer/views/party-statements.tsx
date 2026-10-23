'use client';

import { SIDE_COLOR, short } from '@/features/docx/components/clause-analyzer/views/bits';
import {
	Fragment,
	KIND_LABEL,
	tint,
} from '@/features/docx/components/clause-analyzer/views/favour-bits';
import { originOf, ownedBy } from '@/features/docx/components/clause-analyzer/views/favour-shared';
import { type ClauseTally } from '@/features/docx/utils/knowledge/clause-favour';
import type { Side } from '@/features/docx/utils/knowledge/statement-grid';
import type { DeonticKind, KgCondition } from '@/types/knowledge';

const SIDES: Side[] = ['a', 'b'];
/** What the clause gives each party, side by side, in the contract's own words. */
export function PartyStatements({
	tally,
	kinds,
	names,
	conditions,
	onOpen,
}: {
	tally: ClauseTally;
	kinds: DeonticKind[];
	names: Record<Side, string>;
	conditions: KgCondition[];
	onOpen: (nodeId: string) => void;
}) {
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
