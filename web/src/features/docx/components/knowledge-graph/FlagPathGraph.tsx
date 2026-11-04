'use client';

import {
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
	INFERRED_COLOR,
	InferredLine,
	LINK_STYLE,
	PathKey,
	clauseGist,
	clauseLabel,
	flagTypes,
	missingLines,
	type PathCtx,
} from '@/features/docx/components/clause-analyzer/flag-path/path-bits';
import { conditionLead } from '@/features/docx/utils/knowledge/clause-favour';
import {
	valuePhrase,
	type FlagHopPath,
	type HopCondition,
	type HopStatement,
	type Inferred,
} from '@/features/docx/utils/knowledge/red-flag-hops';

type Style = 'graph' | 'ghost' | 'inferred';

interface PathNode {
	id: string;
	col: 0 | 1 | 2 | 3 | 4;
	style: Style;
	color: string;
	label: string;
	text: ReactNode;
	sub?: string;
	flagged?: boolean;
	onOpen?: () => void;
}

interface PathEdge {
	/** Drawn from the left node to the right one; `label` names the edge and its real direction. */
	left: string;
	right: string;
	color: string;
	label?: string;
	style: Style;
	width?: number;
}

// Five fixed columns with wide gaps for the edges and their labels. The canvas may run past the
// panel: it is dragged sideways with the mouse, not scrolled.
const GRID = 'relative grid w-max grid-cols-[repeat(5,210px)] gap-x-24 px-4';

const COLUMNS = [
	{ hop: '0', title: 'The red flag' },
	{ hop: '1', title: 'Attached to it' },
	{ hop: '2', title: 'Its clause and links' },
	{ hop: '3', title: 'Their conditions' },
	{ hop: '≈', title: 'What it means (inferred)' },
];

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

/** The nodes and edges of a path, laid out by hop: every edge is one the hop is allowed to
 *  follow, and what is inferred is joined to what it compares. */
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
			color: ctx.colorOf(path.root.ownerId),
			label: s.kind === 'right' ? 'grants_right_to →' : 'assigns_obligation_to →',
			style: 'graph',
		});
	if (path.root.otherId && path.root.otherId !== path.root.ownerId)
		edges.push({
			left: rootId,
			right: partyNode(path.root.otherId),
			color: ctx.colorOf(path.root.otherId),
			label: s.kind === 'right' ? 'burdenPartyId →' : 'benefitPartyId →',
			style: 'graph',
			width: 1,
		});
	// Hop 1: its conditions.
	for (const c of path.root.conditions) {
		node(conditionNode(c.condition.id, c, 1, ctx));
		edges.push({
			left: rootId,
			right: c.condition.id,
			color: KIND_COLORS.condition,
			label: '← gates',
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
			color: NODE_COLORS.clause,
			label: 'is_part_of →',
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
			color: LINK_STYLE[link.type].color,
			label: `${link.type} →`,
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
			color: NODE_COLORS.reference,
			label: '← cited by',
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
			color: NODE_COLORS.definedTerm,
			label: 'uses →',
			style: 'graph',
			width: 1,
		});
	}
	const missing = missingLines(path, ctx).filter((m) => !m.startsWith('No edge joins'));
	if (missing.length > 0) {
		node({
			id: 'missing:root',
			col: 1,
			style: 'ghost',
			color: '',
			label: 'Not in the graph',
			text: missing.join(' · '),
		});
		edges.push({ left: rootId, right: 'missing:root', color: '', style: 'ghost' });
	}

	// Hop 2: the rest of the clause, its values, and the clauses linked to it.
	if (clauseNodeId) {
		for (const x of path.siblings) {
			node(statementNode(x.statement.id, x, 2, ctx, () => onOpen(x.statement.id)));
			edges.push({
				left: clauseNodeId,
				right: x.statement.id,
				color: NODE_COLORS.clause,
				label: '← is_part_of',
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
				color: KIND_COLORS.value,
				label: '← quantifies',
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
				color,
				label: into
					? `← ${clauseLabel(ctx.kg, link.fromClauseId)} ${LINK_STYLE[link.type].verb}`
					: `${LINK_STYLE[link.type].verb} ${clauseLabel(ctx.kg, link.toClauseId)} →`,
				style: 'graph',
				width: 2,
			});
		}
		if (path.missing.links) {
			node({
				id: 'missing:links',
				col: 2,
				style: 'ghost',
				color: '',
				label: 'Not in the graph',
				text: `Nothing modifies ${clauseLabel(ctx.kg, path.clauseId)}; it depends on or refers to no other clause`,
			});
			edges.push({ left: clauseNodeId, right: 'missing:links', color: '', style: 'ghost' });
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
				color: KIND_COLORS.condition,
				label: '← gates',
				style: 'graph',
				width: 1,
			});
		}
	}

	// Inferred: each finding joined to what it compares.
	path.inferred.forEach((item, i) => {
		const id = `inferred:${i}`;
		node({
			id,
			col: 4,
			style: 'inferred',
			color: INFERRED_COLOR,
			label: '≈ Inferred',
			text: <InferredLine item={item} path={path} ctx={ctx} />,
		});
		for (const from of comparedBy(item, path))
			if (has.has(from))
				edges.push({ left: from, right: id, color: INFERRED_COLOR, style: 'inferred' });
	});
	return { nodes, edges };
}

