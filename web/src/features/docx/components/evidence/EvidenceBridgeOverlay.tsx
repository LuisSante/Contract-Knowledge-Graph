'use client';

import type { PointerEvent, ReactNode } from 'react';
import type { EvidenceBridge } from '@/features/docx/utils/evidence/evidence-bridge';

/** Room the label needs left of the margin line. */
const LABEL_ROOM_PX = 88;
/** Least vertical room between two link labels, so they never overlap. */
const LABEL_GAP_PX = 22;

/** Says why the selected paragraph is linked to some of the others («modified by §7»). */
export interface LinkLabel {
	key: string;
	/** The linked paragraphs it speaks for. */
	paragraphIds: string[];
	node: ReactNode;
}

interface EvidenceBridgeOverlayProps {
	bridge: EvidenceBridge;
	onJumpToParagraph: (paragraphId: string) => void;
	onRailPointerDown?: (event: PointerEvent<HTMLElement>) => void;
	/** How a linked paragraph is named to assistive tech («§7, “The Tenant shall…”»). */
	paragraphLabel?: (paragraphId: string) => string;
	/**
	 * Clause Analyzer deontic rail: when provided, scroll markers are colored by
	 * burden/benefit and faded by attention score instead of reference/similarity.
	 */
	toneByParagraph?: Record<string, 'burden' | 'benefit'>;
	scoreByParagraph?: Record<string, number>;
	/** Labels beside the line, each halfway along its own link: between the selected paragraph
	 *  and the nearest paragraph it speaks for. */
	linkLabels?: LinkLabel[];
	/** Names the selected paragraph («§6») on its right, away from the line and its labels. */
	anchorTag?: ReactNode;
	/** A label beside the line where it reaches a linked paragraph, for links of their own kind. */
	connectorLabel?: (paragraphId: string) => ReactNode;
}

