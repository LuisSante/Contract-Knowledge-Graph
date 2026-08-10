from __future__ import annotations

import logging
from typing import Any

from services.llm.base import LLMProvider
from services.llm.cost_estimator import estimate_model_cost_usd, format_cost
from services.llm.usage_tracker import add_usage_cost

logger = logging.getLogger(__name__)


class OpenAIProvider(LLMProvider):
    name = "openai"

    def __init__(
        self,
        *,
        api_key: str,
        model: str = "gpt-4o-mini",
        timeout: float | None = None,
        max_retries: int | None = None,
    ):
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise RuntimeError(
                "OpenAI provider requires the `openai` package. Install dependencies and retry."
            ) from exc

        client_kwargs: dict[str, Any] = {"api_key": api_key}
        if timeout is not None:
            client_kwargs["timeout"] = timeout
        if max_retries is not None:
            client_kwargs["max_retries"] = max_retries

        self._client = OpenAI(**client_kwargs)
        self._model = model

    def generate(self, *, system_prompt: str, user_prompt: str, temperature: float = 0.2) -> str:
        try:
            response = self._client.chat.completions.create(
                model=self._model,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
        except Exception as exc:
            raise RuntimeError(f"OpenAI request failed: {exc}") from exc

        self._log_usage(response)

        content = self._extract_content(response)
        if not content:
            raise RuntimeError("OpenAI returned an empty response")
        return content

    @staticmethod
    def _extract_content(response: Any) -> str:
        choices = getattr(response, "choices", None)
        if not isinstance(choices, list) or not choices:
            return ""

        message = getattr(choices[0], "message", None)
        if message is None:
            return ""

        content = getattr(message, "content", None)
        if isinstance(content, str):
            return content.strip()

        if isinstance(content, list):
            parts: list[str] = []
            for chunk in content:
                text = chunk.get("text") if isinstance(chunk, dict) else None
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
            return "\n".join(parts).strip()

        return ""

    def _log_usage(self, response: Any) -> None:
        usage = getattr(response, "usage", None)
        if usage is None:
            return

        prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
        completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
        total_tokens = int(
            getattr(usage, "total_tokens", prompt_tokens + completion_tokens) or 0
        )

        effective_model = str(getattr(response, "model", self._model) or self._model)
        estimated_cost = estimate_model_cost_usd(
            model_name=effective_model,
            input_tokens=prompt_tokens,
            output_tokens=completion_tokens,
        )
        logger.info(
            "[COST_DEBUG] openai usage parsed: model=%s prompt=%d completion=%d total=%d estimated_cost=%s",
            effective_model,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            format_cost(estimated_cost),
        )
        add_usage_cost(estimated_cost)

        logger.info(
            (
                "OpenAI usage model=%s prompt_tokens=%d completion_tokens=%d "
                "total_tokens=%d est_cost_usd=%s"
            ),
            effective_model,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            format_cost(estimated_cost),
        )
