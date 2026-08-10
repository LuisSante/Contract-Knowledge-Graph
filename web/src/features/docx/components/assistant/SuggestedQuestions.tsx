'use client';

import { Button } from '@/components/ui/button';

interface SuggestedQuestionsProps {
	questions: string[];
	onSuggestedQuestionClick: (question: string) => void;
}

/**
 * Suggested follow-up question chips rendered under an assistant message.
 * Ported from the `message.suggestedQuestions` block of the Svelte
 * `RightPanelAssistant` component.
 */
export function SuggestedQuestions({
	questions,
	onSuggestedQuestionClick,
}: SuggestedQuestionsProps) {
	if (!questions.length) return null;

	return (
		<div className="mt-2.5">
			<p className="mb-1.5 text-xs font-bold text-foreground">Suggested questions</p>
			<div className="flex flex-wrap gap-1.5">
				{questions.map((suggestedQuestion, index) => (
					<Button
						key={`${suggestedQuestion}-${index}`}
						variant="outline"
						size="xs"
						className="h-auto border-indigo-200 bg-indigo-50 px-2 py-1 text-2xs leading-snug whitespace-normal text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100 hover:text-indigo-800"
						onClick={() => onSuggestedQuestionClick(suggestedQuestion)}
					>
						{suggestedQuestion}
					</Button>
				))}
			</div>
		</div>
	);
}
