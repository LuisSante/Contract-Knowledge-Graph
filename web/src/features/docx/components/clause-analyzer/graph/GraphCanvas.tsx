'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { KgVizGraph, KgVizNode } from '@/features/docx/utils/knowledge/kg-graph';
import { useForceLayout } from '@/features/docx/components/clause-analyzer/graph/useForceLayout';
import {
	formatMass,
	NODE_COLORS,
	NODE_LABEL,
	radiusOf,
} from '@/features/docx/components/clause-analyzer/constants';

interface GraphCanvasProps {
	graph: KgVizGraph;
	showLabels: boolean;
	selectedClauseId: string | null;
	/** The selected clause plus its provisions and everything they reach; null = no selection. */
	highlightIds: Set<string> | null;
	onSelectClause: (clauseId: string) => void;
	/** Overrides the colour by kind, e.g. to paint each node in its party's colour. */
	colorOf?: (node: KgVizNode) => string;
}

interface View {
	x: number;
	y: number;
	k: number;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const FIT_PADDING = 48;
const LABEL_CHARS = 18;
/** One press of + or −, and one press of an arrow key, in screen pixels. */
const KEY_ZOOM = 1.25;
const KEY_PAN = 48;
/** Room the info box needs (max-w-64 and about five lines) before it flips to the other side. */
const TIP_WIDTH = 268;
const TIP_HEIGHT = 110;
const PAN_KEYS: Record<string, [number, number]> = {
	ArrowLeft: [1, 0],
	ArrowRight: [-1, 0],
	ArrowUp: [0, 1],
	ArrowDown: [0, -1],
};

/** Zooms by `factor` keeping the screen point (px, py) where it is. */
function zoomAt(previous: View, factor: number, px: number, py: number): View {
	const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, previous.k * factor));
	const ratio = k / previous.k;
	return { k, x: px - (px - previous.x) * ratio, y: py - (py - previous.y) * ratio };
}

