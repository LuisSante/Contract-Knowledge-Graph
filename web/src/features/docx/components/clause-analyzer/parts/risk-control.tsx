'use client';

import {
	CheckCircle2Icon,
	LoaderCircleIcon,
	SparklesIcon,
	TriangleAlertIcon,
	XIcon,
} from 'lucide-react';
import { Portal, Toast } from 'radix-ui';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { KIND_COLORS } from '@/features/docx/components/clause-analyzer/constants';
import { KIND_LABEL } from '@/features/docx/components/clause-analyzer/parts/table-bits';
import type { RisksSource, RisksStatus } from '@/features/docx/hooks/useRisks';
import { cn } from '@/lib/utils';
import type { DeonticKind } from '@/types/knowledge';

/** The risky squares of each tab. */
export type RisksByKind = Record<DeonticKind, number>;

const KINDS: readonly DeonticKind[] = ['obligation', 'right', 'prohibition'];

const squares = (count: number) => `${count} ${count === 1 ? 'square' : 'squares'}`;

/** The count as the reader sees it: «A/B risks + C» against the dataset's red flags, or the
 *  risky squares alone in a contract the dataset does not annotate. A and C are squares and
 *  add up to the risky ones; B is the dataset's flags. */
const riskCount = (found: number, flags: number, flagged: number, unflagged: number) =>
	flags > 0
		? `${flagged}/${flags} risks + ${unflagged}`
		: `${found} ${found === 1 ? 'risk' : 'risks'}`;

const perTab = (byKind: RisksByKind) =>
	KINDS.map((kind) => `${KIND_LABEL[kind]} ${byKind[kind]}`).join(' · ');

const KEY_NOTE =
	'A black outline: the system judged the statement risky. A dot under the square: a red flag annotated in the dataset, there to check the system.';

/** The key to the two signs a square can carry, drawn as the table draws them on a square of
 *  the open tab's color: the system's outline, and the dataset's dot while the dots are shown. */
function RiskKey({ color, flagsShown }: { color: string; flagsShown: boolean }) {
	return (
		<span
			className="inline-flex items-center gap-2.5 whitespace-nowrap text-muted-foreground"
			title={KEY_NOTE}
		>
			<span className="inline-flex items-center gap-1.5">
				<span
					className="mx-0.5 size-2.5 rounded-[2px] outline-2 outline-offset-0 outline-black dark:outline-white"
					style={{ backgroundColor: color }}
				/>
				R. System
			</span>
			{flagsShown && (
				<span className="inline-flex items-center gap-1.5">
					<span
						className="relative size-2.5 rounded-[2px] after:absolute after:top-full after:left-1/2 after:mt-0.5 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-black after:content-[''] dark:after:bg-white"
						style={{ backgroundColor: color }}
					/>
					R. Dataset
				</span>
			)}
		</span>
	);
}

export function RiskControl({
	status,
	source,
	hasSaved,
	found,
	byKind,
	flags,
	flagged,
	unflagged,
	failed,
	color,
	flagsShown,
	onFree,
	onAI,
}: {
	status: RisksStatus;
	source: RisksSource | null;
	hasSaved: boolean;
	/** The squares the system judged risky, the three tabs together, and tab by tab. */
	found: number;
	byKind: RisksByKind;
	/** The red flags the dataset annotates in this contract: what the count is read against.
	 *  Zero for a contract outside the dataset, and then the count stands alone. */
	flags: number;
	/** The risky squares a red flag lands on, outline and dot together: where the system and
	 *  the dataset agree. */
	flagged: number;
	/** The risky squares no flag lands on: what the system found beyond the dataset. */
	unflagged: number;
	failed: number;
	color: string;
	flagsShown: boolean;
	onFree: () => void;
	onAI: () => void;
}) {
	const detecting = status === 'detecting';
	const option = (active: boolean) =>
		cn(
			'inline-flex items-center gap-1 rounded px-2 py-0.5 text-2xs font-medium whitespace-nowrap',
			active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
			'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-muted-foreground'
		);
	return (
		<span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-2xs">
			{source && (
				<span
					className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 font-semibold whitespace-nowrap text-foreground"
					title={
						flags > 0
							? `${squares(found)} with a black outline in the whole contract (${perTab(byKind)}): ${flagged} also ${flagged === 1 ? 'carries' : 'carry'} a red flag's dot, ${unflagged} ${unflagged === 1 ? 'does' : 'do'} not. The dataset annotates ${flags} red ${flags === 1 ? 'flag' : 'flags'} in this contract.`
							: `Squares with a black outline: what the system judged risky, ${found} in the whole contract (${perTab(byKind)}).`
					}
				>
					<TriangleAlertIcon className="size-3" aria-hidden />
					{riskCount(found, flags, flagged, unflagged)}
				</span>
			)}
			{source && <RiskKey color={color} flagsShown={flagsShown} />}
			{source && failed > 0 && (
				<span
					className="whitespace-nowrap text-destructive"
					title="Their review failed, so their statements were never judged."
				>
					{failed} {failed === 1 ? 'clause' : 'clauses'} not reviewed
				</span>
			)}
			{status === 'error' && (
				<span role="alert" className="whitespace-nowrap text-destructive">
					Could not ask the model.
				</span>
			)}
			<span className="font-medium whitespace-nowrap text-muted-foreground">Detect risks</span>
			<span
				role="group"
				aria-label="Detect risks"
				className="inline-flex rounded-md border border-border bg-secondary p-0.5"
			>
				<button
					type="button"
					onClick={onFree}
					disabled={!hasSaved || detecting}
					aria-pressed={source === 'saved'}
					title={
						hasSaved
							? 'Shows the answer saved from the last time the model reviewed this contract. It costs nothing.'
							: 'Nothing saved for this contract yet: ask the AI once and its answer is kept.'
					}
					className={option(source === 'saved')}
				>
					Free
				</button>
				<button
					type="button"
					onClick={onAI}
					disabled={detecting}
					aria-pressed={source === 'ai'}
					title={
						hasSaved
							? 'Asks the model now, a call per clause: it costs money. Its answer replaces the saved one, so «Free» shows it afterwards.'
							: 'Asks the model now, a call per clause: it costs money. The answer is saved, so «Free» can show it afterwards.'
					}
					className={option(source === 'ai')}
				>
					{detecting ? (
						<>
							<LoaderCircleIcon className="size-3 motion-safe:animate-spin" aria-hidden />
							Reviewing…
						</>
					) : (
						<>
							<SparklesIcon className="size-3" aria-hidden />
							AI
						</>
					)}
				</button>
			</span>
		</span>
	);
}

