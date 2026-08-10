from __future__ import annotations

import logging
import sqlite3
from pathlib import Path
from threading import Lock

_LOCK = Lock()
_DB_PATH = Path(__file__).resolve().parents[2] / "data" / "llm_usage.sqlite3"
logger = logging.getLogger(__name__)


def _ensure_db() -> None:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS llm_usage_total (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                total_cost_usd REAL NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute("INSERT OR IGNORE INTO llm_usage_total (id, total_cost_usd) VALUES (1, 0)")
        conn.commit()
    logger.info("[COST_DEBUG] usage DB ready at: %s", _DB_PATH)


def add_usage_cost(cost_usd: float | None) -> None:
    if cost_usd is None:
        logger.info("[COST_DEBUG] add_usage_cost skipped: cost is None")
        return
    if cost_usd <= 0:
        logger.info("[COST_DEBUG] add_usage_cost skipped: non-positive cost=%s", cost_usd)
        return
    with _LOCK:
        _ensure_db()
        with sqlite3.connect(_DB_PATH) as conn:
            conn.execute(
                "UPDATE llm_usage_total SET total_cost_usd = total_cost_usd + ? WHERE id = 1",
                (float(cost_usd),),
            )
            conn.commit()
            row = conn.execute(
                "SELECT total_cost_usd FROM llm_usage_total WHERE id = 1"
            ).fetchone()
            new_total = float(row[0] if row and row[0] is not None else 0.0)
            logger.info(
                "[COST_DEBUG] add_usage_cost applied: delta=%0.9f new_total=%0.9f",
                float(cost_usd),
                new_total,
            )


def get_total_usage_cost_usd() -> float:
    with _LOCK:
        _ensure_db()
        with sqlite3.connect(_DB_PATH) as conn:
            row = conn.execute(
                "SELECT total_cost_usd FROM llm_usage_total WHERE id = 1"
            ).fetchone()
            total = float(row[0] if row and row[0] is not None else 0.0)
            logger.info("[COST_DEBUG] get_total_usage_cost_usd returning: %0.9f", total)
            return total
