from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from services.llm.base import LLMOutputTruncated, LLMProvider
from services.llm.cost_estimator import estimate_model_cost_usd, format_cost
from services.llm.usage_tracker import add_usage_cost

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ModelProfile:
    # The reasoning models reject any temperature but the default whenever they reason,
    # and the API refuses the whole request rather than ignoring it.
    accepts_temperature: bool
    # Sent as reasoning_effort; None for a model with no reasoning to configure.
    reasoning_effort: str | None


# Longest matching prefix wins, so "gpt-6.1-sol-2026-09-29" finds "gpt-6.1-sol".
MODEL_PROFILES: dict[str, ModelProfile] = {
    "gpt-4.1": ModelProfile(accepts_temperature=True, reasoning_effort=None),
    "gpt-4o": ModelProfile(accepts_temperature=True, reasoning_effort=None),
    # No "none" effort on these two: they always reason, and "low" is the cheapest.
    "gpt-6.1-sol": ModelProfile(accepts_temperature=False, reasoning_effort="low"),
    "gpt-6-astra": ModelProfile(accepts_temperature=False, reasoning_effort="low"),
    # These can switch reasoning off. The docs allow a temperature then, other sources say
    # they reject it anyway: it is not sent.
    "gpt-6-sol": ModelProfile(accepts_temperature=False, reasoning_effort="none"),
    "gpt-6-luna": ModelProfile(accepts_temperature=False, reasoning_effort="none"),
}

# An unknown model gets the request that cannot be refused: no temperature, the API's own
# default effort.
_UNKNOWN_MODEL = ModelProfile(accepts_temperature=False, reasoning_effort=None)


def resolve_model_profile(model: str) -> ModelProfile:
    normalized = (model or "").strip().lower()
    matches = [prefix for prefix in MODEL_PROFILES if normalized == prefix or normalized.startswith(f"{prefix}-")]
    return MODEL_PROFILES[max(matches, key=len)] if matches else _UNKNOWN_MODEL


@dataclass
class UsageTotals:
    """Running token and cost totals of one provider, so a caller can price a whole job:
    read it after the job, or reset() it before."""

    calls: int = 0
    prompt: int = 0
    cached: int = 0
    cache_write: int = 0
    completion: int = 0
    reasoning: int = 0
    cost_usd: float = 0.0
    unpriced_calls: int = 0

    def add(self, *, prompt: int, cached: int, cache_write: int, completion: int, reasoning: int, cost: float | None) -> None:
        self.calls += 1
        self.prompt += prompt
        self.cached += cached
        self.cache_write += cache_write
        self.completion += completion
        self.reasoning += reasoning
        if cost is None:
            self.unpriced_calls += 1
        else:
            self.cost_usd += cost

    def reset(self) -> None:
        self.__init__()


class OpenAIProvider(LLMProvider):
    name = "openai"

    def __init__(
        self,
        *,
        api_key: str,
        model: str = "gpt-4o-mini",
        timeout: float | None = None,
        max_retries: int | None = None,
        reasoning_effort: str | None = None,
    ):
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise RuntimeError("OpenAI provider requires the `openai` package. Install dependencies and retry.") from exc

        client_kwargs: dict[str, Any] = {"api_key": api_key}
        if timeout is not None:
            client_kwargs["timeout"] = timeout
        if max_retries is not None:
            client_kwargs["max_retries"] = max_retries

        self._client = OpenAI(**client_kwargs)
        self._model = model
        self._profile = resolve_model_profile(model)
        self._reasoning_effort = reasoning_effort or self._profile.reasoning_effort
        self.usage = UsageTotals()

    def generate(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
        json_schema: dict[str, Any] | None = None,
    ) -> str:
        request: dict[str, Any] = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        if self._profile.accepts_temperature:
            request["temperature"] = temperature
        if self._reasoning_effort:
            request["reasoning_effort"] = self._reasoning_effort
        if json_schema is not None:
            request["response_format"] = {"type": "json_schema", "json_schema": {**json_schema, "strict": True}}

        try:
            response = self._client.chat.completions.create(**request)
        except Exception as exc:
            raise RuntimeError(f"OpenAI request failed: {exc}") from exc

        self._log_usage(response)

        finish_reason = getattr(response.choices[0], "finish_reason", None) if response.choices else None
        if finish_reason == "length":
            # Cut prose is still prose; half a JSON object parses as nothing.
            if json_schema is not None:
                raise LLMOutputTruncated(f"OpenAI response was cut at the output token limit (model={self._model})")
            logger.warning("OpenAI response cut at the output token limit (model=%s)", self._model)

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
        prompt_details = getattr(usage, "prompt_tokens_details", None)
        cached_tokens = int(getattr(prompt_details, "cached_tokens", 0) or 0)
        cache_write_tokens = int(getattr(prompt_details, "cache_write_tokens", 0) or 0)
        # Already inside completion_tokens; logged apart because it is the cost nobody reads.
        reasoning_tokens = int(getattr(getattr(usage, "completion_tokens_details", None), "reasoning_tokens", 0) or 0)

        effective_model = str(getattr(response, "model", self._model) or self._model)
        estimated_cost = estimate_model_cost_usd(
            model_name=effective_model,
            input_tokens=prompt_tokens,
            output_tokens=completion_tokens,
            cached_input_tokens=cached_tokens,
            cache_write_tokens=cache_write_tokens,
        )
        add_usage_cost(estimated_cost)
        self.usage.add(
            prompt=prompt_tokens,
            cached=cached_tokens,
            cache_write=cache_write_tokens,
            completion=completion_tokens,
            reasoning=reasoning_tokens,
            cost=estimated_cost,
        )

        logger.info(
            "[COST_DEBUG] openai usage parsed: model=%s prompt=%d (cached=%d, cache_write=%d) completion=%d (reasoning=%d) est_cost_usd=%s",
            effective_model,
            prompt_tokens,
            cached_tokens,
            cache_write_tokens,
            completion_tokens,
            reasoning_tokens,
            format_cost(estimated_cost),
        )
