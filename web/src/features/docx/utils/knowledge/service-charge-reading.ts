import type { FlagHopPath, HopStatement } from './red-flag-hops';
import type { KnowledgeGraph } from '@/types/knowledge';

/** Evidencia para leer un pago de servicios y su cálculo, sin clasificar riesgos nuevos. */
export interface ServiceChargeReading {
	payment: HopStatement;
	calculation: HopStatement;
	missingAmount: boolean;
	missingCalculationParty: boolean;
}

/** Solo reúne enunciados de la misma anotación y del mismo párrafo, con evidencia verificada. */
export function serviceChargeReading(
	path: FlagHopPath,
	kg: KnowledgeGraph
): ServiceChargeReading | null {
	if (!path.flags.some((f) => f.type === 'services_charges')) return null;
	const same = new Set(path.sameFlag);
	const matched = [path.root, ...path.siblings.filter((s) => same.has(s.statement.id))].filter(
		(s) => s.statement.evidenceVerified === true && s.statement.evidenceSpans?.length
	);
	const payment = matched.find(
		(s) =>
			s.statement.kind === 'obligation' &&
			s.ownerId &&
			/\bpay\b.*\butility\b/i.test(s.statement.action)
	);
	if (!payment) return null;
	const calculation = matched.find(
		(s) =>
			s.statement.id !== payment.statement.id &&
			s.statement.kind === 'obligation' &&
			s.statement.clauseId === payment.statement.clauseId &&
			s.statement.paragraphIds.some((id) => payment.statement.paragraphIds.includes(id)) &&
			s.statement.evidenceSpans?.some((span) => /\bactual\b.*\bmeter readings?\b/i.test(span))
	);
	if (!calculation) return null;
	const ids = new Set([payment.statement.id, calculation.statement.id]);
	return {
		payment,
		calculation,
		missingAmount: !kg.values.some(
			(v) => v.quantifiesId && ids.has(v.quantifiesId) && v.valueType === 'Currency'
		),
		missingCalculationParty: calculation.statement.burdenPartyId === null,
	};
}
