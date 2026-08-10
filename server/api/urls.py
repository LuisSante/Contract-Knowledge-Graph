from django.urls import path

from api import views, views_assistant, views_contradictions, views_llm

# Paths match the FastAPI contract exactly (no trailing slash) so the Next.js
# proxy at /api/v1/* keeps working unchanged.
urlpatterns = [
    # Phase 1 — documents + graph.
    path("list_documents", views.ListDocumentsView.as_view()),
    path("document_file/<str:doc_id>", views.DocumentFileView.as_view()),
    path("process", views.ProcessDocumentView.as_view()),
    # Phase 2 — assistant.
    path("assistant/chat", views_assistant.AssistantChatView.as_view()),
    path("assistant/simplify", views_assistant.AssistantSimplifyView.as_view()),
    path("assistant/fix_contradiction", views_assistant.AssistantFixContradictionView.as_view()),
    # Phase 2 — contradictions.
    path("contradictions/analyze", views_contradictions.ContradictionsAnalyzeView.as_view()),
    path(
        "contradictions/saved/<str:document_id>",
        views_contradictions.SavedContradictionsView.as_view(),
    ),
    # Phase 2 — llm.
    path("llm/estimate", views_llm.LlmEstimateView.as_view()),
    path("llm/cost/total", views_llm.LlmTotalCostView.as_view()),
]
