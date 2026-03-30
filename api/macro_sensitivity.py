"""
Macro sensitivity map loader and lookup utility.

Loads data/config/macro_sensitivity.json which maps each platform ticker
to its macro driver sensitivities (direction + magnitude). Used by the
regime detector (BEAD-004) and staleness badge (BEAD-005).
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import config

logger = logging.getLogger(__name__)

_sensitivity_file = os.path.join(config.PROJECT_ROOT, "data", "config", "macro_sensitivity.json")

try:
    with open(_sensitivity_file, "r", encoding="utf-8") as _fh:
        _SENSITIVITY_MAP: dict[str, dict] = {
            k: v for k, v in json.load(_fh).items()
            if not k.startswith("_")
        }
except Exception:
    _SENSITIVITY_MAP = {}
    logger.warning("macro_sensitivity: failed to load %s", _sensitivity_file)


def get_affected_tickers(macro_variable: str) -> list[dict[str, Any]]:
    """Return tickers sensitive to a given macro variable.

    Args:
        macro_variable: Key name (e.g. "brent_crude", "gold", "us10y").

    Returns:
        List of dicts: [{"ticker": "WDS", "direction": "positive", "magnitude": "high"}, ...]
    """
    results = []
    for ticker, drivers in _SENSITIVITY_MAP.items():
        if macro_variable in drivers:
            entry = drivers[macro_variable].copy()
            entry["ticker"] = ticker
            results.append(entry)
    return results


def get_ticker_drivers(ticker: str) -> dict[str, dict[str, str]]:
    """Return macro drivers for a given ticker.

    Args:
        ticker: Stock ticker (e.g. "WDS", "BHP").

    Returns:
        Dict: {"brent_crude": {"direction": "positive", "magnitude": "high"}, ...}
        Empty dict if ticker not in sensitivity map.
    """
    return _SENSITIVITY_MAP.get(ticker.upper(), {})


def get_all_macro_variables() -> list[str]:
    """Return all unique macro variable keys across all tickers."""
    variables: set[str] = set()
    for drivers in _SENSITIVITY_MAP.values():
        variables.update(drivers.keys())
    return sorted(variables)


def get_sensitivity_map() -> dict[str, dict]:
    """Return the full sensitivity map (read-only reference)."""
    return _SENSITIVITY_MAP
