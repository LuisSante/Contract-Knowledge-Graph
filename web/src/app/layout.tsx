import type { Metadata } from 'next';
import { Providers } from '@/app/providers';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LoadingOverlay } from '@/components/common/LoadingOverlay';
import '@/styles/globals.css';

export const metadata: Metadata = {
	title: 'Contradiction Explorer',
	description: 'ContraVis — explorador de contradicciones en contratos legales.',
	icons: { icon: '/legal.svg' },
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className="h-full antialiased">
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
