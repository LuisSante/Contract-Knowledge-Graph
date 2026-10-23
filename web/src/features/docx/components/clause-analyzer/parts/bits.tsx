import {
	PAIR_SECOND_COLOR,
	PARTY_COLOR,
} from '@/features/docx/components/clause-analyzer/constants';
import type { Side } from '@/features/docx/utils/knowledge/statement-grid';

export const SIDE_COLOR: Record<Side, string> = { a: PARTY_COLOR, b: PAIR_SECOND_COLOR };

/** "Miltenyi Biotec GmbH" reads as "Miltenyi" everywhere the space is short. */
export const short = (name: string) => name.split(/[\s,]+/)[0] || name;
