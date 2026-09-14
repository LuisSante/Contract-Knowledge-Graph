'use client';

import { Fragment, type ReactNode } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ContractSummary, ContractSummaryParty } from '@/types/summary';
import type { ContractSummaryStatus } from '@/features/docx/hooks/useContractSummary';

/** `{{partyId|short text}}` — the model marks its own mentions, so nothing is matched by name. */
const MENTION = /\{\{([^|}]+)\|([^}]+)\}\}/g;

interface ContractAbstractProps {
	status: ContractSummaryStatus;
	summary: ContractSummary | null;
	onGenerate: (force?: boolean) => void;
	/** Seat colour of a party, or null for one that holds no seat. */
	colorOf: (partyId: string | null) => string | null;
	onSeatParty: (partyId: string) => void;
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
				style={color ? { color } : undefined}
			>
				{match[2]}
			</span>
		);
		cursor = at + match[0].length;
	}
	if (cursor < text.length) parts.push(text.slice(cursor));

	return (
		<p className="text-xs leading-relaxed text-foreground/85">
			{parts.map((part, index) => (
				<Fragment key={index}>{part}</Fragment>
			))}
		</p>
	);
}

function PartyLine({
	party,
	color,
	onSeat,
}: {
	party: ContractSummaryParty;
	color: string | null;
	onSeat: () => void;
}) {
	const seatable = party.partyId !== null;
	return (
		<li
			role={seatable ? 'button' : undefined}
			tabIndex={seatable ? 0 : undefined}
			onClick={seatable ? onSeat : undefined}
			title={seatable ? 'Seat this party for the comparison' : 'Not a party in the knowledge graph'}
			className={`flex gap-2 rounded-md px-2 py-1.5 text-left transition ${
				seatable ? 'cursor-pointer hover:bg-muted/60' : 'opacity-70'
			}`}
		>
			<span
				className="mt-1.5 inline-block size-2 shrink-0 rounded-full"
				style={{ backgroundColor: color ?? 'var(--color-muted-foreground)' }}
			/>
			<span className="min-w-0 flex-1">
				<span className="flex flex-wrap items-baseline gap-x-1.5">
					<span className="text-xs font-medium text-foreground">{party.name}</span>
					{party.role && <span className="text-2xs opacity-60">{party.role}</span>}
					{!seatable && <span className="text-2xs text-amber-600">not in the knowledge graph</span>}
				</span>
				{party.does && (
					<span className="mt-0.5 block text-2xs leading-snug text-muted-foreground">
						{party.does}
					</span>
				)}
			</span>
		</li>
	);
}

/** Same silhouette as the result, so the swap on arrival does not jump the layout. */
function AbstractSkeleton() {
	return (
		<div className="space-y-3">
			<Skeleton className="h-4 w-44" />
			<div className="space-y-1.5">
				<Skeleton className="h-2.5 w-full" />
				<Skeleton className="h-2.5 w-full" />
				<Skeleton className="h-2.5 w-4/5" />
			</div>
			<div className="space-y-2 pt-1">
				{[0, 1].map((row) => (
					<div key={row} className="flex gap-2">
						<Skeleton className="mt-1 size-2 shrink-0 rounded-full" />
						<div className="flex-1 space-y-1">
							<Skeleton className="h-2.5 w-40" />
							<Skeleton className="h-2.5 w-3/4" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export function ContractAbstract({
	status,
	summary,
	onGenerate,
	colorOf,
	onSeatParty,
}: ContractAbstractProps) {
	const body = () => {
		if (status === 'loading' || status === 'generating') return <AbstractSkeleton />;

		if (status === 'error') {
			return (
				<div className="flex flex-col items-center gap-2 py-2 text-center">
					<p className="text-xs text-destructive">Could not load the abstract.</p>
					<Button size="sm" variant="outline" onClick={() => onGenerate(false)}>
						Try again
					</Button>
				</div>
			);
		}

		if (status === 'missing' || !summary) {
			return (
				<div className="flex flex-col items-center gap-2.5 py-3 text-center">
					<p className="text-xs text-muted-foreground">
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
			<div className="space-y-2.5">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<h2 className="truncate text-sm font-semibold text-foreground">
							{summary.title || summary.documentName}
						</h2>
						{summary.contractType && (
							<span className="text-2xs uppercase tracking-wide text-muted-foreground">
								{summary.contractType}
							</span>
						)}
					</div>
					<button
						type="button"
						title="Generate the abstract again"
						onClick={() => onGenerate(true)}
						className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
					>
						<RefreshCw className="size-3.5" />
					</button>
				</div>

				{summary.summary && <Prose text={summary.summary} colorOf={colorOf} />}

				{summary.parties.length > 0 && (
					<ul className="space-y-0.5">
						{summary.parties.map((party) => (
							<PartyLine
								key={party.partyId ?? party.name}
								party={party}
								color={colorOf(party.partyId)}
								onSeat={() => party.partyId && onSeatParty(party.partyId)}
							/>
						))}
					</ul>
				)}
			</div>
		);
	};

	return (
		<div className="shrink-0 border-b border-border px-6 py-4">
			<div className="mx-auto w-full max-w-xl">{body()}</div>
		</div>
	);
}
