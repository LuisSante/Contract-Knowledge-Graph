'use client';

import { useMemo, useState, type CSSProperties } from 'react';

import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
	CONTRADICTION_CLAIM_SIDE_COLORS,
	CONTRADICTION_TAXONOMY_COLORS,
	CONTRADICTION_TAXONOMY_LABELS,
	CONTRADICTION_TAXONOMY_ORDER,
} from '@/constants/docx-viewer';
import { buildChatHighlightSegments } from '@/features/docx/utils/contradiction/chat-highlights';
import type {
	ChatHighlightSegment,
	ContradictionTaxonomyType,
	StructuredContradictionAnalysis,
} from '@/types/document';

type ChatPreviewTab = 'contradiction' | 'claims';

type ChatHighlightTooltip = {
	kind: 'claim' | 'highlight';
	badgeText: string;
	badgeStyle: CSSProperties;
	description?: string;
};

type ChatPreviewHoverState = {
	segmentKey: string;
	contradictionId: string;
	claimSide: 'a' | 'b' | null;
	kind: 'claim' | 'highlight';
};

const CONTRADICTION_TAXONOMY_DESCRIPTIONS: Readonly<
	Record<ContradictionTaxonomyType, string>
> = {
	temporal: 'The claims conflict on timing, dates, or sequence of events.',
	numerical:
		'The claims conflict on numbers, amounts, percentages, or quantities.',
	authority:
		'The claims conflict on who has authority or who issues the statement.',
	process: 'The claims conflict on operational steps, method, or procedure.',
	policy_reversal:
		'One claim allows or affirms something and the other directly prohibits or negates it.',
	specificity: 'One claim is broader while the other is narrower in scope.',
};

function toNonEmptyString(raw: unknown): string {
	if (typeof raw === 'string') return raw.trim();
	if (typeof raw === 'number' || typeof raw === 'boolean')
		return String(raw).trim();
	return '';
}

export interface StructuredContradictionMessageProps {
	messageContent: string;
	structuredContradiction: StructuredContradictionAnalysis;
}

