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
	onInputChange: (value: string) => void;
	onSubmit: () => void;
	onKeydown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
	onSuggestedQuestionClick: (question: string) => void;
	onFocusNodeFromPanel: (nodeId: string, emphasize?: boolean) => void;
	onToggleEntityHighlights?: () => void;
	initialSuggestions?: string[];
	onInitialSuggestionClick?: (question: string) => void;
}

export function RightPanelAssistant({
	messages,
	input,
	loading,
	error,
	entityHighlightsEnabled = true,
	onInputChange,
	onSubmit,
	onKeydown,
	onSuggestedQuestionClick,
	onFocusNodeFromPanel,
	onToggleEntityHighlights,
	initialSuggestions,
	onInitialSuggestionClick,
}: RightPanelAssistantProps) {
	return (
		<section className="flex min-h-0 flex-1 flex-col bg-card">
			<AssistantMessageList
				messages={messages}
				loading={loading}
				entityHighlightsEnabled={entityHighlightsEnabled}
				onSuggestedQuestionClick={onSuggestedQuestionClick}
				onFocusNodeFromPanel={onFocusNodeFromPanel}
				onToggleEntityHighlights={onToggleEntityHighlights}
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
