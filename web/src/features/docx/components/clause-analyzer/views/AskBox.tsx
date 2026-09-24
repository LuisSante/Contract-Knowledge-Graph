'use client';

import { useState } from 'react';
import { Caps } from '@/features/docx/components/clause-analyzer/views/bits';

interface AskBoxProps {
	question: string;
	placeholder?: string;
	onAsk?: (question: string) => void;
}

/** Hands the question to the chat, which explains the risk and how to improve it. */
export function AskBox({ question, placeholder = 'Ask about this row…', onAsk }: AskBoxProps) {
	const [text, setText] = useState('');
	if (!onAsk) return null;
	return (
		<div className="space-y-2 rounded-xl border border-border bg-secondary p-3">
			<Caps>Chat — why it is risky and how to improve it</Caps>
			<button
				type="button"
				onClick={() => onAsk(question)}
				className="w-full rounded-lg border border-primary bg-card px-2.5 py-1.5 text-left text-xs font-medium text-accent-foreground hover:bg-accent"
			>
				{question}
			</button>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					const value = text.trim();
					if (!value) return;
					onAsk(value);
					setText('');
				}}
			>
				<input
					value={text}
					onChange={(event) => setText(event.target.value)}
					placeholder={placeholder}
					className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
				/>
			</form>
		</div>
	);
}
