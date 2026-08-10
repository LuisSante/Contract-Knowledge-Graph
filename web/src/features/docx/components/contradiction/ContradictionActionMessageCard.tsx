'use client';

import { ContractChatAssistantIcon, UserIcon } from '@/components/common/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { shortReferenceLabel } from '@/features/docx/utils/text';
import type { AssistantChatMessage } from '@/types/document';

interface ContradictionActionMessageCardProps {
	message: AssistantChatMessage;
	rewriteBusy?: boolean;
	compact?: boolean;
	onFocusNodeFromPanel?: (nodeId: string, emphasize?: boolean) => void;
	onAcceptFixSuggestion?: (messageId: string) => void | Promise<void>;
}

/**
 * Contradiction chat action card: shows a structured fix suggestion (changes +
 * original vs rewrite + "Accept suggestion" button) or a free explanation with
 * its snippets. Faithful port of the Svelte `ContradictionActionMessageCard`
 * component.
 */
export function ContradictionActionMessageCard({
	message,
	rewriteBusy = false,
	compact = false,
	onFocusNodeFromPanel = () => {},
	onAcceptFixSuggestion = () => {},
}: ContradictionActionMessageCardProps) {
	const isUserMessage = message.role === 'user';
	const bubbleClass = isUserMessage
		? 'border border-blue-200 bg-blue-50 text-blue-900'
		: 'border border-border bg-card text-foreground';

	const fix = message.fixContradictionSuggestion;
	const free = message.freeContradictionExplanation;

	const body = (
		<div
			className={`rounded-lg leading-relaxed shadow-sm ${
				compact ? 'px-2 py-1 text-2xs' : 'px-2.5 py-2 text-2xs'
			} ${bubbleClass}`}
		>
			{fix ? (
				<div className="space-y-2">
					<div className="flex flex-wrap items-center justify-between gap-1">
						<div className="flex flex-wrap items-center gap-1">
							<span className="text-2xs font-bold text-foreground">
								Structured contradiction fix
							</span>
							<button
								type="button"
								className="docx-reference-chip"
								title={fix.paragraphId}
								onClick={() => onFocusNodeFromPanel(fix.paragraphId, true)}
							>
								{shortReferenceLabel(fix.paragraphId)}
							</button>
						</div>
						{fix.status === 'applied' ? (
							<Badge
								variant="outline"
								className="h-4 border-green-200 bg-green-50 px-1.5 text-2xs font-semibold text-green-700"
							>
								Applied
							</Badge>
						) : null}
					</div>
					{fix.reason ? <p className="text-2xs text-foreground">{fix.reason}</p> : null}
					<div className="rounded border border-border bg-muted/80 px-2 py-1.5">
						<p className="mb-1 text-2xs font-bold text-foreground">Changes needed</p>
						<ul className="space-y-1 text-2xs text-foreground">
							{fix.changeNotes.map((note, noteIndex) => (
								<li key={`${message.id}-fix-note-${noteIndex}`} className="leading-relaxed">
									• {note}
								</li>
							))}
						</ul>
					</div>
					<div className="overflow-hidden rounded border border-border bg-card">
						<div className="border-b border-border bg-red-50/40 px-2 py-1">
							<p className="text-2xs font-semibold text-destructive">Original Snippet</p>
							<p className="mt-0.5 text-2xs leading-relaxed text-foreground">
								{fix.rewriteResult.payload.originalSnippet}
							</p>
						</div>
						<div className="bg-green-50/40 px-2 py-1">
							<p className="text-2xs font-semibold text-green-700">Proposed Rewrite</p>
							<p className="mt-0.5 text-2xs leading-relaxed text-foreground">
								{fix.rewriteResult.payload.simplifiedSnippet}
							</p>
						</div>
					</div>
					<Button
						variant="outline"
						size="sm"
						className="h-7 border-green-200 bg-green-50 px-2 text-2xs font-semibold text-green-700 hover:border-green-300 hover:bg-green-100"
						disabled={rewriteBusy || fix.status === 'applied'}
						onClick={() => void onAcceptFixSuggestion(message.id)}
					>
						{fix.status === 'applied' ? 'Suggestion applied' : 'Accept suggestion'}
					</Button>
				</div>
			) : free ? (
				<div className="space-y-1.5">
					<div className="flex flex-wrap items-center gap-1">
						<span className="font-bold text-foreground">Free explanation for paragraph</span>
					</div>
					<p className="text-2xs text-foreground">{free.reason}</p>
					{free.snippetA && free.snippetB ? (
						<>
							<div className="space-y-1">
								<p className="text-2xs font-bold text-destructive">
									Snippet A ({free.snippetA.source}):
								</p>
								<p className="rounded border border-red-300 bg-red-100/70 px-2 py-1 text-2xs text-destructive">
									&quot;{free.snippetA.text}&quot;
								</p>
							</div>
							<div className="space-y-1">
								<p className="text-2xs font-bold text-yellow-700">
									Snippet B ({free.snippetB.source}):
								</p>
								<p className="rounded border border-yellow-300 bg-yellow-100/75 px-2 py-1 text-2xs text-yellow-900">
									&quot;{free.snippetB.text}&quot;
								</p>
							</div>
						</>
					) : free.fallbackEvidenceMessage ? (
						<p className="text-2xs text-muted-foreground">{free.fallbackEvidenceMessage}</p>
					) : null}
					<p className="text-2xs text-muted-foreground">{free.footerMessage}</p>
				</div>
			) : null}
		</div>
	);

	const icon = isUserMessage ? (
		<span className="mt-1 inline-flex shrink-0 items-center justify-center text-blue-600">
			<UserIcon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={1.9} />
			<span className="sr-only">You</span>
		</span>
	) : (
		<span className="mt-1 inline-flex shrink-0 items-center justify-center text-muted-foreground">
			<ContractChatAssistantIcon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={1.9} />
			<span className="sr-only">Assistant</span>
		</span>
	);

	return (
		<div className="inline-flex max-w-[92%] items-start gap-1.5">
			{isUserMessage ? (
				<>
					{body}
					{icon}
				</>
			) : (
				<>
					{icon}
					{body}
				</>
			)}
		</div>
	);
}
