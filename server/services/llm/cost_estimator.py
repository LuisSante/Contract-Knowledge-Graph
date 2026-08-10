from __future__ import annotations

from typing import Any

MODEL_PRICING_USD_PER_1M: dict[str, dict[str, float]] = {
    "gpt-4.1-nano": {"input": 0.10, "output": 0.40},
    "gpt-4.1": {"input": 2.0, "output": 8.0},
    "gpt-4.1-2025-04-14": {"input": 2.0, "output": 8.0},
    "gpt-4_1-2025-04-14": {"input": 2.0, "output": 8.0},
    "gpt-5": {"input": 1.25, "output": 10.0},
    "gpt-5.1": {"input": 1.25, "output": 10.0},
    # "gpt-5-mini": {"input": 0.25, "output": 2.0},
    # "gpt-5-nano": {"input": 0.05, "output": 0.4},
}

_TIKTOKEN_ENCODER: Any | None = None
_TIKTOKEN_READY = False


def estimate_tokens(text: str, model_name: str) -> int:
    if not text:
        return 0

    encoder = _get_tiktoken_encoder(model_name)
    if encoder is not None:
        try:
            return len(encoder.encode(text))
        except Exception:
            pass

    return max(1, len(text) // 4)


def estimate_model_cost_usd(*, model_name: str, input_tokens: int, output_tokens: int) -> float | None:
    rates = resolve_model_rates(model_name)
    if rates is None:
        return None
    return (
        (input_tokens / 1_000_000.0) * rates["input"]
        + (output_tokens / 1_000_000.0) * rates["output"]
    )


def resolve_model_rates(model_name: str) -> dict[str, float] | None:
    normalized = (model_name or "").strip().lower()
    if not normalized:
        return None

    if normalized in MODEL_PRICING_USD_PER_1M:
        return MODEL_PRICING_USD_PER_1M[normalized]

    normalized_alt = normalized.replace(".", "_")
    if normalized_alt in MODEL_PRICING_USD_PER_1M:
        return MODEL_PRICING_USD_PER_1M[normalized_alt]

    if normalized.startswith("gpt-4.1-"):
        return MODEL_PRICING_USD_PER_1M["gpt-4.1"]
    if normalized.startswith("gpt-4_1-"):
        return MODEL_PRICING_USD_PER_1M["gpt-4.1"]
    # # Handle OpenAI variant model IDs (e.g., gpt-5.1-2026-..., gpt-5-mini-..., gpt-5-nano-...)
    # if normalized.startswith("gpt-5-mini"):
    #     return MODEL_PRICING_USD_PER_1M["gpt-5-mini"]
    # if normalized.startswith("gpt-5-nano"):
    #     return MODEL_PRICING_USD_PER_1M["gpt-5-nano"]
    if normalized.startswith("gpt-5"):
        return MODEL_PRICING_USD_PER_1M["gpt-5"]
    if normalized.startswith("gpt-5.1"):
        return MODEL_PRICING_USD_PER_1M["gpt-5.1"]

    return None


def format_cost(cost: float | None) -> str:
    if cost is None:
        return "unknown"
    return f"{cost:.6f}"


def _get_tiktoken_encoder(model_name: str) -> Any | None:
    global _TIKTOKEN_ENCODER
    global _TIKTOKEN_READY

    if _TIKTOKEN_READY:
        return _TIKTOKEN_ENCODER

    _TIKTOKEN_READY = True

    try:
        import tiktoken  # type: ignore
    except Exception:
        _TIKTOKEN_ENCODER = None
        return None

    try:
        _TIKTOKEN_ENCODER = tiktoken.encoding_for_model(model_name)
    except Exception:
        _TIKTOKEN_ENCODER = tiktoken.get_encoding("cl100k_base")

    return _TIKTOKEN_ENCODER
