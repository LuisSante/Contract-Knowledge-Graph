from typing import Literal

from pydantic import BaseModel, Field

DerivedEdgeType = Literal[
    "is_part_of",
    "assigns_obligation_to",  # obligation | prohibition -> obligor party
    "grants_right_to",  # right                    -> holder party
    "defines",  # clause -> defined term
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
    role: str = ""  # e.g. "Company", "Distributor", "Supplier"
    address: str = ""
    aliases: list[str] = Field(default_factory=list)
    paragraphIds: list[str] = Field(default_factory=list)


class KgClause(BaseModel):
    id: str
    ref: str | None = None  # "Section 3.2", "Article 5", or None if unnumbered
    heading: str = ""
    level: int | None = None  # nesting depth implied by the numbering
    paragraphIds: list[str] = Field(default_factory=list)


class KgDefinedTerm(BaseModel):
    id: str
    term: str  # "Confidential Information"
    definition: str = ""  # verbatim span (provenance)
    definedInClauseId: str | None = None
    paragraphIds: list[str] = Field(default_factory=list)


class _KgDeontic(BaseModel):
    id: str
    action: str = ""  # short verb phrase, e.g. "Pay Invoices"
    summary: str  # short paraphrase of the duty/right/restriction
    text: str = ""  # verbatim span copied from the source paragraph (provenance)
    burdenPartyId: str | None = None  # party that must comply / is prohibited
    benefitPartyId: str | None = None  # party that benefits / holds the right
    clauseId: str | None = None
    deadline: str = ""  # "within 30 days of receipt"
    frequency: str = ""  # "once per calendar year"
    paragraphIds: list[str] = Field(default_factory=list)


class KgObligation(_KgDeontic):
    pass


class KgRight(_KgDeontic):
    pass


class KgProhibition(_KgDeontic):
    pass


class KgCondition(BaseModel):
    id: str
    trigger: str  # verbatim span stating the prerequisite
    operator: str = ""  # IF | UNLESS | UNTIL | UPON
    gatesId: str | None = None  # statement or clause the condition gates
    paragraphIds: list[str] = Field(default_factory=list)


class KgReference(BaseModel):
    id: str
    name: str  # "ISO 27001", "GDPR"
    citation: str = ""  # "Article 30"
    citedById: str | None = None  # clause or statement doing the citing
    paragraphIds: list[str] = Field(default_factory=list)


class KgValue(BaseModel):
    id: str
    valueType: str = ""  # Currency | Percentage | Duration | Quantity
    amount: str = ""
    unit: str = ""
    quantifiesId: str | None = None  # statement or clause the value belongs to
    paragraphIds: list[str] = Field(default_factory=list)


class KgEdge(BaseModel):
    source: str
    target: str
    type: EdgeType
    evidence: str = ""  # verbatim wording that states the link, when extracted
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
