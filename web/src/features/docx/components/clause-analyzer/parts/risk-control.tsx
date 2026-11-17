'use client';

import { LoaderCircleIcon, SparklesIcon, TriangleAlertIcon } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { RisksSource, RisksStatus } from '@/features/docx/hooks/useRisks';
import { cn } from '@/lib/utils';

export function RiskControl({
	status,
	source,
	hasSaved,
	shown,
	total,
	failed,
	onFree,
	onAI,
}: {
	status: RisksStatus;
	source: RisksSource | null;
	hasSaved: boolean;
	shown: number;
	total: number;
	failed: number;
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
					title={`Squares with a black outline: what the system judged risky. ${total} in the whole contract.`}
				>
					<TriangleAlertIcon className="size-3" aria-hidden />
					{shown} {shown === 1 ? 'risk' : 'risks'}
				</span>
			)}
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
