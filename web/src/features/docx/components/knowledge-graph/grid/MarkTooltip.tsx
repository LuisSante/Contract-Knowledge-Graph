'use client';

import type { MarkKind } from '@/features/docx/utils/knowledge/statement-grid';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { KIND_COLORS, KIND_LABEL } from '@/features/docx/components/knowledge-graph/constants';

/** Where the pointer is, relative to the panel, plus what it is over. */
export interface HoverInfo {
	x: number;
	y: number;
	kind: MarkKind;
	detail: string;
	owner?: string;
}

/** Anchored to an invisible span the caller positions, so it follows the pointer. */
export function MarkTooltip({ hover }: { hover: HoverInfo | null }) {
	return (
		<TooltipProvider>
			<Tooltip open={hover !== null}>
				<TooltipTrigger asChild>
					<span
						aria-hidden
						className="pointer-events-none absolute size-0"
						style={{ left: hover?.x ?? 0, top: hover?.y ?? 0 }}
					/>
				</TooltipTrigger>
				{hover && (
					<TooltipContent
						side="top"
						sideOffset={12}
						className="max-w-[360px] border-l-4 px-3.5 py-2.5 shadow-lg"
						style={{ borderLeftColor: KIND_COLORS[hover.kind] }}
					>
						<span className="flex items-baseline gap-1.5 text-sm leading-snug">
							<span
								className="relative top-[-1px] inline-block size-2.5 shrink-0 self-center rounded-full"
								style={{ backgroundColor: KIND_COLORS[hover.kind] }}
							/>
							<span className="font-semibold">{KIND_LABEL[hover.kind]}</span>
							{hover.owner && <span className="min-w-0 opacity-80">— {hover.owner}</span>}
						</span>
						{hover.detail && (
							<span className="mt-1.5 block text-xs leading-relaxed opacity-90">
								{hover.detail}
							</span>
						)}
					</TooltipContent>
				)}
			</Tooltip>
		</TooltipProvider>
	);
}
