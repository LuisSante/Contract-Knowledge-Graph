from __future__ import annotations

import json
import logging
from pathlib import Path
from threading import Lock

# Simple running total of LLM cost, stored as a small JSON file (no database).
# A real store (Postgres) will replace this later.
_LOCK = Lock()
_JSON_PATH = Path(__file__).resolve().parents[2] / "llm_usage.json"
logger = logging.getLogger(__name__)


def _read_total() -> float:
    try:
        with open(_JSON_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return float(data.get("total_cost_usd", 0.0) or 0.0)
    except (FileNotFoundError, json.JSONDecodeError, ValueError, TypeError):
        return 0.0


def _write_total(total: float) -> None:
    _JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump({"total_cost_usd": float(total)}, f, indent=2)


def add_usage_cost(cost_usd: float | None) -> None:
    if cost_usd is None:
        logger.info("[COST_DEBUG] add_usage_cost skipped: cost is None")
        return
    if cost_usd <= 0:
        logger.info("[COST_DEBUG] add_usage_cost skipped: non-positive cost=%s", cost_usd)
        return
    with _LOCK:
        new_total = _read_total() + float(cost_usd)
        _write_total(new_total)
        logger.info(
            "[COST_DEBUG] add_usage_cost applied: delta=%0.9f new_total=%0.9f",
            float(cost_usd),
            new_total,
        )


def get_total_usage_cost_usd() -> float:
    with _LOCK:
        total = _read_total()
        logger.info("[COST_DEBUG] get_total_usage_cost_usd returning: %0.9f", total)
        return total
