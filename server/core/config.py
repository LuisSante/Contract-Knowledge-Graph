from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    PARAGRAPHS_OUTPUT_DIR: Path = Path("../infra/json/paragraphs")
    KNOWLEDGE_GRAPH_DIR: Path = Path("../infra/json/kg")
    # A file, not a directory: every contract abstract lives in this one map.
    CONTRACT_SUMMARY_PATH: Path = Path("../infra/json/abstract.json")
    # Red flags annotated in the ALeaseBERT dataset, keyed by document id; written by
    # notebooks/red_flags.ipynb, never by the system.
    RED_FLAGS_PATH: Path = Path("../infra/json/red_flags.json")
    # Risks the detector found, one file per contract (named like its knowledge graph): the
    # latest answer the model gave for it, which the app then serves for free. Written by the
    # server, never by a notebook, and kept apart from the red flags above, which only validate
    # them.
    RISKS_DIR: Path = Path("../infra/json/risks")

    # this extract paragraphs from a document
    EXTRACT_PARAGRAPHS: bool = True

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
        return normalized in {"1", "true", "yes", "on", "debug", "dev", "development"}

    @field_validator("CORS_ORIGINS", "ALLOWED_HOSTS", mode="before")
    @classmethod
    def _split_list(cls, value):
        if isinstance(value, str) and not value.strip().startswith("["):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


settings = Settings()
