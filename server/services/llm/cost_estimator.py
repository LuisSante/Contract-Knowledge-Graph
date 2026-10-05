from __future__ import annotations

from dataclasses import dataclass
from logging import getLogger
from typing import Any

logger = getLogger(__name__)


@dataclass(frozen=True)
class Rates:
    """USD per 1M tokens."""

    input: float
    output: float
    # None: the model gives no discount on cached input, so it bills as plain input.
    cached_input: float | None = None
    # None: writing the cache costs nothing on top of the input it is written from.
    cache_write: float | None = None


@dataclass(frozen=True)
class Pricing:
    short: Rates
    # None: the model bills the same at any length.
    long: Rates | None = None


# A request whose input exceeds this is billed entirely at the long-context rates.
LONG_CONTEXT_THRESHOLD = 272_000

# From OpenAI's pricing page, read 2026-10-05.
MODEL_PRICING_USD_PER_1M: dict[str, Pricing] = {
    "gpt-6-astra": Pricing(Rates(10.0, 50.0, 1.00, 12.50), Rates(20.0, 75.0, 2.00, 25.0)),
    "gpt-6.1-sol": Pricing(Rates(2.0, 10.0, 0.10, 2.50), Rates(4.0, 15.0, 0.20, 5.0)),
    "gpt-6-sol": Pricing(Rates(2.0, 10.0, 0.20, 2.50), Rates(4.0, 15.0, 0.40, 5.0)),
    "gpt-6-luna": Pricing(Rates(0.10, 0.50, 0.01, 0.125), Rates(0.20, 0.75, 0.02, 0.25)),
    "gpt-5.6-sol": Pricing(Rates(4.0, 20.0, 0.40, 5.0), Rates(8.0, 30.0, 0.80, 10.0)),
    "gpt-5.6-terra": Pricing(Rates(2.0, 12.0, 0.20, 2.50), Rates(4.0, 18.0, 0.40, 5.0)),
    "gpt-5.6-luna": Pricing(Rates(0.20, 1.20, 0.02, 0.25), Rates(0.40, 1.80, 0.04, 0.50)),
    "gpt-5.5": Pricing(Rates(5.0, 30.0, 0.50), Rates(10.0, 45.0, 1.00)),
    "gpt-5.5-pro": Pricing(Rates(30.0, 180.0), Rates(60.0, 270.0)),
    "gpt-5.4": Pricing(Rates(2.50, 15.0, 0.25), Rates(5.0, 22.50, 0.50)),
    "gpt-5.4-pro": Pricing(Rates(30.0, 180.0), Rates(60.0, 270.0)),
    "gpt-5.4-mini": Pricing(Rates(0.75, 4.50, 0.075)),
    "gpt-5.4-nano": Pricing(Rates(0.20, 1.25, 0.02)),
    "gpt-5.2": Pricing(Rates(1.75, 14.0, 0.175)),
    "gpt-5.2-pro": Pricing(Rates(21.0, 168.0)),
    "gpt-5.1": Pricing(Rates(1.25, 10.0, 0.125)),
    "gpt-5": Pricing(Rates(1.25, 10.0, 0.125)),
    "gpt-5-mini": Pricing(Rates(0.25, 2.0, 0.025)),
    "gpt-5-nano": Pricing(Rates(0.05, 0.40, 0.005)),
    "gpt-5-pro": Pricing(Rates(15.0, 120.0)),
    "gpt-4.1": Pricing(Rates(2.0, 8.0, 0.50)),
    "gpt-4.1-mini": Pricing(Rates(0.40, 1.60, 0.10)),
    "gpt-4.1-nano": Pricing(Rates(0.10, 0.40, 0.025)),
    "gpt-4o": Pricing(Rates(2.50, 10.0, 1.25)),
    "gpt-4o-mini": Pricing(Rates(0.15, 0.60, 0.075)),
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
        except ValueError:
            # Special tokens in the text; the four-chars-per-token estimate is enough
            # for a cost preview.
            logger.debug("tiktoken could not encode the text", exc_info=True)

    return max(1, len(text) // 4)


def estimate_model_cost_usd(
    *,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    cached_input_tokens: int = 0,
    cache_write_tokens: int = 0,
) -> float | None:
    """Cost of one request. input_tokens is the whole prompt, cached and written parts included,
    and output_tokens includes any reasoning tokens — both as the API reports them."""
    pricing = resolve_model_rates(model_name)
    if pricing is None:
        return None
    rates = pricing.long if pricing.long and input_tokens > LONG_CONTEXT_THRESHOLD else pricing.short

    plain_input = max(0, input_tokens - cached_input_tokens - cache_write_tokens)
    cached_rate = rates.input if rates.cached_input is None else rates.cached_input
    write_rate = rates.input if rates.cache_write is None else rates.cache_write
    usd = plain_input * rates.input + cached_input_tokens * cached_rate + cache_write_tokens * write_rate + output_tokens * rates.output
    return usd / 1_000_000.0


def resolve_model_rates(model_name: str) -> Pricing | None:
    """Exact name first, then the longest known name it is a dated snapshot of
    ("gpt-4.1-2025-04-14" -> "gpt-4.1"). An unknown family returns None rather than a
    neighbour's price: "gpt-5.7" is not billed as "gpt-5"."""
    normalized = (model_name or "").strip().lower().replace("_", ".")
    if not normalized:
        return None
    if normalized in MODEL_PRICING_USD_PER_1M:
        return MODEL_PRICING_USD_PER_1M[normalized]

    snapshot_of = [
        name for name in MODEL_PRICING_USD_PER_1M if normalized.startswith(f"{name}-") and normalized[len(name) + 1 : len(name) + 2].isdigit()
    ]
    if snapshot_of:
        return MODEL_PRICING_USD_PER_1M[max(snapshot_of, key=len)]
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
    except ImportError:
        logger.debug("tiktoken is not installed; estimating tokens by length")
        _TIKTOKEN_ENCODER = None
        return None

    try:
        _TIKTOKEN_ENCODER = tiktoken.encoding_for_model(model_name)
    except KeyError:
        # A model tiktoken does not know yet: its own default encoding still counts.
        _TIKTOKEN_ENCODER = tiktoken.get_encoding("cl100k_base")

    return _TIKTOKEN_ENCODER
