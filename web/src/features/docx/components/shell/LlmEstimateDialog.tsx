'use client';

import { Button } from '@/components/ui/button';
import type { LlmEstimateResponse } from '@/types/document';

interface LlmEstimateDialogProps {
	estimate: LlmEstimateResponse | null;
	isOpen: boolean;
	onResolve: (approved: boolean) => void;
}

export function LlmEstimateDialog({ estimate, isOpen, onResolve }: LlmEstimateDialogProps) {
	if (!isOpen || !estimate) return null;

	return (
		<div className="pointer-events-none fixed right-5 bottom-5 z-[120]">
			<div className="pointer-events-auto w-[min(92vw,420px)] rounded-xl border border-blue-100 bg-card/98 p-4 shadow-[0_14px_34px_rgba(30,64,175,0.2)] backdrop-blur dark:border-border dark:shadow-[0_14px_34px_rgba(0,0,0,0.55)]">
				<p className="text-sm font-semibold text-slate-900 dark:text-foreground">
					Confirm LLM request
				</p>
				<p className="mt-1 text-xs text-slate-600 dark:text-muted-foreground">
					Estimated cost:{' '}
					<span className="font-semibold text-blue-700 dark:text-primary">
						{estimate.estimatedCostUsdFormatted}
					</span>{' '}
					({estimate.estimatedTotalTokens} tokens)
				</p>
				<p className="mt-1 text-2xs text-slate-500 dark:text-muted-foreground">
					{estimate.provider} · {estimate.model}
				</p>
				<div className="mt-3 flex items-center justify-end gap-2">
					<Button
						variant="outline"
						size="sm"
						className="border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-input dark:text-primary dark:hover:bg-accent"
						onClick={() => onResolve(false)}
					>
						Cancel
					</Button>
					<Button
						size="sm"
						className="bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
						onClick={() => onResolve(true)}
					>
						Send
					</Button>
				</div>
			</div>
		</div>
	);
}
