'use client';

import { useEffect, useState } from 'react';

/**
 * SSR-safe media query hook. Returns `defaultValue` during server render and the
 * first client paint (so markup matches and hydration doesn't mismatch), then
 * reconciles to the real match after mount and stays in sync with viewport changes.
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
	const [matches, setMatches] = useState(defaultValue);

	useEffect(() => {
		const mql = window.matchMedia(query);
		const sync = () => setMatches(mql.matches);
		sync();
		mql.addEventListener('change', sync);
		return () => mql.removeEventListener('change', sync);
	}, [query]);

	return matches;
}

/**
 * True at the `lg` breakpoint and up (≥1024px), where the docx viewer shows its
 * three-zone layout (document + side panel + tool rail). Below it, the panel
 * collapses to an overlay sheet. Defaults to `true` so SSR renders the desktop
 * layout; narrow viewports reconcile after mount.
 */
export function useIsDesktop(): boolean {
	return useMediaQuery('(min-width: 1024px)', true);
}
