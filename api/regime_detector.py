"""
Regime break detector (BEAD-004).

Consumes the macro state (from macro_series + macro_prices + macro_series_history)
and detects material regime changes by comparing current values against rolling
30-day statistics. Produces regime events that feed POST /api/regime/refresh.

Detection rules:
- Fire when any macro variable moves >15% from its 30-day rolling mean
- Fire when any macro variable moves >2 standard deviations from its 30-day rolling mean
- Either threshold triggers (OR logic)
- If stddev is null/zero (insufficient history), only the 15% threshold is checked
- Cooldown: 4 hours per variable to suppress repeat alerts

Does NOT touch staleness-badge.js or report-sections.js (BEAD-005 separation).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

import macro_sensitivity

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PCT_THRESHOLD = 15.0
SIGMA_THRESHOLD = 2.0
COOLDOWN_SECONDS = 4 * 3600  # 4 hours
MIN_SAMPLES_FOR_SIGMA = 5

# Maps sensitivity map keys -> macro state endpoint keys.
# The macro state endpoint returns keys from macro_series.series_id and
# macro_prices.symbol. The sensitivity map uses descriptive keys.
_SENSITIVITY_TO_STATE: dict[str, list[str]] = {
    "brent_crude": ["BRENT_SPOT"],
    "natural_gas": [],
    "gold": ["GOLD", "XAU/USD"],
    "copper": ["COPPER"],
    "iron_ore": ["IRON_ORE"],
    "audusd": ["AUD/USD", "AUDUSD"],
    "us10y": ["DGS10"],
    "rba_cash_rate": ["CASH_RATE"],
}


# ---------------------------------------------------------------------------
# Regime event
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RegimeEvent:
    """Immutable record of a detected regime break."""
    variable: str
    current: float
    baseline: float
    change_pct: float
    sigma: float | None
    timestamp: float
    affected_tickers: list[dict[str, Any]] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Cooldown state
# ---------------------------------------------------------------------------

_cooldowns: dict[str, float] = {}


def _is_cooled_down(variable: str) -> bool:
    """Check if a variable is within its cooldown window."""
    last_fire = _cooldowns.get(variable, 0)
    return (time.time() - last_fire) >= COOLDOWN_SECONDS


def _record_fire(variable: str) -> None:
    """Record that a variable just fired."""
    _cooldowns[variable] = time.time()


def reset_cooldowns() -> None:
    """Clear all cooldown state. Useful for testing."""
    _cooldowns.clear()


# ---------------------------------------------------------------------------
# Core detection
# ---------------------------------------------------------------------------

def _resolve_state_value(
    macro_state: dict[str, Any],
    sensitivity_key: str,
) -> dict[str, Any] | None:
    """Find the macro state entry for a sensitivity map key.

    Tries each possible state key in priority order.
    Returns the state dict (with current, rolling_30d_mean, etc.) or None.
    """
    candidates = _SENSITIVITY_TO_STATE.get(sensitivity_key, [])
    for state_key in candidates:
        entry = macro_state.get(state_key)
        if entry and entry.get("current") is not None:
            return entry
    return None


def detect(macro_state: dict[str, Any]) -> list[RegimeEvent]:
    """Run regime break detection against current macro state.

    Args:
        macro_state: The "variables" dict from GET /api/macro/state.

    Returns:
        List of RegimeEvent for each variable that breached a threshold
        and is not within its cooldown window.
    """
    events: list[RegimeEvent] = []
    all_variables = macro_sensitivity.get_all_macro_variables()

    for sens_key in all_variables:
        state = _resolve_state_value(macro_state, sens_key)
        if state is None:
            continue

        current = state.get("current")
        mean = state.get("rolling_30d_mean")
        stddev = state.get("rolling_30d_stddev")
        samples = state.get("rolling_30d_samples", 0)

        if current is None or mean is None or mean == 0:
            continue

        # Percentage deviation from 30d mean
        pct_change = ((current - mean) / abs(mean)) * 100
        abs_pct = abs(pct_change)

        # Sigma deviation (only if we have enough history)
        sigma = None
        if stddev and stddev > 0 and samples >= MIN_SAMPLES_FOR_SIGMA:
            sigma = (current - mean) / stddev

        # Check thresholds
        pct_triggered = abs_pct >= PCT_THRESHOLD
        sigma_triggered = sigma is not None and abs(sigma) >= SIGMA_THRESHOLD

        if not pct_triggered and not sigma_triggered:
            continue

        # Check cooldown
        if not _is_cooled_down(sens_key):
            logger.debug(
                "regime_detector: %s breached threshold but in cooldown", sens_key
            )
            continue

        # Fire
        affected = macro_sensitivity.get_affected_tickers(sens_key)
        event = RegimeEvent(
            variable=sens_key,
            current=current,
            baseline=mean,
            change_pct=round(pct_change, 2),
            sigma=round(sigma, 2) if sigma is not None else None,
            timestamp=time.time(),
            affected_tickers=affected,
        )
        events.append(event)
        _record_fire(sens_key)

        trigger_type = []
        if pct_triggered:
            trigger_type.append(f"{abs_pct:.1f}% move")
        if sigma_triggered:
            trigger_type.append(f"{abs(sigma):.1f} sigma")

        logger.warning(
            "REGIME BREAK: %s current=%.4f mean=%.4f (%s). %d tickers affected.",
            sens_key, current, mean, ", ".join(trigger_type), len(affected),
        )

    return events


# ---------------------------------------------------------------------------
# Scheduler integration
# ---------------------------------------------------------------------------

async def run_detection_cycle(pool: Any) -> list[RegimeEvent]:
    """Fetch macro state from the database and run detection.

    Called by the scheduler after each macro data refresh cycle.
    Returns any regime events detected.
    """
    # Ensure sensitivity map is fresh from DB
    try:
        await macro_sensitivity._ensure_cache()
    except Exception:
        pass  # Detection continues with whatever map is available

    try:
        async with pool.acquire() as conn:
            # Query the same data as GET /api/macro/state, inline
            series_rows = await conn.fetch(
                """
                SELECT source, series_id, last_value, last_date,
                       previous_value, updated_at
                FROM macro_series
                WHERE series_id IN (
                    'DGS10', 'BRENT_SPOT', 'WTI_SPOT',
                    'CASH_RATE', 'AUDUSD', 'VIXCLS',
                    'AU_10Y', 'FEDFUNDS',
                    'IRON_ORE', 'GOLD', 'COPPER'
                )
                """
            )
            price_rows = await conn.fetch(
                """
                SELECT DISTINCT ON (symbol) symbol, price, change_pct,
                       source, fetched_at
                FROM macro_prices
                WHERE symbol IN ('AUD/USD', 'XAU/USD', 'NZD/USD', 'EUR/USD')
                ORDER BY symbol, fetched_at DESC
                """
            )
            rolling_rows = await conn.fetch(
                """
                SELECT source, series_id,
                       AVG(value) AS mean_30d,
                       STDDEV(value) AS stddev_30d,
                       COUNT(*) AS sample_count
                FROM macro_series_history
                WHERE recorded_at >= NOW() - INTERVAL '30 days'
                GROUP BY source, series_id
                """
            )
    except Exception as exc:
        logger.error("regime_detector: DB query failed: %s", exc)
        return []

    # Build the same structure as the macro state endpoint
    macro_state: dict[str, Any] = {}

    for row in series_rows:
        sid = row["series_id"]
        current = float(row["last_value"]) if row["last_value"] is not None else None
        macro_state[sid] = {"current": current}

    for row in price_rows:
        symbol = row["symbol"]
        macro_state[symbol] = {
            "current": float(row["price"]) if row["price"] is not None else None,
        }

    rolling_map: dict[str, dict] = {}
    for row in rolling_rows:
        rolling_map[row["series_id"]] = {
            "mean_30d": float(row["mean_30d"]) if row["mean_30d"] is not None else None,
            "stddev_30d": float(row["stddev_30d"]) if row["stddev_30d"] is not None else None,
            "sample_count": row["sample_count"],
        }

    for key, var in macro_state.items():
        stats = rolling_map.get(key, {})
        var["rolling_30d_mean"] = stats.get("mean_30d")
        var["rolling_30d_stddev"] = stats.get("stddev_30d")
        var["rolling_30d_samples"] = stats.get("sample_count", 0)

    events = detect(macro_state)

    if events:
        logger.info(
            "regime_detector: %d regime event(s) detected: %s",
            len(events),
            ", ".join(e.variable for e in events),
        )

    return events
