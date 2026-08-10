'use client';

import { Fragment } from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Message, MessageAvatar, MessageContent } from '@/components/ui/message';
import { ContractChatAssistantIcon, UserIcon } from '@/components/common/icons';
import {
	shortReferenceLabel,
	splitReferenceAndEntityText,
	splitReferenceText,
	type ReferenceTextSegment,
} from '@/features/docx/utils/text';
import type { AssistantChatMessage } from '@/types/document';

import { CitationChips } from '@/features/docx/components/assistant/CitationChips';
import { ContradictionActionMessageCard } from '@/features/docx/components/contradiction/ContradictionActionMessageCard';
import { StructuredContradictionMessage } from '@/features/docx/components/contradiction/StructuredContradictionMessage';
import { SuggestedQuestions } from '@/features/docx/components/assistant/SuggestedQuestions';

interface AssistantMessageProps {
	message: AssistantChatMessage;
	onSuggestedQuestionClick: (question: string) => void;
	onFocusNodeFromPanel: (nodeId: string, emphasize?: boolean) => void;
	/** Whether message entities are highlighted (toggle on click). */
	entityHighlightsEnabled?: boolean;
	/** Rewrite in progress: disables the fix card button. */
	rewriteBusy?: boolean;
	onToggleEntityHighlights?: () => void;
	onAcceptFixSuggestion?: (messageId: string) => void | Promise<void>;
}

/**
 * Peels a leading "Paragraph"/"Párrafo" word off the assistant content so it can
 * be shown as a bold mini-header (matching the "Suggested questions" header),
 * while the rest of the text keeps its reference/entity chips.
 */
function splitLeadLabel(content: string): { label: string | null; rest: string } {
	const match = content.match(/^\s*(Paragraph|Párrafo)\b[ \t:]*/i);
	if (!match) return { label: null, rest: content };
	return { label: match[1], rest: content.slice(match[0].length) };
}

function renderSegments(
	segments: ReferenceTextSegment[],
	keyPrefix: string,
): React.ReactNode {
	return segments.map((segment, index) => {
		const key = `${keyPrefix}-${index}`;
		if (segment.isReference) {
			return (
				<span key={key} className="docx-reference-chip align-middle" title={segment.text}>
					{shortReferenceLabel(segment.text)}
				</span>
			);
		}
		if (segment.isEntity) {
			return (
				<span
					key={key}
					className="docx-paragraph-explanation-entity-token"
					data-entity-key={segment.entityKey}
					style={
						{
							'--entity-color': segment.entityColor ?? '#2563eb',
							'--entity-color-soft': segment.entitySoftColor ?? 'rgba(37,99,235,0.16)',
						} as React.CSSProperties
					}
				>
					{segment.text}
				</span>
			);
		}
		return <Fragment key={key}>{segment.text}</Fragment>;
	});
}

/**
 * A single chat message (user vs assistant). Ported from the message-rendering
 * block of the Svelte `RightPanelAssistant` component. The "fix contradiction"
 * action card is intentionally not ported in this migration step.
 */
export function AssistantMessage({
	message,
	onSuggestedQuestionClick,
	onFocusNodeFromPanel,
	entityHighlightsEnabled = true,
	rewriteBusy = false,
	onToggleEntityHighlights = () => {},
	onAcceptFixSuggestion = () => {},
}: AssistantMessageProps) {
	const isUser = message.role === 'user';
	const isAssistant = message.role === 'assistant';

	const align = isUser ? 'end' : 'start';

	// Avatar shared by every branch so user/assistant figures stay consistent.
	const avatar = (
		<MessageAvatar>
			<Avatar size="sm">
				<AvatarFallback className={isUser ? 'text-blue-600' : 'text-muted-foreground'}>
					{isUser ? (
						<UserIcon className="h-3.5 w-3.5" strokeWidth={1.9} />
					) : (
						<ContractChatAssistantIcon className="h-3.5 w-3.5" strokeWidth={1.9} />
					)}
					<span className="sr-only">{isUser ? 'You' : 'Assistant'}</span>
				</AvatarFallback>
			</Avatar>
		</MessageAvatar>
	);

	// Contradiction actions (structured fix / free explanation) keep their own
	// card, but ride inside the shared Message/avatar layout.
	if (message.fixContradictionSuggestion || message.freeContradictionExplanation) {
		return (
			<Message align={align}>
				{avatar}
				<MessageContent>
					<ContradictionActionMessageCard
						message={message}
						rewriteBusy={rewriteBusy}
						onFocusNodeFromPanel={onFocusNodeFromPanel}
						onAcceptFixSuggestion={onAcceptFixSuggestion}
					/>
				</MessageContent>
			</Message>
		);
	}

	const entities = message.entityHighlights ?? [];
	const canToggleEntities = isAssistant && entities.length > 0;

	return (
		<Message align={align}>
			{avatar}
			<MessageContent>
				<Bubble
					variant={isUser ? 'default' : 'muted'}
					align={align}
					className={isAssistant ? 'max-w-[94%]' : undefined}
				>
					<BubbleContent
						className={`text-xs ${canToggleEntities ? 'cursor-pointer' : ''}`}
						onClick={canToggleEntities ? () => onToggleEntityHighlights() : undefined}
					>
						{isAssistant && message.structuredContradiction ? (
							<StructuredContradictionMessage
								messageContent={message.content}
								structuredContradiction={message.structuredContradiction}
							/>
						) : (
							(() => {
								const { label, rest } = isAssistant
									? splitLeadLabel(message.content)
									: { label: null, rest: message.content };
								return (
									<>
										{label ? (
											<p className="mb-1 text-xs font-bold text-foreground">{label}</p>
										) : null}
										<p className="leading-5 whitespace-pre-wrap">
											{renderSegments(
												entityHighlightsEnabled && entities.length
													? splitReferenceAndEntityText(rest, entities)
													: splitReferenceText(rest),
												`${message.id}-content`,
											)}
										</p>
									</>
								);
							})()
						)}

						{message.suggestedQuestions?.length ? (
							<SuggestedQuestions
								questions={message.suggestedQuestions}
								onSuggestedQuestionClick={onSuggestedQuestionClick}
							/>
						) : null}

						{message.citations?.length ? (
							<CitationChips
								citations={message.citations}
								onFocusNodeFromPanel={onFocusNodeFromPanel}
							/>
						) : null}
					</BubbleContent>
				</Bubble>
			</MessageContent>
		</Message>
	);
}
