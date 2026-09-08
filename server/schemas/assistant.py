from pydantic import BaseModel, Field

from schemas.common import AssistantMessageRole, AssistantProvider


class AssistantParagraphNode(BaseModel):
    id: str
    text: str
    paragraph_enum: int
    page: int


class AssistantHistoryMessage(BaseModel):
    role: AssistantMessageRole
    content: str


class KgChatClause(BaseModel):
    id: str
    label: str
    burden: float
    benefit: float


class KgChatLedger(BaseModel):
    """Deterministic burden/benefit facts for the focused party (already computed
    on the client). The chat explains these; it never recomputes them."""

    obligations: int
    rights: int
    prohibitions: int
    burdenWeight: float
    benefitWeight: float
    burdenCount: int
    benefitCount: int
    usePageRank: bool = True
    topClauses: list[KgChatClause] = Field(default_factory=list)


class AssistantChatRequest(BaseModel):
    documentId: str
    question: str
    provider: AssistantProvider = "openai"
    model: str | None = None
    selectedParagraphId: str | None = None
    paragraphNodes: list[AssistantParagraphNode]
    history: list[AssistantHistoryMessage] = Field(default_factory=list)
    focusNodeId: str | None = None
    focusNodeLabel: str | None = None
    focusNodeKind: str | None = None
    focusParagraphIds: list[str] = Field(default_factory=list)
    kgLedger: KgChatLedger | None = None


class AssistantCitation(BaseModel):
    id: str
    excerpt: str
    page: int | None = None
    paragraph_enum: int | None = None


class AssistantChatResponse(BaseModel):
    answer: str
    citations: list[AssistantCitation]
    suggestedQuestions: list[str]
    provider: AssistantProvider
