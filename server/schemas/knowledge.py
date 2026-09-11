from typing import Literal

from pydantic import BaseModel, Field

DerivedEdgeType = Literal[
    "is_part_of",
    "assigns_obligation_to",
    "grants_right_to",
    "defines",
]

ExtractedEdgeType = Literal[
    "uses",
    "references",
    "depends_on",
    "supersedes",
    "modifies",
]

AnalysisEdgeType = Literal["contradicts"]

EdgeType = DerivedEdgeType | ExtractedEdgeType | AnalysisEdgeType


class KgParty(BaseModel):
    id: str
    name: str
    role: str = ""
    address: str = ""
    aliases: list[str] = Field(default_factory=list)
    paragraphIds: list[str] = Field(default_factory=list)


class KgClause(BaseModel):
    id: str
    ref: str | None = None
    heading: str = ""
    level: int | None = None
    paragraphIds: list[str] = Field(default_factory=list)


class KgDefinedTerm(BaseModel):
    id: str
    term: str
    definition: str = ""
    definedInClauseId: str | None = None
    paragraphIds: list[str] = Field(default_factory=list)


class _KgDeontic(BaseModel):
    id: str
    action: str = ""
    summary: str
    text: str = ""
    evidenceVerified: bool | None = None
    evidenceSpans: list[str] = Field(default_factory=list)
    burdenPartyId: str | None = None
    benefitPartyId: str | None = None
    clauseId: str | None = None
    deadline: str = ""
    frequency: str = ""
    paragraphIds: list[str] = Field(default_factory=list)


class KgObligation(_KgDeontic):
    pass


class KgRight(_KgDeontic):
    pass


class KgProhibition(_KgDeontic):
    pass


class KgCondition(BaseModel):
    id: str
    trigger: str
    operator: str = ""  # IF | UNLESS | UNTIL | UPON
    gatesId: str | None = None  # statement or clause the condition gates
    paragraphIds: list[str] = Field(default_factory=list)


class KgReference(BaseModel):
    id: str
    name: str
    citation: str = ""
    citedById: str | None = None
    paragraphIds: list[str] = Field(default_factory=list)


class KgValue(BaseModel):
    id: str
    valueType: str = ""  # Currency | Percentage | Duration | Quantity
    amount: str = ""
    unit: str = ""
    quantifiesId: str | None = None
    paragraphIds: list[str] = Field(default_factory=list)


class KgEdge(BaseModel):
    source: str
    target: str
    type: EdgeType
    evidence: str = ""
    paragraphIds: list[str] = Field(default_factory=list)


class KnowledgeGraph(BaseModel):
    parties: list[KgParty] = Field(default_factory=list)
    clauses: list[KgClause] = Field(default_factory=list)
    definedTerms: list[KgDefinedTerm] = Field(default_factory=list)
    obligations: list[KgObligation] = Field(default_factory=list)
    rights: list[KgRight] = Field(default_factory=list)
    prohibitions: list[KgProhibition] = Field(default_factory=list)
    conditions: list[KgCondition] = Field(default_factory=list)
    references: list[KgReference] = Field(default_factory=list)
    values: list[KgValue] = Field(default_factory=list)
    edges: list[KgEdge] = Field(default_factory=list)
