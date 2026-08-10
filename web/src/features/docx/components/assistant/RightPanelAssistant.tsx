'use client';

import type { KeyboardEvent } from 'react';

import type { AssistantChatMessage } from '@/types/document';

import { AssistantInputBox } from '@/features/docx/components/assistant/AssistantInputBox';
import { AssistantMessageList } from '@/features/docx/components/assistant/AssistantMessageList';

interface RightPanelAssistantProps {
	messages: AssistantChatMessage[];
	input: string;
	loading: boolean;
	error: string | null;
	entityHighlightsEnabled?: boolean;
	rewriteBusy?: boolean;
	onInputChange: (value: string) => void;
	onSubmit: () => void;
	onKeydown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
	onSuggestedQuestionClick: (question: string) => void;
	onFocusNodeFromPanel: (nodeId: string, emphasize?: boolean) => void;
	onToggleEntityHighlights?: () => void;
	onAcceptFixSuggestion?: (messageId: string) => void | Promise<void>;
	/** Initial quick questions (empty chat). */
	initialSuggestions?: string[];
	onInitialSuggestionClick?: (question: string) => void;
}

/**
 * Contract chat assistant panel: scrollable message list + bottom input box +
 * error display. Faithful port of the chat half of the Svelte
 * `RightPanelAssistant` component. The quick-action suggestions, entity-
 * highlight toggle, and fix-contradiction action card are intentionally
 * dropped/stubbed in this migration step.
 */
export function RightPanelAssistant({
	messages,
	input,
	loading,
	error,
	entityHighlightsEnabled = true,
	rewriteBusy = false,
	onInputChange,
	onSubmit,
	onKeydown,
	onSuggestedQuestionClick,
	onFocusNodeFromPanel,
	onToggleEntityHighlights,
	onAcceptFixSuggestion,
	initialSuggestions,
	onInitialSuggestionClick,
}: RightPanelAssistantProps) {
	return (
		<section className="flex min-h-0 flex-1 flex-col bg-card">
			<AssistantMessageList
				messages={messages}
				loading={loading}
				entityHighlightsEnabled={entityHighlightsEnabled}
				rewriteBusy={rewriteBusy}
				onSuggestedQuestionClick={onSuggestedQuestionClick}
				onFocusNodeFromPanel={onFocusNodeFromPanel}
				onToggleEntityHighlights={onToggleEntityHighlights}
				onAcceptFixSuggestion={onAcceptFixSuggestion}
			/>

			{error ? (
				<div className="border-t border-red-100 bg-red-50 px-3 py-1.5 text-2xs text-destructive">
					{error}
				</div>
			) : null}

			<AssistantInputBox
				input={input}
				loading={loading}
				onInputChange={onInputChange}
				onSubmit={onSubmit}
				onKeydown={onKeydown}
				suggestions={initialSuggestions}
				messagesEmpty={messages.length === 0}
				onSuggestionClick={onInitialSuggestionClick}
			/>
		</section>
	);
}

export type { RightPanelAssistantProps };
