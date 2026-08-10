# ContraVis backend — Django REST Framework

Phase 1 of the FastAPI → Django REST Framework migration: stateless document +
paragraph-graph API. No database yet (the graph is computed per request).

## Endpoints (`/api/v1`)
- `GET  /list_documents` — list dataset documents
- `GET  /document_file/{doc_id}` — download a `.docx`
- `POST /process` — build the paragraph graph for a document

## Run
```bash
uv sync
uv run python manage.py migrate      # creates db.sqlite3 (Django auth/contenttypes)
uv run python manage.py runserver 8300
```

`POST /process` also needs the embedding model:
```bash
uv add sentence-transformers   # heavy (pulls torch)
```

The old FastAPI backend is preserved in `../server_old/` as reference.
