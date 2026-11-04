/** Geometría de la capa explicativa. Sus conectores no son aristas del KG. */
export interface ExplanationBox {
	l: number;
	r: number;
	t: number;
	b: number;
	mid: number;
}

export interface ExplanationConnector {
	d: string;
	arrow: boolean;
}

export interface ExplanationLayout {
	paths: ExplanationConnector[];
	labels: Array<{ x: number; y: number; text: string }>;
}

export interface ExplanationTarget {
	box: ExplanationBox | null;
	label: string;
	annotation: boolean;
}

const center = (box: ExplanationBox) => (box.l + box.r) / 2;

/** Los conceptos se leen con sus relaciones. Los carriles exteriores evitan
 * atravesar otras tarjetas al conectar aportes entre sí o con el KG. */
export function explanationLayout(
	root: ExplanationBox,
	conclusion: ExplanationBox,
	reasons: Array<ExplanationBox | null>,
	targets: ExplanationTarget[] = []
): ExplanationLayout {
	const paths: ExplanationConnector[] = [];
	const labels: ExplanationLayout['labels'] = [];
	const cx = center(conclusion);
	const rx = root.l + (root.r - root.l) * 0.8;
	paths.push({
		d: `M ${cx} ${conclusion.t} C ${cx} ${conclusion.t - 40} ${rx} ${root.b + 40} ${rx} ${root.b}`,
		arrow: true,
	});
	labels.push({ x: cx, y: conclusion.t - 26, text: 'explains' });
	const placed = reasons.flatMap((box, index) => (box ? [{ box, index }] : []));
	for (const { box, index } of placed) {
		const target = targets[index];
		if (!target?.box) continue;
		if (target.annotation) {
			const channelX = Math.min(box.l, target.box.l) - 65 - index * 16;
			paths.push({
				d: `M ${box.l} ${box.mid} H ${channelX} V ${target.box.mid} H ${target.box.l}`,
				arrow: true,
			});
			labels.push({ x: channelX, y: (box.mid + target.box.mid) / 2, text: target.label });
		} else {
			const channelX = box.r + 24 + index * 18;
			const railY = Math.min(...placed.map(({ box: other }) => other.t)) - 26 - index * 18;
			const tx = target.box.l + (target.box.r - target.box.l) * 0.8;
			paths.push({
				d: `M ${box.r} ${box.mid} H ${channelX} V ${railY} C ${channelX} ${railY - 24} ${tx} ${target.box.b + 24} ${tx} ${target.box.b}`,
				arrow: true,
			});
			labels.push({ x: channelX, y: box.mid - 14, text: target.label });
		}
	}
	// La evidencia se consulta resaltando sus tarjetas; no se duplica con enlaces genéricos.
	return { paths, labels };
}
