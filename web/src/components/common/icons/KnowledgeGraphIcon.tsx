import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	size?: number | string;
	strokeWidth?: number | string;
};

export function KnowledgeGraphIcon({
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
			fill="none"
			stroke={color}
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...rest}
		>
			<line x1="12" y1="12" x2="5" y2="5" />
			<line x1="12" y1="12" x2="19" y2="6" />
			<line x1="12" y1="12" x2="6" y2="19" />
			<line x1="12" y1="12" x2="18" y2="18" />
			<circle cx="12" cy="12" r="2.6" />
			<circle cx="5" cy="5" r="1.8" />
			<circle cx="19" cy="6" r="1.8" />
			<circle cx="6" cy="19" r="1.8" />
			<circle cx="18" cy="18" r="1.8" />
		</svg>
	);
}
