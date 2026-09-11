import {
	PAIR_SECOND_COLOR,
	PARTY_COLOR,
} from '@/features/docx/components/knowledge-graph/constants';

/** Diverging from the centre; each half is that party's own 0–100%. */
export function ShareBar({ share }: { share: { a: number; b: number } }) {
	const pctA = Math.round(share.a * 100);
	return (
		<span className="mt-0.5 flex items-center gap-1">
			<span className="relative flex h-[4px] min-w-0 flex-1 items-center">
				<span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
				<span className="absolute left-1/2 h-full w-px -translate-x-1/2 bg-border/80" />
				<span
					className="absolute top-0 h-full rounded-l-full"
					style={{ right: '50%', width: `${share.a * 50}%`, backgroundColor: PARTY_COLOR }}
				/>
				<span
					className="absolute top-0 h-full rounded-r-full"
					style={{ left: '50%', width: `${share.b * 50}%`, backgroundColor: PAIR_SECOND_COLOR }}
				/>
			</span>
			<span className="w-14 shrink-0 text-right text-[9px] leading-none tabular-nums">
				<span style={{ color: PARTY_COLOR }}>{pctA}%</span>
				<span className="opacity-40">/</span>
				<span style={{ color: PAIR_SECOND_COLOR }}>{100 - pctA}%</span>
			</span>
		</span>
	);
}
