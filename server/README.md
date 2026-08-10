# Backend (`server`)

FastAPI service to list CUAD DOCX contracts and serve contract-processing APIs.

> **Architecture & conventions:** see [`AGENTS.md`](./AGENTS.md) for the target
> file structure (layering, domains) and the planned paths for database and auth.
> New code should follow that structure.

## Requirements

- Python 3.11+ recommended.
- `pip`.

## Installation

From the repository root:

```bash
make setup-backend
```

Or manually:

```bash
cd server
python3 -m pip install -r requirements.txt
```

## Environment variables

`server/.env` (optional for LLM features):

```bash
GEMINI_API_KEY=your_api_key
OPENAI_API_KEY=your_api_key
```

Notes:

- Contract assistant uses `GEMINI_API_KEY` by default.
- OpenAI support is available via provider selection when `OPENAI_API_KEY` is configured.
- Do not commit `.env` files.

## Run in development

From repository root:

```bash
make dev-backend
```

Or manually:

```bash
cd server
python3 -m uvicorn main:app --reload --port 8300
```

Local base URL: `http://localhost:8300`

## Endpoints

- `GET /`: simple status message.
- `GET /health`: health check.
- `GET /api/v1/list_documents`: list available CUAD documents.
- `GET /api/v1/document_file/{doc_id}`: download DOCX by id.
- `POST /api/v1/process`: generate base paragraph graph (`nodes` + referential/semantic `edges`).
- `POST /api/v1/assistant/chat`: contract assistant response with paragraph citations.

## Data dependency

`DocumentStore` loads files from:

- `../infra/CUAD_v1/full_contract_docx` (relative to `server/`).

Because of this, start the backend from `server/` or use `make dev-backend` (already does `cd server`).

## Common issues

- `Dataset directory not found`: verify `infra/CUAD_v1/full_contract_docx` exists.
- Empty document list: dataset folder is empty or initialization failed.
- Dependency/import errors: reinstall with `pip install -r requirements.txt`.
