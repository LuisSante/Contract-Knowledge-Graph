// Party-centric deontic knowledge graph (mirrors server/schemas/knowledge.py).

export type ProvisionType = 'obligation' | 'right' | 'prohibition';
export type KgEdgeType = 'introduces' | 'burdens' | 'benefits';

export interface KgParty {
	id: string;
	name: string;
	role: string;
	aliases: string[];
	paragraphIds: string[];
}

export interface KgClause {
	id: string;
	ref: string | null;
	heading: string;
	paragraphIds: string[];
}

export interface KgProvision {
	id: string;
	type: ProvisionType;
	summary: string;
	text: string;
	obligorPartyId: string | null;
	beneficiaryPartyId: string | null;
	clauseId: string | null;
	paragraphIds: string[];
}

export interface KgEdge {
	source: string;
	target: string;
	type: KgEdgeType;
}

export interface KnowledgeGraph {
	parties: KgParty[];
	clauses: KgClause[];
	provisions: KgProvision[];
	edges: KgEdge[];
}

export interface KnowledgeGraphResponse {
	status: 'success' | 'error';
	documentId: string;
	knowledgeGraph: KnowledgeGraph;
}

// Node kinds used by the visualization layer.
export type KgNodeKind = 'party' | 'clause' | 'provision';
