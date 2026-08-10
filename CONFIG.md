## Config Variables

Short reference for `server/utils/config.py`.

### Path Variables
- `CUAD_PDF_DIR`: Source folder for contract PDFs used by the backend.
- `CUAD_DOC_DIR`: Source folder for contract DOCX files used by the backend.
- `EDITED_PDF_DIR`: Output/input folder for edited PDFs.
- `EDITED_DOC_DIR`: Output/input folder for edited DOCX files.
- `SAVED_CONTRADICTIONS_DIR`: Where contradiction analysis results are stored.
- `GRAPH_CACHE_DIR`: Where processed graph/KG cache files are stored.

### Cache and Versioning
- `GRAPH_CACHE_ENABLED`: Enables/disables graph cache usage (`1` on, `0` off).

### Neo4j Integration
- `NEO4J_URI`: Neo4j Bolt URI used by backend connectivity checks.
- `NEO4J_USERNAME`: Neo4j username.
- `NEO4J_PASSWORD`: Neo4j password.
- `NEO4J_DATABASE`: Neo4j database name (default `neo4j`).

### Semantic Graph Controls
- `SEMANTIC_RELATED_MODE`: Semantic edge strategy.
  - `top_k`: keep only top neighbors per paragraph.
  - `all`: keep all neighbors above threshold.
- `SEMANTIC_TOP_K`: Number of semantic neighbors per paragraph when using `top_k`.
- `SEMANTIC_SIMILARITY_THRESHOLD`: Minimum cosine similarity to create semantic edges.

### Extraction Rules
- `REFERENCE_PATTERNS`: Regex patterns used to detect explicit references (Section, Article, Exhibit, etc.).
- `TYPE_PRIORITY`: Priority weights used for relation/type ranking decisions.

### Helper Parsers
- `_env_int(name, default)`: Reads an integer env var safely with fallback.
- `_env_float(name, default)`: Reads a float env var safely with fallback.
