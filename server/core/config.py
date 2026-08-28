from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    SAVED_CONTRADICTIONS_DIR: Path = Path("../infra/contradiction_results")
    GRAPH_OUTPUT_DIR: Path = Path("../infra/json/graph")
    PARAGRAPHS_OUTPUT_DIR: Path = Path("../infra/json/paragraphs")
    KNOWLEDGE_GRAPH_DIR: Path = Path("../infra/json/kg")

    # this extract paragraphs from a document
    EXTRACT_PARAGRAPHS: bool = True

    SEMANTIC_RELATED_MODE: str = "top_k"
    SEMANTIC_TOP_K: int = 5
    SEMANTIC_SIMILARITY_THRESHOLD: float = 0.80

    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    LLM_TIMEOUT_SECONDS: float = 60.0
    LLM_MAX_RETRIES: int = 2

    SECRET_KEY: str = "dev-insecure-change-me"
    DEBUG: bool = False
    ALLOWED_HOSTS: list[str] = ["localhost", "127.0.0.1"]

    @field_validator("DEBUG", mode="before")
    @classmethod
    def _parse_debug(cls, value):
        if isinstance(value, bool):
            return value
        normalized = str(value).strip().lower()
        if normalized in {"1", "true", "yes", "on", "debug", "dev", "development"}:
            return True
        return False

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

    @field_validator("CORS_ORIGINS", "ALLOWED_HOSTS", mode="before")
    @classmethod
    def _split_list(cls, value):
        if isinstance(value, str) and not value.strip().startswith("["):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


settings = Settings()
