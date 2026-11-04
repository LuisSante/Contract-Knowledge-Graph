import {
	PAIR_SECOND_COLOR,
	PARTY_COLOR,
} from '@/features/docx/components/clause-analyzer/constants';
import type { Side } from '@/features/docx/utils/knowledge/statement-grid';

export const SIDE_COLOR: Record<Side, string> = { a: PARTY_COLOR, b: PAIR_SECOND_COLOR };

/** "Miltenyi Biotec GmbH" reads as "Miltenyi" everywhere the space is short. */
export const short = (name: string) => name.split(/[\s,]+/)[0] || name;

/**
 * The two parties' short names, told apart: when both start with the same word («CEEG (Nanjing)
 * Special Transformers» and «CEEG (Nanjing) PV-Tech»), each adds its first word that differs
 * («CEEG Special», «CEEG PV-Tech»).
 */
export function pairShort(names: Record<Side, string>): Record<Side, string> {
	const a = short(names.a);
	const b = short(names.b);
	if (a.toLowerCase() !== b.toLowerCase()) return { a, b };
	const words = (name: string) => name.split(/[\s,]+/).filter(Boolean);
	const wa = words(names.a);
	const wb = words(names.b);
	const at = wa.findIndex((w, i) => w.toLowerCase() !== (wb[i] ?? '').toLowerCase());
	if (at <= 0) return { a, b };
	return { a: `${a} ${wa[at]}`, b: wb[at] ? `${b} ${wb[at]}` : b };
}
