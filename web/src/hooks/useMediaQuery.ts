'use client';

import { useEffect, useState } from 'react';

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

export function useIsDesktop(): boolean {
	return useMediaQuery('(min-width: 1024px)', true);
}
