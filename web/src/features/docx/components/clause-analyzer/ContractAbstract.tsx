'use client';

import { Fragment, type ReactNode } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ContractSummary } from '@/types/summary';
import type { ContractSummaryStatus } from '@/features/docx/hooks/useContractSummary';
import { textColorOf } from '@/features/docx/components/clause-analyzer/constants';

/** `{{partyId|short text}}` — the model marks its own mentions. PartyEntry checks each id against
 *  the abstract's own name for it, since a stored abstract may carry another run's ids. */
const MENTION = /\{\{([^|}]+)\|([^}]+)\}\}/g;

interface ContractAbstractProps {
	status: ContractSummaryStatus;
	summary: ContractSummary | null;
	onGenerate: (force?: boolean) => void;
	/** Seat colour of a party, or null for one that holds no seat. */
	colorOf: (partyId: string | null) => string | null;
}

function Prose({ text, colorOf }: { text: string; colorOf: (id: string | null) => string | null }) {
	const parts: ReactNode[] = [];
	let cursor = 0;

	for (const match of text.matchAll(MENTION)) {
		const at = match.index ?? 0;
		if (at > cursor) parts.push(text.slice(cursor, at));
		const color = colorOf(match[1]);
		parts.push(
			<span
				key={`${at}-${match[1]}`}
				className="font-semibold"
				style={color ? { color: textColorOf(color) } : undefined}
			>
				{match[2]}
			</span>
		);
		cursor = at + match[0].length;
	}
	if (cursor < text.length) parts.push(text.slice(cursor));

	return (
		<p className="text-base leading-7 text-foreground/85">
			{parts.map((part, index) => (
				<Fragment key={index}>{part}</Fragment>
			))}
		</p>
	);
}

/** Same silhouette as the result, so the swap on arrival does not jump the layout. */
function AbstractSkeleton() {
	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Skeleton className="h-6 w-3/4" />
				<Skeleton className="h-4 w-40" />
			</div>
			<div className="space-y-2">
				<Skeleton className="h-3.5 w-full" />
				<Skeleton className="h-3.5 w-full" />
				<Skeleton className="h-3.5 w-4/5" />
			</div>
		</div>
	);
}

export function ContractAbstract({ status, summary, onGenerate, colorOf }: ContractAbstractProps) {
	const body = () => {
		if (status === 'loading' || status === 'generating') return <AbstractSkeleton />;

		if (status === 'error') {
			return (
				<div className="flex flex-col items-center gap-2 py-2 text-center">
					<p className="text-sm text-destructive">Could not load the abstract.</p>
					<Button size="sm" variant="outline" onClick={() => onGenerate(false)}>
						Try again
					</Button>
				</div>
			);
		}

		if (status === 'missing' || !summary) {
			return (
				<div className="flex flex-col items-center gap-2.5 py-3 text-center">
					<p className="text-sm text-muted-foreground">
						This contract has no abstract yet — one call reads it and writes the five-line version.
					</p>
					<Button size="sm" onClick={() => onGenerate(false)}>
						<Sparkles className="size-3.5" />
						Summarize contract
					</Button>
				</div>
			);
		}

		return (
			// The parties are not listed here: the cards below carry each one's role and part.
			<div className="space-y-3">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 space-y-2">
						<h2 className="text-2xl leading-8 font-bold text-foreground">
							{summary.title || summary.documentName}
						</h2>
						{summary.contractType && (
							<span className="inline-block rounded bg-muted px-2 py-0.5 text-xs font-medium text-foreground/80">
								{summary.contractType}
							</span>
						)}
					</div>
					<button
						type="button"
						title="Generate the abstract again"
						onClick={() => onGenerate(true)}
						className="mt-1 shrink-0 rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
					>
						<RefreshCw className="size-4" />
					</button>
				</div>

				{summary.summary && <Prose text={summary.summary} colorOf={colorOf} />}
			</div>
		);
	};

	return <section>{body()}</section>;
}
