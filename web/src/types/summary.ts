export interface ContractSummaryParty {
	/** Null when the abstract names an entity the knowledge graph has no node for. */
	partyId: string | null;
	name: string;
	role: string;
	does: string;
}

export interface ContractSummary {
	documentId: string;
	documentName: string;
	title: string;
	contractType: string;
	/** Party mentions arrive as `{{partyId|short text}}`; see MENTION in ContractAbstract. */
	summary: string;
	parties: ContractSummaryParty[];
}
