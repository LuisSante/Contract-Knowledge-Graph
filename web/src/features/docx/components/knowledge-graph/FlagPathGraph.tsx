'use client';

import {
	createContext,
	useContext,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	type ReactNode,
} from 'react';
import { FlagExplanation } from './FlagExplanation';
import type { FlagExplanationResponse } from '@/types/flag-explanation';
import { flagExplanationInput } from '@/features/docx/utils/knowledge/flag-explanation-input';
import { cn } from '@/lib/utils';
import {
	KIND_COLORS,
	KIND_LABEL,
	NODE_COLORS,
	NEUTRAL_TEXT_COLOR,
	textColorOf,
} from '@/features/docx/components/clause-analyzer/constants';
import { short } from '@/features/docx/components/clause-analyzer/parts/bits';
import { tint } from '@/features/docx/components/clause-analyzer/parts/table-bits';
import {
	FLAG_COLOR,
	FlagTag,
	INFERRED_COLOR,
	LINK_STYLE,
	PartyChip,
	clauseGist,
	clauseLabel,
	flagTypes,
	type PathCtx,
} from '@/features/docx/components/clause-analyzer/flag-path/path-bits';
import { conditionLead } from '@/features/docx/utils/knowledge/clause-favour';
import {
	serviceChargeReading,
	type ServiceChargeReading,
} from '@/features/docx/utils/knowledge/service-charge-reading';
import {
	valuePhrase,
	type FlagHopPath,
	type HopCondition,
	type HopLink,
	type HopStatement,
	type LinkType,
} from '@/features/docx/utils/knowledge/red-flag-hops';

interface MapNode {
	id: string;
	/** IDs originales cuando una tarjeta agrupa un par recíproco. */
	nodeIds?: string[];
	color: string;
	label: ReactNode;
	text: ReactNode;
	sub?: string;
	evidence?: string[];
	note?: string;
	flagged?: boolean;
	flagLabel?: string;
	context?: boolean;
	onOpen?: () => void;
}

interface Twig {
	node: MapNode;
	label: string;
	color: string;
}

interface Branch {
	key: string;
	side: 'left' | 'right';
	question: string;
	color: string;
	twigs: Twig[];
}

interface ClauseSub {
	twigs: Twig[];
	context: MapNode[];
}

const PASSIVE: Record<LinkType, string> = {
	modifies: 'modified by',
	depends_on: 'depended on by',
	references: 'referred to by',
};

const ASK: Record<LinkType, string> = {
	modifies: 'What it changes',
	depends_on: 'What it depends on',
	references: 'What it refers to',
};

const ROLE: Record<LinkType, string> = {
	modifies: 'what it changes',
	depends_on: 'what it depends on',
	references: 'what it refers to',
};

const conditionText = (c: HopCondition) =>
	`${conditionLead(c.condition.operator)
		.replace(/^Only /, '')
		.toLowerCase()} ${c.condition.trigger}`;

function statementNode(
	hop: HopStatement,
	ctx: PathCtx,
	onOpen: (id: string) => void,
	extra: Partial<MapNode> = {},
	/** The flagged statement's own conditions get a branch of their own instead. */
	withConditions = true
): MapNode {
	const s = hop.statement;
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
	// Hop 3: its own conditions travel with it as a line, not as nodes of their own.
	const gated = withConditions
		? hop.conditions.map((c) => `gated by: ${conditionText(c)}`).join(' · ')
		: '';
	return {
		id: s.id,
		nodeIds: [
			s.id,
			...hop.conditions.map((c) => c.condition.id),
			...ctx.kg.values.filter((v) => v.quantifiesId === s.id).map((v) => v.id),
		],
		color: KIND_COLORS[s.kind],
		label: `${KIND_LABEL[s.kind]}${owner ? ` · ${short(owner.name)}` : ''} · ${clauseLabel(ctx.kg, s.clauseId)}`,
		text: s.action,
		evidence: s.evidenceSpans,
		sub: [timing, gated].filter(Boolean).join(' · ') || undefined,
		flagged: hop.flagged,
		onOpen: () => onOpen(s.id),
		...extra,
	};
}

/** Agrupa la presentación de pares recíprocos sin modificar los nodos del grafo.
 * Los calificadores deben coincidir para no ocultar diferencias entre las partes. */
function statementGroups(hops: HopStatement[]): HopStatement[][] {
	const groups: HopStatement[][] = [];
	const signature = (hop: HopStatement) =>
		JSON.stringify([
			hop.statement.kind,
			hop.statement.clauseId,
			hop.statement.text?.trim(),
			hop.statement.action,
			hop.timing,
			hop.conditions.map(({ condition }) => [condition.operator, condition.trigger]),
			hop.flagged,
		]);
	for (const hop of hops) {
		const twin = groups.find(
			([first]) =>
				first.ownerId &&
				first.otherId &&
				first.ownerId !== first.otherId &&
				hop.ownerId === first.otherId &&
				hop.otherId === first.ownerId &&
				hop.statement.clauseId &&
				hop.statement.text?.trim() &&
				signature(hop) === signature(first)
		);
		if (twin) twin.push(hop);
		else groups.push([hop]);
	}
	return groups;
}

