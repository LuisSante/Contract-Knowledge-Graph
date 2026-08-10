'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';

import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export interface ProcessingStep {
	label: string;
	active: boolean;
}

interface ProcessingIndicatorProps {
	steps?: ProcessingStep[];
	label?: string;
}

const TICK_INTERVAL_MS = 260;

/**
 * Animated "processing…" indicator built on shadcn `Marker`s: completed steps
 * show a green check, the active step a `Spinner` with a shimmering label, and
 * pending steps a muted dot. Reusable across panels.
 */
export function ProcessingIndicator({
	steps = [],
	label = 'Processing',
}: ProcessingIndicatorProps) {
	const [tick, setTick] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => {
			setTick((prev) => prev + 1);
		}, TICK_INTERVAL_MS);
		return () => {
			clearInterval(timer);
		};
	}, []);

	const activeProcessingStepIndex = useMemo(
		() => (steps.length > 0 ? Math.floor(tick / 3) % steps.length : 0),
		[tick, steps.length],
	);

	return (
		<div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 dark:border-blue-950/50 dark:bg-blue-950/20">
			<div className="mb-2.5 flex items-center gap-1.5">
				<Spinner className="size-3 text-blue-600 dark:text-blue-400" />
				<p className="text-2xs font-semibold tracking-wide text-blue-700 uppercase dark:text-blue-300">
					{label}
				</p>
			</div>
			<div className="flex flex-col gap-2">
				{steps.map((step, index) => {
					const isActive = index === activeProcessingStepIndex;
					const isDone = index < activeProcessingStepIndex;
					return (
						<Marker
							key={`${step.label}-${index}`}
							role="status"
							className="gap-2.5 text-xs"
						>
							<MarkerIcon
								className={cn(
									'flex size-3.5 items-center justify-center rounded-full',
									isDone
										? 'bg-green-100 text-green-600 dark:bg-green-950/50 dark:text-green-400'
										: isActive
											? 'text-blue-600 dark:text-blue-400'
											: 'bg-muted text-muted-foreground/50',
								)}
							>
								{isDone ? (
									<Check className="size-2.5" strokeWidth={3} />
								) : isActive ? (
									<Spinner className="size-3.5" />
								) : (
									<span className="size-1 rounded-full bg-current" />
								)}
							</MarkerIcon>
							<MarkerContent
								className={cn(
									'transition-colors',
									isActive
										? 'shimmer font-medium text-foreground'
										: isDone
											? 'text-muted-foreground'
											: 'text-muted-foreground/60',
								)}
							>
								{step.label}
							</MarkerContent>
						</Marker>
					);
				})}
			</div>
		</div>
	);
}
