'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { KgVizGraph, KgVizNode } from '@/features/docx/utils/knowledge/kg-graph';
import { useForceLayout } from '@/features/docx/components/kg-visualization/useForceLayout';
import {
	formatGain,
	formatMass,
	NODE_COLORS,
	NODE_LABEL,
	radiusOf,
} from '@/features/docx/components/kg-visualization/constants';

export type ScoreMode = 'ppr' | 'prior' | 'gain';

interface GraphCanvasProps {
	graph: KgVizGraph;
	scoreMode: ScoreMode;
	showLabels: boolean;
	selectedClauseId: string | null;
	/** The selected clause plus its provisions and everything they reach; null = no selection. */
	highlightIds: Set<string> | null;
	onSelectClause: (clauseId: string) => void;
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

function valueOf(node: KgVizNode, mode: ScoreMode): number {
	if (mode === 'prior') return node.prior;
	if (mode === 'gain') return node.gain;
	return node.score;
}

export function GraphCanvas({
	graph,
	scoreMode,
	showLabels,
	selectedClauseId,
	highlightIds,
	onSelectClause,
}: GraphCanvasProps) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
	const [hovered, setHovered] = useState<{ node: KgVizNode; x: number; y: number } | null>(null);
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

	const positions = useForceLayout(graph, size.width, size.height);
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
			setView((previous) => {
				const k = Math.min(
					MAX_ZOOM,
					Math.max(MIN_ZOOM, previous.k * Math.exp(-event.deltaY * 0.0015))
				);
				const ratio = k / previous.k;
				return { k, x: px - (px - previous.x) * ratio, y: py - (py - previous.y) * ratio };
			});
		};
		element.addEventListener('wheel', onWheel, { passive: false });
		return () => element.removeEventListener('wheel', onWheel);
	}, []);

	const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
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

	const scoreText = (node: KgVizNode) =>
		scoreMode === 'gain' ? formatGain(node.gain) : formatMass(valueOf(node, scoreMode));

	// Text is counter-scaled so it keeps a constant size on screen. Fitting 40 nodes
	// puts the frame around k≈0.55, which would render a 9px number at 5px — unreadable,
	// and the number is the whole reason this view exists.
	const textScale = 1 / Math.max(view.k * frame.k, 0.05);

	const lit = (id: string) => highlightIds === null || highlightIds.has(id);

	return (
		<div ref={wrapperRef} className="relative min-h-0 flex-1 overflow-hidden">
			<svg
				className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
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
						const color = NODE_COLORS[node.kind];
						const inSelection = lit(node.id);
						const dimmed = hovered !== null && hovered.node.id !== node.id;
						const selected = node.id === selectedClauseId;
						const negative = scoreMode === 'gain' && node.gain < 0;
						return (
							<g
								key={node.id}
								transform={`translate(${point.x},${point.y})`}
								opacity={dimmed ? 0.35 : inSelection ? 1 : 0.2}
								className={node.kind === 'clause' ? 'cursor-pointer' : 'cursor-default'}
								onPointerEnter={(event) => setHovered({ node, x: event.clientX, y: event.clientY })}
								onPointerLeave={() => setHovered(null)}
								onClick={() => {
									if (node.kind === 'clause') onSelectClause(node.id);
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
									fillOpacity={negative ? 0.06 : (inSelection ? 0.2 : 0.12) + 0.34 * node.weight}
									stroke={color}
									strokeWidth={selected ? 3 : inSelection ? 2.2 : 1.4}
									strokeDasharray={negative ? '3 2' : undefined}
								/>
								<text
									textAnchor="middle"
									dy="0.34em"
									fontSize={9 * textScale}
									fontWeight={600}
									fill="currentColor"
									className="pointer-events-none tabular-nums"
								>
									{scoreText(node)}
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

			<button
				type="button"
				onClick={() => setView({ x: 0, y: 0, k: 1 })}
				className="absolute bottom-2 left-2 rounded border border-border/70 bg-card/90 px-1.5 py-0.5 text-2xs text-muted-foreground shadow-sm hover:text-foreground"
				title="Re-centre the layout"
			>
				Fit
			</button>

			{hovered && (
				<div
					className="pointer-events-none fixed z-50 max-w-64 rounded-md border border-border bg-popover p-2 text-2xs shadow-md"
					style={{ left: hovered.x + 12, top: hovered.y + 12 }}
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
						PPR {formatMass(hovered.node.score)}% · prior {formatMass(hovered.node.prior)}% · gain{' '}
						{formatGain(hovered.node.gain)} · {hovered.node.degree} edges here
					</div>
					{hovered.node.kind === 'clause' && (
						<div className="mt-1 text-muted-foreground">Click to open it on the left.</div>
					)}
				</div>
			)}
		</div>
	);
}