function groupedStatementNodes(
	hops: HopStatement[],
	ctx: PathCtx,
	onOpen: (id: string) => void,
	extra: (hop: HopStatement) => Partial<MapNode>
): MapNode[] {
	return statementGroups(hops).map((group) => {
		const hop = group[0];
		const node = statementNode(hop, ctx, onOpen, extra(hop));
		if (group.length > 1) {
			node.nodeIds = group.flatMap((item) => [
				item.statement.id,
				...item.conditions.map((c) => c.condition.id),
				...ctx.kg.values.filter((v) => v.quantifiesId === item.statement.id).map((v) => v.id),
			]);
			node.label = (
				<>
					{KIND_LABEL[hop.statement.kind]} · <span style={{ color: NEUTRAL_TEXT_COLOR }}>Both</span>{' '}
					· {clauseLabel(ctx.kg, hop.statement.clauseId)}
				</>
			);
		}
		return node;
	});
}

function partyNode(id: string, ctx: PathCtx, note: string): MapNode {
	const party = ctx.kg.parties.find((p) => p.id === id);
	return {
		id: `party:${id}`,
		color: ctx.colorOf(id),
		label: 'Party',
		text: party ? `${short(party.name)}${party.role ? ` (${party.role})` : ''}` : id,
		note,
	};
}

function linkNode(link: HopLink, far: string, ctx: PathCtx, onOpen: (id: string) => void) {
	const color = LINK_STYLE[link.type].color;
	if (link.statement) return statementNode(link.statement, ctx, onOpen, { color });
	return {
		id: `link:${link.type}:${far}`,
		color,
		label: `Clause · ${clauseLabel(ctx.kg, far)}`,
		text: clauseGist(ctx.kg, far),
	};
}

/** The branches around the statement: only the graph's edges, grouped by the question they answer. */
function buildMap(path: FlagHopPath, ctx: PathCtx, onOpen: (id: string) => void) {
	const s = path.root.statement;
	const isRight = s.kind === 'right';
	const branches: Branch[] = [];

	const who: Twig[] = [];
	if (path.root.ownerId)
		who.push({
			node: partyNode(path.root.ownerId, ctx, isRight ? 'can use it' : 'carries it'),
			label: isRight ? 'grants right' : 'assigns obligation',
			color: ctx.colorOf(path.root.ownerId),
		});
	if (path.root.otherId && path.root.otherId !== path.root.ownerId)
		who.push({
			node: partyNode(path.root.otherId, ctx, isRight ? 'bears it' : 'gains from it'),
			label: isRight ? 'burdens' : 'benefits',
			color: ctx.colorOf(path.root.otherId),
		});
	if (who.length)
		branches.push({ key: 'who', side: 'left', question: 'Who', color: INFERRED_COLOR, twigs: who });

	if (path.root.conditions.length)
		branches.push({
			key: 'only-if',
			side: 'left',
			question: 'Only if',
			color: KIND_COLORS.condition,
			twigs: path.root.conditions.map((c, i) => {
				const party = c.partyId ? ctx.kg.parties.find((p) => p.id === c.partyId) : null;
				return {
					label: 'gated by',
					color: KIND_COLORS.condition,
					node: {
						id: c.condition.id,
						color: KIND_COLORS.condition,
						label: `Condition · ${conditionLead(c.condition.operator).replace(/^Only /, '')}`,
						text: c.condition.trigger,
						sub: party ? `names ${short(party.name)}` : undefined,
						note: path.root.conditions.length > 1 ? `trigger ${i + 1}` : 'the trigger',
						flagged: c.flagged,
					},
				};
			}),
		});

	// Edges that leave the statement for another clause: one branch per kind of edge.
	for (const type of ['modifies', 'depends_on', 'references'] as const) {
		const links = path.outgoing.filter((l) => l.type === type);
		if (!links.length) continue;
		branches.push({
			key: type,
			side: 'right',
			question: ASK[type],
			color: LINK_STYLE[type].color,
			twigs: links.map((l) => ({
				label: LINK_STYLE[type].verb,
				color: LINK_STYLE[type].color,
				node: {
					id: `out:${type}:${l.toClauseId}`,
					color: LINK_STYLE[type].color,
					label: `Clause · ${clauseLabel(ctx.kg, l.toClauseId)}`,
					text: clauseGist(ctx.kg, l.toClauseId),
					note: ROLE[type],
				},
			})),
		});
	}

	const cites: Twig[] = [
		...path.cites.map((r) => ({
			label: 'cites',
			color: NODE_COLORS.reference,
			node: {
				id: r.id,
				color: NODE_COLORS.reference,
				label: 'Reference',
				text: `«${r.name || r.citation}»`,
				sub: r.citation ? r.citation : 'no citation in the graph',
			},
		})),
		...path.terms.map((t) => ({
			label: 'uses',
			color: NODE_COLORS.definedTerm,
			node: {
				id: t.id,
				color: NODE_COLORS.definedTerm,
				label: 'Defined term',
				text: `«${t.term}»`,
				sub: t.definition,
			},
		})),
	];
	if (cites.length)
		branches.push({
			key: 'cites',
			side: 'right',
			question: 'What it cites',
			color: NODE_COLORS.reference,
			twigs: cites,
		});

	let clauseSub: ClauseSub | null = null;
	if (path.clauseId) {
		const here = clauseLabel(ctx.kg, path.clauseId);
		branches.push({
			key: 'where',
			side: 'right',
			question: 'Where',
			color: NODE_COLORS.clause,
			twigs: [
				{
					label: 'part of',
					color: NODE_COLORS.clause,
					node: {
						id: `clause:${path.clauseId}`,
						color: NODE_COLORS.clause,
						label: 'Clause',
						text: `${here} ${clauseGist(ctx.kg, path.clauseId)}`,
						note: 'where it is written',
					},
				},
			],
		});
		const same = new Set(path.sameFlag);
		clauseSub = {
			twigs: [
				...path.clauseValues.map((v) => ({
					label: 'quantified by',
					color: KIND_COLORS.value,
					node: {
						id: v.id,
						color: KIND_COLORS.value,
						label: `Value · ${here}`,
						text: valuePhrase(v),
					},
				})),
				...path.incoming.map((l) => ({
					label: `${PASSIVE[l.type]} ${clauseLabel(ctx.kg, l.fromClauseId)}`,
					color: LINK_STYLE[l.type].color,
					node: linkNode(l, l.fromClauseId, ctx, onOpen),
				})),
				...path.clauseOutgoing.map((l) => ({
					label: `contains · ${LINK_STYLE[l.type].verb} ${clauseLabel(ctx.kg, l.toClauseId)}`,
					color: LINK_STYLE[l.type].color,
					node: linkNode(l, l.toClauseId, ctx, onOpen),
				})),
			],
			context: groupedStatementNodes(
				path.siblings.filter((x) => !same.has(x.statement.id)),
				ctx,
				onOpen,
				(x) => ({
					context: true,
					flagLabel: x.flagged ? 'other red flag' : undefined,
				})
			),
		};
	}

	const leadHere = path.flags.length > 1 ? `${path.flags.length} red flags lead here` : '';
	const root = statementNode(path.root, ctx, onOpen, { note: 'the provision under review' }, false);
	root.sub = [leadHere, root.sub].filter(Boolean).join(' · ') || undefined;
	const same = new Set(path.sameFlag);
	const companions = groupedStatementNodes(
		path.siblings.filter((x) => same.has(x.statement.id)),
		ctx,
		onOpen,
		(x) => ({
			flagLabel: 'same red flag',
			evidence: x.statement.evidenceSpans,
		})
	);
	return { root, companions, branches, clauseSub };
}

