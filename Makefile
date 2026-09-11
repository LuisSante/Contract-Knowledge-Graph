PYTHON = python
PNPM = pnpm -C web
NPM = npm --prefix client
WEB_PORT = 3000

.PHONY: install finstall run frun \
	build fbuild \
	sinstall srun \
	preprocess docs format help

help:
	@echo "Commands available:"
	@echo "  make install      - Install backend deps (uv sync: Python + uv.lock)"
	@echo "  make finstall     - Install frontend dependencies"
	@echo "  make run          - Run Django (manage.py runserver)"
	@echo "  make frun         - Run Next.js"
	@echo "  make fbuild       - Build Next.js"
	@echo "  make sinstall     - Install legacy Svelte dependencies"
	@echo "  make srun         - Run legacy Svelte app"
	@echo "  make preprocess   - Preprocess data"
	@echo "  make docs         - Regenerate the measurement tables in docs/"
	@echo "  make format       - Format the frontend with Prettier"

install:
	@echo "Installing backend dependencies (uv sync)..."
	@echo "Reproducible: instala el Python fijado (.python-version) y las deps de uv.lock."
	@echo "Requisito previo: tener uv instalado -> https://docs.astral.sh/uv/"
	cd server && uv sync

finstall:
	@echo "Installing frontend dependencies..."
	$(PNPM) install

run:
	@echo "Starting Django (uv)..."
	cd server && uv run python manage.py runserver 8300

frun:
	@echo "Starting Next.js..."
	$(PNPM) dev --port $(WEB_PORT)

fbuild:
	@echo "Building Next.js..."
	$(PNPM) build

format:
	@echo "Formatting the frontend..."
	$(PNPM) run format

preprocess:
	@echo "Preprocessing data..."
	cd notebooks/KG && $(PYTHON) create_kg.py

# Reads infra/json/kg/ and rewrites only what sits between the <!-- tabla:N --> markers.
# The prose that interprets the numbers is never touched.
docs:
	@echo "Regenerating measurement tables..."
	$(PYTHON) scripts/measure_kg_corpus.py --write