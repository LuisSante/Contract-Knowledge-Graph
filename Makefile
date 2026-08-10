PYTHON = python
PNPM = pnpm -C web
NPM = npm --prefix client
WEB_PORT = 3000
BACKUP_DIR = ./infra/backups
NEO_CONTAINER = neo4j-dev

.PHONY: install finstall run frun \
	build fbuild \
	sinstall srun \
	preprocess backup restore help

help:
	@echo "Commands available:"
	@echo "  make install      - Install backend deps (uv sync: Python + uv.lock)"
	@echo "  make finstall     - Install frontend dependencies"
	@echo "  make run          - Run FastAPI (uv run uvicorn)"
	@echo "  make frun         - Run Next.js"
	@echo "  make fbuild       - Build Next.js"
	@echo "  make sinstall     - Install legacy Svelte dependencies"
	@echo "  make srun         - Run legacy Svelte app"
	@echo "  make preprocess   - Preprocess data"
	@echo "  make backup       - Backup Neo4j"
	@echo "  make restore      - Restore Neo4j"

install:
	@echo "Installing backend dependencies (uv sync)..."
	@echo "Reproducible: instala el Python fijado (.python-version) y las deps de uv.lock."
	@echo "Requisito previo: tener uv instalado -> https://docs.astral.sh/uv/"
	cd server && uv sync

finstall:
	@echo "Installing frontend dependencies..."
	$(PNPM) install

run:
	@echo "Starting FastAPI (uv)..."
	cd server && uv run uvicorn main:app --reload --port 8300

frun:
	@echo "Starting Next.js..."
	$(PNPM) dev --port $(WEB_PORT)

fbuild:
	@echo "Building Next.js..."
	$(PNPM) build

preprocess:
	@echo "Preprocessing data..."
	cd notebooks/KG && $(PYTHON) create_kg.py

backup:
	@mkdir -p $(BACKUP_DIR)
	docker exec $(NEO_CONTAINER) neo4j stop || true
	docker exec $(NEO_CONTAINER) rm -f /var/lib/neo4j/backups/neo4j.dump
	docker exec $(NEO_CONTAINER) mkdir -p backups
	docker exec $(NEO_CONTAINER) neo4j-admin database dump neo4j --to-path=backups
	docker cp $(NEO_CONTAINER):/var/lib/neo4j/backups/neo4j.dump $(BACKUP_DIR)
	docker exec $(NEO_CONTAINER) neo4j start || true

restore:
ifeq ($(FORCE),true)
	@echo "FORCE enabled: removing old volumes..."
		sudo rm -rf infra/volumes/minio-data/ \
				infra/volumes/neo4j-data/ \
				infra/volumes/neo4j-logs/ \
				infra/volumes/neo4j-import/ \
				infra/volumes/neo4j-plugins/
else
	@echo "INFO: Old volumes will NOT be removed. Use 'make restore FORCE=true' to force deletion."
endif
	@mkdir -p $(BACKUP_DIR)
	docker exec $(NEO_CONTAINER) neo4j stop || true
	docker exec $(NEO_CONTAINER) rm -rf /var/lib/neo4j/data/databases/neo4j
	docker exec $(NEO_CONTAINER) rm -rf /var/lib/neo4j/data/transactions/neo4j
	docker exec $(NEO_CONTAINER) mkdir -p /var/lib/neo4j/backups
	docker cp ./infra/backups/neo4j.dump $(NEO_CONTAINER):/var/lib/neo4j/backups/neo4j.dump
	docker exec $(NEO_CONTAINER) neo4j-admin database load --from-path=backups --overwrite-destination=true neo4j
	docker exec $(NEO_CONTAINER) neo4j start || true