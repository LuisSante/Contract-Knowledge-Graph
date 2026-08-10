# Installation & Running

ContraVis is a monorepo with a **FastAPI backend** (`server/`) and a **Next.js
frontend** (`web/`). The backend serves the contracts and computes the paragraph
graph; the frontend renders the documents and the visual analytics UI.

## Requirements

- **[uv](https://docs.astral.sh/uv/)** — Python package/Project manager (handles
  the pinned Python version via `.python-version` and `uv.lock`).
- **Node.js 20+** and **[pnpm](https://pnpm.io/)**.
- The CUAD `.docx` dataset under `infra/` (see [Data dependency](#data-dependency)).

> All commands below are run from the **repository root**. Run `make help` to list
> every available target.

## 1. Backend (`server/`)

Install dependencies (creates the virtualenv and installs the locked deps):

```bash
make install          # = cd server && uv sync
```

Configure environment variables in `server/.env` (optional, only for LLM
features). Copy the template and fill in your keys:

```bash
cp server/.env.example server/.env
```

```bash
# server/.env
OPENAI_API_KEY=your_api_key
GEMINI_API_KEY=your_api_key
# LLM client tuning (optional)
LLM_TIMEOUT_SECONDS=60
LLM_MAX_RETRIES=2
# Allowed frontend origins (comma-separated)
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

> The contract assistant uses `GEMINI_API_KEY` by default. Never commit the real
> `.env` — only `.env.example` (placeholders) is tracked.

## 2. Frontend (`web/`)

Install dependencies:

```bash
make finstall         # = pnpm -C web install
```

The frontend calls the backend same-origin at `/api/v1/*` and Next.js proxies it
server-side (no CORS). The proxy target defaults to `http://localhost:8300` and
can be overridden with `BACKEND_URL` in `web/.env`.

## 3. Run the stack

Open two terminals from the repository root:

```bash
# Terminal 1 — backend (http://localhost:8300)
make run              # = cd server && uv run uvicorn main:app --reload --port 8300

# Terminal 2 — frontend (http://localhost:3000)
make frun             # = pnpm -C web dev --port 3000
```

Then open:

- **App:** http://localhost:3000
- **Backend health:** http://localhost:8300/health

Production build of the frontend:

```bash
make fbuild           # = pnpm -C web build
```

## Windows

`make` is not available on Windows. Use the double-click helper scripts in
[`scripts/windows/`](scripts/windows) (see its
[README](scripts/windows/README.md)) to install `uv` and run the backend, and run
`pnpm install` / `pnpm dev` inside `web/` for the frontend.

## Data dependency

The backend reads contracts from:

```
infra/CUAD_v1/full_contract_docx_contradictions/target/
```

If this folder is missing or empty, `GET /api/v1/list_documents` returns an empty
list and no document will be available in the app.

## Typical request flow

1. The frontend lists documents — `GET /api/v1/list_documents`.
2. On selection it downloads the DOCX — `GET /api/v1/document_file/{doc_id}`.
3. The `docx-engine` renders the document and extracts its paragraphs.
4. The paragraphs are sent to `POST /api/v1/process`, which returns the paragraph
   graph (reference + semantic edges). See the [README](README.md) for how the
   graph is linked back to the HTML.
