'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import type { KnowledgeGraph, DeonticKind } from '@/types/knowledge';
import { deonticNodes } from '@/types/knowledge';
import type { DyadAnalysis } from '@/features/docx/utils/knowledge/dyadic';
import {
	computeMembraneLayout,
	type MembraneSector,
} from '@/features/docx/utils/knowledge/membrane-layout';

/** Side colours. Deliberately not the burden/benefit red-green: this axis is *who*, not *how*. */
export const SIDE_COLORS = {
	A: '#6d5bd0',
	B: '#d98324',
	neutral: '#9aa0a6',
} as const;

/** Kind still reads on the node outline, so a provision shows side and severity at once. */
const KIND_STROKE: Record<DeonticKind, string> = {
	obligation: '#c0392b',
	right: '#1e8e5a',
	prohibition: '#8e44ad',
};

const KIND_RADIUS: Record<DeonticKind, number> = {
	obligation: 4.6,
	prohibition: 5.2,
	right: 4,
};

export interface MembraneHover {
	x: number;
	y: number;
	title: string;
	detail: string;
	color: string;
}

interface MembraneRingProps {
	kg: KnowledgeGraph;
	analysis: DyadAnalysis;
	paragraphOrder: Map<string, number>;
	width: number;
	height: number;
	/** Container-relative coordinates for the hover card; null clears it. */
	onHover: (hover: MembraneHover | null) => void;
	onSelectClause: (clauseId: string) => void;
	onSelectStatement: (statementId: string) => void;
	onBackgroundClick: () => void;
	/** Drawn faintly when off, so the ring stays readable while the layer is inspected. */
	showControl: boolean;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function MembraneRing({
	kg,
	analysis,
	paragraphOrder,
	width,
	height,
	onHover,
	onSelectClause,
	onSelectStatement,
	onBackgroundClick,
	showControl,
}: MembraneRingProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const transformRef = useRef<d3.ZoomTransform | null>(null);

	const layout = useMemo(
		() =>
			width > 0 && height > 0
				? computeMembraneLayout(kg, { width, height, analysis, paragraphOrder })
				: null,
		[kg, analysis, paragraphOrder, width, height]
	);

	const statementMeta = useMemo(() => {
		const meta = new Map<string, { kind: DeonticKind; label: string }>();
		for (const v of deonticNodes(kg)) {
			meta.set(v.id, { kind: v.kind, label: v.summary || v.action || v.id });
		}
		return meta;
	}, [kg]);

	const conditionById = useMemo(
		() => new Map(kg.conditions.map((c) => [c.id, c] as const)),
		[kg]
	);
	const termById = useMemo(
		() => new Map(kg.definedTerms.map((t) => [t.id, t] as const)),
		[kg]
	);

	useEffect(() => {
		if (!layout || !svgRef.current) return;
		const svg = d3.select(svgRef.current);
		svg.selectAll('*').remove();
		const root = svg.append('g');

		let panned = false;
		const zoom = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.2, 6])
			.on('zoom', (event) => {
				if (event.sourceEvent) panned = true;
				transformRef.current = event.transform;
				root.attr('transform', event.transform.toString());
			});
		svg.call(zoom).on('dblclick.zoom', null);
		if (transformRef.current) svg.call(zoom.transform, transformRef.current);
		svg.on('pointerdown', () => {
			panned = false;
		});
		svg.on('click', (event: MouseEvent) => {
			if (panned || event.target !== svgRef.current) return;
			onBackgroundClick();
		});

		const { x: cx, y: cy } = layout.center;
		const pointAt = (angle: number, distance: number) =>
			[cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance] as const;
		const arcPath = (radius: number, from: number, to: number) => {
			const [x0, y0] = pointAt(from, radius);
			const [x1, y1] = pointAt(to, radius);
			return `M${x0},${y0}A${radius},${radius},0,${to - from > Math.PI ? 1 : 0},1,${x1},${y1}`;
		};
		const hoverAt = (event: MouseEvent, title: string, detail: string, color: string) => {
			const rect = svgRef.current?.getBoundingClientRect();
			onHover({
				x: event.clientX - (rect?.left ?? 0),
				y: event.clientY - (rect?.top ?? 0),
				title,
				detail,
				color,
			});
		};

		// --- guides ---
		const scaffold = root.append('g').attr('pointer-events', 'none').attr('fill', 'none');
		for (const [radius, dash] of [
			[layout.coreRadius, '3 6'],
			[layout.membraneRadius, '6 5'],
			[layout.outerRadius, ''],
		] as const) {
			scaffold
				.append('circle')
				.attr('cx', cx)
				.attr('cy', cy)
				.attr('r', radius)
				.attr('stroke', 'currentColor')
				.attr('stroke-opacity', dash ? 0.18 : 0.1)
				.attr('stroke-dasharray', dash || null);
		}

		// --- λ band: one arc per clause, colour = who the clause favours ---
		scaffold
			.append('g')
			.selectAll<SVGPathElement, MembraneSector>('path')
			.data(layout.sectors)
			.join('path')
			.attr('d', (d) => arcPath(layout.lambdaRadius, d.startAngle, d.endAngle))
			.attr('stroke', (d) =>
				d.lambda > 0.12 ? SIDE_COLORS.A : d.lambda < -0.12 ? SIDE_COLORS.B : SIDE_COLORS.neutral
			)
			.attr('stroke-width', layout.lambdaThickness)
			.attr('stroke-opacity', (d) =>
				d.stakes <= 0 ? 0.22 : Math.min(1, 0.35 + Math.abs(d.lambda) * 0.65)
			);

		// --- territory bars: the clause's 100%, split across the membrane ---
		const bars = root.append('g').attr('pointer-events', 'none').attr('stroke-linecap', 'butt');
		const bar = (d: MembraneSector, length: number, outward: boolean, color: string) => {
			const from = outward ? layout.membraneRadius : layout.membraneRadius - length;
			const [x0, y0] = pointAt(d.midAngle, from);
			const [x1, y1] = pointAt(d.midAngle, from + length);
			return { x0, y0, x1, y1, color };
		};
		for (const outward of [true, false]) {
			bars
				.selectAll<SVGLineElement, MembraneSector>(`line.${outward ? 'a' : 'b'}`)
				.data(layout.sectors.filter((d) => (outward ? d.lengthA : d.lengthB) > 0.8))
				.join('line')
				.attr('class', outward ? 'a' : 'b')
				.each(function (d) {
					const { x0, y0, x1, y1, color } = bar(
						d,
						outward ? d.lengthA : d.lengthB,
						outward,
						outward ? SIDE_COLORS.A : SIDE_COLORS.B
					);
					d3.select(this)
						.attr('x1', x0)
						.attr('y1', y0)
						.attr('x2', x1)
						.attr('y2', y1)
						.attr('stroke', color)
						.attr('stroke-width', d.thickness)
						.attr('stroke-opacity', 0.9);
				});
		}

		// --- cross-clause gatings: a condition reaching into another clause ---
		root
			.append('g')
			.attr('fill', 'none')
			.attr('pointer-events', 'none')
			.selectAll('path')
			.data(layout.chords)
			.join('path')
			.attr('d', (d) => {
				const from = layout.positions.get(d.conditionId)!;
				const to = layout.positions.get(d.gatedId)!;
				return `M${from.x},${from.y}Q${cx},${cy} ${to.x},${to.y}`;
			})
			.attr('stroke', 'currentColor')
			.attr('stroke-width', 1.6)
			.attr('stroke-opacity', showControl ? 0.6 : 0.15);

		// --- sector hit areas (over the ring, under the nodes) ---
		root
			.append('g')
			.attr('fill', 'none')
			.attr('stroke', 'transparent')
			.attr('stroke-width', layout.lambdaThickness + 10)
			.attr('cursor', 'pointer')
			.selectAll<SVGPathElement, MembraneSector>('path')
			.data(layout.sectors)
			.join('path')
			.attr('d', (d) => arcPath(layout.lambdaRadius, d.startAngle, d.endAngle))
			.on('mouseenter mousemove', (event: MouseEvent, d) => {
				hoverAt(
					event,
					d.label,
					d.stakes > 0
						? `${percent(d.shareA)} ${analysis.partyA.name} · ${percent(d.shareNeutral)} neutro · ${percent(d.shareB)} ${analysis.partyB.name}`
						: 'Sin provisiones deónticas — no le concierne a ninguna parte',
					d.lambda > 0.12 ? SIDE_COLORS.A : d.lambda < -0.12 ? SIDE_COLORS.B : SIDE_COLORS.neutral
				);
			})
			.on('mouseleave', () => onHover(null))
			.on('click', (event: MouseEvent, d) => {
				event.stopPropagation();
				onSelectClause(d.clauseId);
			});

		// --- core: conditions and the defined terms that couple clauses ---
		const core = root.append('g').attr('cursor', 'default');
		const coreNodes = [...layout.positions].filter(
			([id, position]) => position.band === 'core' && !statementMeta.has(id)
		);
		core
			.selectAll('circle')
			.data(coreNodes)
			.join('circle')
			.attr('cx', ([, p]) => p.x)
			.attr('cy', ([, p]) => p.y)
			.attr('r', ([id]) => (conditionById.has(id) ? 3.4 : 3.2 + Math.min(4, (analysis.reach.get(id) ?? 2) * 0.35)))
			.attr('fill', ([id]) => (conditionById.has(id) ? 'var(--background, #fff)' : SIDE_COLORS.neutral))
			.attr('fill-opacity', ([id]) => (conditionById.has(id) ? 1 : 0.75))
			.attr('stroke', ([id]) => (conditionById.has(id) ? 'currentColor' : 'none'))
			.attr('stroke-opacity', 0.6)
			.attr('stroke-width', 1.3)
			.on('mouseenter mousemove', (event: MouseEvent, [id]) => {
				const condition = conditionById.get(id);
				if (condition) {
					hoverAt(
						event,
						`Condición · ${condition.operator || 'IF'}`,
						condition.trigger || '—',
						SIDE_COLORS.neutral
					);
					return;
				}
				const term = termById.get(id);
				hoverAt(
					event,
					term?.term ?? id,
					`Usado por ${analysis.reach.get(id) ?? 0} cláusulas`,
					SIDE_COLORS.neutral
				);
			})
			.on('mouseleave', () => onHover(null));

		// --- statements: fill = side, outline = deontic kind, halo = gated ---
		const statements = [...layout.positions].filter(([id]) => statementMeta.has(id));
		const halos = statements.filter(([id]) => analysis.gatedIds.has(id));
		root
			.append('g')
			.attr('fill', 'none')
			.attr('pointer-events', 'none')
			.attr('stroke', 'currentColor')
			.attr('stroke-opacity', showControl ? 0.55 : 0.12)
			.selectAll('circle')
			.data(halos)
			.join('circle')
			.attr('cx', ([, p]) => p.x)
			.attr('cy', ([, p]) => p.y)
			.attr('r', ([id]) => KIND_RADIUS[statementMeta.get(id)!.kind] + 3.6);

		root
			.append('g')
			.attr('cursor', 'pointer')
			.attr('stroke-width', 1.4)
			.selectAll('circle')
			.data(statements)
			.join('circle')
			.attr('cx', ([, p]) => p.x)
			.attr('cy', ([, p]) => p.y)
			.attr('r', ([id]) => KIND_RADIUS[statementMeta.get(id)!.kind])
			.attr('fill', ([, p]) => SIDE_COLORS[p.side])
			.attr('stroke', ([id]) => KIND_STROKE[statementMeta.get(id)!.kind])
			.on('mouseenter mousemove', (event: MouseEvent, [id, position]) => {
				const meta = statementMeta.get(id)!;
				const owner =
					position.side === 'A'
						? analysis.partyA.name
						: position.side === 'B'
							? analysis.partyB.name
							: 'ninguna parte del par';
				hoverAt(
					event,
					meta.kind,
					`Favorece a ${owner}${analysis.gatedIds.has(id) ? ' · condicionado' : ''} — ${meta.label}`,
					SIDE_COLORS[position.side]
				);
			})
			.on('mouseleave', () => onHover(null))
			.on('click', (event: MouseEvent, [id]) => {
				event.stopPropagation();
				onSelectStatement(id);
			});

		// --- labels: only the clauses that carry real weight ---
		const anchorFor = (angle: number) =>
			Math.cos(angle) < -0.1 ? 'end' : Math.cos(angle) > 0.1 ? 'start' : 'middle';
		root
			.append('g')
			.attr('pointer-events', 'none')
			.selectAll<SVGTextElement, MembraneSector>('text')
			.data(
				[...layout.sectors]
					.filter((s) => s.stakes > 0)
					.sort((a, b) => b.stakes - a.stakes)
					.slice(0, 12)
			)
			.join('text')
			.attr('x', (d) => pointAt(d.midAngle, layout.outerRadius + 10)[0])
			.attr('y', (d) => pointAt(d.midAngle, layout.outerRadius + 10)[1])
			.attr('text-anchor', (d) => anchorFor(d.midAngle))
			.attr('dominant-baseline', 'middle')
			.attr('font-size', 9)
			.attr('fill', 'currentColor')
			.attr('fill-opacity', 0.6)
			.text((d) => d.label);
	}, [
		layout,
		analysis,
		statementMeta,
		conditionById,
		termById,
		showControl,
		onHover,
		onSelectClause,
		onSelectStatement,
		onBackgroundClick,
	]);

	return (
		<svg
			ref={svgRef}
			className="h-full w-full cursor-grab text-foreground active:cursor-grabbing"
		/>
	);
}