/** How long the notice stays when nobody closes it. */
const NOTICE_MS = 5000;

/**
 * Tells the reader an answer is on screen, the model's or the saved one, and what it found in
 * each tab: a card in the window's top right corner that leaves by itself after five seconds,
 * or sooner when it is closed or the risks come off the screen. The clock stops while the
 * pointer or the focus is on the card, and while the window is not the one in front.
 */
export function RisksNotice({
	noticeId,
	found,
	byKind,
	flags,
	flagged,
	unflagged,
	failed,
	onClose,
}: {
	/** The answer the reader is being told of; null when there is none. An answer that follows
	 *  another has another number, and its card starts its five seconds anew. */
	noticeId: number | null;
	/** The same counts the control shows, so the card says what the chip says. */
	found: number;
	byKind: RisksByKind;
	flags: number;
	flagged: number;
	unflagged: number;
	failed: number;
	/** Closes the notice with that number, and only that one. */
	onClose: (noticeId: number) => void;
}) {
	return (
		<Toast.Provider duration={NOTICE_MS} label="Risk analysis" swipeDirection="right">
			{/* A card per notice: the library never stops the clock of a card that has left, and
			    this way that clock asks to close its own notice, which is already gone. */}
			<Toast.Root
				key={noticeId}
				open={noticeId !== null}
				onOpenChange={(next) => {
					if (!next && noticeId !== null) onClose(noticeId);
				}}
				className="list-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2 data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform data-[swipe=end]:translate-x-(--radix-toast-swipe-end-x) data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x)"
			>
				{/* The toast is the live region already, so the card inside it carries no role. */}
				<Alert
					role={undefined}
					className="px-3 py-2 text-xs shadow-lg has-data-[slot=alert-action]:pr-10"
				>
					<CheckCircle2Icon aria-hidden />
					{/* Some clauses went unjudged: the review ended, but not all of it was a success. */}
					<Toast.Title asChild>
						<AlertTitle>{failed > 0 ? 'Analysis finished' : 'Analysis successful'}</AlertTitle>
					</Toast.Title>
					<Toast.Description asChild>
						<AlertDescription className="text-xs">
							{/* The count on a line of its own, as the chip says it; the tabs on the next. */}
							<p className="font-semibold text-foreground">
								{riskCount(found, flags, flagged, unflagged)}
							</p>
							<p className="flex flex-wrap items-center gap-x-3 gap-y-1">
								{KINDS.map((kind) => (
									<span key={kind} className="inline-flex items-center gap-1.5 whitespace-nowrap">
										<span
											className="size-2.5 rounded-[2px]"
											style={{ backgroundColor: KIND_COLORS[kind] }}
										/>
										{KIND_LABEL[kind]}
										<span className="font-semibold text-foreground">{byKind[kind]}</span>
									</span>
								))}
							</p>
							{failed > 0 && (
								<p className="text-destructive">
									{failed} {failed === 1 ? 'clause' : 'clauses'} could not be reviewed.
								</p>
							)}
						</AlertDescription>
					</Toast.Description>
					<AlertAction className="top-1.5 right-2">
						<Toast.Close asChild>
							<Button variant="ghost" size="icon-xs" aria-label="Close the notice" title="Close">
								<XIcon />
							</Button>
						</Toast.Close>
					</AlertAction>
				</Alert>
			</Toast.Root>
			{/* On the body, not in the panel: a drawer that moves would carry a fixed box with it. */}
			<Portal.Root>
				<Toast.Viewport className="fixed top-4 right-4 z-100 m-0 flex w-96 max-w-[calc(100vw-2rem)] list-none flex-col gap-2 p-0 outline-none" />
			</Portal.Root>
		</Toast.Provider>
	);
}

/** Shows or hides the dataset's red flags, the dots under the squares. They only validate what
 *  the system marks, so the reader can take them out of the way. */
export function DatasetFlagsToggle({
	on,
	onChange,
}: {
	on: boolean;
	onChange: (on: boolean) => void;
}) {
	return (
		<label
			className="inline-flex cursor-pointer items-center gap-1.5 text-2xs font-medium whitespace-nowrap text-muted-foreground"
			title="Red flags annotated in the lease dataset: a dot under the square. They are not the system's; they are there to check it."
		>
			<Checkbox
				checked={on}
				onCheckedChange={(value) => onChange(value === true)}
				className="size-3.5"
			/>
			Red flags
		</label>
	);
}
