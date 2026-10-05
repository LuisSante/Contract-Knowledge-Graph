'use client';

interface PartyManagerProps {
	hidden: Array<{ id: string; name: string }>;
	hasView: boolean;
	onUnhide: (id: string) => void;
	onReset: () => void;
}

export function PartyManager({ hidden, hasView, onUnhide, onReset }: PartyManagerProps) {
	// Nothing to undo is the usual case: rendering anyway leaves a bordered,
	// padded strip under the panel that says nothing.
	if (!hasView) return null;

	return (
		<div className="flex items-center gap-2 border-t border-border/60 px-3 py-1.5 text-2xs text-muted-foreground">
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
