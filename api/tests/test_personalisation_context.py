"""
Tests for personalisation_context.py (Phase D0.3).
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from personalisation_context import (
    MandateSettings,
    CognitiveProfile,
    PersonalisationContext,
    parse_personalisation_context,
    SAFETY_CAPS,
    MANDATE_DEFAULTS,
    _pct_to_decimal,
)


# ---------------------------------------------------------------------------
# MandateSettings
# ---------------------------------------------------------------------------

class TestMandateSettings:
    def test_defaults(self):
        m = MandateSettings()
        assert m.max_position_size == 0.15
        assert m.sector_cap == 0.35
        assert m.cash_range_min == 0.03
        assert m.cash_range_max == 0.25

    def test_clamp_above_safety_cap(self):
        m = MandateSettings(max_position_size=0.80)  # above 50% cap
        assert m.max_position_size == 0.50

    def test_clamp_below_safety_floor(self):
        m = MandateSettings(sector_cap=0.01)  # below 5% floor
        assert m.sector_cap == 0.05

    def test_cash_range_min_exceeds_max(self):
        m = MandateSettings(cash_range_min=0.15, cash_range_max=0.10)
        assert m.cash_range_min == 0.15
        assert m.cash_range_max == 0.15  # clamped up to min

    def test_to_thresholds(self):
        m = MandateSettings(max_position_size=0.20, sector_cap=0.40)
        t = m.to_thresholds()
        assert t["max_single_position"] == 0.20
        assert t["max_sector"] == 0.40
        assert t["min_cash"] == 0.03
        assert t["max_cash"] == 0.25

    def test_has_custom_values_default(self):
        m = MandateSettings()
        assert not m.has_custom_values()

    def test_has_custom_values_modified(self):
        m = MandateSettings(max_position_size=0.20)
        assert m.has_custom_values()

    def test_has_custom_values_restricted_names(self):
        m = MandateSettings(restricted_names=["CBA"])
        assert m.has_custom_values()

    def test_to_dict_roundtrip(self):
        m = MandateSettings(max_position_size=0.20, restricted_names=["CBA", "WBC"])
        d = m.to_dict()
        assert d["max_position_size"] == 0.20
        assert d["restricted_names"] == ["CBA", "WBC"]


# ---------------------------------------------------------------------------
# parse_personalisation_context
# ---------------------------------------------------------------------------

class TestParsePersonalisationContext:
    def test_none_input(self):
        ctx = parse_personalisation_context(None)
        assert isinstance(ctx, PersonalisationContext)
        assert not ctx.mandate.has_custom_values()

    def test_empty_dict(self):
        ctx = parse_personalisation_context({})
        assert not ctx.has_firm_context()

    def test_full_payload(self):
        payload = {
            "firm": {"name": "Test Fund", "type": "Family Office", "aum": "$500M-$2B", "governance": "Sole Decision-Maker"},
            "fund": {"name": "Growth Fund", "strategy": "Long Only", "geography": "ASX Only", "benchmark": "S&P/ASX 200", "riskBudget": 15, "holdingPeriod": "1-3 years"},
            "mandate": {
                "maxPositionSize": 20,
                "sectorCap": 40,
                "cashRangeMin": 5,
                "cashRangeMax": 30,
                "turnoverTolerance": "High (50-100% annual)",
                "concentrationTolerance": "Concentrated (5-10 positions)",
                "styleBias": "Value",
                "riskAppetite": "Aggressive",
                "positionDirection": "long_only",
                "restrictedNames": ["CBA", "WBC"],
                "benchmarkFraming": "Relative (track benchmark)",
            },
            "profile": {
                "bigFive": {"E": 12, "A": 14, "C": 16, "N": 8, "O": 18},
                "crt": {"score": 5, "label": "High System 2"},
                "philosophy": {"Contrarianism": 4, "Conviction": 5},
                "biases": [{"bias": "Anchoring", "intervention": "Challenge anchors"}],
                "preferences": {"timing": "Morning digest", "detail": "Full analysis"},
            },
        }
        ctx = parse_personalisation_context(payload)

        # Firm
        assert ctx.firm_name == "Test Fund"
        assert ctx.firm_type == "Family Office"
        assert ctx.has_firm_context()

        # Fund
        assert ctx.fund_strategy == "Long Only"
        assert ctx.fund_risk_budget == 15.0

        # Mandate (percentage values converted to decimals)
        assert ctx.mandate.max_position_size == 0.20
        assert ctx.mandate.sector_cap == 0.40
        assert ctx.mandate.restricted_names == ["CBA", "WBC"]
        assert ctx.mandate.has_custom_values()

        # Profile
        assert ctx.has_profile()
        assert ctx.cognitive_profile.big_five["E"] == 12
        assert ctx.cognitive_profile.crt_score == 5
        assert len(ctx.cognitive_profile.biases) == 1

    def test_mandate_clamped_on_parse(self):
        payload = {
            "mandate": {"maxPositionSize": 80}  # above 50% safety cap
        }
        ctx = parse_personalisation_context(payload)
        assert ctx.mandate.max_position_size == 0.50  # clamped

    def test_pct_to_decimal_already_decimal(self):
        assert _pct_to_decimal(0.15) == 0.15

    def test_pct_to_decimal_from_percentage(self):
        assert _pct_to_decimal(15) == 0.15

    def test_pct_to_decimal_invalid(self):
        assert _pct_to_decimal("invalid") == 0.15


# ---------------------------------------------------------------------------
# CognitiveProfile
# ---------------------------------------------------------------------------

class TestCognitiveProfile:
    def test_to_dict(self):
        cp = CognitiveProfile(
            big_five={"E": 12, "N": 8},
            crt_score=5,
            crt_label="High System 2",
        )
        d = cp.to_dict()
        assert d["big_five"]["E"] == 12
        assert d["crt_score"] == 5
