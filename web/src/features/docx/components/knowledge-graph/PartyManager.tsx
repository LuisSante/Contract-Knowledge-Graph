'use client';

interface PartyManagerProps {
	hidden: Array<{ id: string; name: string }>;
	/** A merge group or a hidden party exists — show Reset. */
	hasView: boolean;
	hintsLoading: boolean;
	onUnhide: (id: string) => void;
	onReset: () => void;
}

/**
 * Slim footer for the parties view: how to select, plus the list of hidden
 * parties (which aren't in the graph to click, so they get restore chips here).
 * Merge/split/delete live in the header menu, driven by the graph selection.
 */
export function PartyManager({ hidden, hasView, hintsLoading, onUnhide, onReset }: PartyManagerProps) {
	return (
		<div className="flex items-center gap-2 border-t border-border/60 px-3 py-1.5 text-2xs text-muted-foreground">
			{hintsLoading && <span className="text-foreground/40">loading hints…</span>}

			{hidden.length > 0 && (
				<span className="flex flex-wrap items-center gap-1">
					<span className="font-medium text-foreground/50">Hidden:</span>
					{hidden.map((h) => (
						<button
							key={h.id}
							type="button"
							onClick={() => onUnhide(h.id)}
							className="rounded border border-border px-1.5 py-0.5 text-foreground/70 hover:bg-muted"
							title="Restore this party"
						>
							{h.name} ↺
						</button>
					))}
				</span>
			)}

			{hasView && (
				<button
					type="button"
					onClick={onReset}
					className="ml-auto rounded border border-border px-2 py-0.5 hover:bg-muted"
				>
					Reset
				</button>
			)}
		</div>
	);
}
