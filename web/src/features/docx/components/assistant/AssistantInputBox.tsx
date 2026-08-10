'use client';

import type { KeyboardEvent } from 'react';
import { Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface AssistantInputBoxProps {
	input: string;
	loading: boolean;
	onInputChange: (value: string) => void;
	onSubmit: () => void;
	onKeydown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
	/** Initial quick questions (only when chat is empty and no text typed). */
	suggestions?: string[];
	messagesEmpty?: boolean;
	onSuggestionClick?: (question: string) => void;
}

/**
 * Chat input area: controlled textarea + send button + initial quick-action
 * suggestions. Port of the `form` block from the Svelte `RightPanelAssistant`.
 */
export function AssistantInputBox({
	input,
	loading,
	onInputChange,
	onSubmit,
	onKeydown,
	suggestions = [],
	messagesEmpty = false,
	onSuggestionClick,
}: AssistantInputBoxProps) {
	const showSuggestions =
		suggestions.length > 0 && messagesEmpty && input.trim().length === 0;

	return (
		<form
			className="bg-card p-2"
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
		>
			{showSuggestions ? (
				<div className="mb-2 flex flex-wrap justify-end gap-1.5">
					{suggestions.map((suggestion) => (
						<Button
							key={suggestion}
							type="button"
							variant="outline"
							size="sm"
							className="h-7 w-auto shrink-0 rounded-full border-blue-200 bg-blue-50/60 px-3 text-2xs text-blue-700 hover:bg-indigo-600 hover:text-white dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
							onClick={() => onSuggestionClick?.(suggestion)}
						>
							{suggestion}
						</Button>
					))}
				</div>
			) : null}

			<div className="mt-2 flex items-end gap-1.5">
				<Textarea
					rows={2}
					placeholder="Ask about this contract or paragraph…"
					className="min-h-[50px] rounded-lg text-2xs"
					value={input}
					onChange={(event) => onInputChange(event.target.value)}
					onKeyDown={onKeydown}
					disabled={loading}
				/>
				<Button
					type="submit"
					size="icon"
					disabled={loading}
					className="size-8 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
					aria-label="Send chat message"
					title="Send"
				>
					<Send className="size-3.5" />
				</Button>
			</div>
		</form>
	);
}
