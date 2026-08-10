import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	size?: number | string;
	strokeWidth?: number | string;
};

export function CloseIcon({
	className = 'h-4 w-4',
	strokeWidth = 2,
	color = 'currentColor',
	size = 24,
	...rest
}: IconProps) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			width={size}
			height={size}
			className={className}
			stroke={color}
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...rest}
		>
			<path d="M6 6l12 12M18 6 6 18" />
		</svg>
	);
}
