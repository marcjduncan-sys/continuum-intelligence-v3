"""
Personalisation Context (Phase D0.3).

Shared structured object that carries the user's mandate, cognitive profile,
and delivery preferences from the Personalisation wizard to PM Chat.

This module is pure data and formatting. No LLM calls, no network.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# Safety caps (absolute maximums -- Constitution floor)
# User mandate cannot exceed these regardless of what they set.
# ---------------------------------------------------------------------------

SAFETY_CAPS = {
    "max_position_size": {"min": 0.01, "max": 0.50},
    "sector_cap": {"min": 0.05, "max": 0.50},
    "cash_range_min": {"min": 0.0, "max": 0.20},
    "cash_range_max": {"min": 0.05, "max": 0.50},
}


# ---------------------------------------------------------------------------
# Mandate defaults (house defaults when no personalisation exists)
# ---------------------------------------------------------------------------

MANDATE_DEFAULTS = {
    "max_position_size": 0.15,
    "sector_cap": 0.35,
    "cash_range_min": 0.03,
    "cash_range_max": 0.25,
    "turnover_tolerance": "moderate",
    "concentration_tolerance": "moderate",
    "style_bias": "none",
    "risk_appetite": "moderate",
    "position_direction": "long_only",
    "restricted_names": [],
    "benchmark_framing": "relative",
}


@dataclass
class MandateSettings:
    """User-defined portfolio mandate constraints.

    Values are decimals (0.15 = 15%), not percentages.
    Clamped to safety caps on construction.
    """

    max_position_size: float = 0.15
    sector_cap: float = 0.35
    cash_range_min: float = 0.03
    cash_range_max: float = 0.25
    turnover_tolerance: str = "moderate"
    concentration_tolerance: str = "moderate"
    style_bias: str = "none"
    risk_appetite: str = "moderate"
    position_direction: str = "long_only"
    restricted_names: list[str] = field(default_factory=list)
    benchmark_framing: str = "relative"

    def __post_init__(self):
        self.clamp()

    def clamp(self) -> None:
        """Enforce safety caps."""
        caps = SAFETY_CAPS
        self.max_position_size = max(
            caps["max_position_size"]["min"],
            min(caps["max_position_size"]["max"], self.max_position_size),
        )
        self.sector_cap = max(
            caps["sector_cap"]["min"],
            min(caps["sector_cap"]["max"], self.sector_cap),
        )
        self.cash_range_min = max(
            caps["cash_range_min"]["min"],
            min(caps["cash_range_min"]["max"], self.cash_range_min),
        )
        self.cash_range_max = max(
            caps["cash_range_max"]["min"],
            min(caps["cash_range_max"]["max"], self.cash_range_max),
        )
        if self.cash_range_min > self.cash_range_max:
            self.cash_range_max = self.cash_range_min

    def to_dict(self) -> dict[str, Any]:
        return {
            "max_position_size": self.max_position_size,
            "sector_cap": self.sector_cap,
            "cash_range_min": self.cash_range_min,
            "cash_range_max": self.cash_range_max,
            "turnover_tolerance": self.turnover_tolerance,
            "concentration_tolerance": self.concentration_tolerance,
            "style_bias": self.style_bias,
            "risk_appetite": self.risk_appetite,
            "position_direction": self.position_direction,
            "restricted_names": list(self.restricted_names),
            "benchmark_framing": self.benchmark_framing,
        }

    def to_thresholds(self) -> dict[str, float]:
        """Convert mandate to threshold dict compatible with PM Constitution."""
        return {
            "max_single_position": self.max_position_size,
            "max_sector": self.sector_cap,
            "min_cash": self.cash_range_min,
            "max_cash": self.cash_range_max,
        }

    def has_custom_values(self) -> bool:
        """Return True if any value differs from house defaults."""
        defaults = MANDATE_DEFAULTS
        return (
            self.max_position_size != defaults["max_position_size"]
            or self.sector_cap != defaults["sector_cap"]
            or self.cash_range_min != defaults["cash_range_min"]
            or self.cash_range_max != defaults["cash_range_max"]
            or len(self.restricted_names) > 0
            or self.turnover_tolerance != defaults["turnover_tolerance"]
            or self.concentration_tolerance != defaults["concentration_tolerance"]
            or self.style_bias != defaults["style_bias"]
            or self.risk_appetite != defaults["risk_appetite"]
            or self.position_direction != defaults["position_direction"]
        )


@dataclass
class CognitiveProfile:
    """Extracted cognitive and behavioural profile from the Personalisation assessment."""

    big_five: dict[str, int] = field(default_factory=dict)
    crt_score: int = 0
    crt_label: str = ""
    philosophy: dict[str, int] = field(default_factory=dict)
    biases: list[dict[str, str]] = field(default_factory=list)
    preferences: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "big_five": dict(self.big_five),
            "crt_score": self.crt_score,
            "crt_label": self.crt_label,
            "philosophy": dict(self.philosophy),
            "biases": list(self.biases),
            "preferences": dict(self.preferences),
        }


@dataclass
class PersonalisationContext:
    """Complete personalisation context for PM Chat.

    Assembled from the Personalisation wizard state and passed on every
    PM Chat request. Contains mandate settings, cognitive profile,
    firm/fund context, and alignment diagnostics (when available).
    """

    # Mandate constraints (overrides house defaults)
    mandate: MandateSettings = field(default_factory=MandateSettings)

    # Cognitive profile (from assessment)
    cognitive_profile: CognitiveProfile | None = None

    # Firm context
    firm_name: str = ""
    firm_type: str = ""
    firm_aum: str = ""
    firm_governance: str = ""

    # Fund context
    fund_name: str = ""
    fund_strategy: str = ""
    fund_geography: str = ""
    fund_benchmark: str = ""
    fund_risk_budget: float = 10.0
    fund_holding_period: str = ""

    # Alignment diagnostics (populated by D0.4 backend computation)
    alignment: dict[str, Any] | None = None

    def has_profile(self) -> bool:
        return self.cognitive_profile is not None

    def has_firm_context(self) -> bool:
        return bool(self.firm_name)

    def to_dict(self) -> dict[str, Any]:
        return {
            "mandate": self.mandate.to_dict(),
            "cognitive_profile": self.cognitive_profile.to_dict() if self.cognitive_profile else None,
            "firm_name": self.firm_name,
            "firm_type": self.firm_type,
            "firm_aum": self.firm_aum,
            "firm_governance": self.firm_governance,
            "fund_name": self.fund_name,
            "fund_strategy": self.fund_strategy,
            "fund_geography": self.fund_geography,
            "fund_benchmark": self.fund_benchmark,
            "fund_risk_budget": self.fund_risk_budget,
            "fund_holding_period": self.fund_holding_period,
            "alignment": self.alignment,
        }


def parse_personalisation_context(data: dict | None) -> PersonalisationContext:
    """Parse a PersonalisationContext from a JSON dict (frontend payload).

    Handles the format sent by pnGetPersonalisationContext() in personalisation.js.
    Missing or malformed fields fall back to defaults.
    """
    if not data or not isinstance(data, dict):
        return PersonalisationContext()

    # Parse mandate
    m = data.get("mandate") or {}
    mandate = MandateSettings(
        max_position_size=_pct_to_decimal(m.get("maxPositionSize", 15)),
        sector_cap=_pct_to_decimal(m.get("sectorCap", 35)),
        cash_range_min=_pct_to_decimal(m.get("cashRangeMin", 3)),
        cash_range_max=_pct_to_decimal(m.get("cashRangeMax", 25)),
        turnover_tolerance=str(m.get("turnoverTolerance", "moderate")),
        concentration_tolerance=str(m.get("concentrationTolerance", "moderate")),
        style_bias=str(m.get("styleBias", "none")),
        risk_appetite=str(m.get("riskAppetite", "moderate")),
        position_direction=str(m.get("positionDirection", "long_only")),
        restricted_names=[
            str(n).strip().upper()
            for n in (m.get("restrictedNames") or [])
            if str(n).strip()
        ],
        benchmark_framing=str(m.get("benchmarkFraming", "relative")),
    )

    # Parse cognitive profile
    profile_data = data.get("profile")
    cognitive_profile = None
    if profile_data and isinstance(profile_data, dict):
        big_five = profile_data.get("bigFive") or {}
        crt = profile_data.get("crt") or {}
        cognitive_profile = CognitiveProfile(
            big_five={str(k): int(v) for k, v in big_five.items() if isinstance(v, (int, float))},
            crt_score=int(crt.get("score", 0)),
            crt_label=str(crt.get("label", "")),
            philosophy={str(k): int(v) for k, v in (profile_data.get("philosophy") or {}).items() if isinstance(v, (int, float))},
            biases=profile_data.get("biases") or [],
            preferences=profile_data.get("preferences") or {},
        )

    # Parse firm/fund context
    firm = data.get("firm") or {}
    fund = data.get("fund") or {}

    return PersonalisationContext(
        mandate=mandate,
        cognitive_profile=cognitive_profile,
        firm_name=str(firm.get("name", "")),
        firm_type=str(firm.get("type", "")),
        firm_aum=str(firm.get("aum", "")),
        firm_governance=str(firm.get("governance", "")),
        fund_name=str(fund.get("name", "")),
        fund_strategy=str(fund.get("strategy", "")),
        fund_geography=str(fund.get("geography", "")),
        fund_benchmark=str(fund.get("benchmark", "")),
        fund_risk_budget=float(fund.get("riskBudget", 10)),
        fund_holding_period=str(fund.get("holdingPeriod", "")),
    )


def _pct_to_decimal(val: Any) -> float:
    """Convert a percentage value (0-100) to a decimal (0-1)."""
    try:
        v = float(val)
        if v > 1:
            return v / 100.0
        return v
    except (TypeError, ValueError):
        return 0.15
