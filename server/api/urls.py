from django.urls import path

from api import views

# Paths match the FastAPI contract exactly (no trailing slash) so the Next.js
# proxy at /api/v1/* keeps working unchanged.
urlpatterns = [
    path("list_documents", views.ListDocumentsView.as_view()),
    path("document_file/<str:doc_id>", views.DocumentFileView.as_view()),
    path("process", views.ProcessDocumentView.as_view()),
]
