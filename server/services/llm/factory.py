from __future__ import annotations

import os
from logging import getLogger

from dotenv import load_dotenv

from core.config import settings
from services.llm.base import LLMProvider
from services.llm.gemini_provider import GeminiProvider
from services.llm.openai_provider import OpenAIProvider

load_dotenv()

logger = getLogger(__name__)


class LLMProviderFactory:
    _cache: dict[str, LLMProvider] = {}

    @classmethod
    def create(cls, provider_name: str, *, model: str | None = None) -> LLMProvider:
        normalized = (provider_name or "").strip().lower() or "gemini"
        model_override = (model or "").strip() or None
        cache_key = f"{normalized}:{model_override or '__default__'}"

        if cache_key in cls._cache:
            return cls._cache[cache_key]

        if normalized == "gemini":
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                raise RuntimeError("GEMINI_API_KEY is not configured")

            resolved_model = model_override or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
            logger.info(
                "[COST_DEBUG] LLMProviderFactory selecting provider=gemini model=%s cache_key=%s",
                resolved_model,
                cache_key,
            )
            provider = GeminiProvider(api_key=api_key, model=resolved_model)
            cls._cache[cache_key] = provider
            return provider

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
