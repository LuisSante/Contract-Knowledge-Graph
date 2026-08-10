'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import { Message, MessageAvatar, MessageContent } from '@/components/ui/message';
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from '@/components/ui/message-scroller';
import { Spinner } from '@/components/ui/spinner';
import { ContractChatAssistantIcon } from '@/components/common/icons';
import { PanelEmptyState } from '@/features/docx/components/shell/PanelEmptyState';
import type { AssistantChatMessage } from '@/types/document';

import { AssistantMessage } from '@/features/docx/components/assistant/AssistantMessage';

interface AssistantMessageListProps {
	messages: AssistantChatMessage[];
	loading: boolean;
	onSuggestedQuestionClick: (question: string) => void;
	onFocusNodeFromPanel: (nodeId: string, emphasize?: boolean) => void;
	entityHighlightsEnabled?: boolean;
	rewriteBusy?: boolean;
	onToggleEntityHighlights?: () => void;
	onAcceptFixSuggestion?: (messageId: string) => void | Promise<void>;
}

/** Assistant "thinking" placeholder: a muted bubble with a shimmering status. */
function LoadingBubble() {
	return (
		<Message align="start">
			<MessageAvatar>
				<Avatar size="sm">
					<AvatarFallback className="text-muted-foreground">
						<ContractChatAssistantIcon className="h-3.5 w-3.5" strokeWidth={1.9} />
						<span className="sr-only">Assistant</span>
					</AvatarFallback>
				</Avatar>
			</MessageAvatar>
			<MessageContent>
				<Bubble variant="muted" align="start">
					<BubbleContent>
						<Marker role="status" className="w-auto text-xs">
							<MarkerIcon>
								<Spinner className="size-3.5" />
							</MarkerIcon>
							<MarkerContent className="shimmer">Reviewing the contract…</MarkerContent>
						</Marker>
					</BubbleContent>
				</Bubble>
			</MessageContent>
		</Message>
	);
}

/**
 * Scrollable list of chat messages plus the loading skeleton. Auto-scrolls to
 * the latest message via the shadcn message-scroller (autoScroll + last-anchor),
 * and exposes a "scroll to latest" button when the user scrolls up.
 */
export function AssistantMessageList({
	messages,
	loading,
	onSuggestedQuestionClick,
	onFocusNodeFromPanel,
	entityHighlightsEnabled = true,
	rewriteBusy = false,
	onToggleEntityHighlights,
	onAcceptFixSuggestion,
}: AssistantMessageListProps) {
	const lastIndex = messages.length - 1;

	return (
		<MessageScrollerProvider autoScroll defaultScrollPosition="end">
			<MessageScroller className="min-h-0 flex-1">
				<MessageScrollerViewport>
					<MessageScrollerContent className="flex min-h-full flex-col gap-3 p-2">
						{messages.length > 0 ? (
							<>
								<div className="rounded-md border border-blue-100 bg-blue-50/60 px-2 py-1 text-2xs text-blue-800">
									Tip: click an assistant message to toggle entity highlights.
								</div>
								<div className="rounded-md border border-indigo-100 bg-indigo-50/60 px-2 py-1 text-2xs text-indigo-800">
									Tip: hold <span className="font-semibold">Shift + Scroll</span> to bring
									related/evidence blocks closer.
								</div>
							</>
						) : null}

						{messages.length === 0 && !loading ? (
							<PanelEmptyState
								icon={<ContractChatAssistantIcon />}
								title="Ask about this contract"
								description="Type a question below, or pick a suggested one, to chat about the whole contract or the selected paragraph."
							/>
						) : null}

						{messages.map((message, index) => (
							<MessageScrollerItem
								key={message.id}
								messageId={message.id}
								scrollAnchor={!loading && index === lastIndex}
							>
								<AssistantMessage
									message={message}
									onSuggestedQuestionClick={onSuggestedQuestionClick}
									onFocusNodeFromPanel={onFocusNodeFromPanel}
									entityHighlightsEnabled={entityHighlightsEnabled}
									rewriteBusy={rewriteBusy}
									onToggleEntityHighlights={onToggleEntityHighlights}
									onAcceptFixSuggestion={onAcceptFixSuggestion}
								/>
							</MessageScrollerItem>
						))}

						{loading ? (
							<MessageScrollerItem scrollAnchor>
								<LoadingBubble />
							</MessageScrollerItem>
						) : null}
					</MessageScrollerContent>
				</MessageScrollerViewport>

				<MessageScrollerButton direction="end" />
			</MessageScroller>
		</MessageScrollerProvider>
	);
}
