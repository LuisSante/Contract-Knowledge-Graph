import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	size?: number | string;
	strokeWidth?: number | string;
};

export function SummarizeSimplifyIcon({
	className = 'h-4 w-4',
	strokeWidth = 1.8,
	color = 'currentColor',
	size = 24,
	...rest
}: IconProps) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			width={size}
			height={size}
			className={className}
			color={color}
			fill="none"
			stroke={color}
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...rest}
		>
			<path d="M3 6H21" />
			<path d="M6 12H18" />
			<path d="M9 18H15" />
		</svg>
	);
}
