from typing import Literal

from pydantic import BaseModel, Field

ProvisionType = Literal["obligation", "right", "prohibition"]

EdgeType = Literal["introduces", "burdens", "benefits"]


class KgParty(BaseModel):
    id: str
    name: str
    role: str = ""  # e.g. "Company", "Distributor", "Supplier"
    aliases: list[str] = Field(default_factory=list)
    paragraphIds: list[str] = Field(default_factory=list)


class KgClause(BaseModel):
    id: str
    ref: str | None = None  # "Section 3.2", "Article 5", or None if unnumbered
    heading: str = ""
    paragraphIds: list[str] = Field(default_factory=list)


class KgProvision(BaseModel):
    id: str
    type: ProvisionType
    summary: str  # short paraphrase of the duty/right/restriction
    text: str = ""  # verbatim span copied from the source paragraph (provenance)
    obligorPartyId: str | None = None  # party that must comply / is prohibited
    beneficiaryPartyId: str | None = None  # party that benefits / holds the right
    clauseId: str | None = None
    paragraphIds: list[str] = Field(default_factory=list)


class KgEdge(BaseModel):
    source: str
    target: str
    type: EdgeType


class KnowledgeGraph(BaseModel):
    parties: list[KgParty] = Field(default_factory=list)
    clauses: list[KgClause] = Field(default_factory=list)
    provisions: list[KgProvision] = Field(default_factory=list)
    edges: list[KgEdge] = Field(default_factory=list)
