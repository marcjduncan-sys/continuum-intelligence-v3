"""
Macro sensitivity map: DB-backed with inference for new tickers.

Loads from the macro_sensitivity database table with a 5-min in-memory cache.
Falls back to data/config/macro_sensitivity.json during transition.
New tickers get auto-inferred entries via infer_macro_sensitivity() during
coverage initiation, based on their SECTOR_COMMODITY_MAP entry.
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

import config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# JSON fallback (transition safety)
# ---------------------------------------------------------------------------

_sensitivity_file = os.path.join(config.PROJECT_ROOT, "data", "config", "macro_sensitivity.json")

try:
    with open(_sensitivity_file, "r", encoding="utf-8") as _fh:
        _JSON_FALLBACK: dict[str, dict] = {
            k: v for k, v in json.load(_fh).items()
            if not k.startswith("_")
        }
except Exception:
    _JSON_FALLBACK = {}

# ---------------------------------------------------------------------------
# DB-backed registry with cache
# ---------------------------------------------------------------------------

_cache: dict[str, dict] = {}
_cache_ts: float = 0
_CACHE_TTL = 300  # 5 minutes


async def _load_from_db() -> dict[str, dict]:
    """Load full sensitivity map from database."""
    try:
        import db
        pool = await db.get_pool()
        if pool is None:
            return {}
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT ticker, macro_key, direction, magnitude FROM macro_sensitivity"
            )
            result: dict[str, dict] = {}
            for row in rows:
                ticker = row["ticker"]
                if ticker not in result:
                    result[ticker] = {}
                result[ticker][row["macro_key"]] = {
                    "direction": row["direction"],
                    "magnitude": row["magnitude"],
                }
            return result
    except Exception as exc:
        logger.debug("macro_sensitivity DB load failed (using fallback): %s", exc)
        return {}


def _get_map() -> dict[str, dict]:
    """Return the current sensitivity map (cache or JSON fallback)."""
    if _cache:
        return _cache
    return _JSON_FALLBACK


async def refresh_cache() -> None:
    """Force-refresh the in-memory cache from DB."""
    global _cache, _cache_ts
    db_map = await _load_from_db()
    if db_map:
        _cache = db_map
        _cache_ts = time.time()


async def _ensure_cache() -> None:
    """Refresh cache if stale."""
    global _cache, _cache_ts
    if time.time() - _cache_ts > _CACHE_TTL:
        await refresh_cache()


# ---------------------------------------------------------------------------
# Public lookup API (same signatures as before)
# ---------------------------------------------------------------------------

def get_affected_tickers(macro_variable: str) -> list[dict[str, Any]]:
    """Return tickers sensitive to a given macro variable."""
    results = []
    for ticker, drivers in _get_map().items():
        if macro_variable in drivers:
            entry = drivers[macro_variable].copy()
            entry["ticker"] = ticker
            results.append(entry)
    return results


def get_ticker_drivers(ticker: str) -> dict[str, dict[str, str]]:
    """Return macro drivers for a given ticker."""
    return _get_map().get(ticker.upper(), {})


def get_all_macro_variables() -> list[str]:
    """Return all unique macro variable keys across all tickers."""
    variables: set[str] = set()
    for drivers in _get_map().values():
        variables.update(drivers.keys())
    return sorted(variables)


def get_sensitivity_map() -> dict[str, dict]:
    """Return the full sensitivity map (read-only reference)."""
    return _get_map()


# ---------------------------------------------------------------------------
# Inference: auto-generate sensitivity for new tickers
# ---------------------------------------------------------------------------

# Commodity ticker -> macro sensitivity mapping (deterministic)
_COMMODITY_TO_SENSITIVITY: dict[str, dict[str, str]] = {
    "BZ=F": {"macro_key": "brent_crude", "direction": "positive", "magnitude": "high"},
    "NG=F": {"macro_key": "natural_gas", "direction": "positive", "magnitude": "medium"},
    "GC=F": {"macro_key": "gold", "direction": "positive", "magnitude": "high"},
    "SI=F": {"macro_key": "gold", "direction": "positive", "magnitude": "medium"},
    "HG=F": {"macro_key": "copper", "direction": "positive", "magnitude": "medium"},
}

# Sector-based defaults
_SECTOR_DEFAULTS: dict[str, list[dict[str, str]]] = {
    "Financials": [
        {"macro_key": "us10y", "direction": "positive", "magnitude": "medium"},
        {"macro_key": "rba_cash_rate", "direction": "positive", "magnitude": "high"},
        {"macro_key": "audusd", "direction": "mixed", "magnitude": "medium"},
    ],
    "Real Estate": [
        {"macro_key": "rba_cash_rate", "direction": "negative", "magnitude": "high"},
        {"macro_key": "audusd", "direction": "mixed", "magnitude": "low"},
    ],
}

# FX sensitivity for USD earners (tech, healthcare, international)
_USD_EARNER_SECTORS = {
    "Information Technology", "Health Care", "Communication Services",
}


def infer_macro_sensitivity(
    ticker: str,
    sector_commodity_entry: dict | None = None,
    sector: str | None = None,
) -> list[dict[str, str]]:
    """Infer macro sensitivity entries for a ticker from its commodity mapping.

    Args:
        ticker: ASX ticker code.
        sector_commodity_entry: The ticker's entry from SECTOR_COMMODITY_MAP (optional).
        sector: GICS sector name (optional, for sector-based defaults).

    Returns:
        List of dicts: [{"macro_key": "brent_crude", "direction": "positive", "magnitude": "high"}, ...]
    """
    seen_keys: set[str] = set()
    entries: list[dict[str, str]] = []

    # Commodity-based sensitivity
    if sector_commodity_entry:
        for commodity in sector_commodity_entry.get("commodities", []):
            cticker = commodity.get("ticker", "")
            mapping = _COMMODITY_TO_SENSITIVITY.get(cticker)
            if mapping and mapping["macro_key"] not in seen_keys:
                entries.append(mapping.copy())
                seen_keys.add(mapping["macro_key"])

        # AUD/USD sensitivity for stocks with AUDUSD=X in commodities
        for commodity in sector_commodity_entry.get("commodities", []):
            if commodity.get("ticker") == "AUDUSD=X" and "audusd" not in seen_keys:
                entries.append({"macro_key": "audusd", "direction": "mixed", "magnitude": "medium"})
                seen_keys.add("audusd")

    # Sector-based defaults
    if sector and sector in _SECTOR_DEFAULTS:
        for default in _SECTOR_DEFAULTS[sector]:
            if default["macro_key"] not in seen_keys:
                entries.append(default.copy())
                seen_keys.add(default["macro_key"])

    # USD earner FX sensitivity
    if sector and sector in _USD_EARNER_SECTORS and "audusd" not in seen_keys:
        entries.append({"macro_key": "audusd", "direction": "negative", "magnitude": "medium"})
        seen_keys.add("audusd")

    # If nothing was inferred, add a minimal default
    if not entries:
        entries.append({"macro_key": "audusd", "direction": "negative", "magnitude": "low"})

    return entries


async def write_sensitivity(
    ticker: str,
    entries: list[dict[str, str]],
    source: str = "inferred",
    pool: Any = None,
) -> bool:
    """Write sensitivity entries for a ticker to the database.

    Idempotent: existing entries are not overwritten (ON CONFLICT DO NOTHING).
    Returns True if at least one row was written.
    """
    if pool is None:
        try:
            import db
            pool = await db.get_pool()
        except Exception:
            return False

    if pool is None:
        return False

    written = 0
    try:
        async with pool.acquire() as conn:
            for entry in entries:
                result = await conn.execute(
                    """
                    INSERT INTO macro_sensitivity (ticker, macro_key, direction, magnitude, source)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (ticker, macro_key) DO NOTHING
                    """,
                    ticker.upper(),
                    entry["macro_key"],
                    entry["direction"],
                    entry["magnitude"],
                    source,
                )
                if result and "INSERT 0 1" in result:
                    written += 1
    except Exception as exc:
        logger.warning("macro_sensitivity: DB write failed for %s: %s", ticker, exc)
        return False

    if written > 0:
        # Invalidate cache so next lookup sees the new entries
        global _cache_ts
        _cache_ts = 0
        logger.info("macro_sensitivity: wrote %d entries for %s (source=%s)", written, ticker, source)

    return written > 0
