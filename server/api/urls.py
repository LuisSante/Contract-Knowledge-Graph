from django.urls import path

from api import views, views_assistant, views_llm

urlpatterns = [
    path("list_documents", views.ListDocumentsView.as_view()),
    path("document_file/<str:doc_id>", views.DocumentFileView.as_view()),
    path("extract_paragraphs", views.ExtractParagraphsView.as_view()),
    path("knowledge_graph/<str:doc_id>", views.KnowledgeGraphView.as_view()),
    path("knowledge_graph/<str:doc_id>/party_hints", views.KnowledgePartyHintsView.as_view()),
    path(
        "knowledge_graph/<str:doc_id>/clause_importance",
        views.ClauseImportanceView.as_view(),
    ),
    path("assistant/chat", views_assistant.AssistantChatView.as_view()),
    path("llm/estimate", views_llm.LlmEstimateView.as_view()),
    path("llm/cost/total", views_llm.LlmTotalCostView.as_view()),
]
