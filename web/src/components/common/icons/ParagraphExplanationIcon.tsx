import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
	size?: number | string;
	strokeWidth?: number | string;
};

export function ParagraphExplanationIcon({
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
			<path d="M8 3.5h8.5a2 2 0 0 1 2 2V14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
			<path d="M9.5 7.5h5.5M9.5 10.5h4" />
			<path d="M12.5 16v3.5l2.2-1.6h1.8a2 2 0 0 0 2-2V13.5" />
			<path d="M5.5 9.5H4a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h4l2 1.5V11.5a2 2 0 0 0-2-2Z" />
			<circle cx="5.7" cy="15" r="0.7" fill={color} stroke="none" />
			<circle cx="8.1" cy="15" r="0.7" fill={color} stroke="none" />
			<circle cx="10.5" cy="15" r="0.7" fill={color} stroke="none" />
		</svg>
	);
}
