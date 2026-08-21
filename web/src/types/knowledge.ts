// Party-centric deontic knowledge graph (mirrors server/schemas/knowledge.py).

export type DeonticKind = 'obligation' | 'right' | 'prohibition';

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

/** Shared shape of the three deontic node kinds. The collection a node lives in
 *  (obligations / rights / prohibitions) is its kind — there is no `type` field. */
export interface KgDeontic {
	id: string;
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

export type KgObligation = KgDeontic;
export type KgRight = KgDeontic;
export type KgProhibition = KgDeontic;

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
	obligations: KgObligation[];
	rights: KgRight[];
	prohibitions: KgProhibition[];
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
	| 'obligation'
	| 'right'
	| 'prohibition'
	| 'condition'
	| 'reference'
	| 'value';

/** Flatten the three deontic collections into one list, tagging each with its
 *  kind — a convenience iterator for consumers, not a persisted "provision" node. */
export interface KgDeonticNode extends KgDeontic {
	kind: DeonticKind;
}

export function deonticNodes(kg: KnowledgeGraph): KgDeonticNode[] {
	return [
		...kg.obligations.map((n) => ({ ...n, kind: 'obligation' as const })),
		...kg.rights.map((n) => ({ ...n, kind: 'right' as const })),
		...kg.prohibitions.map((n) => ({ ...n, kind: 'prohibition' as const })),
	];
}