interface Geo {
	width: number;
	height: number;
	paths: Array<{
		d: string;
		color: string;
		width: number;
		dash?: string;
		opacity?: number;
		nodeIds?: string[];
		derived?: boolean;
		arrow?: boolean;
	}>;
	labels: Array<{ x: number; y: number; text: string; color: string }>;
	pills: Array<{ x: number; y: number; text: string; color: string }>;
}

/** The safeguard card's id among the reasons: never one of the model's explanation-N ids. */
const SAFEGUARD_ID = 'safeguard';
const HighlightContext = createContext<ReadonlySet<string>>(new Set());
const idsOf = (node: MapNode) =>
	node.nodeIds ?? [node.id.replace(/^(?:party:|clause:|out:[^:]+:|link:[^:]+:)/, '')];

const curve = (x1: number, y1: number, x2: number, y2: number) => {
	const mx = (x1 + x2) / 2;
	return `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
};

export function FlagPathGraph({
	docId,
	path,
	ctx,
	onOpen,
}: {
	docId: string;
	path: FlagHopPath;
	ctx: PathCtx;
	onOpen: (statementId: string) => void;
}) {
	const { root, companions, branches, clauseSub } = useMemo(
		() => buildMap(path, ctx, onOpen),
		[path, ctx, onOpen]
	);
	const left = useMemo(() => branches.filter((b) => b.side === 'left'), [branches]);
	const right = useMemo(() => branches.filter((b) => b.side === 'right'), [branches]);
	const reading = useMemo(() => serviceChargeReading(path, ctx.kg), [path, ctx.kg]);
	const [showContext, setShowContext] = useState(false);
	const [highlightIds, setHighlightIds] = useState<ReadonlySet<string>>(new Set());
	const [rawExplanation, setExplanation] = useState<FlagExplanationResponse | null>(null);
	// La misma lista visible alimenta las tarjetas, la selección y sus conexiones.
	const explanation = useMemo(
		() =>
			rawExplanation
				? {
						...rawExplanation,
						explanation: {
							...rawExplanation.explanation,
							reasons: rawExplanation.explanation.reasons
								.filter((reason) => !('basis' in reason && reason.basis === 'graph'))
								.map((reason, index) => ({
									...reason,
									id: reason.id ?? `explanation-${index + 1}`,
									concept: reason.concept ?? ('title' in reason ? String(reason.title) : ''),
									kind: reason.kind ?? 'interpretation',
									targetId:
										reason.targetId ??
										('targetNodeId' in reason ? String(reason.targetNodeId) : root.id),
									relation: reason.relation ?? 'explains',
								}))
								// The safeguard is one more card, after the reasons, hanging from what it limits.
								.concat(
									rawExplanation.explanation.safeguard
										? [
												{
													...rawExplanation.explanation.safeguard,
													id: SAFEGUARD_ID,
													kind: 'interpretation' as const,
												},
											]
										: []
								),
						},
					}
				: null,
		[rawExplanation, root.id]
	);
	const [selectedReason, setSelectedReason] = useState<number | null>(null);
	const explanationInput = useMemo(() => flagExplanationInput(path, ctx.kg), [path, ctx.kg]);
	const highlight = (ids: string[]) => {
		setHighlightIds(new Set(ids));
		if (clauseSub?.context.some((node) => idsOf(node).some((id) => ids.includes(id))))
			setShowContext(true);
	};
	const selectReason = (index: number | null, result = explanation) => {
		setSelectedReason(index);
		const chain = [];
		let reason = index === null ? undefined : result?.explanation.reasons[index];
		const seen = new Set<string>();
		while (reason && !seen.has(reason.id)) {
			chain.push(reason);
			seen.add(reason.id);
			reason = result?.explanation.reasons.find((item) => item.id === reason?.targetId);
		}
		const evidenceIds = chain.flatMap((item) => item.evidenceIds);
		const target = chain.at(-1)?.targetId;
		highlight([
			...(result?.evidence.filter((e) => evidenceIds.includes(e.id)).flatMap((e) => e.nodeIds) ??
				[]),
			...(target ? [target] : []),
		]);
	};
	const showExplanation = (result: FlagExplanationResponse | null) => {
		setExplanation(result);
		selectReason(result?.explanation.reasons.length ? 0 : null, result);
	};

	const boxRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<HTMLDivElement>(null);
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

	// T layout: the provision on the left, neither party's; a lane per party on the right, with
	// WHO at the corner. Every line reads forward, to the right or down.
	const ownerId = path.root.ownerId;
	const otherId = path.root.otherId && path.root.otherId !== ownerId ? path.root.otherId : null;
	const laneKey = [ownerId, otherId].filter(Boolean).join('|');
	const laneIds = useMemo(() => (laneKey ? laneKey.split('|') : []), [laneKey]);
	const who = left.find((b) => b.key === 'who') ?? null;
	const onlyIf = left.find((b) => b.key === 'only-if') ?? null;
	// A condition goes in the lane of the party its trigger names; one naming none stays neutral.
	const conditionLane = useMemo(() => {
		const lane = new Map<string, string | null>();
		for (const c of path.root.conditions)
			lane.set(c.condition.id, c.partyId && laneIds.includes(c.partyId) ? c.partyId : null);
		return lane;
	}, [path.root.conditions, laneIds]);
	const spine = useMemo(() => {
		const neutralConditions = onlyIf?.twigs.filter((t) => !conditionLane.get(t.node.id)) ?? [];
		return [
			...(onlyIf && neutralConditions.length ? [{ ...onlyIf, twigs: neutralConditions }] : []),
			...right,
		];
	}, [onlyIf, right, conditionLane]);
	// Each reason sits in the lane of the party its chain starts from, one column per step.
	const placedReasons = useMemo(() => {
		const reasons = explanation?.explanation.reasons ?? [];
		const byId = new Map(reasons.map((r) => [r.id, r] as const));
		const exposed =
			explanation?.explanation.exposedPartyIds.find((id) => laneIds.includes(id)) ?? null;
		return reasons.map((reason, index) => {
			let base = reason;
			let depth = 1;
			const seen = new Set([reason.id]);
			while (byId.has(base.targetId) && !seen.has(base.targetId)) {
				base = byId.get(base.targetId)!;
				seen.add(base.id);
				depth += 1;
			}
			const lane = laneIds.includes(base.targetId)
				? base.targetId
				: (exposed ?? laneIds[0] ?? null);
			// A card's column is its chain's length, so every line reads left to right: the
			// mechanism next to the party, then what hangs from it.
			return { reason, index, depth, lane };
		});
	}, [explanation, laneIds]);

	// The risk (the explanation's summary) sits in the exposed party's lane, joined to the
	// provision by one line: «why it is a risk». With no exposed party in a lane, it stays above
	// the provision.
	const riskLane =
		explanation?.explanation.exposedPartyIds.find((id) => laneIds.includes(id)) ?? null;

	const [split, setSplit] = useState<number | null>(null);
	const [geo, setGeo] = useState<Geo | null>(null);
	useLayoutEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		const measure = () => {
			const o = map.getBoundingClientRect();
			const box = (el: Element | null) => {
				if (!el) return null;
				const r = el.getBoundingClientRect();
				return {
					l: r.left - o.left,
					r: r.right - o.left,
					t: r.top - o.top,
					mid: r.top - o.top + r.height / 2,
					b: r.bottom - o.top,
				};
			};
			// A node's own box first: the provision also lists its conditions among its ids.
			const node = (id: string) =>
				box(
					map.querySelector(`[data-map-node="${CSS.escape(id)}"]`) ??
						map.querySelector(`[data-map-ids~="${CSS.escape(id)}"]`)
				);
			const rootBox = node(root.id);
			if (!rootBox) return;
			// The first lane ends where the provision's middle is, so WHO sits on the boundary.
			if (laneIds.length)
				setSplit((prev) =>
					prev !== null && Math.abs(prev - rootBox.mid) < 1 ? prev : rootBox.mid
				);
			const out: Geo = {
				width: map.offsetWidth,
				height: map.offsetHeight,
				paths: [],
				labels: [],
				pills: [],
			};
			const twig = (x1: number, y1: number, x2: number, y2: number, t: Twig, label = true) => {
				out.paths.push({
					d: curve(x1, y1, x2, y2),
					color: t.color,
					width: 1.75,
					nodeIds: idsOf(t.node),
				});
				if (label)
					out.labels.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, text: t.label, color: t.color });
			};
			// WHO at the corner: one thick line from the provision, then a twig into each lane.
			const neutral = box(map.querySelector('[data-zone="neutral"]'));
			const firstLane = box(map.querySelector('[data-zone="lane-0"]'));
			if (who && neutral && firstLane) {
				const hub = { x: neutral.r + 46, y: firstLane.b };
				out.paths.push({
					d: curve(rootBox.r, rootBox.mid, hub.x - 22, hub.y),
					color: who.color,
					width: 5,
					opacity: 0.7,
					nodeIds: who.twigs.flatMap((t) => idsOf(t.node)),
				});
				out.pills.push({ x: hub.x, y: hub.y, text: who.question, color: who.color });
				for (const t of who.twigs) {
					const x = node(t.node.id);
					if (x) twig(hub.x + 22, hub.y, x.l, x.mid, t);
				}
			}
			// A condition that names a party sits in that party's lane, gating the provision.
			for (const t of onlyIf?.twigs ?? []) {
				if (!conditionLane.get(t.node.id)) continue;
				const x = node(t.node.id);
				if (x) twig(rootBox.r, rootBox.mid + 16, x.l, x.mid, { ...t, label: 'only if' });
			}
			// The spine under the provision: WHERE, what it changes, what it cites, each a stop.
			const pills = spine
				.map((b) => box(map.querySelector(`[data-spine-pill="${CSS.escape(b.key)}"]`)))
				.filter((x): x is NonNullable<typeof x> => x !== null);
			if (pills.length) {
				const x = (pills[0].l + pills[0].r) / 2;
				out.paths.push({
					d: `M ${x} ${rootBox.b} V ${pills[pills.length - 1].t}`,
					color: '#7d9cc6',
					width: 5,
					opacity: 0.7,
				});
				spine.forEach((b, i) => {
					const pill = pills[i];
					if (!pill) return;
					for (const t of b.twigs) {
						const n = node(t.node.id);
						if (n) twig(pill.r, pill.mid, n.l, Math.min(n.mid, n.t + 22), t, false);
					}
				});
			}
			// What hangs from the clause sits under it: an elbow down its left side, still outward.
			if (clauseSub && path.clauseId) {
				const clause = node(`clause:${path.clauseId}`);
				if (clause) {
					const x0 = clause.l + 10;
					const elbow = (to: { l: number; mid: number }) =>
						`M ${x0} ${clause.b} V ${to.mid - 6} Q ${x0} ${to.mid} ${x0 + 6} ${to.mid} H ${to.l}`;
					for (const t of clauseSub.twigs) {
						const x = node(t.node.id);
						if (x)
							out.paths.push({ d: elbow(x), color: t.color, width: 1.5, nodeIds: idsOf(t.node) });
					}
					const fold = box(map.querySelector('[data-map-context]'));
					if (fold) out.paths.push({ d: elbow(fold), color: '#a3a3a3', width: 1.25, dash: '5 4' });
				}
			}
			// The reading layer: from the summary down to the provision, and from each card's
			// destination forward to the card. Its lines are dashed: they are not the graph's.
			if (explanation) {
				const color = 'var(--muted-foreground)';
				const derived = (d: string) =>
					out.paths.push({ d, color, width: 1.25, dash: '4 5', derived: true });
				const summary = box(map.querySelector('[data-explanation-card="conclusion"]'));
				if (summary && riskLane) {
					// Leaves the provision on the side of the risk's lane, so it clears WHO's line.
					const y = laneIds.indexOf(riskLane) === 0 ? rootBox.t + 26 : rootBox.b - 26;
					derived(curve(rootBox.r, y, summary.l, summary.mid));
					out.labels.push({
						x: rootBox.r + (summary.l - rootBox.r) * 0.62,
						y: y + (summary.mid - y) * 0.62,
						text: 'why it is a risk',
						color,
					});
				} else if (summary) {
					const x = rootBox.l + (rootBox.r - rootBox.l) / 2;
					derived(`M ${x} ${summary.b} V ${rootBox.t}`);
					out.labels.push({ x: x + 30, y: (summary.b + rootBox.t) / 2, text: 'explains', color });
				}
				const reasons = explanation.explanation.reasons;
				reasons.forEach((reason, index) => {
					const card = box(map.querySelector(`[data-explanation-card="reason-${index}"]`));
					const at = reasons.findIndex((other) => other.id === reason.targetId);
					const from =
						at >= 0
							? box(map.querySelector(`[data-explanation-card="reason-${at}"]`))
							: node(reason.targetId);
					if (!card || !from) return;
					derived(curve(from.r, from.mid, card.l, card.mid));
					out.labels.push({
						x: (from.r + card.l) / 2,
						y: (from.mid + card.mid) / 2,
						text: reason.relation,
						color,
					});
				});
			}

			setGeo(out);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(map);
		return () => observer.disconnect();
	}, [
		root,
		who,
		onlyIf,
		spine,
		clauseSub,
		conditionLane,
		laneIds,
		path.clauseId,
		showContext,
		explanation,
		riskLane,
	]);

	const isRight = path.root.statement.kind === 'right';
	const t = path.root.timing;
	const when = [t?.deadline, t?.frequency].filter(Boolean).join(' · ');
	const conditions = path.root.conditions.length;
	const neutralReasons = placedReasons.filter((p) => p.lane === null);
	const riskCard = explanation && (
		<article
			data-explanation-card="conclusion"
			className="relative z-10 rounded-md border border-dashed border-muted-foreground bg-card p-3 text-xs"
		>
			<span className="text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
				{riskLane ? 'Risk · reading' : 'Reading · summary'}
			</span>
			<h3 className="mt-0.5 text-sm font-semibold" aria-label="Risk summary">
				{explanation.explanation.summary}
			</h3>
		</article>
	);

	const reasonCard = ({ reason, index }: (typeof placedReasons)[number]) => {
		const active = selectedReason === index;
		const missing = reason.kind === 'missing_information';
		const label = reason.id === SAFEGUARD_ID ? 'Safeguard' : missing ? 'Information gap' : null;
		return (
			<article
				key={reason.id}
				data-explanation-card={`reason-${index}`}
				className={cn(
					'relative z-10 rounded-md border border-dashed border-muted-foreground/60 bg-card p-3 text-xs',
					active && 'ring-2 ring-primary/50'
				)}
			>
				<button
					type="button"
					aria-pressed={active}
					className="w-full text-left"
					onClick={() => selectReason(active ? null : index)}
				>
					{label && (
						<span className="text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
							{label}
						</span>
					)}
					<h4 className="mt-0.5 font-semibold">{reason.concept}</h4>
				</button>
			</article>
		);
	};

	const zoneLabel = (text: string, color?: string) => (
		<p
			className="text-[10px] font-bold tracking-wide uppercase"
			style={{ color: color ? textColorOf(color) : 'var(--muted-foreground)' }}
		>
			{text}
		</p>
	);

	return (
		<HighlightContext.Provider value={highlightIds}>
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-1.5 text-2xs">
					<span className="font-bold tracking-wide uppercase" style={{ color: FLAG_COLOR }}>
						Why it is a red flag · {flagTypes(path)}
					</span>
					<span className="text-muted-foreground">
						from {KIND_LABEL[path.root.statement.kind].toLowerCase()} «{path.root.statement.action}»
						· {clauseLabel(ctx.kg, path.clauseId)}
					</span>
				</div>
				{reading && <ServiceReading reading={reading} ctx={ctx} onOpen={onOpen} />}
				{/* What the map below answers, read from it: no sentence the graph does not hold. */}
				<div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 bg-muted/30 px-3 py-1.5 text-2xs">
					<span
						className="rounded border border-dashed px-1 text-[9px] font-semibold"
						style={{ color: INFERRED_COLOR, borderColor: INFERRED_COLOR }}
						title="Read from the map below; nothing here is added to the graph"
					>
						reading
					</span>
					<Fact question={isRight ? 'Who can use it' : 'Who carries it'}>
						<PartyChip id={path.root.ownerId} ctx={ctx} />
					</Fact>
					<Fact question={isRight ? 'Who bears it' : 'Who gains'}>
						<PartyChip id={path.root.otherId} ctx={ctx} />
					</Fact>
					<Fact question="Only if">
						{conditions
							? `${conditions === 1 ? 'one condition' : `one of ${conditions} conditions`}`
							: 'no condition in the graph'}
					</Fact>
					<Fact question="When">{when || 'not in the graph'}</Fact>
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
					<div ref={mapRef} className="relative flex min-h-full w-max items-stretch">
						{/* The provision: neither party's, read top to bottom. */}
						<div
							data-zone="neutral"
							className="flex w-[420px] shrink-0 flex-col border-r border-border/70 bg-muted/25 px-6 pt-4 pb-8"
						>
							{zoneLabel('The provision · neither party')}
							{!explanation ? (
								<div className="mt-3">
									<FlagExplanation
										key={JSON.stringify(explanationInput)}
										docId={docId}
										input={explanationInput}
										onResult={showExplanation}
									/>
								</div>
							) : (
								!riskLane && <div className="mt-3">{riskCard}</div>
							)}
							<div className={explanation && !riskLane ? 'mt-10' : 'mt-4'}>
								<NodeBox node={root} strong />
							</div>
							{companions.length > 0 && (
								<div className="mt-4 space-y-2.5">
									<p className="text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
										Same annotated fragment
									</p>
									{companions.map((n) => (
										<NodeBox key={n.id} node={n} />
									))}
								</div>
							)}
							{spine.length > 0 && (
								<div className="mt-7 flex flex-col gap-6">
									{spine.map((b) => (
										<div key={b.key} className="flex items-start gap-5">
											<span
												data-spine-pill={b.key}
												className="relative z-20 mt-2 w-[76px] shrink-0 rounded-full border bg-card px-1.5 py-0.5 text-center text-[9px] font-bold tracking-wide uppercase"
												style={{
													color: textColorOf(b.color),
													borderColor: b.color,
													backgroundImage: `linear-gradient(${tint(b.color, 16)}, ${tint(b.color, 16)})`,
												}}
											>
												{b.question}
											</span>
											<div className="flex min-w-0 flex-1 flex-col gap-2.5">
												{b.twigs.map((t) => (
													<NodeBox key={t.node.id} node={t.node} via={t} />
												))}
												{b.key === 'where' && clauseSub && (
													<div className="ml-5 flex flex-col gap-2">
														{clauseSub.twigs.map((t) => (
															<NodeBox key={t.node.id} node={t.node} via={t} />
														))}
														{clauseSub.context.length > 0 && (
															<div
																data-map-context
																className="rounded-md border border-dashed border-border p-2"
															>
																<button
																	type="button"
																	aria-expanded={showContext}
																	onClick={() => setShowContext((v) => !v)}
																	className="flex w-full items-center gap-1.5 text-left text-[9px] font-bold tracking-wide text-muted-foreground uppercase"
																>
																	<span>{showContext ? '▾' : '▸'}</span>
																	Context · {clauseSub.context.length} more in{' '}
																	{clauseLabel(ctx.kg, path.clauseId)}
																</button>
																{showContext && (
																	<div className="mt-2 flex flex-col gap-2">
																		{clauseSub.context.map((n) => (
																			<NodeBox key={n.id} node={n} />
																		))}
																	</div>
																)}
															</div>
														)}
													</div>
												)}
											</div>
										</div>
									))}
								</div>
							)}
							{neutralReasons.length > 0 && (
								<div className="mt-8 flex flex-col gap-3">{neutralReasons.map(reasonCard)}</div>
							)}
						</div>
						{/* A lane per party: what reaches it, read left to right from the party. */}
						{laneIds.length > 0 && (
							<div className="flex min-w-[600px] flex-col">
								{laneIds.map((id, i) => {
									const color = ctx.colorOf(id);
									const party = ctx.kg.parties.find((p) => p.id === id);
									const partyTwig = who?.twigs.find((t) => t.node.id === `party:${id}`);
									const conds =
										onlyIf?.twigs.filter((t) => conditionLane.get(t.node.id) === id) ?? [];
									const mine = placedReasons.filter((p) => p.lane === id);
									const depth = Math.max(0, ...mine.map((p) => p.depth));
									const first = i === 0;
									const partyCol = [
										...(first ? conds : []),
										...(partyTwig ? [partyTwig] : []),
										...(first ? [] : conds),
									];
									return (
										<div
											key={id}
											data-zone={`lane-${i}`}
											className={cn(
												'relative flex gap-[110px] pr-10 pl-[120px]',
												first ? 'items-end pt-12 pb-6' : 'flex-1 items-start pt-10 pb-12'
											)}
											style={{
												backgroundColor: tint(color, 7),
												minHeight: first && split !== null ? split : undefined,
											}}
										>
											<span className="absolute top-3 left-[120px]">
												{zoneLabel(
													party
														? `${short(party.name)}${party.role ? ` (${party.role})` : ''}`
														: id,
													color
												)}
											</span>
											<div className="flex w-[210px] shrink-0 flex-col gap-2.5">
												{first && riskLane === id && <div className="mb-6">{riskCard}</div>}
												{partyCol.map((t) => (
													<NodeBox key={t.node.id} node={t.node} />
												))}
												{!first && riskLane === id && <div className="mt-6">{riskCard}</div>}
											</div>
											{Array.from({ length: depth }, (_, d) => (
												<div key={d} className="flex w-[230px] shrink-0 flex-col gap-4">
													{mine.filter((p) => p.depth === d + 1).map(reasonCard)}
												</div>
											))}
										</div>
									);
								})}
							</div>
						)}
						{geo && (
							<svg
								className="pointer-events-none absolute top-0 left-0"
								width={geo.width}
								height={geo.height}
								aria-hidden
							>
								<defs>
									<marker
										id="explanation-arrow"
										viewBox="0 0 8 8"
										refX="7"
										refY="4"
										markerWidth="5"
										markerHeight="5"
										orient="auto-start-reverse"
									>
										<path d="M 0 0 L 8 4 L 0 8" fill="none" stroke="var(--muted-foreground)" />
									</marker>
								</defs>
								{geo.paths.map((p, i) => (
									<path
										key={i}
										d={p.d}
										fill="none"
										stroke={p.color}
										strokeOpacity={
											!p.derived &&
											highlightIds.size &&
											!p.nodeIds?.some((id) => highlightIds.has(id))
												? 0.15
												: (p.opacity ?? 0.85)
										}
										strokeWidth={
											p.width + (p.nodeIds?.some((id) => highlightIds.has(id)) ? 1.5 : 0)
										}
										strokeLinecap="round"
										strokeDasharray={p.dash}
										markerEnd={
											p.derived && p.arrow !== false ? 'url(#explanation-arrow)' : undefined
										}
									/>
								))}
							</svg>
						)}
						{geo?.labels.map((l, i) => (
							<span
								key={i}
								className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded bg-background/95 px-1 text-[9px] font-semibold whitespace-nowrap italic"
								style={{ left: l.x, top: l.y, color: textColorOf(l.color) }}
							>
								{l.text}
							</span>
						))}
						{geo?.pills.map((p, i) => (
							<span
								key={i}
								className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-card px-2 py-0.5 text-[9px] font-bold tracking-wide whitespace-nowrap uppercase"
								style={{
									left: p.x,
									top: p.y,
									color: textColorOf(p.color),
									borderColor: p.color,
									backgroundImage: `linear-gradient(${tint(p.color, 16)}, ${tint(p.color, 16)})`,
								}}
							>
								{p.text}
							</span>
						))}
					</div>
				</div>
			</div>
		</HighlightContext.Provider>
	);
}

function Fact({ question, children }: { question: string; children: ReactNode }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<span className="text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
				{question}
			</span>
			<span className="font-medium text-foreground">{children}</span>
		</span>
	);
}

/** Lectura acotada a la evidencia del pago y del contador, con sus límites separados. */
function ServiceReading({
	reading,
	ctx,
	onOpen,
}: {
	reading: ServiceChargeReading;
	ctx: PathCtx;
	onOpen: (id: string) => void;
}) {
	const { payment, calculation } = reading;
	const payer = ctx.kg.parties.find((p) => p.id === payment.ownerId);
	const frequency = payment.statement.frequency.trim();
	return (
		<section className="border-b border-border/60 bg-muted/30 px-3 py-3" aria-label="Risk reading">
			<p className="mb-1 text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
				Reading · based on the two statements below
			</p>
			<p className="text-sm leading-relaxed">
				{payer?.name ?? 'The recorded payer'} must pay utility costs
				{frequency ? ` ${frequency}` : ''}, calculated from actual meter readings.
			</p>
			<div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
				{[payment, calculation].map((s) => (
					<button
						key={s.statement.id}
						type="button"
						onClick={() => onOpen(s.statement.id)}
						className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
						title="Show the supporting text in the contract"
					>
						{s.statement.action} · evidence
					</button>
				))}
			</div>
			{(reading.missingAmount || reading.missingCalculationParty) && (
				<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
					Limits of this explanation:{' '}
					{[
						reading.missingAmount &&
							'no monetary amount is linked to these statements in the graph',
						reading.missingCalculationParty && 'no party is assigned the calculation',
					]
						.filter(Boolean)
						.join('; ')}
					. These gaps do not establish a risk by themselves.
				</p>
			)}
		</section>
	);
}

function NodeBox({ node, strong, via }: { node: MapNode; strong?: boolean; via?: Twig }) {
	const highlightIds = useContext(HighlightContext);
	const highlighted = idsOf(node).some((id) => highlightIds.has(id));
	const Tag = node.onOpen ? 'button' : 'div';
	return (
		<Tag
			type={node.onOpen ? 'button' : undefined}
			onClick={node.onOpen}
			data-map-node={node.id}
			data-map-ids={idsOf(node).join(' ')}
			title={node.onOpen ? 'Show it in the contract' : undefined}
			className={cn(
				'relative z-10 block w-full rounded-md border bg-card px-2.5 py-1.5 text-left',
				node.onOpen && 'cursor-pointer hover:bg-muted/50',
				node.context && 'border-dashed opacity-65',
				highlighted && 'ring-2 ring-primary ring-offset-2 ring-offset-background !opacity-100'
			)}
			style={{
				borderColor: node.color,
				borderWidth: node.context ? 1 : strong ? 2 : 1.5,
			}}
		>
			{/* Under the clause there is no room for a label on the line: the relation heads the box. */}
			{via && (
				<span
					className="mb-0.5 block text-[9px] font-semibold italic"
					style={{ color: textColorOf(via.color) }}
				>
					{via.label}
				</span>
			)}
			<span className="flex flex-wrap items-center gap-1.5">
				<span
					className="text-[9px] font-bold tracking-wide uppercase"
					style={{ color: textColorOf(node.color) }}
				>
					{node.label}
				</span>
				{node.flagged && <FlagTag label={node.flagLabel} />}
			</span>
			<span
				className={cn(
					'mt-0.5 block leading-snug font-medium text-foreground',
					strong ? 'text-sm' : 'text-xs'
				)}
			>
				{node.text}
			</span>
			{node.sub && (
				<span className="mt-0.5 block text-[10px] text-muted-foreground">{node.sub}</span>
			)}
			{node.evidence?.map((span, i) => (
				<span key={i} className="mt-2 block border-l-2 border-border pl-2 text-xs leading-relaxed">
					<span className="mb-0.5 block text-[9px] font-semibold text-muted-foreground uppercase">
						Evidence
					</span>
					«{span}»
				</span>
			))}
			{node.note && (
				<span
					className="mt-0.5 block text-[10px] font-semibold italic"
					style={{ color: INFERRED_COLOR }}
				>
					{node.note}
				</span>
			)}
		</Tag>
	);
}
