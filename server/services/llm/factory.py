from __future__ import annotations

import os
from logging import getLogger
from typing import ClassVar

from dotenv import load_dotenv

from core.config import settings
from services.llm.base import LLMProvider
from services.llm.openai_provider import OpenAIProvider

load_dotenv()

logger = getLogger(__name__)


class LLMProviderFactory:
    # Process-wide on purpose: a provider holds its client, so it is built once.
    _cache: ClassVar[dict[str, LLMProvider]] = {}

    @classmethod
    def create(cls, provider_name: str, *, model: str | None = None) -> LLMProvider:
        normalized = (provider_name or "").strip().lower() or "openai"
        model_override = (model or "").strip() or None
        cache_key = f"{normalized}:{model_override or '__default__'}"

        if cache_key in cls._cache:
            return cls._cache[cache_key]

        # Provider strategy: add new branches here (each returns an LLMProvider).
        if normalized == "openai":
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise RuntimeError("OPENAI_API_KEY is not configured")

            resolved_model = model_override or os.getenv("OPENAI_MODEL", "gpt-4.1")
            logger.info(
                "[COST_DEBUG] LLMProviderFactory selecting provider=openai model=%s cache_key=%s",
                resolved_model,
                cache_key,
            )
            provider = OpenAIProvider(
                api_key=api_key,
                model=resolved_model,
                timeout=settings.LLM_TIMEOUT_SECONDS,
                max_retries=settings.LLM_MAX_RETRIES,
            )
            cls._cache[cache_key] = provider
            return provider

        raise RuntimeError(f"Unsupported provider: {provider_name}")
