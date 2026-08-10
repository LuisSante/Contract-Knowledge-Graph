from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    # Output paths (configurable per environment).
    SAVED_CONTRADICTIONS_DIR: Path = Path("../infra/contradiction_results")
    GRAPH_OUTPUT_DIR: Path = Path("../infra/json/graph")

    # Neo4j (knowledge graph).
    NEO4J_URI: str = ""
    NEO4J_USERNAME: str = ""
    NEO4J_PASSWORD: str = ""
    NEO4J_DATABASE: str = "neo4j"

    # Related paragraphs (semantic similarity).
    SEMANTIC_RELATED_MODE: str = "top_k"
    SEMANTIC_TOP_K: int = 5
    SEMANTIC_SIMILARITY_THRESHOLD: float = 0.79

    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    LLM_TIMEOUT_SECONDS: float = 60.0
    LLM_MAX_RETRIES: int = 2

    @field_validator("NEO4J_URI", "NEO4J_USERNAME", "NEO4J_PASSWORD")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("NEO4J_DATABASE")
    @classmethod
    def _strip_or_default(cls, value: str) -> str:
        return value.strip() or "neo4j"

    @field_validator("SEMANTIC_RELATED_MODE")
    @classmethod
    def _normalize_mode(cls, value: str) -> str:
        normalized = value.strip().lower()
        return normalized if normalized in {"top_k", "all"} else "top_k"

    @field_validator("SEMANTIC_TOP_K")
    @classmethod
    def _min_top_k(cls, value: int) -> int:
        return max(1, value)

    @field_validator("SEMANTIC_SIMILARITY_THRESHOLD")
    @classmethod
    def _clamp_threshold(cls, value: float) -> float:
        return max(0.0, min(1.0, value))

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, value):
        if isinstance(value, str) and not value.strip().startswith("["):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


settings = Settings()
