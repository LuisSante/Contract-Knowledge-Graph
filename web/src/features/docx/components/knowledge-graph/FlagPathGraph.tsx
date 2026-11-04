'use client';

import {
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import {
	KIND_COLORS,
	KIND_LABEL,
	NODE_COLORS,
	textColorOf,
} from '@/features/docx/components/clause-analyzer/constants';
import { short } from '@/features/docx/components/clause-analyzer/parts/bits';
import {
	FLAG_COLOR,
	FlagTag,
	LINK_STYLE,
	clauseGist,
	clauseLabel,
	flagTypes,
	type PathCtx,
} from '@/features/docx/components/clause-analyzer/flag-path/path-bits';
import { conditionLead } from '@/features/docx/utils/knowledge/clause-favour';
import {
	valuePhrase,
	type FlagHopPath,
	type HopCondition,
	type HopStatement,
} from '@/features/docx/utils/knowledge/red-flag-hops';

interface PathNode {
	id: string;
	col: 0 | 1 | 2 | 3;
	style: 'graph';
	color: string;
	label: string;
	text: ReactNode;
	sub?: string;
	flagged?: boolean;
	onOpen?: () => void;
}

interface PathEdge {
	/** La posición visual y el sentido de la relación se guardan por separado. */
	left: string;
	right: string;
	direction: 'left' | 'right';
	color: string;
	label?: string;
	style: 'graph';
	width?: number;
}

// Solo se reservan columnas para los hops con contenido.
const GRID = 'relative grid w-max gap-x-24 px-4';

const COLUMNS = [
	{ col: 0, title: 'Hop 0' },
	{ col: 1, title: 'Hop 1' },
	{ col: 2, title: 'Hop 2' },
	{ col: 3, title: 'Hop 3' },
] as const;

function conditionNode(id: string, hop: HopCondition, col: 1 | 3, ctx: PathCtx): PathNode {
	const party = hop.partyId ? ctx.kg.parties.find((p) => p.id === hop.partyId) : null;
	return {
		id,
		col,
		style: 'graph',
		color: KIND_COLORS.condition,
		label: `Condition · ${conditionLead(hop.condition.operator).replace(/^Only /, '')}`,
		text: hop.condition.trigger,
		sub: party ? `names ${short(party.name)}` : undefined,
		flagged: hop.flagged,
	};
}

function statementNode(
	id: string,
	hop: HopStatement,
	col: 0 | 2,
	ctx: PathCtx,
	onOpen?: () => void
): PathNode {
	const owner = hop.ownerId ? ctx.kg.parties.find((p) => p.id === hop.ownerId) : null;
	const t = hop.timing;
	const timing = t
		? [
				t.deadline && `when: ${t.deadline}`,
				t.frequency && `how often: ${t.frequency}`,
				t.amounts.join(', '),
			]
				.filter(Boolean)
				.join(' · ')
		: '';
	return {
		id,
		col,
		style: 'graph',
		color: KIND_COLORS[hop.statement.kind],
		label: `${KIND_LABEL[hop.statement.kind]}${owner ? ` · ${short(owner.name)}` : ''} · ${clauseLabel(ctx.kg, hop.statement.clauseId)}`,
		text: hop.statement.action,
		sub: timing || undefined,
		flagged: hop.flagged,
		onOpen,
	};
}

/** Nodos y relaciones permitidos por hop; las inferencias quedan aparte, sin conexiones. */
function layout(path: FlagHopPath, ctx: PathCtx, onOpen: (id: string) => void) {
	const nodes: PathNode[] = [];
	const edges: PathEdge[] = [];
	const has = new Set<string>();
	const node = (n: PathNode) => {
		if (has.has(n.id)) return;
		has.add(n.id);
		nodes.push(n);
	};
	const s = path.root.statement;
	const rootId = s.id;
	const rootNode = statementNode(rootId, path.root, 0, ctx, () => onOpen(rootId));
	const leadHere = path.flags.length > 1 ? `${path.flags.length} red flags lead here` : '';
	node({ ...rootNode, sub: [leadHere, rootNode.sub].filter(Boolean).join(' · ') || undefined });

	// Hop 1: the parties.
	const partyNode = (id: string) => {
		const party = ctx.kg.parties.find((p) => p.id === id);
		node({
			id: `party:${id}`,
			col: 1,
			style: 'graph',
			color: ctx.colorOf(id),
			label: 'Party',
			text: party ? `${short(party.name)}${party.role ? ` (${party.role})` : ''}` : id,
		});
		return `party:${id}`;
	};
	if (path.root.ownerId)
		edges.push({
			left: rootId,
			right: partyNode(path.root.ownerId),
			direction: 'right',
			color: ctx.colorOf(path.root.ownerId),
			label: s.kind === 'right' ? 'grants right' : 'assigns obligation',
			style: 'graph',
		});
	if (path.root.otherId && path.root.otherId !== path.root.ownerId)
		edges.push({
			left: rootId,
			right: partyNode(path.root.otherId),
			direction: 'right',
			color: ctx.colorOf(path.root.otherId),
			label: s.kind === 'right' ? 'burdens' : 'benefits',
			style: 'graph',
			width: 1,
		});
	// Hop 1: its conditions.
	for (const c of path.root.conditions) {
		node(conditionNode(c.condition.id, c, 1, ctx));
		edges.push({
			left: rootId,
			right: c.condition.id,
			direction: 'left',
			color: KIND_COLORS.condition,
			label: 'gates',
			style: 'graph',
			width: 1.2,
		});
	}
	// Hop 1: its clause, with the clause's own values in hop 2.
	const clauseNodeId = path.clauseId ? `clause:${path.clauseId}` : null;
	if (path.clauseId && clauseNodeId) {
		node({
			id: clauseNodeId,
			col: 1,
			style: 'graph',
			color: NODE_COLORS.clause,
			label: 'Clause',
			text: `${clauseLabel(ctx.kg, path.clauseId)} ${clauseGist(ctx.kg, path.clauseId)}`,
		});
		edges.push({
			left: rootId,
			right: clauseNodeId,
			direction: 'right',
			color: NODE_COLORS.clause,
			label: 'part of',
			style: 'graph',
			width: 1.2,
		});
	}
	// Hop 1: edges that leave the statement for another clause.
	for (const link of path.outgoing) {
		const id = `out:${link.type}:${link.toClauseId}`;
		node({
			id,
			col: 1,
			style: 'graph',
			color: LINK_STYLE[link.type].color,
			label: `Clause · ${clauseLabel(ctx.kg, link.toClauseId)}`,
			text: clauseGist(ctx.kg, link.toClauseId),
		});
		edges.push({
			left: rootId,
			right: id,
			direction: 'right',
			color: LINK_STYLE[link.type].color,
			label: LINK_STYLE[link.type].verb,
			style: 'graph',
			width: 2.5,
		});
	}
	for (const r of path.cites) {
		node({
			id: r.id,
			col: 1,
			style: 'graph',
			color: NODE_COLORS.reference,
			label: 'Reference',
			text: r.name || r.citation,
		});
		edges.push({
			left: rootId,
			right: r.id,
			direction: 'left',
			color: NODE_COLORS.reference,
			label: 'cited by',
			style: 'graph',
			width: 1,
		});
	}
	for (const t of path.terms) {
		node({
			id: t.id,
			col: 1,
			style: 'graph',
			color: NODE_COLORS.definedTerm,
			label: 'Defined term',
			text: `«${t.term}»`,
			sub: t.definition,
		});
		edges.push({
			left: rootId,
			right: t.id,
			direction: 'right',
			color: NODE_COLORS.definedTerm,
			label: 'uses',
			style: 'graph',
			width: 1,
		});
	}
	// Hop 2: the rest of the clause, its values, and the clauses linked to it.
	if (clauseNodeId) {
		for (const x of path.siblings) {
			node(statementNode(x.statement.id, x, 2, ctx, () => onOpen(x.statement.id)));
			edges.push({
				left: clauseNodeId,
				right: x.statement.id,
				direction: 'left',
				color: NODE_COLORS.clause,
				label: 'part of',
				style: 'graph',
				width: 1,
			});
		}
		for (const v of path.clauseValues) {
			node({
				id: v.id,
				col: 2,
				style: 'graph',
				color: KIND_COLORS.value,
				label: `Value · ${v.valueType}`,
				text: valuePhrase(v),
			});
			edges.push({
				left: clauseNodeId,
				right: v.id,
				direction: 'left',
				color: KIND_COLORS.value,
				label: 'quantifies',
				style: 'graph',
				width: 1.2,
			});
		}
		for (const link of [...path.incoming, ...path.clauseOutgoing]) {
			const far = link.toClauseId === path.clauseId ? link.fromClauseId : link.toClauseId;
			const id = link.statement ? link.statement.statement.id : `link:${link.type}:${far}`;
			const color = LINK_STYLE[link.type].color;
			if (link.statement)
				node({ ...statementNode(id, link.statement, 2, ctx, () => onOpen(id)), color });
			else
				node({
					id,
					col: 2,
					style: 'graph',
					color,
					label: `Clause · ${clauseLabel(ctx.kg, far)}`,
					text: clauseGist(ctx.kg, far),
				});
			const into = link.toClauseId === path.clauseId;
			edges.push({
				left: clauseNodeId,
				right: id,
				direction: into ? 'left' : 'right',
				color,
				label: into
					? `${clauseLabel(ctx.kg, link.fromClauseId)} ${LINK_STYLE[link.type].verb}`
					: `${LINK_STYLE[link.type].verb} ${clauseLabel(ctx.kg, link.toClauseId)}`,
				style: 'graph',
				width: 2,
			});
		}
	}

	// Hop 3: the conditions of those statements.
	const hop2 = [
		...path.siblings,
		...[...path.incoming, ...path.clauseOutgoing].flatMap((l) =>
			l.statement ? [l.statement] : []
		),
	];
	for (const x of hop2) {
		for (const c of x.conditions) {
			node(conditionNode(c.condition.id, c, 3, ctx));
			edges.push({
				left: x.statement.id,
				right: c.condition.id,
				direction: 'left',
				color: KIND_COLORS.condition,
				label: 'gates',
				style: 'graph',
				width: 1,
			});
		}
	}

	return { nodes, edges };
}

interface Placed {
	edges: Array<PathEdge & { d: string; lx: number; ly: number }>;
	width: number;
	height: number;
}

/**
 * Camino de una red flag por hops. Solo se conectan relaciones del grafo;
 * las inferencias no se muestran en esta vista.
 */
export function FlagPathGraph({
	path,
	ctx,
	onOpen,
}: {
	path: FlagHopPath;
	ctx: PathCtx;
	onOpen: (statementId: string) => void;
}) {
	const arrowMarkerId = useId();
	const { nodes, edges } = useMemo(() => layout(path, ctx, onOpen), [path, ctx, onOpen]);
	const columns = COLUMNS.filter((c) => nodes.some((n) => n.col === c.col));
	const gridStyle = { gridTemplateColumns: `repeat(${columns.length}, 210px)` };
	const boxRef = useRef<HTMLDivElement>(null);
	const columnsRef = useRef<HTMLDivElement>(null);
	// Dragging the canvas moves it; a drag that ends on a node does not open it.
	const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(
		null
	);
	const [dragging, setDragging] = useState(false);
	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		const box = boxRef.current;
		if (!box || event.button !== 0) return;
		drag.current = {
			x: event.clientX,
			y: event.clientY,
			left: box.scrollLeft,
			top: box.scrollTop,
			moved: false,
		};
	};
	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const box = boxRef.current;
		const start = drag.current;
		if (!box || !start) return;
		const dx = event.clientX - start.x;
		const dy = event.clientY - start.y;
		if (!start.moved && Math.hypot(dx, dy) < 4) return;
		if (!start.moved) {
			start.moved = true;
			setDragging(true);
			box.setPointerCapture(event.pointerId);
		}
		box.scrollLeft = start.left - dx;
		box.scrollTop = start.top - dy;
	};
	const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
		const box = boxRef.current;
		if (box?.hasPointerCapture(event.pointerId)) box.releasePointerCapture(event.pointerId);
		setDragging(false);
		// Kept until the click that follows, which it cancels; cleared on the next press.
		if (drag.current && !drag.current.moved) drag.current = null;
	};
	const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
		if (drag.current?.moved) {
			event.preventDefault();
			event.stopPropagation();
		}
		drag.current = null;
	};
	const [placed, setPlaced] = useState<Placed | null>(null);

	useLayoutEffect(() => {
		const box = boxRef.current;
		const content = columnsRef.current;
		if (!box || !content) return;
		const measure = () => {
			const origin = box.getBoundingClientRect();
			const rect = (id: string) => {
				const el = box.querySelector<HTMLElement>(`[data-path-node="${CSS.escape(id)}"]`);
				if (!el) return null;
				const r = el.getBoundingClientRect();
				return {
					left: r.left - origin.left + box.scrollLeft,
					right: r.right - origin.left + box.scrollLeft,
					mid: r.top - origin.top + box.scrollTop + r.height / 2,
				};
			};
			const out: Placed['edges'] = [];
			for (const e of edges) {
				const a = rect(e.left);
				const b = rect(e.right);
				if (!a || !b) continue;
				const x1 = a.right;
				const x2 = b.left;
				const dx = Math.max(24, (x2 - x1) / 2);
				const d = `M ${x1} ${a.mid} C ${x1 + dx} ${a.mid} ${x2 - dx} ${b.mid} ${x2} ${b.mid}`;
				// The label sits near the far end, where the lines from one node have spread apart.
				const t = 0.55;
				const u = 1 - t;
				const lx =
					u * u * u * x1 + 3 * u * u * t * (x1 + dx) + 3 * u * t * t * (x2 - dx) + t * t * t * x2;
				const ly =
					u * u * u * a.mid + 3 * u * u * t * a.mid + 3 * u * t * t * b.mid + t * t * t * b.mid;
				out.push({ ...e, d, lx, ly });
			}
			setPlaced({
				edges: out,
				width: Math.max(box.clientWidth, content.offsetWidth),
				height: Math.max(box.clientHeight, content.offsetTop + content.offsetHeight),
			});
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(box);
		return () => observer.disconnect();
	}, [edges, nodes]);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-1.5 text-2xs">
				<span className="font-bold tracking-wide uppercase" style={{ color: FLAG_COLOR }}>
					Why it is a red flag · {flagTypes(path)}
				</span>
				<span className="text-muted-foreground">
					from {KIND_LABEL[path.root.statement.kind].toLowerCase()} «{path.root.statement.action}» ·{' '}
					{clauseLabel(ctx.kg, path.clauseId)}
				</span>
			</div>
			{/* No sideways scrollbar: what runs past the panel is reached by dragging. */}
			<div
				ref={boxRef}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
				onClickCapture={onClickCapture}
				className={cn(
					'relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-background select-none',
					dragging ? 'cursor-grabbing' : 'cursor-grab'
				)}
			>
				{/* Headers in a row of their own, so each column's nodes centre on the same line. */}
				<div className={cn(GRID, 'pt-3 pb-2')} style={gridStyle}>
					{columns.map((c) => (
						<p
							key={c.col}
							className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase"
						>
							{c.title}
						</p>
					))}
				</div>
				<div ref={columnsRef} className={cn(GRID, 'items-center pb-4')} style={gridStyle}>
					{columns.map((c) => (
						<div key={c.col} className="flex flex-col justify-center space-y-2.5 self-stretch">
							{nodes
								.filter((n) => n.col === c.col)
								.map((n) => (
									<NodeBox key={n.id} node={n} />
								))}
						</div>
					))}
				</div>
				{placed && (
					<svg
						className="pointer-events-none absolute top-0 left-0"
						width={placed.width}
						height={placed.height}
						aria-hidden
					>
						<defs>
							<marker
								id={arrowMarkerId}
								viewBox="0 0 10 10"
								refX="9"
								refY="5"
								markerWidth="8"
								markerHeight="8"
								markerUnits="userSpaceOnUse"
								orient="auto-start-reverse"
							>
								<path d="M 0 0 L 10 5 L 0 10 Z" fill="context-stroke" />
							</marker>
						</defs>
						{placed.edges.map((e, i) => (
							<path
								key={i}
								d={e.d}
								fill="none"
								stroke={e.color}
								strokeOpacity={0.85}
								strokeWidth={e.width ?? 1.5}
								markerStart={e.direction === 'left' ? `url(#${arrowMarkerId})` : undefined}
								markerEnd={e.direction === 'right' ? `url(#${arrowMarkerId})` : undefined}
							/>
						))}
					</svg>
				)}
				{placed?.edges
					.filter((e) => e.label)
					.map((e, i) => (
						<span
							key={i}
							className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded bg-background/95 px-1 text-[9px] font-semibold whitespace-nowrap italic"
							style={{ left: e.lx, top: e.ly, color: textColorOf(e.color) }}
						>
							{e.label}
						</span>
					))}
			</div>
		</div>
	);
}

function NodeBox({ node }: { node: PathNode }) {
	const Tag = node.onOpen ? 'button' : 'div';
	return (
		<Tag
			type={node.onOpen ? 'button' : undefined}
			onClick={node.onOpen}
			data-path-node={node.id}
			title={node.onOpen ? 'Show it in the contract' : undefined}
			className={cn(
				'relative z-10 block w-full rounded-md border bg-card px-2.5 py-1.5 text-left',
				node.onOpen && 'cursor-pointer hover:bg-muted/50'
			)}
			style={{
				borderColor: node.color,
				borderWidth: 1.5,
			}}
		>
			<span className="flex flex-wrap items-center gap-1.5">
				<span
					className="text-[9px] font-bold tracking-wide uppercase"
					style={{ color: textColorOf(node.color) }}
				>
					{node.label}
				</span>
				{node.flagged && <FlagTag />}
			</span>
			<span className="mt-0.5 block text-xs leading-snug font-medium text-foreground">
				{node.text}
			</span>
			{node.sub && (
				<span className="mt-0.5 block text-[10px] text-muted-foreground">{node.sub}</span>
			)}
		</Tag>
	);
}
