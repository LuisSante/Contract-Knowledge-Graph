import type { Metadata } from 'next';
import { Public_Sans, Source_Serif_4 } from 'next/font/google';
import { Providers } from '@/app/providers';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LoadingOverlay } from '@/components/common/LoadingOverlay';
import '@/styles/globals.css';

/** The interface's face (Public Sans, a civic sans) and the one for what reads as legal text:
 * contract titles, clause names, parties (Source Serif 4, a book face). */
const sans = Public_Sans({ subsets: ['latin', 'latin-ext'], variable: '--font-public-sans' });
const serif = Source_Serif_4({ subsets: ['latin', 'latin-ext'], variable: '--font-source-serif' });

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
		<html
			lang="en"
			className={`h-full antialiased ${sans.variable} ${serif.variable}`}
			suppressHydrationWarning
		>
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
