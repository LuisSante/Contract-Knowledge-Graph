from django.urls import path

from api import views, views_assistant, views_llm

# Paths match the FastAPI contract exactly (no trailing slash) so the Next.js
# proxy at /api/v1/* keeps working unchanged.
urlpatterns = [
    # Documents + knowledge graph.
    path("list_documents", views.ListDocumentsView.as_view()),
    path("document_file/<str:doc_id>", views.DocumentFileView.as_view()),
    path("extract_paragraphs", views.ExtractParagraphsView.as_view()),
    path("knowledge_graph/<str:doc_id>", views.KnowledgeGraphView.as_view()),
    path("knowledge_graph/<str:doc_id>/party_hints", views.KnowledgePartyHintsView.as_view()),
    path(
        "knowledge_graph/<str:doc_id>/clause_importance",
        views.ClauseImportanceView.as_view(),
    ),
    # Phase 2 — assistant.
    path("assistant/chat", views_assistant.AssistantChatView.as_view()),
    # Phase 2 — llm.
    path("llm/estimate", views_llm.LlmEstimateView.as_view()),
    path("llm/cost/total", views_llm.LlmTotalCostView.as_view()),
]
