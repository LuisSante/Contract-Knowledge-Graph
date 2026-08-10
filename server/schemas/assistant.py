from typing import Literal

from pydantic import BaseModel, Field

from schemas.common import (
    AssistantMessageRole,
    AssistantMode,
    AssistantProvider,
    AssistantScope,
)


class AssistantParagraphNode(BaseModel):
    id: str
    text: str
    paragraph_enum: int
    page: int


class AssistantRelatedParagraph(BaseModel):
    id: str
    relationTypes: list[Literal["reference", "semantic_similarity"]] = Field(default_factory=list)
    semanticScore: float | None = None
    references: list[str] = Field(default_factory=list)


class AssistantHistoryMessage(BaseModel):
    role: AssistantMessageRole
    content: str


class AssistantChatRequest(BaseModel):
    documentId: str
    question: str
    mode: AssistantMode = "explain"
    scope: AssistantScope = "selected"
    provider: AssistantProvider = "gemini"
    model: str | None = None
    selectedParagraphId: str | None = None
    relatedParagraphs: list[AssistantRelatedParagraph] = Field(default_factory=list)
    paragraphNodes: list[AssistantParagraphNode]
    history: list[AssistantHistoryMessage] = Field(default_factory=list)


class AssistantCitation(BaseModel):
    id: str
    excerpt: str
    page: int | None = None
    paragraph_enum: int | None = None


class AssistantChatResponse(BaseModel):
    answer: str
    citations: list[AssistantCitation]
    suggestedQuestions: list[str]
    mode: AssistantMode
    scope: AssistantScope
    provider: AssistantProvider


class SimplifyEvidence(BaseModel):
    paragraph_id: str
    selection_start: int
    selection_end: int


class SimplifyAudit(BaseModel):
    system_prompt: str
    user_prompt: str
    model_response: str


class SimplifyRelatedParagraph(BaseModel):
    id: str
    text: str
    paragraph_enum: int | None = None
    page: int | None = None
    relationTypes: list[Literal["reference", "semantic_similarity"]] = Field(default_factory=list)
    semanticScore: float | None = None
    references: list[str] = Field(default_factory=list)


class SimplifySelectionRequest(BaseModel):
    documentId: str
    provider: AssistantProvider = "gemini"
    paragraphId: str
    paragraphText: str
    selectionStart: int = 0
    selectionEnd: int = 0
    contradictionReason: str | None = None
    relatedParagraphs: list[SimplifyRelatedParagraph] = Field(default_factory=list)


class SimplifySelectionResponse(BaseModel):
    paragraphId: str
    provider: AssistantProvider
    originalSnippet: str
    simplifiedSnippet: str
    evidence: SimplifyEvidence
    audit: SimplifyAudit