export function GraphCanvas({
	graph,
	showLabels,
	selectedClauseId,
	highlightIds,
	onSelectClause,
	colorOf,
}: GraphCanvasProps) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
	// Where the info box points, relative to the canvas: the drawer around it is transformed,
	// which makes it the box of anything `fixed` inside, so viewport coordinates land off target.
	const [hovered, setHovered] = useState<{ node: KgVizNode; x: number; y: number } | null>(null);
	const hoverAt = (node: KgVizNode, clientX: number, clientY: number) => {
		const box = wrapperRef.current?.getBoundingClientRect();
		setHovered({ node, x: clientX - (box?.left ?? 0), y: clientY - (box?.top ?? 0) });
	};
	const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

	useEffect(() => {
		const element = wrapperRef.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect;
			setSize({ width, height });
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	const positions = useForceLayout(graph);
	const nodeById = useMemo(
		() => new Map(graph.nodes.map((node) => [node.id, node] as const)),
		[graph]
	);

	// The frame that puts the whole layout on screen is derived, not stored: it has to
	// follow every change of layout or container size, and an effect that pushed it
	// into state would re-render on each one. `view` holds only what the user panned
	// and zoomed on top of it, so "Fit" is just a reset to identity.
	const frame = useMemo<View>(() => {
		if (positions.size === 0 || size.width <= 0 || size.height <= 0) {
			return { x: 0, y: 0, k: 1 };
		}
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (const [id, point] of positions) {
			const radius = radiusOf(nodeById.get(id)?.weight ?? 0);
			minX = Math.min(minX, point.x - radius);
			minY = Math.min(minY, point.y - radius);
			maxX = Math.max(maxX, point.x + radius);
			maxY = Math.max(maxY, point.y + radius);
		}
		const spanX = Math.max(maxX - minX, 1);
		const spanY = Math.max(maxY - minY, 1);
		const k = Math.min(
			MAX_ZOOM,
			Math.max(
				MIN_ZOOM,
				Math.min((size.width - FIT_PADDING) / spanX, (size.height - FIT_PADDING) / spanY)
			)
		);
		return {
			k,
			x: size.width / 2 - ((minX + maxX) / 2) * k,
			y: size.height / 2 - ((minY + maxY) / 2) * k,
		};
	}, [positions, nodeById, size.width, size.height]);

	// React attaches wheel passively at the root, so preventDefault only lands on a
	// listener registered here.
	useEffect(() => {
		const element = wrapperRef.current;
		if (!element) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			const rect = element.getBoundingClientRect();
			const px = event.clientX - rect.left;
			const py = event.clientY - rect.top;
			setView((previous) => zoomAt(previous, Math.exp(-event.deltaY * 0.0015), px, py));
		};
		element.addEventListener('wheel', onWheel, { passive: false });
		return () => element.removeEventListener('wheel', onWheel);
	}, []);

	const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
		// A press on a node is a click, not the start of a pan: capturing the pointer here
		// would hand the click to the canvas and the node would never see it.
		if ((event.target as Element).closest('[data-node]')) return;
		dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const dx = event.clientX - drag.x;
		const dy = event.clientY - drag.y;
		dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
		setView((previous) => ({ ...previous, x: previous.x + dx, y: previous.y + dy }));
	};

	const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
		if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
	};

	// The keyboard's wheel and drag: + and − zoom on the centre, 0 fits, arrows pan.
	const onKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		const pan = PAN_KEYS[event.key];
		if (pan) {
			setView((previous) => ({
				...previous,
				x: previous.x + pan[0] * KEY_PAN,
				y: previous.y + pan[1] * KEY_PAN,
			}));
		} else if (event.key === '+' || event.key === '=' || event.key === '-' || event.key === '_') {
			const factor = event.key === '+' || event.key === '=' ? KEY_ZOOM : 1 / KEY_ZOOM;
			setView((previous) => zoomAt(previous, factor, size.width / 2, size.height / 2));
		} else if (event.key === '0') {
			setView({ x: 0, y: 0, k: 1 });
		} else {
			return;
		}
		event.preventDefault();
		// The info box sits where the node was; once the view moves it would point at nothing.
		setHovered(null);
	};

	const counts = graph.countByKind;
	const statements = graph.nodes.length - counts.clause - counts.party;
	const graphLabel =
		`Knowledge graph: ${counts.party} parties, ${counts.clause} clauses, ${statements} statements. ` +
		'Tab moves through the clauses, Enter selects one. Plus and minus zoom, 0 fits, arrows pan.';

	// Text is counter-scaled so it keeps a constant size on screen. Fitting 40 nodes
	// puts the frame around k≈0.55, which would render a 9px number at 5px — unreadable,
	// and the number is the whole reason this view exists.
	const textScale = 1 / Math.max(view.k * frame.k, 0.05);

	const lit = (id: string) => highlightIds === null || highlightIds.has(id);

	return (
		<div ref={wrapperRef} className="relative min-h-0 flex-1 overflow-hidden">
			<svg
				role="group"
				aria-label={graphLabel}
				tabIndex={0}
				className="h-full w-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset active:cursor-grabbing dark:focus-visible:ring-ring"
				onKeyDown={onKeyDown}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
			>
				<g
					transform={
						`translate(${view.x},${view.y}) scale(${view.k}) ` +
						`translate(${frame.x},${frame.y}) scale(${frame.k})`
					}
				>
					<g stroke="currentColor" strokeWidth={1}>
						{graph.edges.map((edge, index) => {
							const a = positions.get(edge.source);
							const b = positions.get(edge.target);
							if (!a || !b) return null;
							const inside = lit(edge.source) && lit(edge.target);
							return (
								<line
									key={`${edge.source}-${edge.target}-${edge.type}-${index}`}
									x1={a.x}
									y1={a.y}
									x2={b.x}
									y2={b.y}
									strokeOpacity={inside ? 0.42 : 0.07}
									strokeWidth={inside ? 1.4 : 1}
								/>
							);
						})}
					</g>

					{graph.nodes.map((node) => {
						const point = positions.get(node.id);
						if (!point) return null;
						const radius = radiusOf(node.weight);
						const color = colorOf?.(node) ?? NODE_COLORS[node.kind];
						const inSelection = lit(node.id);
						const dimmed = hovered !== null && hovered.node.id !== node.id;
						const selected = node.id === selectedClauseId;
						// Only clauses take focus: they are what a click selects, and tabbing
						// through every statement would bury them.
						const isClause = node.kind === 'clause';
						return (
							<g
								key={node.id}
								data-node
								transform={`translate(${point.x},${point.y})`}
								opacity={dimmed ? 0.35 : inSelection ? 1 : 0.2}
								className={
									isClause
										? 'cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid'
										: 'cursor-default'
								}
								tabIndex={isClause ? 0 : undefined}
								role={isClause ? 'button' : undefined}
								aria-pressed={isClause ? selected : undefined}
								aria-label={
									isClause
										? `Clause ${node.label}, PPR ${formatMass(node.score)}%, ${node.degree} edges`
										: undefined
								}
								onPointerEnter={(event) => hoverAt(node, event.clientX, event.clientY)}
								onPointerLeave={() => setHovered(null)}
								onFocus={(event) => {
									// A click focuses the node too; the box then stays where the pointer put it.
									if (!event.currentTarget.matches(':focus-visible')) return;
									const rect = event.currentTarget.getBoundingClientRect();
									hoverAt(node, rect.right, rect.top + rect.height / 2);
								}}
								onBlur={() => setHovered(null)}
								onClick={() => {
									if (isClause) onSelectClause(node.id);
								}}
								onKeyDown={(event) => {
									if (!isClause || (event.key !== 'Enter' && event.key !== ' ')) return;
									event.preventDefault();
									onSelectClause(node.id);
								}}
							>
								{/* Where the restart vector injects mass — the 62 statements that
								    carry the prior. Everything else only ever receives. */}
								{node.prior > 0 && (
									<circle
										r={radius + 5}
										fill="none"
										stroke={color}
										strokeWidth={1.4}
										strokeDasharray="4 3"
										opacity={0.65}
										// On the dark canvas the faded ring falls under 3:1; the CSS wins over the attribute.
										className="dark:opacity-100"
									/>
								)}
								{selected && (
									<circle
										r={radius + 9}
										fill="none"
										stroke="currentColor"
										strokeWidth={2}
										opacity={0.75}
									/>
								)}
								<circle
									r={radius}
									fill={color}
									fillOpacity={(inSelection ? 0.2 : 0.12) + 0.34 * node.weight}
									stroke={color}
									strokeWidth={selected ? 3 : inSelection ? 2.2 : 1.4}
								/>
								<text
									textAnchor="middle"
									dy="0.34em"
									fontSize={9 * textScale}
									fontWeight={600}
									fill="currentColor"
									className="pointer-events-none tabular-nums"
								>
									{formatMass(node.score)}
								</text>
								{showLabels && (
									<text
										textAnchor="middle"
										y={radius + 11 * textScale}
										fontSize={8.5 * textScale}
										fill="currentColor"
										fillOpacity={inSelection ? 0.8 : 0.5}
										className="pointer-events-none"
									>
										{node.label.length > LABEL_CHARS
											? `${node.label.slice(0, LABEL_CHARS - 1)}…`
											: node.label}
									</text>
								)}
							</g>
						);
					})}
				</g>
			</svg>

			{hovered && (
				<div
					className="pointer-events-none absolute z-50 max-w-64 rounded-md border border-border bg-popover p-2 text-2xs shadow-md dark:border-foreground/15 dark:bg-muted"
					style={{
						...(hovered.x + TIP_WIDTH > size.width
							? { right: size.width - hovered.x + 12 }
							: { left: hovered.x + 12 }),
						...(hovered.y + TIP_HEIGHT > size.height
							? { bottom: size.height - hovered.y + 12 }
							: { top: hovered.y + 12 }),
					}}
				>
					<div className="mb-1 flex items-center gap-1.5">
						<span
							className="inline-block h-2 w-2 shrink-0 rounded-full"
							style={{ backgroundColor: NODE_COLORS[hovered.node.kind] }}
						/>
						<span className="font-medium text-foreground">{NODE_LABEL[hovered.node.kind]}</span>
						{hovered.node.prior > 0 && (
							<span className="text-muted-foreground">· carries prior</span>
						)}
					</div>
					<div className="mb-1 text-foreground/80">{hovered.node.label}</div>
					<div className="text-muted-foreground tabular-nums">
						PPR {formatMass(hovered.node.score)}% · {hovered.node.degree} edges here
					</div>
					{hovered.node.kind === 'clause' && (
						<div className="mt-1 text-muted-foreground">
							Click or press Enter to open it on the left.
						</div>
					)}
				</div>
			)}
		</div>
	);
}
