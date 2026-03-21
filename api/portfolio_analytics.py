"""
Portfolio analytics engine (Phase C).

Pure deterministic functions that compute portfolio statistics from a snapshot.
No LLM calls, no network, no side effects. Every output is reproducible from inputs.

Design: all analytics flow through `compute_analytics()` which returns a
`PortfolioAnalytics` dict. Thresholds are configurable. Every flag carries
a plain-English explanation tied to an actual number.

Source of truth for weights: market_value / total_value, derived here.
No stored weight column exists.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field, asdict
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Threshold configuration
# ---------------------------------------------------------------------------

@dataclass
class ThresholdConfig:
    """Configurable thresholds for portfolio risk flags.

    All weight thresholds are expressed as decimals (0.15 = 15%).
    """
    max_single_position: float = 0.15       # single name > 15%
    max_top5: float = 0.50                   # top 5 > 50%
    max_top10: float = 0.75                  # top 10 > 75%
    max_sector: float = 0.35                 # single sector > 35%
    min_cash: float = 0.03                   # cash < 3%
    max_cash: float = 0.25                   # cash > 25%
    unmapped_sector_name: str = "Unclassified"

    def to_dict(self) -> dict:
        return asdict(self)


DEFAULT_THRESHOLDS = ThresholdConfig()


# ---------------------------------------------------------------------------
# Analytics flag with explanation (C5)
# ---------------------------------------------------------------------------

@dataclass
class AnalyticsFlag:
    """A single portfolio risk/observation flag with explanation."""
    code: str               # machine-readable: e.g. "HIGH_SINGLE_NAME"
    severity: str           # "warning" | "info"
    message: str            # human-readable sentence
    metric_name: str        # what was measured
    metric_value: float     # the actual number
    threshold: float        # the threshold it was compared against

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Core weight computation (frozen source of truth)
# ---------------------------------------------------------------------------

def _derive_weights(holdings: list[dict], total_value: float) -> list[dict]:
    """Attach 'weight' to each holding. Returns holdings sorted by weight desc.

    This is the single derivation path for weights. Do not store weights elsewhere.
    """
    for h in holdings:
        mv = float(h.get("market_value", 0))
        h["weight"] = round(mv / total_value, 6) if total_value > 0 else 0.0
    holdings.sort(key=lambda h: h["weight"], reverse=True)
    return holdings


# ---------------------------------------------------------------------------
# Concentration metrics
# ---------------------------------------------------------------------------

def _concentration_metrics(
    weighted_holdings: list[dict],
) -> dict[str, float]:
    """Compute concentration statistics from weight-sorted holdings."""
    n = len(weighted_holdings)
    weights = [h["weight"] for h in weighted_holdings]

    max_single = weights[0] if weights else 0.0
    top5 = sum(weights[:5]) if n >= 5 else sum(weights)
    top10 = sum(weights[:10]) if n >= 10 else sum(weights)

    # HHI: sum of squared weights (0 to 1; higher = more concentrated)
    hhi = sum(w * w for w in weights)

    # Equal-weight deviation: how far from 1/N each position is
    if n > 0:
        equal_w = 1.0 / n
        ew_deviation = sum(abs(w - equal_w) for w in weights) / n
    else:
        ew_deviation = 0.0

    return {
        "position_count": n,
        "max_single_weight": round(max_single, 6),
        "top5_weight": round(top5, 6),
        "top10_weight": round(top10, 6),
        "hhi": round(hhi, 6),
        "equal_weight_deviation": round(ew_deviation, 6),
    }


# ---------------------------------------------------------------------------
# Sector exposure
# ---------------------------------------------------------------------------

def _sector_exposure(
    weighted_holdings: list[dict],
    total_value: float,
    unmapped_name: str = "Unclassified",
) -> dict[str, float]:
    """Aggregate holdings by sector, return {sector: weight}."""
    sectors: dict[str, float] = {}
    for h in weighted_holdings:
        sector = h.get("sector") or unmapped_name
        mv = float(h.get("market_value", 0))
        sectors[sector] = sectors.get(sector, 0.0) + mv
    if total_value > 0:
        return {s: round(v / total_value, 6) for s, v in sorted(sectors.items(), key=lambda x: -x[1])}
    return {s: 0.0 for s in sectors}


# ---------------------------------------------------------------------------
# Theme exposure (simple keyword-based, Phase C)
# ---------------------------------------------------------------------------

# Map of theme name -> set of sectors that belong to it.
# This is deliberately simple; enriched via config in future phases.
_THEME_MAP: dict[str, set[str]] = {
    "Cyclical": {"Materials", "Energy", "Industrials", "Consumer Discretionary"},
    "Defensive": {"Consumer Staples", "Health Care", "Utilities"},
    "Growth": {"Information Technology", "Communication Services"},
    "Financial": {"Financials"},
    "Real Assets": {"Real Estate", "Materials", "Energy"},
}


def _theme_exposure(
    sector_weights: dict[str, float],
) -> dict[str, float]:
    """Compute simple theme exposure by aggregating sector weights."""
    themes: dict[str, float] = {}
    for theme, sectors in _THEME_MAP.items():
        weight = sum(sector_weights.get(s, 0.0) for s in sectors)
        if weight > 0:
            themes[theme] = round(weight, 6)
    return themes


# ---------------------------------------------------------------------------
# Flag generation (C4 + C5)
# ---------------------------------------------------------------------------

def _generate_flags(
    concentration: dict[str, float],
    cash_weight: float,
    sector_weights: dict[str, float],
    weighted_holdings: list[dict],
    thresholds: ThresholdConfig,
) -> list[AnalyticsFlag]:
    """Generate explainable portfolio flags against thresholds."""
    flags: list[AnalyticsFlag] = []

    # --- Single-name concentration ---
    max_w = concentration["max_single_weight"]
    if max_w > thresholds.max_single_position and weighted_holdings:
        top = weighted_holdings[0]
        flags.append(AnalyticsFlag(
            code="HIGH_SINGLE_NAME",
            severity="warning",
            message=(
                f"{top['ticker']} is {max_w * 100:.1f}% of the portfolio. "
                f"Threshold is {thresholds.max_single_position * 100:.0f}%. "
                f"Consider whether conviction justifies this concentration."
            ),
            metric_name="max_single_weight",
            metric_value=max_w,
            threshold=thresholds.max_single_position,
        ))

    # --- Top 5 concentration ---
    top5 = concentration["top5_weight"]
    if top5 > thresholds.max_top5:
        top5_tickers = [h["ticker"] for h in weighted_holdings[:5]]
        flags.append(AnalyticsFlag(
            code="HIGH_TOP5",
            severity="warning",
            message=(
                f"Top 5 holdings ({', '.join(top5_tickers)}) represent "
                f"{top5 * 100:.1f}% of the portfolio. "
                f"Threshold is {thresholds.max_top5 * 100:.0f}%."
            ),
            metric_name="top5_weight",
            metric_value=top5,
            threshold=thresholds.max_top5,
        ))

    # --- Top 10 concentration ---
    top10 = concentration["top10_weight"]
    if top10 > thresholds.max_top10:
        flags.append(AnalyticsFlag(
            code="HIGH_TOP10",
            severity="warning",
            message=(
                f"Top 10 holdings represent {top10 * 100:.1f}% of the portfolio. "
                f"Threshold is {thresholds.max_top10 * 100:.0f}%."
            ),
            metric_name="top10_weight",
            metric_value=top10,
            threshold=thresholds.max_top10,
        ))

    # --- Sector concentration ---
    for sector, weight in sector_weights.items():
        if sector == thresholds.unmapped_sector_name:
            continue  # handled separately
        if weight > thresholds.max_sector:
            flags.append(AnalyticsFlag(
                code="HIGH_SECTOR",
                severity="warning",
                message=(
                    f"{sector} exposure is {weight * 100:.1f}% of the portfolio. "
                    f"Threshold is {thresholds.max_sector * 100:.0f}%."
                ),
                metric_name=f"sector_{sector}",
                metric_value=weight,
                threshold=thresholds.max_sector,
            ))

    # --- Unmapped sector ---
    unmapped_weight = sector_weights.get(thresholds.unmapped_sector_name, 0.0)
    if unmapped_weight > 0:
        flags.append(AnalyticsFlag(
            code="UNMAPPED_SECTOR",
            severity="info",
            message=(
                f"{unmapped_weight * 100:.1f}% of the portfolio has no sector classification. "
                f"Consider mapping these holdings to improve exposure analysis."
            ),
            metric_name="unmapped_sector_weight",
            metric_value=unmapped_weight,
            threshold=0.0,
        ))

    # --- Cash too low ---
    if cash_weight < thresholds.min_cash:
        flags.append(AnalyticsFlag(
            code="LOW_CASH",
            severity="warning",
            message=(
                f"Cash is {cash_weight * 100:.1f}% of the portfolio. "
                f"Minimum threshold is {thresholds.min_cash * 100:.0f}%. "
                f"Low cash limits ability to act on new opportunities."
            ),
            metric_name="cash_weight",
            metric_value=cash_weight,
            threshold=thresholds.min_cash,
        ))

    # --- Cash too high ---
    if cash_weight > thresholds.max_cash:
        flags.append(AnalyticsFlag(
            code="HIGH_CASH",
            severity="info",
            message=(
                f"Cash is {cash_weight * 100:.1f}% of the portfolio. "
                f"Maximum threshold is {thresholds.max_cash * 100:.0f}%. "
                f"High cash may indicate deployment lag or deliberate defensiveness."
            ),
            metric_name="cash_weight",
            metric_value=cash_weight,
            threshold=thresholds.max_cash,
        ))

    return flags


# ---------------------------------------------------------------------------
# Top positions summary
# ---------------------------------------------------------------------------

def _top_positions(weighted_holdings: list[dict], n: int = 5) -> list[dict]:
    """Return top N positions with ticker, weight, market_value, sector."""
    return [
        {
            "ticker": h["ticker"],
            "weight": h["weight"],
            "market_value": float(h["market_value"]),
            "sector": h.get("sector") or "Unclassified",
        }
        for h in weighted_holdings[:n]
    ]


# ---------------------------------------------------------------------------
# Concentration score (0-100, higher = more concentrated)
# ---------------------------------------------------------------------------

def _concentration_score(concentration: dict[str, float]) -> float:
    """Compute a single 0-100 concentration score.

    Uses HHI normalised by position count. A single-stock portfolio = 100.
    An equally-weighted 100-stock portfolio ~= 1.
    """
    n = concentration["position_count"]
    hhi = concentration["hhi"]
    if n <= 1:
        return 100.0
    # Normalised HHI: (HHI - 1/N) / (1 - 1/N)
    min_hhi = 1.0 / n
    max_hhi = 1.0
    if max_hhi == min_hhi:
        return 0.0
    normalised = (hhi - min_hhi) / (max_hhi - min_hhi)
    return round(min(max(normalised * 100, 0), 100), 1)


# ---------------------------------------------------------------------------
# Main entry point: compute_analytics
# ---------------------------------------------------------------------------

def compute_analytics(
    *,
    holdings: list[dict],
    total_value: float,
    cash_value: float,
    thresholds: ThresholdConfig | None = None,
) -> dict[str, Any]:
    """Compute the full analytics object for a portfolio snapshot.

    Args:
        holdings: list of holding dicts with at minimum
                  {ticker, quantity, price, market_value, sector?}
        total_value: snapshot total portfolio value
        cash_value: snapshot cash allocation
        thresholds: optional custom thresholds (defaults used if None)

    Returns:
        Complete analytics dict ready for persistence and PM context injection.
        All numbers are deterministic from the inputs.
    """
    if thresholds is None:
        thresholds = DEFAULT_THRESHOLDS

    # Deep copy to avoid mutating caller's data
    h_copy = [dict(h) for h in holdings]

    # Derive weights (frozen source of truth)
    weighted = _derive_weights(h_copy, total_value)

    # Cash weight
    cash_weight = round(cash_value / total_value, 6) if total_value > 0 else 0.0

    # Concentration metrics
    concentration = _concentration_metrics(weighted)

    # Sector exposure
    sector_weights = _sector_exposure(weighted, total_value, thresholds.unmapped_sector_name)

    # Theme exposure
    theme_weights = _theme_exposure(sector_weights)

    # Concentration score
    conc_score = _concentration_score(concentration)

    # Flags with explanations
    flags = _generate_flags(concentration, cash_weight, sector_weights, weighted, thresholds)

    # Top positions
    top5 = _top_positions(weighted, 5)

    return {
        "position_count": concentration["position_count"],
        "total_value": total_value,
        "cash_value": cash_value,
        "cash_weight": cash_weight,
        "concentration": concentration,
        "concentration_score": conc_score,
        "sector_exposure": sector_weights,
        "theme_exposure": theme_weights,
        "top_positions": top5,
        "flags": [f.to_dict() for f in flags],
        "thresholds_used": thresholds.to_dict(),
        "holdings_with_weights": [
            {
                "ticker": h["ticker"],
                "quantity": float(h["quantity"]),
                "price": float(h["price"]),
                "market_value": float(h["market_value"]),
                "weight": h["weight"],
                "sector": h.get("sector") or "Unclassified",
                "asset_class": h.get("asset_class", "equity"),
            }
            for h in weighted
        ],
    }


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------

def analytics_to_json(analytics: dict) -> str:
    """Serialise analytics dict to JSON string for DB persistence."""
    return json.dumps(analytics, default=str)


def analytics_from_json(json_str: str) -> dict:
    """Deserialise analytics JSON from DB."""
    return json.loads(json_str)
