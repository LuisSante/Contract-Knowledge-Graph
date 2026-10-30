'use client';

import { useMemo } from 'react';
import {
	forceCenter,
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
	type SimulationNodeDatum,
} from 'd3';
import type { KgVizGraph } from '@/features/docx/utils/knowledge/kg-graph';
import { radiusOf } from '@/features/docx/components/clause-analyzer/constants';

export interface NodePosition {
	x: number;
	y: number;
}

interface SimNode extends SimulationNodeDatum {
	id: string;
	radius: number;
}

interface SimLink {
	source: string | SimNode;
	target: string | SimNode;
}

const TICKS = 320;

/**
 * Runs the simulation to completion up front instead of animating it: the layout is
 * a still frame, so React never re-renders per tick and the result is stable across
 * mounts for the same input. It is laid out around the origin, in a space of its own:
 * the canvas fits it to whatever size it has, so a resize refits and never reruns it.
 */
export function useForceLayout(graph: KgVizGraph | null): Map<string, NodePosition> {
	return useMemo(() => {
		const positions = new Map<string, NodePosition>();
		if (!graph || graph.nodes.length === 0) return positions;

		const nodes: SimNode[] = graph.nodes.map((node) => ({
			id: node.id,
			radius: radiusOf(node.weight),
		}));
		const links: SimLink[] = graph.edges.map((edge) => ({
			source: edge.source,
			target: edge.target,
		}));

		const simulation = forceSimulation(nodes)
			.force(
				'link',
				forceLink<SimNode, SimLink>(links)
					.id((node) => node.id)
					.distance(90)
					.strength(0.28)
			)
			.force('charge', forceManyBody().strength(-420))
			.force(
				'collide',
				forceCollide<SimNode>().radius((node) => node.radius + 14)
			)
			.force('center', forceCenter(0, 0))
			.stop();

		simulation.tick(TICKS);

		for (const node of nodes) positions.set(node.id, { x: node.x ?? 0, y: node.y ?? 0 });
		return positions;
	}, [graph]);
}
