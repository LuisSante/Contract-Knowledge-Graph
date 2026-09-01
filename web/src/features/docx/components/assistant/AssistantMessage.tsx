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
import { SuggestedQuestions } from '@/features/docx/components/assistant/SuggestedQuestions';

interface AssistantMessageProps {
	message: AssistantChatMessage;
	onSuggestedQuestionClick: (question: string) => void;
	onFocusNodeFromPanel: (nodeId: string, emphasize?: boolean) => void;
	entityHighlightsEnabled?: boolean;
	onToggleEntityHighlights?: () => void;
}

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

export function AssistantMessage({
	message,
	onSuggestedQuestionClick,
	onFocusNodeFromPanel,
	entityHighlightsEnabled = true,
	onToggleEntityHighlights = () => {},
}: AssistantMessageProps) {
	const isUser = message.role === 'user';
	const isAssistant = message.role === 'assistant';

	const align = isUser ? 'end' : 'start';

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
						{(() => {
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
						})()}

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
