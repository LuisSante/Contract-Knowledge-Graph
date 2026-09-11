'use client';

import type { KgParty } from '@/types/knowledge';
import { Button } from '@/components/ui/button';
import {
	PAIR_SECOND_COLOR,
	PARTY_COLOR,
} from '@/features/docx/components/knowledge-graph/constants';

interface PanelHeaderProps {
	parties: KgParty[];
	/** The anchor party; the picker offers every other one as the second seat. */
	focusPartyId: string | null;
	secondPartyId: string | null;
	onSecondParty: (partyId: string | null) => void;
	pickerOpen: boolean;
	onPickerOpen: (open: boolean) => void;
	allKindsOn: boolean;
	onToggleAllKinds: () => void;
}

export function PanelHeader({
	parties,
	focusPartyId,
	secondPartyId,
	onSecondParty,
	pickerOpen,
	onPickerOpen,
	allKindsOn,
	onToggleAllKinds,
}: PanelHeaderProps) {
	const isPartyFocus = focusPartyId !== null;
	return (
		<div className="border-b border-border/60 px-3 py-2 text-2xs text-muted-foreground">
			<div className="flex items-center justify-between gap-2">
				<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
					<span className="flex items-center gap-1">
						{isPartyFocus ? (
							<span className="relative">
								<button
									type="button"
									onClick={() => onPickerOpen(!pickerOpen)}
									className="rounded border border-border/70 px-1.5 py-0.5 hover:bg-muted"
									title="Add a second party to compare the two side by side"
								>
									{secondPartyId ? '2 of' : '1 of'} {parties.length} parties ▾
								</button>
								{pickerOpen && (
									<span className="absolute top-full left-0 z-20 mt-1 flex w-56 flex-col gap-1 rounded-md border border-border bg-popover p-2 shadow-md">
										{parties.map((party) => {
											const isAnchor = party.id === focusPartyId;
											const color = isAnchor
												? PARTY_COLOR
												: party.id === secondPartyId
													? PAIR_SECOND_COLOR
													: 'transparent';
											return (
												<label
													key={party.id}
													className={
														isAnchor
															? 'flex cursor-default items-center gap-2 opacity-70'
															: 'flex cursor-pointer items-center gap-2 hover:text-foreground'
													}
												>
													<input
														type="checkbox"
														checked={isAnchor || party.id === secondPartyId}
														disabled={isAnchor}
														onChange={() =>
															onSecondParty(party.id === secondPartyId ? null : party.id)
														}
														className="cursor-pointer accent-primary"
													/>
													<span
														className="inline-block h-2 w-2 shrink-0 rounded-full border"
														style={{ backgroundColor: color, borderColor: 'currentColor' }}
													/>
													<span className="truncate">{party.name}</span>
												</label>
											);
										})}
									</span>
								)}
							</span>
						) : (
							<span>{parties.length} parties</span>
						)}
					</span>
				</div>
				<Button
					variant="ghost"
					size="xs"
					className="h-6 shrink-0 px-1.5 text-2xs"
					onClick={onToggleAllKinds}
				>
					{allKindsOn ? 'Hide all' : 'Show all'}
				</Button>
			</div>
		</div>
	);
}
