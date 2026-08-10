import logging

from fastapi import APIRouter, Query

from api.deps import document_store
from schemas.types import (
    ContradictionAnalysisRequest,
    ContradictionAnalysisResponse,
    ContradictionGraphMode,
    SavedContradictionsResponse,
)
from services.contradictions.analysis import analyze_document_contradictions
from services.contradictions.saved import (
    load_saved_contradictions_for_document,
    save_analyzed_contradictions,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/contradictions/analyze", response_model=ContradictionAnalysisResponse)
def analyze_document_contradictions_endpoint(payload: ContradictionAnalysisRequest):
    canonical_doc_id = document_store.get_canonical_id(payload.documentId)
    if canonical_doc_id and canonical_doc_id != payload.documentId:
        payload = payload.model_copy(update={"documentId": canonical_doc_id})
    response = analyze_document_contradictions(payload)
    try:
        doc_meta = document_store.get_document(payload.documentId)
        saved_path = save_analyzed_contradictions(
            response,
            document_relative_path=doc_meta.relative_path if doc_meta else None,
            document_group=doc_meta.group_label if doc_meta else None,
        )
        logger.info("Saved contradiction analysis: %s", saved_path)
    except Exception:
        logger.exception("Failed to persist contradiction analysis result")
    return response


@router.get("/contradictions/saved/{document_id}", response_model=SavedContradictionsResponse)
def get_saved_contradictions(
    document_id: str,
    mode: ContradictionGraphMode = Query(default="without_kg"),
):
    aliases = document_store.get_document_aliases(document_id)
    rows, source_file = load_saved_contradictions_for_document(
        document_id,
        mode=mode,
        aliases=aliases,
    )
    canonical_id = document_store.get_canonical_id(document_id) or document_id
    return SavedContradictionsResponse(
        documentId=canonical_id,
        sourceFile=source_file,
        mode=mode,
        paragraphResults=rows,
    )
