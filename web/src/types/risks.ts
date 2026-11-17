/** A statement the system's detector judged risky, as the server keeps it (a file per contract
 *  in infra/json/risks/).
 *  Not to be confused with a red flag, which is the dataset's annotation and only validates. */
export interface ContractRisk {
	/** The obligation, right or prohibition it points at: the square to mark. */
	statementId: string;
	/** One of the lease red-flag types the detector was given, e.g. `landlord_repairs`. */
	type: string;
	/** The model's one-sentence reason. */
	reason: string;
}

export interface ContractRisks {
	documentId: string;
	model: string;
	clausesReviewed: number;
	/** Clauses whose review failed: their statements were never judged. */
	clausesFailed: number;
	risks: ContractRisk[];
}
