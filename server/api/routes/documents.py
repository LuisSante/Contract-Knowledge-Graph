import logging
import re
from collections import Counter

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from api.deps import document_store
from schemas.types import (
    DatasetDocument,
    ProcessCacheMeta,
    ProcessDocumentRequest,
    ProcessDocumentResponse,
)
from services.graph.relations import generate_graph_data

router = APIRouter()
logger = logging.getLogger(__name__)

PAGE_NUMBER_ONLY_RE = re.compile(r"^(?:\d+|[ivxlcdm]{1,8})$", re.IGNORECASE)
PAGE_LABEL_RE = re.compile(r"^(?:page|pagina|p[aÃ¡]g\.?)\s*\d+(?:\s*(?:\/|of|de)\s*\d+)?$", re.IGNORECASE)
BOUNDARY_SCAN_LINES = 3


def normalize_text(raw: str) -> str:
    return re.sub(r"\s+", " ", raw or "").strip()


def is_page_marker(text: str) -> bool:
    if not text:
        return False
    return bool(PAGE_NUMBER_ONLY_RE.match(text) or PAGE_LABEL_RE.match(text))


def is_repeated_boundary_candidate(text: str) -> bool:
    if is_page_marker(text):
        return True
    if len(text) > 180:
        return False
    words = [token for token in text.split(" ") if token]
    return 0 < len(words) <= 22


def detect_repeated_boundary_texts(
    pages: list[dict],
) -> tuple[dict[int, dict[str, list[tuple[int, str]]]], set[str], set[str]]:
    boundaries_by_page: dict[int, dict[str, list[tuple[int, str]]]] = {}
    top_counts: Counter[str] = Counter()
    bottom_counts: Counter[str] = Counter()

    for page_idx, page in enumerate(pages):
        non_empty_entries: list[tuple[int, str]] = []
        for element_idx, element in enumerate(page.get("elements", [])):
            text = normalize_text(str(element.get("text", "")))
            if text:
                non_empty_entries.append((element_idx, text))

        if not non_empty_entries:
            continue

        top_entries = non_empty_entries[:BOUNDARY_SCAN_LINES]
        bottom_entries = non_empty_entries[max(len(non_empty_entries) - BOUNDARY_SCAN_LINES, 0):]
        top_entries_keyed = [(idx, text.lower()) for idx, text in top_entries]
        bottom_entries_keyed = [(idx, text.lower()) for idx, text in bottom_entries]
        boundaries_by_page[page_idx] = {
            "top": top_entries_keyed,
            "bottom": bottom_entries_keyed,
        }
        for _, text_key in top_entries_keyed:
            top_counts[text_key] += 1
        for _, text_key in bottom_entries_keyed:
            bottom_counts[text_key] += 1

    repeated_top = {
        text for text, count in top_counts.items() if count >= 2 and is_repeated_boundary_candidate(text)
    }
    repeated_bottom = {
        text for text, count in bottom_counts.items() if count >= 2 and is_repeated_boundary_candidate(text)
    }

    return boundaries_by_page, repeated_top, repeated_bottom


@router.get("/list_documents", response_model=list[DatasetDocument])
def list_documents():
    document_store.ensure_initialized()

    return document_store.get_documents()


@router.get("/document_file/{doc_id}")
def get_document_file(doc_id: str):
    document_store.ensure_initialized()

    path = document_store.get_path(doc_id)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail="Document not found")

    if path.suffix.lower() != ".docx":
        raise HTTPException(status_code=400, detail="Only DOCX documents are supported")

    return FileResponse(
        path=path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=path.name,
    )


@router.post("/process", response_model=ProcessDocumentResponse)
async def process_document(payload: ProcessDocumentRequest) -> ProcessDocumentResponse:
    raw_doc_id = payload.documentId
    doc_id = document_store.get_canonical_id(raw_doc_id) or raw_doc_id
    pages = [page.model_dump() for page in payload.pages]
    boundaries_by_page, repeated_top_texts, repeated_bottom_texts = detect_repeated_boundary_texts(pages)

    all_paragraphs_input = []

    for page_idx, page in enumerate(pages):
        boundary = boundaries_by_page.get(page_idx, {})
        top_boundary = boundary.get("top", [])
        bottom_boundary = boundary.get("bottom", [])

        for idx, el in enumerate(page.get("elements", [])):
            text_content = normalize_text(str(el.get("text", "")))
            if not text_content:
                continue

            if is_page_marker(text_content):
                continue

            text_key = text_content.lower()
            if text_key in repeated_top_texts and any(
                idx == boundary_idx and text_key == boundary_text
                for boundary_idx, boundary_text in top_boundary
            ):
                continue

            if text_key in repeated_bottom_texts and any(
                idx == boundary_idx and text_key == boundary_text
                for boundary_idx, boundary_text in bottom_boundary
            ):
                continue

            all_paragraphs_input.append(
                {
                    "id": el.get("id"),
                    "documentId": doc_id,
                    "text": text_content,
                    "page": page.get("pageNumber"),
                    "paragraph_enum": idx,
                }
            )

    graph_obj = generate_graph_data(all_paragraphs_input)

    return ProcessDocumentResponse(
        status="success",
        documentId=doc_id,
        graph=graph_obj,
        cache=ProcessCacheMeta(),
    )


@router.get("/")
def document_init():
    return {"message": "Document initialization endpoint"}