export function StructuredContradictionMessage({
	messageContent,
	structuredContradiction,
}: StructuredContradictionMessageProps) {
	const [chatPreviewTab, setChatPreviewTab] =
		useState<ChatPreviewTab>('contradiction');
	const [chatPreviewHover, setChatPreviewHover] =
		useState<ChatPreviewHoverState | null>(null);

	const chatSegments = useMemo(
		() => buildChatHighlightSegments(structuredContradiction),
		[structuredContradiction],
	);

	const clearChatPreviewHover = () => setChatPreviewHover(null);

	const handleTabChange = (value: string) => {
		const nextTab: ChatPreviewTab = value === 'claims' ? 'claims' : 'contradiction';
		if (chatPreviewTab === nextTab) return;
		setChatPreviewTab(nextTab);
		if (nextTab !== 'contradiction') clearChatPreviewHover();
	};

	const handleSegmentMouseEnter = (
		segment: ChatHighlightSegment,
		segmentKey: string,
	) => {
		const contradictionId = toNonEmptyString(segment.claimId);
		if (!contradictionId) {
			clearChatPreviewHover();
			return;
		}
		if (segment.claimSide) {
			setChatPreviewHover({
				segmentKey,
				contradictionId,
				claimSide: segment.claimSide,
				kind: 'claim',
			});
			return;
		}
		if (segment.category) {
			setChatPreviewHover({
				segmentKey,
				contradictionId,
				claimSide: segment.claimSide ?? null,
				kind: 'highlight',
			});
		}
	};

	const isTooltipOpen = (segmentKey: string): boolean =>
		chatPreviewHover?.segmentKey === segmentKey;

	const isHoveringContradiction = (contradictionId?: string): boolean => {
		if (!chatPreviewHover || !contradictionId) return false;
		return (
			chatPreviewHover.contradictionId.toLowerCase() ===
			contradictionId.toLowerCase()
		);
	};

	const resolveHighlightStyle = (
		segment: ChatHighlightSegment,
	): CSSProperties => {
		const hoverMatchesContradiction = isHoveringContradiction(segment.claimId);

		if (chatPreviewHover?.kind === 'claim' && chatPreviewHover.claimSide) {
			const claimColor = CONTRADICTION_CLAIM_SIDE_COLORS[chatPreviewHover.claimSide];

			if (segment.claimSide === chatPreviewHover.claimSide) {
				return {
					background: `${claimColor}3a`,
					borderBottom: `2px solid ${claimColor}`,
					boxShadow: `0 0 0 1px ${claimColor}70, 0 0 10px ${claimColor}3d`,
				};
			}
			if (!segment.claimSide && hoverMatchesContradiction) {
				return {
					background: `${claimColor}36`,
					borderBottom: `2px solid ${claimColor}`,
					boxShadow: `inset 0 0 0 1px ${claimColor}55`,
				};
			}
			if (segment.category) {
				return {
					background: 'transparent',
					borderBottom: '1.5px solid transparent',
					boxShadow: 'none',
				};
			}
			return {};
		}

		if (
			chatPreviewHover?.kind === 'highlight' &&
			hoverMatchesContradiction &&
			segment.category
		) {
			const contradictionType = segment.contradictionType || segment.category;
			const color = CONTRADICTION_TAXONOMY_COLORS[contradictionType];
			return {
				background: `${color}3a`,
				borderBottom: `2px solid ${color}`,
				boxShadow: `0 0 0 1px ${color}70, 0 0 12px ${color}55`,
			};
		}

		if (segment.category) {
			const color = CONTRADICTION_TAXONOMY_COLORS[segment.category];
			return {
				background: `${color}22`,
				borderBottom: `1.5px solid ${color}`,
			};
		}

		return {};
	};

	const resolveClaimStyle = (segment: ChatHighlightSegment): CSSProperties => {
		if (!segment.claimSide) return {};
		const color = CONTRADICTION_CLAIM_SIDE_COLORS[segment.claimSide];
		return {
			background: `${color}26`,
			borderBottom: `1.5px solid ${color}`,
			boxShadow: `inset 0 0 0 1px ${color}45`,
		};
	};

	const resolveTooltip = (
		segment: ChatHighlightSegment,
	): ChatHighlightTooltip | null => {
		if (segment.category) {
			const contradictionType = segment.contradictionType || segment.category;
			const color = CONTRADICTION_TAXONOMY_COLORS[contradictionType];
			const typeLabel = CONTRADICTION_TAXONOMY_LABELS[contradictionType];
			return {
				kind: 'highlight',
				badgeText: typeLabel,
				badgeStyle: {
					borderColor: `${color}55`,
					background: `${color}1f`,
					color,
				},
				description:
					segment.contradictionWhy ||
					CONTRADICTION_TAXONOMY_DESCRIPTIONS[contradictionType],
			};
		}

		if (segment.claimSide) {
			const claimLabel = segment.claimSide === 'a' ? 'Snippet A' : 'Snippet B';
			const color = CONTRADICTION_CLAIM_SIDE_COLORS[segment.claimSide];
			return {
				kind: 'claim',
				badgeText: claimLabel,
				badgeStyle: {
					borderColor: `${color}55`,
					background: `${color}1f`,
					color,
				},
			};
		}

		return null;
	};

	if (!structuredContradiction?.highlight_source_text?.trim()) {
		return (
			<div className="space-y-2">
				<p className="whitespace-pre-wrap">{messageContent}</p>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<p className="whitespace-pre-wrap">{messageContent}</p>

			<div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/65 to-sky-50/35 px-2.5 py-2.5 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.45)]">
				<Tabs value={chatPreviewTab} onValueChange={handleTabChange} className="gap-1.5">
					<TabsList className="h-6 w-full border border-border bg-card p-[2px]">
						<TabsTrigger value="contradiction" className="text-2xs font-semibold">
							Contradiction
						</TabsTrigger>
						<TabsTrigger value="claims" className="text-2xs font-semibold">
							Snippet
						</TabsTrigger>
					</TabsList>

					<TabsContent value="contradiction" className="text-2xs">
						<p
							className="leading-relaxed break-words whitespace-normal text-foreground"
							onMouseLeave={clearChatPreviewHover}
						>
							{chatSegments.map((segment, segmentIndex) => {
								if (!segment.interactive) {
									return <span key={segmentIndex}>{segment.text}</span>;
								}
								const tooltipData = resolveTooltip(segment);
								const segmentKey = `segment:${segmentIndex}`;
								if (tooltipData) {
									return (
										<Tooltip
											key={segmentIndex}
											open={isTooltipOpen(segmentKey)}
											onOpenChange={(open) => {
												if (open) {
													handleSegmentMouseEnter(segment, segmentKey);
													return;
												}
												if (isTooltipOpen(segmentKey)) clearChatPreviewHover();
											}}
										>
											<TooltipTrigger asChild>
												<span
													className="inline bg-transparent p-0 text-left align-baseline leading-[inherit] whitespace-normal text-inherit transition-[background-color,border-color,box-shadow,color] duration-150 ease-out hover:cursor-help focus-visible:outline-none"
													onMouseEnter={() =>
														handleSegmentMouseEnter(segment, segmentKey)
													}
													onMouseLeave={clearChatPreviewHover}
													onFocus={() =>
														handleSegmentMouseEnter(segment, segmentKey)
													}
													onBlur={clearChatPreviewHover}
												>
													<span
														className="inline rounded-[3px] px-[2px] py-[1px]"
														style={resolveHighlightStyle(segment)}
													>
														{segment.text}
													</span>
												</span>
											</TooltipTrigger>
											<TooltipContent
												side="top"
												sideOffset={6}
												className="max-w-[290px] border border-border bg-card px-2 py-1.5 text-foreground shadow-md"
											>
												<div className="space-y-1">
													<Badge
														variant="outline"
														className="h-4 px-1.5 text-2xs font-semibold"
														style={tooltipData.badgeStyle}
													>
														{tooltipData.badgeText}
													</Badge>
													{tooltipData.description ? (
														<p className="text-2xs leading-relaxed text-muted-foreground">
															{tooltipData.description}
														</p>
													) : null}
												</div>
											</TooltipContent>
										</Tooltip>
									);
								}
								return (
									<button
										key={segmentIndex}
										type="button"
										className="inline appearance-none rounded-sm border-0 bg-transparent px-[2px] py-[1px] text-left align-baseline leading-[inherit] whitespace-normal text-inherit"
										style={resolveHighlightStyle(segment)}
										onMouseEnter={() =>
											handleSegmentMouseEnter(segment, segmentKey)
										}
										onMouseLeave={clearChatPreviewHover}
									>
										{segment.text}
									</button>
								);
							})}
						</p>

						<div className="mt-2 flex flex-wrap gap-2">
							{CONTRADICTION_TAXONOMY_ORDER.map((category) => (
								<Badge
									key={category}
									variant="outline"
									className="h-4 items-center gap-1 border-border bg-card px-1.5 text-2xs text-muted-foreground"
								>
									<span
										className="inline-flex h-2 w-2 rounded-full"
										style={{ background: CONTRADICTION_TAXONOMY_COLORS[category] }}
									/>
									{CONTRADICTION_TAXONOMY_LABELS[category]}
								</Badge>
							))}
						</div>
					</TabsContent>

					<TabsContent value="claims" className="text-2xs">
						<p className="leading-relaxed break-words whitespace-normal text-foreground">
							{chatSegments.map((segment, segmentIndex) =>
								segment.claimSide ? (
									<span
										key={segmentIndex}
										className="inline rounded-[3px] px-[2px] py-[1px]"
										style={resolveClaimStyle(segment)}
									>
										{segment.text}
									</span>
								) : (
									<span key={segmentIndex}>{segment.text}</span>
								),
							)}
						</p>

						<div className="mt-2 flex flex-wrap gap-1.5">
							<Badge
								variant="outline"
								className="h-4 items-center gap-1 px-1.5 text-2xs font-semibold"
								style={{
									borderColor: `${CONTRADICTION_CLAIM_SIDE_COLORS.a}55`,
									background: `${CONTRADICTION_CLAIM_SIDE_COLORS.a}14`,
									color: CONTRADICTION_CLAIM_SIDE_COLORS.a,
								}}
							>
								<span
									className="inline-flex h-2 w-2 rounded-full"
									style={{ background: CONTRADICTION_CLAIM_SIDE_COLORS.a }}
								/>
								Snippet A
							</Badge>
							<Badge
								variant="outline"
								className="h-4 items-center gap-1 px-1.5 text-2xs font-semibold"
								style={{
									borderColor: `${CONTRADICTION_CLAIM_SIDE_COLORS.b}55`,
									background: `${CONTRADICTION_CLAIM_SIDE_COLORS.b}14`,
									color: CONTRADICTION_CLAIM_SIDE_COLORS.b,
								}}
							>
								<span
									className="inline-flex h-2 w-2 rounded-full"
									style={{ background: CONTRADICTION_CLAIM_SIDE_COLORS.b }}
								/>
								Snippet B
							</Badge>
						</div>
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}

export default StructuredContradictionMessage;
