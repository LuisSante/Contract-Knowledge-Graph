import type { KgValue, KnowledgeGraph } from '@/types/knowledge';

/** When and how much a statement says, as the graph holds it. */
export interface StatementTiming {
	/** The graph's `deadline` field («30 days from the invoice date»); empty when none. */
	deadline: string;
	/** The graph's `frequency` field: how often or for how long («per month»); empty when none. */
	frequency: string;
	/** The values that quantify it («USD 35.00», «25 %»), in the graph's order. */
	amounts: string[];
}

/** «USD 35.00», «25 %», «2 times monthly rent»: a value as one short phrase. */
function amountOf(value: KgValue): string {
	const amount = value.amount.trim();
	const unit = value.unit.trim();
	if (!unit) return amount;
	return value.valueType === 'Currency' ? `${unit} ${amount}` : `${amount} ${unit}`;
}

/**
 * Each statement's deadline, frequency and values, read from what the graph already holds:
 * the statement's `deadline` and `frequency` fields, and the values that quantify it. A
 * duration is left out when the statement has a deadline or frequency, which already says it
 * in words («30 days from the invoice date»). Statements with none of the three are absent.
 */
export function statementTiming(kg: KnowledgeGraph): Map<string, StatementTiming> {
	const valuesOf = new Map<string, KgValue[]>();
	for (const value of kg.values) {
		if (!value.quantifiesId) continue;
		valuesOf.set(value.quantifiesId, [...(valuesOf.get(value.quantifiesId) ?? []), value]);
	}
	const timing = new Map<string, StatementTiming>();
	for (const s of [...kg.obligations, ...kg.rights, ...kg.prohibitions]) {
		const deadline = s.deadline?.trim() ?? '';
		const frequency = s.frequency?.trim() ?? '';
		const amounts = (valuesOf.get(s.id) ?? [])
			.filter((v) => v.valueType !== 'Duration' || (!deadline && !frequency))
			.map(amountOf)
			.filter(Boolean);
		if (deadline || frequency || amounts.length > 0)
			timing.set(s.id, { deadline, frequency, amounts });
	}
	return timing;
}
