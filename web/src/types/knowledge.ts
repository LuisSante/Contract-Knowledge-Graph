// Party-centric deontic knowledge graph (mirrors server/schemas/knowledge.py).

export type ProvisionType = 'obligation' | 'right' | 'prohibition';

/** Edges derived in code from node fields or from clause numbering. */
export type DerivedEdgeType =
	| 'is_part_of'
	| 'assigns_obligation_to'
	| 'grants_right_to'
	| 'defines';

/** Edges the LLM extracts; targets are resolved server-side after the chunk merge. */
export type ExtractedEdgeType =
	| 'uses'
	| 'references'
	| 'depends_on'
	| 'supersedes'
	| 'modifies';

/** Produced by contradiction analysis, never by extraction. */
export type AnalysisEdgeType = 'contradicts';

export type KgEdgeType = DerivedEdgeType | ExtractedEdgeType | AnalysisEdgeType;

export interface KgParty {
	id: string;
	name: string;
	role: string;
	address: string;
	aliases: string[];
	paragraphIds: string[];
}

export interface KgClause {
	id: string;
	ref: string | null;
	heading: string;
	level: number | null;
	paragraphIds: string[];
}

export interface KgDefinedTerm {
	id: string;
	term: string;
	definition: string;
	definedInClauseId: string | null;
	paragraphIds: string[];
}

export interface KgProvision {
	id: string;
	type: ProvisionType;
	action: string;
	summary: string;
	text: string;
	obligorPartyId: string | null;
	beneficiaryPartyId: string | null;
	clauseId: string | null;
	deadline: string;
	frequency: string;
	paragraphIds: string[];
}

export interface KgCondition {
	id: string;
	trigger: string;
	operator: string;
	gatesId: string | null;
	paragraphIds: string[];
}

export interface KgReference {
	id: string;
	name: string;
	citation: string;
	citedById: string | null;
	paragraphIds: string[];
}

export interface KgValue {
	id: string;
	valueType: string;
	amount: string;
	unit: string;
	quantifiesId: string | null;
	paragraphIds: string[];
}

export interface KgEdge {
	source: string;
	target: string;
	type: KgEdgeType;
	/** Verbatim wording that states the link, for extracted edges. */
	evidence: string;
	paragraphIds: string[];
}

export interface KnowledgeGraph {
	parties: KgParty[];
	clauses: KgClause[];
	definedTerms: KgDefinedTerm[];
	provisions: KgProvision[];
	conditions: KgCondition[];
	references: KgReference[];
	values: KgValue[];
	edges: KgEdge[];
}

export interface KnowledgeGraphResponse {
	status: 'success' | 'error';
	documentId: string;
	knowledgeGraph: KnowledgeGraph;
}

// Node kinds used by the visualization layer.
export type KgNodeKind =
	| 'party'
	| 'clause'
	| 'definedTerm'
	| 'provision'
	| 'condition'
	| 'reference'
	| 'value';
