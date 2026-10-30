'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The key app/layout.tsx's inline script reads before the first paint. */
const THEME_KEY = 'theme';
const SYSTEM_DARK = '(prefers-color-scheme: dark)';

function subscribe(onChange: () => void) {
	const root = document.documentElement;
	const observer = new MutationObserver(onChange);
	observer.observe(root, { attributes: true, attributeFilter: ['class'] });
	// With nothing saved the page keeps following the system, also when it changes while open.
	const media = matchMedia(SYSTEM_DARK);
	const follow = () => {
		try {
			if (!localStorage.getItem(THEME_KEY)) root.classList.toggle('dark', media.matches);
		} catch {
			root.classList.toggle('dark', media.matches);
		}
	};
	media.addEventListener('change', follow);
	return () => {
		observer.disconnect();
		media.removeEventListener('change', follow);
	};
}

const isDark = () => document.documentElement.classList.contains('dark');

/** Light or dark. The choice is saved; until the reader makes one, the system decides. */
export function ThemeToggle({ className }: { className?: string }) {
	// null on the server: the theme is only known once the inline script has run.
	const dark = useSyncExternalStore(subscribe, isDark, () => null);

	const toggle = () => {
		const next = !isDark();
		document.documentElement.classList.toggle('dark', next);
		try {
			localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
		} catch {
			// Private windows may refuse storage; the switch still holds for this page.
		}
	};

	return (
		<button
			type="button"
			onClick={toggle}
			aria-label="Dark theme"
			aria-pressed={dark ?? undefined}
			title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
			className={cn(
				'inline-flex size-8 flex-none items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
				className
			)}
		>
			{/* Drawn from the class, not from state, so the right icon shows before hydration. */}
			<Moon className="size-4 dark:hidden" aria-hidden />
			<Sun className="hidden size-4 dark:block" aria-hidden />
		</button>
	);
}
