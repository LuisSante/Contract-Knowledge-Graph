import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

export function LightningBoltIcon({ className = 'h-6 w-6', ...rest }: IconProps) {
	return (
		<svg
			className={className}
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
			{...rest}
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="2"
				d="M13 10V3L4 14h7v7l9-11h-7z"
			/>
		</svg>
	);
}
