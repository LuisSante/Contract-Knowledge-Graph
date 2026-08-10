from fastapi import APIRouter

from schemas.types import (
    AssistantChatRequest,
    AssistantChatResponse,
    SimplifySelectionRequest,
    SimplifySelectionResponse,
)
from services.assistant.contract_assistant import (
    fix_contradiction_selection,
    generate_assistant_response,
    simplify_paragraph_selection,
)

router = APIRouter()


@router.post("/assistant/chat", response_model=AssistantChatResponse)
def assistant_chat(payload: AssistantChatRequest):
    return generate_assistant_response(payload)


@router.post("/assistant/simplify", response_model=SimplifySelectionResponse)
def assistant_simplify(payload: SimplifySelectionRequest):
    return simplify_paragraph_selection(payload)


@router.post("/assistant/fix_contradiction", response_model=SimplifySelectionResponse)
def assistant_fix_contradiction(payload: SimplifySelectionRequest):
    return fix_contradiction_selection(payload)