/** The nodes an inferred finding reads. */
function comparedBy(item: Inferred, path: FlagHopPath): string[] {
	const clause = path.clauseId ? `clause:${path.clauseId}` : null;
	switch (item.kind) {
		case 'conduct':
			return path.root.conditions
				.filter((c) => c.partyId === item.partyId)
				.map((c) => c.condition.id);
		case 'counterpart':
			return [path.root.statement.id, ...(clause ? [clause] : [])];
		case 'safeguard':
			return item.candidates.map((c) => c.statement.id);
		case 'no-safeguard':
			return [...(clause ? [clause] : []), 'missing:links'];
		case 'amounts':
		case 'timing':
			return [path.root.statement.id, item.withId];
	}
}

interface Placed {
	edges: Array<PathEdge & { d: string; lx: number; ly: number }>;
	width: number;
	height: number;
}

/**
 * Version 2: a red flag's path in the Knowledge Graph tab, in columns by hop. Each edge is
 * named and points the way the graph has it; what is missing is a grey ghost, and what is
 * inferred sits apart, joined by dotted lines to the nodes it compares.
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
	const { nodes, edges } = useMemo(() => layout(path, ctx, onOpen), [path, ctx, onOpen]);
	const boxRef = useRef<HTMLDivElement>(null);
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
		if (!box) return;
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
			setPlaced({ edges: out, width: box.scrollWidth, height: box.scrollHeight });
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
				<span className="ml-auto text-[10px] text-muted-foreground">Drag to move ✥</span>
				<PathKey />
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
				<div className={cn(GRID, 'pt-3 pb-2')}>
					{COLUMNS.map((c, i) => (
						<p
							key={c.hop}
							className={cn(
								'text-[10px] font-bold tracking-wide uppercase',
								i === 4 && 'border-l border-border/60 pl-4'
							)}
							style={{ color: i === 4 ? INFERRED_COLOR : undefined }}
						>
							<span className={cn('mr-1.5', i === 4 ? '' : 'text-muted-foreground/50')}>
								{c.hop}
							</span>
							<span className={i === 4 ? '' : 'text-muted-foreground'}>{c.title}</span>
						</p>
					))}
				</div>
				<div className={cn(GRID, 'items-center pb-4')}>
					{COLUMNS.map((c, i) => (
						<div
							key={c.hop}
							className={cn(
								'space-y-2.5 self-stretch',
								'flex flex-col justify-center',
								i === 4 && 'border-l border-border/60 pl-4'
							)}
						>
							{nodes
								.filter((n) => n.col === i)
								.map((n) => (
									<NodeBox key={n.id} node={n} />
								))}
							{i === 3 && !nodes.some((n) => n.col === 3) && (
								<p className="text-[11px] text-muted-foreground/70 italic">
									No conditions on the statements of hop 2.
								</p>
							)}
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
						{placed.edges.map((e, i) => (
							<path
								key={i}
								d={e.d}
								fill="none"
								stroke={e.style === 'ghost' ? 'var(--muted-foreground)' : e.color}
								strokeOpacity={e.style === 'ghost' ? 0.5 : e.style === 'inferred' ? 0.7 : 0.85}
								strokeWidth={e.width ?? (e.style === 'graph' ? 1.5 : 1)}
								strokeDasharray={
									e.style === 'ghost' ? '3 3' : e.style === 'inferred' ? '2 3' : undefined
								}
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
	const ghost = node.style === 'ghost';
	const inferred = node.style === 'inferred';
	const Tag = node.onOpen ? 'button' : 'div';
	return (
		<Tag
			type={node.onOpen ? 'button' : undefined}
			onClick={node.onOpen}
			data-path-node={node.id}
			title={node.onOpen ? 'Show it in the contract' : undefined}
			className={cn(
				'relative z-10 block w-full rounded-md border px-2.5 py-1.5 text-left',
				ghost || inferred ? 'border-dashed bg-background' : 'bg-card',
				node.onOpen && 'cursor-pointer hover:bg-muted/50'
			)}
			style={{
				borderColor: ghost ? 'var(--muted-foreground)' : node.color,
				borderWidth: ghost || inferred ? 1 : 1.5,
				opacity: ghost ? 0.8 : 1,
			}}
		>
			<span className="flex flex-wrap items-center gap-1.5">
				<span
					className="text-[9px] font-bold tracking-wide uppercase"
					style={{ color: ghost ? 'var(--muted-foreground)' : textColorOf(node.color) }}
				>
					{node.label}
				</span>
				{node.flagged && <FlagTag />}
			</span>
			<span
				className={cn(
					'mt-0.5 block text-xs leading-snug',
					ghost
						? 'text-muted-foreground italic'
						: inferred
							? 'text-slate-700 italic dark:text-slate-300'
							: 'font-medium text-foreground'
				)}
			>
				{ghost && <span className="mr-1 not-italic">∅</span>}
				{node.text}
			</span>
			{node.sub && (
				<span className="mt-0.5 block text-[10px] text-muted-foreground">{node.sub}</span>
			)}
		</Tag>
	);
}
