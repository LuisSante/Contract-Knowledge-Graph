export type DeonticKind = 'obligation' | 'right' | 'prohibition';

export type DerivedEdgeType =
	| 'is_part_of'
	| 'assigns_obligation_to'
	| 'grants_right_to'
	| 'defines';

export type ExtractedEdgeType =
	| 'uses'
	| 'references'
	| 'depends_on'
	| 'supersedes'
	| 'modifies';

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

export interface KgDeontic {
	id: string;
	action: string;
	summary: string;
	text: string;
	burdenPartyId: string | null;
	benefitPartyId: string | null;
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
