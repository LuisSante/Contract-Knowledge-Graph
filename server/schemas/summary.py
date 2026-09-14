from pydantic import BaseModel, Field


class ContractSummaryParty(BaseModel):
    # None when the model named a party the KG has no node for — worth seeing,
    # since it means the extractor missed an entity.
    partyId: str | None = None
    name: str
    role: str = ""
    does: str = ""


class ContractSummary(BaseModel):
    documentId: str
    documentName: str = ""
    title: str = ""
    contractType: str = ""
    # Party mentions are marked `{{partyId|short text}}` so the client colours
    # them without having to match names back to the graph.
    summary: str = ""
    parties: list[ContractSummaryParty] = Field(default_factory=list)
