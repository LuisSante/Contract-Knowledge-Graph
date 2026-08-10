'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle, Minus, Send, Square, Wand2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChatIcon } from '@/components/common/icons';
import type { AssistantChatMessage } from '@/types/document';

import { AssistantMessageList } from '@/features/docx/components/assistant/AssistantMessageList';

const CHAT_PANEL_COLLAPSED_HEIGHT = 46;
const CHAT_PANEL_OPEN_DEFAULT_HEIGHT = 250;
const CHAT_PANEL_OPEN_THRESHOLD = 47;

interface ContradictionChatPanelProps {
	messages: AssistantChatMessage[];
	input: string;
	loading: boolean;
	error: string | null;
	rewriteBusy: boolean;
	entityHighlightsEnabled: boolean;
	onInputChange: (value: string) => void;
	onSubmit: () => void;
	onKeydown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	onWhy: () => void;
	onRisks: () => void;
	onSuggestFix: () => void;
	onToggleEntityHighlights: () => void;
	onAcceptFixSuggestion: (messageId: string) => void | Promise<void>;
	onSuggestedQuestionClick: (question: string) => void;
	onFocusNodeFromPanel: (nodeId: string, emphasize?: boolean) => void;
}

/**
 * Chat embedded in Contradiction Analysis, anchored at the bottom and
 * resizable. Quick-actions bar always visible; when opened it shows the thread
 * (shared with the Contract Chat Assistant) and the textarea. Faithful port of
 * the chat block from the Svelte `RightPanelAnalysis`.
 */
export function ContradictionChatPanel({
	messages,
	input,
	loading,
	error,
	rewriteBusy,
	entityHighlightsEnabled,
	onInputChange,
	onSubmit,
	onKeydown,
	onWhy,
	onRisks,
	onSuggestFix,
	onToggleEntityHighlights,
	onAcceptFixSuggestion,
	onSuggestedQuestionClick,
	onFocusNodeFromPanel,
}: ContradictionChatPanelProps) {
	const [height, setHeight] = useState(CHAT_PANEL_COLLAPSED_HEIGHT);
	const [isResizing, setIsResizing] = useState(false);
	const resizeStartY = useRef(0);
	const resizeStartHeight = useRef(CHAT_PANEL_OPEN_DEFAULT_HEIGHT);

	const isOpen = height > CHAT_PANEL_OPEN_THRESHOLD;

	const resolveHalfOpenHeight = useCallback(() => {
		if (typeof window === 'undefined') return CHAT_PANEL_OPEN_DEFAULT_HEIGHT;
		return Math.max(CHAT_PANEL_OPEN_THRESHOLD + 1, Math.round(window.innerHeight * 0.5));
	}, []);

	const openPanel = useCallback(() => {
		setHeight((prev) => (prev > CHAT_PANEL_OPEN_THRESHOLD ? prev : resolveHalfOpenHeight()));
	}, [resolveHalfOpenHeight]);

	const togglePanel = () => {
		setHeight((prev) =>
			prev > CHAT_PANEL_OPEN_THRESHOLD ? CHAT_PANEL_COLLAPSED_HEIGHT : resolveHalfOpenHeight()
		);
	};

	// Resizing by dragging the top handle.
	useEffect(() => {
		if (!isResizing) return;
		const handleMove = (event: MouseEvent) => {
			const delta = resizeStartY.current - event.clientY;
			setHeight(Math.max(CHAT_PANEL_COLLAPSED_HEIGHT, Math.round(resizeStartHeight.current + delta)));
		};
		const handleUp = () => setIsResizing(false);
		window.addEventListener('mousemove', handleMove);
		window.addEventListener('mouseup', handleUp);
		return () => {
			window.removeEventListener('mousemove', handleMove);
			window.removeEventListener('mouseup', handleUp);
		};
	}, [isResizing]);

	const startResize = (event: React.MouseEvent) => {
		event.preventDefault();
		resizeStartY.current = event.clientY;
		resizeStartHeight.current = height;
		setIsResizing(true);
	};

	const runQuickAction = (action: () => void) => {
		openPanel();
		action();
	};

	return (
		<div
			className={`relative flex shrink-0 flex-col border-t border-border bg-card px-3 py-2 ${
				isResizing ? '' : 'transition-[height] duration-200 ease-out'
			}`}
			style={{ height, minHeight: CHAT_PANEL_COLLAPSED_HEIGHT }}
		>
			<button
				type="button"
				className={`absolute top-0 left-1/2 flex h-2.5 w-16 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize items-center justify-center rounded-full border transition ${
					isResizing
						? 'border-blue-300 bg-blue-50 dark:bg-blue-950/40'
						: 'border-border bg-card hover:border-blue-300 hover:bg-accent'
				}`}
				aria-label="Resize contradiction chat"
				title="Drag to resize chat area"
				onMouseDown={startResize}
			>
				<span className="h-0.5 w-6 rounded-full bg-muted-foreground/40" aria-hidden="true" />
			</button>

			<div className={`flex items-center gap-1.5 ${isOpen ? 'mb-2' : ''}`}>
				<span
					className="inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground"
					aria-hidden="true"
				>
					<ChatIcon className="h-3.5 w-3.5" strokeWidth={1.8} />
				</span>

				<Button
					variant="outline"
					size="sm"
					className="h-6 gap-1 rounded-full border-blue-200 bg-blue-50 px-2 text-2xs text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
					onClick={() => runQuickAction(onWhy)}
				>
					<HelpCircle className="size-3" />
					Why is it a contradiction?
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="h-6 gap-1 rounded-full border-amber-200 bg-amber-50 px-2 text-2xs text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
					onClick={() => runQuickAction(onRisks)}
				>
					<AlertTriangle className="size-3" />
					What are the risks?
				</Button>
				<Button
					size="sm"
					className="h-6 gap-1 rounded-full bg-indigo-600 px-2 text-2xs text-white hover:bg-indigo-700"
					disabled={rewriteBusy || loading}
					onClick={() => runQuickAction(onSuggestFix)}
				>
					<Wand2 className="size-3" />
					{rewriteBusy ? 'Preparing fix…' : 'Suggest fix'}
				</Button>

				<Button
					type="button"
					variant="outline"
					size="icon"
					className="ml-auto size-6 rounded-lg hover:border-blue-300 hover:bg-accent hover:text-blue-700"
					onClick={togglePanel}
					aria-label={isOpen ? 'Minimize contradiction chat' : 'Maximize contradiction chat'}
					title={isOpen ? 'Minimize contradiction chat' : 'Maximize contradiction chat'}
				>
					{isOpen ? <Minus className="size-3.5" /> : <Square className="size-3" />}
				</Button>
			</div>

			{isOpen ? (
				<>
					<div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-muted/30">
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
					</div>

					{error ? <p className="mt-1 text-2xs text-destructive">{error}</p> : null}

					<div className="mt-2 flex items-end gap-1.5">
						<Textarea
							rows={2}
							placeholder="Ask about this contradiction…"
							className="min-h-[50px] rounded-lg text-2xs"
							value={input}
							onChange={(event) => onInputChange(event.target.value)}
							onKeyDown={onKeydown}
							disabled={loading}
						/>
						<Button
							size="icon"
							className="size-8 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
							onClick={onSubmit}
							disabled={loading}
							aria-label="Send contradiction chat message"
							title="Send"
						>
							<Send className="size-3.5" />
						</Button>
					</div>
				</>
			) : null}
		</div>
	);
}
