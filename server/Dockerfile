# ContraVis backend — imagen basada en uv.
# Requiere `uv.lock` commiteado (genéralo con `uv lock` o `uv sync`).
FROM python:3.12-slim AS base

# Binario de uv (copiado de la imagen oficial).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Librerías de sistema para weasyprint (Cairo/Pango) y wheels que compilan.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libcairo2 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libgdk-pixbuf-2.0-0 \
        libffi-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

# 1) Capa de dependencias (cacheable): solo el lock + pyproject.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# 2) Código de la app.
COPY . .
RUN uv sync --frozen --no-dev

EXPOSE 8300
CMD ["uv", "run", "--no-dev", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8300"]

# Notas:
# - `torch` por defecto baja el wheel de PyPI (grande). Para CPU-only y una imagen
#   más liviana, fija el índice CPU en pyproject ([tool.uv.sources]).
# - La app lee rutas `../infra/...`; en producción monta/ajusta esos paths
#   (volumen o variables) o el contenedor no encontrará los datos.
# - `spacy` puede requerir descargar un modelo (`python -m spacy download ...`) si
#   se usa; añádelo como paso si aplica.
