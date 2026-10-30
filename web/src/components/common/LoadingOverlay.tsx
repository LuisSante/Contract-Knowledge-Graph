'use client';

import { useDocumentStore } from '@/stores/document';

/**
 * Floating loading indicator (replaces the `transition:fade` overlay from the
 * old `+layout.svelte`). Shown while `loading` is active in the store.
 */
export function LoadingOverlay() {
	const loading = useDocumentStore((state) => state.loading);

	// The live region stays mounted so screen readers announce the text when it
	// appears; only its content toggles.
	return (
		<div className="pointer-events-none fixed top-4 right-4 z-50" role="status" aria-live="polite">
			{loading && (
				<div className="flex animate-in fade-in items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-xl ring-1 ring-black/5 motion-reduce:animate-none">
					<div
						aria-hidden="true"
						className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent motion-reduce:animate-none"
					/>
					Loading…
				</div>
			)}
		</div>
	);
}