export function EvidenceBridgeOverlay({
	bridge,
	onJumpToParagraph,
	onRailPointerDown,
	paragraphLabel = () => 'paragraph',
	toneByParagraph,
	scoreByParagraph,
	linkLabels,
	anchorTag,
	connectorLabel,
}: EvidenceBridgeOverlayProps) {
	const { connectors, primaryConnector, selectedRightPx, folds, collapsedCards, scrollMarkers } =
		bridge;
	const deonticRail = toneByParagraph != null;

	// Each label sits halfway between the selected paragraph and the nearest paragraph of its
	// link, so a link from above is named above and one from below, below.
	const placedLabels = (linkLabels ?? [])
		.flatMap((label) => {
			const own = connectors.filter((c) => label.paragraphIds.includes(c.paragraphId));
			if (own.length === 0) return [];
			const span = (c: (typeof own)[number]) => Math.abs(c.relatedCapTopPx - c.selectedCapTopPx);
			const nearest = own.reduce((best, c) => (span(c) < span(best) ? c : best));
			return [
				{
					...label,
					leftPx: nearest.leftPx,
					topPx: (nearest.selectedCapTopPx + nearest.relatedCapTopPx) / 2,
				},
			];
		})
		.sort((a, b) => a.topPx - b.topPx);
	for (let i = 1; i < placedLabels.length; i++) {
		const floor = placedLabels[i - 1].topPx + LABEL_GAP_PX;
		if (placedLabels[i].topPx < floor) placedLabels[i].topPx = floor;
	}

	return (
		<>
			{connectors.length > 0 ? (
				// The line, its tags and the collapsed cards are drawn on the paper, which stays light
				// in the dark theme: they keep the light tokens and the paper's dark text.
				<div className="theme-light pointer-events-none absolute inset-0 z-20 overflow-hidden text-foreground">
					{primaryConnector ? (
						<>
							<span
								className="docx-paragraph-explanation-bracket docx-paragraph-explanation-bracket--interactive"
								style={{
									left: primaryConnector.leftPx,
									top: primaryConnector.topPx,
									height: Math.max(6, primaryConnector.bottomPx - primaryConnector.topPx),
								}}
								role="button"
								tabIndex={0}
								aria-label={`Go to related paragraph ${paragraphLabel(primaryConnector.paragraphId)}`}
								onClick={() => onJumpToParagraph(primaryConnector.paragraphId)}
								onKeyDown={(event) => {
									if (event.key === 'Enter' || event.key === ' ') {
										event.preventDefault();
										onJumpToParagraph(primaryConnector.paragraphId);
									}
								}}
							/>
							<span
								className="docx-paragraph-explanation-cap"
								style={{
									left: primaryConnector.leftPx,
									top: primaryConnector.selectedCapTopPx,
									width: primaryConnector.selectedCapWidthPx,
								}}
							/>
						</>
					) : null}

					{connectors.map((connector, index) => (
						<span
							key={`connector-cap-${connector.paragraphId}-${index}`}
							className="docx-paragraph-explanation-cap docx-paragraph-explanation-cap--interactive"
							style={{
								left: connector.leftPx,
								top: connector.relatedCapTopPx,
								width: connector.relatedCapWidthPx,
							}}
							role="button"
							tabIndex={0}
							aria-label={`Go to related paragraph ${paragraphLabel(connector.paragraphId)}`}
							onClick={() => onJumpToParagraph(connector.paragraphId)}
							onKeyDown={(event) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									onJumpToParagraph(connector.paragraphId);
								}
							}}
						/>
					))}

					{primaryConnector && anchorTag ? (
						<span
							className="pointer-events-auto absolute"
							// In the page's right margin, beside the selected paragraph: the other side
							// from the line, so it never mixes with the link labels.
							style={{
								left: selectedRightPx + 10,
								top: primaryConnector.selectedCapTopPx,
								transform: 'translateY(-50%)',
							}}
						>
							{anchorTag}
						</span>
					) : null}

					{placedLabels.map((label) => (
						<span
							key={label.key}
							className="pointer-events-auto absolute"
							// In the page margin, left of the line; a narrow pane that scrolled the
							// margin away keeps it in view, over the paragraph's first words.
							// It never runs past the page's left edge: at most the room left of the line.
							style={{
								left: Math.max(label.leftPx - 6, LABEL_ROOM_PX),
								top: label.topPx,
								maxWidth: Math.max(label.leftPx - 6, LABEL_ROOM_PX) - 4,
								transform: 'translate(-100%, -50%)',
							}}
						>
							{label.node}
						</span>
					))}

					{connectorLabel &&
						connectors.map((connector, index) => {
							const label = connectorLabel(connector.paragraphId);
							return label ? (
								<span
									key={`connector-label-${connector.paragraphId}-${index}`}
									className="pointer-events-auto absolute"
									style={{
										left: Math.max(connector.leftPx - 6, LABEL_ROOM_PX),
										top: connector.relatedCapTopPx,
										transform: 'translate(-100%, -50%)',
									}}
								>
									{label}
								</span>
							) : null;
						})}

					{folds.map((fold, index) => (
						<svg
							key={`fold-${index}`}
							className="docx-paragraph-explanation-line-fold"
							style={{ left: fold.leftPx, top: fold.topPx }}
							viewBox="0 0 12 20"
							aria-hidden="true"
						>
							<path d="M6 1 L3 5 L9 9 L3 13 L6 19" />
						</svg>
					))}

					{collapsedCards.map((card) => (
						<div
							key={`collapsed-card-${card.paragraphId}`}
							className="docx-paragraph-explanation-collapsed-card"
							style={{ left: card.leftPx, top: card.topPx, width: card.widthPx }}
							// The HTML comes from the document's own already-rendered DOM (static clone).
							dangerouslySetInnerHTML={{ __html: card.html }}
						/>
					))}
				</div>
			) : null}

			{scrollMarkers.length > 0 ? (
				<div
					className="absolute top-2 right-1 bottom-2 z-20 w-2 touch-none"
					onPointerDown={onRailPointerDown}
				>
					{scrollMarkers.map((marker) => {
						if (deonticRail) {
							const tone = toneByParagraph?.[marker.paragraphId] ?? 'burden';
							const score = scoreByParagraph?.[marker.paragraphId] ?? 0;
							return (
								<span
									key={`kg-marker-${marker.paragraphId}`}
									className={`docx-kg-scroll-marker docx-kg-scroll-marker--${tone}`}
									style={{ top: `${marker.topPercent}%`, opacity: 0.35 + 0.65 * score }}
									role="button"
									tabIndex={0}
									aria-label={`Go to ${tone} paragraph ${paragraphLabel(marker.paragraphId)}`}
									onClick={() => onJumpToParagraph(marker.paragraphId)}
									onKeyDown={(event) => {
										if (event.key === 'Enter' || event.key === ' ') {
											event.preventDefault();
											onJumpToParagraph(marker.paragraphId);
										}
									}}
								/>
							);
						}
						return (
							<span
								key={`evidence-marker-${marker.paragraphId}`}
								className="docx-evidence-scroll-marker"
								style={{ top: `${marker.topPercent}%` }}
								role="button"
								tabIndex={0}
								aria-label={`Go to related paragraph ${paragraphLabel(marker.paragraphId)}`}
								onClick={() => onJumpToParagraph(marker.paragraphId)}
								onKeyDown={(event) => {
									if (event.key === 'Enter' || event.key === ' ') {
										event.preventDefault();
										onJumpToParagraph(marker.paragraphId);
									}
								}}
							/>
						);
					})}
				</div>
			) : null}
		</>
	);
}
