import type { Metadata } from 'next';
import { Providers } from '@/app/providers';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LoadingOverlay } from '@/components/common/LoadingOverlay';
import '@/styles/globals.css';

export const metadata: Metadata = {
	title: 'Clause Explorer',
	description: 'Which clauses weigh on which party, and the words that prove it.',
	icons: { icon: '/legal.svg' },
};

/**
 * The reader's saved theme (ThemeToggle writes `theme` to localStorage), or the system's when
 * there is none, applied before anything paints so a dark page never flashes white.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		// The inline script below sets `dark` on <html> before the first paint, so the server's
		// class list and the DOM differ on purpose.
		<html lang="en" className="h-full antialiased" suppressHydrationWarning>
			<head>
				<script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
			</head>
			<body className="min-h-full">
				<Providers>
					<TooltipProvider>
						<LoadingOverlay />
						{children}
					</TooltipProvider>
				</Providers>
			</body>
		</html>
	);
}
