from pydantic import BaseModel, Field


class ContractRisk(BaseModel):
    # The obligation, right or prohibition the model pointed at: the square to mark.
    statementId: str
    # One of the red-flag types the model was given.
    type: str
    reason: str = ""


class ContractRisks(BaseModel):
    documentId: str
    model: str = ""
    promptVersion: str = ""
    # A clause that holds statements is one call. A failed call is counted, not hidden: its
    # statements were never judged, which is not the same as judged and found safe.
    clausesReviewed: int = 0
    clausesFailed: int = 0
    risks: list[ContractRisk] = Field(default_factory=list)
