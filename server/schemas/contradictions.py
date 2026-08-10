from typing import Literal

from pydantic import BaseModel, Field

from schemas.common import (
    AssistantProvider,
    ContradictionGraphMode,
    ContradictionTaxonomyType,
)
from schemas.documents import Graph


class ContradictionEvidence(BaseModel):
    snippet_a: str = ""
    snippet_b: str = ""
    source_a: Literal["paragraph", "context", "unknown"] = "unknown"
    source_b: Literal["paragraph", "context", "unknown"] = "unknown"
    evidence_status: Literal["exact", "missing", "approximate"] = "missing"
    evidence_note: str = ""


class ContradictionFinding(BaseModel):
    confidence: int = Field(ge=0, le=100)
    brief_reason: str = ""
    contradiction_type: ContradictionTaxonomyType | None = None
    evidence: ContradictionEvidence | None = None


class ContradictionParagraphResult(BaseModel):
    paragraph_id: str
    contradiction: bool
    confidence: int = Field(ge=0, le=100)
    brief_reason: str = ""
    contradiction_type: ContradictionTaxonomyType | None = None
    evidence: ContradictionEvidence | None = None
    contradictions: list[ContradictionFinding] = Field(default_factory=list)


class ContradictionAnalysisRequest(BaseModel):
    documentId: str
    graph: Graph
    provider: AssistantProvider = "openai"
    temperature: float = 0.1
    model: str | None = None
    mode: ContradictionGraphMode = "without_kg"


class ContradictionAnalysisResponse(BaseModel):
    documentId: str
    provider: AssistantProvider
    temperature: float
    model: str | None = None
    mode: ContradictionGraphMode = "without_kg"
    paragraphResults: list[ContradictionParagraphResult]
    rawResponse: str


class SavedContradictionsResponse(BaseModel):
    documentId: str
    sourceFile: str
    mode: ContradictionGraphMode
    paragraphResults: list[ContradictionParagraphResult]
