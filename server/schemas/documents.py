from typing import Literal

from pydantic import BaseModel, Field


class DatasetDocument(BaseModel):
    id: str
    name: str
    full_path: str
    relative_path: str = ""
    group_label: str = "root"
    display_name: str = ""
    origin: Literal["dataset", "upload"]
    processed: bool


class Node(BaseModel):
    id: str
    documentId: str
    text: str
    paragraph_enum: int
    page: int


class ProcessElement(BaseModel):
    """Element (paragraph) of a page as sent by the docx viewer."""

    id: str | None = None
    text: str = ""


class ProcessPage(BaseModel):
    pageNumber: int | None = None
    elements: list[ProcessElement] = Field(default_factory=list)


class ProcessDocumentRequest(BaseModel):
    documentId: str
    pages: list[ProcessPage] = Field(default_factory=list)
