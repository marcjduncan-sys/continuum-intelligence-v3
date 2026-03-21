"""Tests for portfolio analytics engine (Phase C).

Hand-checked test cases covering all required scenarios.
Every expected number is calculated manually and asserted to verify
the analytics engine produces trusted output.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from portfolio_analytics import (
    compute_analytics,
    ThresholdConfig,
    DEFAULT_THRESHOLDS,
    _derive_weights,
    _concentration_metrics,
    _sector_exposure,
    _theme_exposure,
    _concentration_score,
    _generate_flags,
    AnalyticsFlag,
)


# =====================================================================
# Test fixtures
# =====================================================================

def _diversified_long_only():
    """10-position diversified portfolio. Hand-calculated weights below."""
    return {
        "holdings": [
            {"ticker": "CBA", "quantity": 200, "price": 120, "market_value": 24000, "sector": "Financials"},
            {"ticker": "BHP", "quantity": 300, "price": 50, "market_value": 15000, "sector": "Materials"},
            {"ticker": "CSL", "quantity": 50, "price": 280, "market_value": 14000, "sector": "Health Care"},
            {"ticker": "WBC", "quantity": 400, "price": 30, "market_value": 12000, "sector": "Financials"},
            {"ticker": "NAB", "quantity": 300, "price": 35, "market_value": 10500, "sector": "Financials"},
            {"ticker": "WOW", "quantity": 200, "price": 40, "market_value": 8000, "sector": "Consumer Staples"},
            {"ticker": "RIO", "quantity": 60, "price": 120, "market_value": 7200, "sector": "Materials"},
            {"ticker": "TLS", "quantity": 1500, "price": 4, "market_value": 6000, "sector": "Communication Services"},
            {"ticker": "WES", "quantity": 50, "price": 60, "market_value": 3000, "sector": "Consumer Staples"},
            {"ticker": "TCL", "quantity": 100, "price": 13, "market_value": 1300, "sector": "Industrials"},
        ],
        "total_value": 110000,  # holdings sum = 101000, cash = 9000
        "cash_value": 9000,
    }
    # Holdings sum: 24000+15000+14000+12000+10500+8000+7200+6000+3000+1300 = 101000
    # Cash: 9000
    # Total: 110000
    # Weights: CBA=24/110=0.218182, BHP=15/110=0.136364, CSL=14/110=0.127273
    #          WBC=12/110=0.109091, NAB=10.5/110=0.095455, WOW=8/110=0.072727
    #          RIO=7.2/110=0.065455, TLS=6/110=0.054545, WES=3/110=0.027273
    #          TCL=1.3/110=0.011818
    # Cash weight: 9/110=0.081818
    # Max single: CBA=21.8%
    # Top 5: CBA+BHP+CSL+WBC+NAB = (24+15+14+12+10.5)/110 = 75.5/110 = 68.6%
    # Top 10: 101/110 = 91.8%


def _concentrated():
    """2-position concentrated portfolio."""
    return {
        "holdings": [
            {"ticker": "CBA", "quantity": 1000, "price": 120, "market_value": 120000, "sector": "Financials"},
            {"ticker": "BHP", "quantity": 100, "price": 50, "market_value": 5000, "sector": "Materials"},
        ],
        "total_value": 130000,  # 120000 + 5000 + 5000 cash
        "cash_value": 5000,
    }
    # CBA weight: 120/130 = 0.923077
    # BHP weight: 5/130 = 0.038462
    # Cash weight: 5/130 = 0.038462
    # Max single: 92.3%
    # Top 5: 125/130 = 96.2%


def _cash_heavy():
    """Portfolio with >25% cash."""
    return {
        "holdings": [
            {"ticker": "CBA", "quantity": 200, "price": 100, "market_value": 20000, "sector": "Financials"},
        ],
        "total_value": 100000,
        "cash_value": 80000,
    }
    # CBA weight: 20/100 = 0.2
    # Cash weight: 80/100 = 0.8


def _unknown_sectors():
    """Holdings with no sector mapping."""
    return {
        "holdings": [
            {"ticker": "XYZ", "quantity": 100, "price": 50, "market_value": 5000},
            {"ticker": "ABC", "quantity": 200, "price": 25, "market_value": 5000, "sector": None},
        ],
        "total_value": 12000,
        "cash_value": 2000,
    }


def _single_holding():
    """Portfolio with exactly one position."""
    return {
        "holdings": [
            {"ticker": "CBA", "quantity": 500, "price": 100, "market_value": 50000, "sector": "Financials"},
        ],
        "total_value": 55000,
        "cash_value": 5000,
    }
    # CBA weight: 50/55 = 0.909091
    # Cash weight: 5/55 = 0.090909


def _zero_holdings():
    """All-cash portfolio."""
    return {
        "holdings": [],
        "total_value": 50000,
        "cash_value": 50000,
    }


# =====================================================================
# Test: Diversified long-only portfolio
# =====================================================================

class TestDiversifiedLongOnly:
    """Hand-checked: 10 positions, $110K total, $9K cash."""

    def test_position_count(self):
        a = compute_analytics(**_diversified_long_only())
        assert a["position_count"] == 10

    def test_total_and_cash(self):
        a = compute_analytics(**_diversified_long_only())
        assert a["total_value"] == 110000
        assert a["cash_value"] == 9000
        # 9000/110000 = 0.081818
        assert abs(a["cash_weight"] - 0.081818) < 0.001

    def test_max_single_weight(self):
        """CBA = 24000/110000 = 21.8%"""
        a = compute_analytics(**_diversified_long_only())
        conc = a["concentration"]
        assert abs(conc["max_single_weight"] - 24000 / 110000) < 0.001

    def test_top5_weight(self):
        """Top 5 by market value: CBA+BHP+CSL+WBC+NAB = 75500/110000 = 68.6%"""
        a = compute_analytics(**_diversified_long_only())
        expected = (24000 + 15000 + 14000 + 12000 + 10500) / 110000
        assert abs(a["concentration"]["top5_weight"] - expected) < 0.001

    def test_top10_weight(self):
        """All 10 holdings = 101000/110000 = 91.8%"""
        a = compute_analytics(**_diversified_long_only())
        expected = 101000 / 110000
        assert abs(a["concentration"]["top10_weight"] - expected) < 0.001

    def test_sector_exposure(self):
        """Financials = (24+12+10.5)/110 = 42.3%"""
        a = compute_analytics(**_diversified_long_only())
        financials = a["sector_exposure"].get("Financials", 0)
        expected = (24000 + 12000 + 10500) / 110000
        assert abs(financials - expected) < 0.001

    def test_theme_exposure(self):
        """Financial theme should match Financials sector weight."""
        a = compute_analytics(**_diversified_long_only())
        fin_theme = a["theme_exposure"].get("Financial", 0)
        fin_sector = a["sector_exposure"].get("Financials", 0)
        assert abs(fin_theme - fin_sector) < 0.001

    def test_top_positions_ordered(self):
        """Top 5 should be in descending weight order."""
        a = compute_analytics(**_diversified_long_only())
        tickers = [p["ticker"] for p in a["top_positions"]]
        assert tickers == ["CBA", "BHP", "CSL", "WBC", "NAB"]

    def test_flags_single_name(self):
        """CBA at 21.8% should trigger HIGH_SINGLE_NAME (threshold 15%)."""
        a = compute_analytics(**_diversified_long_only())
        codes = [f["code"] for f in a["flags"]]
        assert "HIGH_SINGLE_NAME" in codes

    def test_flags_top5(self):
        """Top 5 at 68.6% should trigger HIGH_TOP5 (threshold 50%)."""
        a = compute_analytics(**_diversified_long_only())
        codes = [f["code"] for f in a["flags"]]
        assert "HIGH_TOP5" in codes

    def test_flags_sector(self):
        """Financials at 42.3% should trigger HIGH_SECTOR (threshold 35%)."""
        a = compute_analytics(**_diversified_long_only())
        codes = [f["code"] for f in a["flags"]]
        assert "HIGH_SECTOR" in codes

    def test_holdings_with_weights_length(self):
        a = compute_analytics(**_diversified_long_only())
        assert len(a["holdings_with_weights"]) == 10

    def test_concentration_score_moderate(self):
        """10-position portfolio should have moderate concentration score."""
        a = compute_analytics(**_diversified_long_only())
        # Not single-stock (100) and not equally weighted (low)
        assert 0 < a["concentration_score"] < 80


# =====================================================================
# Test: Concentrated portfolio
# =====================================================================

class TestConcentrated:
    """Hand-checked: CBA 92.3%, BHP 3.8%, cash 3.8%."""

    def test_max_single(self):
        a = compute_analytics(**_concentrated())
        expected = 120000 / 130000
        assert abs(a["concentration"]["max_single_weight"] - expected) < 0.001

    def test_top5(self):
        """Only 2 positions, so top5 = 125000/130000."""
        a = compute_analytics(**_concentrated())
        expected = 125000 / 130000
        assert abs(a["concentration"]["top5_weight"] - expected) < 0.001

    def test_concentration_score_high(self):
        a = compute_analytics(**_concentrated())
        assert a["concentration_score"] > 70

    def test_single_name_flag(self):
        a = compute_analytics(**_concentrated())
        codes = [f["code"] for f in a["flags"]]
        assert "HIGH_SINGLE_NAME" in codes

    def test_flag_explanation_contains_ticker(self):
        a = compute_analytics(**_concentrated())
        single_flags = [f for f in a["flags"] if f["code"] == "HIGH_SINGLE_NAME"]
        assert len(single_flags) == 1
        assert "CBA" in single_flags[0]["message"]
        assert "92.3%" in single_flags[0]["message"] or "92.3" in single_flags[0]["message"]

    def test_flag_explanation_contains_threshold(self):
        a = compute_analytics(**_concentrated())
        single_flags = [f for f in a["flags"] if f["code"] == "HIGH_SINGLE_NAME"]
        assert "15%" in single_flags[0]["message"]


# =====================================================================
# Test: Cash-heavy portfolio
# =====================================================================

class TestCashHeavy:
    """$80K cash out of $100K. Cash weight = 80%."""

    def test_cash_weight(self):
        a = compute_analytics(**_cash_heavy())
        assert abs(a["cash_weight"] - 0.8) < 0.001

    def test_high_cash_flag(self):
        a = compute_analytics(**_cash_heavy())
        codes = [f["code"] for f in a["flags"]]
        assert "HIGH_CASH" in codes

    def test_no_low_cash_flag(self):
        a = compute_analytics(**_cash_heavy())
        codes = [f["code"] for f in a["flags"]]
        assert "LOW_CASH" not in codes

    def test_high_cash_explanation(self):
        a = compute_analytics(**_cash_heavy())
        cash_flags = [f for f in a["flags"] if f["code"] == "HIGH_CASH"]
        assert len(cash_flags) == 1
        assert "80.0%" in cash_flags[0]["message"]
        assert "25%" in cash_flags[0]["message"]


# =====================================================================
# Test: Unknown sectors
# =====================================================================

class TestUnknownSectors:
    """All holdings have no sector. Should be classified as Unclassified."""

    def test_unmapped_flag(self):
        a = compute_analytics(**_unknown_sectors())
        codes = [f["code"] for f in a["flags"]]
        assert "UNMAPPED_SECTOR" in codes

    def test_unclassified_in_sector_exposure(self):
        a = compute_analytics(**_unknown_sectors())
        assert "Unclassified" in a["sector_exposure"]

    def test_no_theme_exposure(self):
        """With no known sectors, theme exposure should be empty."""
        a = compute_analytics(**_unknown_sectors())
        assert a["theme_exposure"] == {} or all(v == 0 for v in a["theme_exposure"].values())


# =====================================================================
# Test: Single holding
# =====================================================================

class TestSingleHolding:
    """One position + cash. Concentration should be maximal for that position."""

    def test_position_count(self):
        a = compute_analytics(**_single_holding())
        assert a["position_count"] == 1

    def test_concentration_score(self):
        """Single position portfolio should have score = 100."""
        a = compute_analytics(**_single_holding())
        assert a["concentration_score"] == 100.0

    def test_max_single_equals_full_weight(self):
        a = compute_analytics(**_single_holding())
        expected = 50000 / 55000
        assert abs(a["concentration"]["max_single_weight"] - expected) < 0.001

    def test_top5_equals_holdings_total(self):
        a = compute_analytics(**_single_holding())
        expected = 50000 / 55000
        assert abs(a["concentration"]["top5_weight"] - expected) < 0.001


# =====================================================================
# Test: Zero holdings (all-cash)
# =====================================================================

class TestZeroHoldings:
    """No positions at all. Should not divide by zero."""

    def test_position_count_zero(self):
        a = compute_analytics(**_zero_holdings())
        assert a["position_count"] == 0

    def test_cash_weight_is_one(self):
        a = compute_analytics(**_zero_holdings())
        assert abs(a["cash_weight"] - 1.0) < 0.001

    def test_no_crash(self):
        """Should not raise any exceptions."""
        a = compute_analytics(**_zero_holdings())
        assert a is not None

    def test_empty_top_positions(self):
        a = compute_analytics(**_zero_holdings())
        assert a["top_positions"] == []

    def test_empty_sector_exposure(self):
        a = compute_analytics(**_zero_holdings())
        assert a["sector_exposure"] == {}

    def test_concentration_score_zero_or_hundred(self):
        """With 0 holdings, position_count=0, score should be 100 (n<=1 branch)."""
        a = compute_analytics(**_zero_holdings())
        assert a["concentration_score"] == 100.0


# =====================================================================
# Test: Custom thresholds
# =====================================================================

class TestCustomThresholds:
    """Verify threshold framework is respected."""

    def test_relaxed_thresholds_no_flags(self):
        """With very relaxed thresholds, concentrated portfolio should have fewer flags."""
        relaxed = ThresholdConfig(
            max_single_position=0.95,
            max_top5=0.99,
            max_top10=0.99,
            max_sector=0.99,
            min_cash=0.01,
            max_cash=0.99,
        )
        a = compute_analytics(**_concentrated(), thresholds=relaxed)
        warning_flags = [f for f in a["flags"] if f["severity"] == "warning"]
        assert len(warning_flags) == 0

    def test_tight_thresholds_more_flags(self):
        """With very tight thresholds, diversified portfolio triggers more flags."""
        tight = ThresholdConfig(
            max_single_position=0.05,
            max_top5=0.30,
            max_top10=0.60,
            max_sector=0.10,
            min_cash=0.10,
            max_cash=0.05,
        )
        a = compute_analytics(**_diversified_long_only(), thresholds=tight)
        codes = [f["code"] for f in a["flags"]]
        assert "HIGH_SINGLE_NAME" in codes
        assert "HIGH_TOP5" in codes
        assert "HIGH_TOP10" in codes

    def test_thresholds_recorded(self):
        """Analytics output should record which thresholds were used."""
        custom = ThresholdConfig(max_single_position=0.20)
        a = compute_analytics(**_diversified_long_only(), thresholds=custom)
        assert a["thresholds_used"]["max_single_position"] == 0.20


# =====================================================================
# Test: Flag explainability
# =====================================================================

class TestExplainability:
    """Each flag must have a plain-English message tied to an actual number."""

    def test_all_flags_have_message(self):
        a = compute_analytics(**_diversified_long_only())
        for f in a["flags"]:
            assert f["message"], f"Flag {f['code']} has empty message"
            assert len(f["message"]) > 20, f"Flag {f['code']} message too short"

    def test_all_flags_have_metric_value(self):
        a = compute_analytics(**_diversified_long_only())
        for f in a["flags"]:
            assert f["metric_value"] is not None, f"Flag {f['code']} has no metric_value"

    def test_all_flags_have_threshold(self):
        a = compute_analytics(**_diversified_long_only())
        for f in a["flags"]:
            assert f["threshold"] is not None, f"Flag {f['code']} has no threshold"

    def test_message_contains_percentage(self):
        """Flag messages should contain a percentage so the user can verify."""
        a = compute_analytics(**_concentrated())
        for f in a["flags"]:
            if f["code"] != "UNMAPPED_SECTOR":
                assert "%" in f["message"], f"Flag {f['code']} message missing percentage"


# =====================================================================
# Test: Low cash
# =====================================================================

class TestLowCash:
    """Portfolio with very little cash should trigger LOW_CASH."""

    def test_low_cash_flag(self):
        a = compute_analytics(
            holdings=[
                {"ticker": "CBA", "quantity": 1000, "price": 100, "market_value": 100000, "sector": "Financials"},
            ],
            total_value=101000,
            cash_value=1000,  # 1000/101000 = 0.99% < 3%
        )
        codes = [f["code"] for f in a["flags"]]
        assert "LOW_CASH" in codes

    def test_low_cash_explanation(self):
        a = compute_analytics(
            holdings=[
                {"ticker": "CBA", "quantity": 1000, "price": 100, "market_value": 100000, "sector": "Financials"},
            ],
            total_value=101000,
            cash_value=1000,
        )
        low_cash = [f for f in a["flags"] if f["code"] == "LOW_CASH"]
        assert len(low_cash) == 1
        assert "1.0%" in low_cash[0]["message"] or "0.9%" in low_cash[0]["message"]
        assert "3%" in low_cash[0]["message"]


# =====================================================================
# Test: Determinism
# =====================================================================

class TestDeterminism:
    """Same inputs must produce identical outputs every time."""

    def test_repeated_calls_identical(self):
        a1 = compute_analytics(**_diversified_long_only())
        a2 = compute_analytics(**_diversified_long_only())
        # Compare all numeric fields
        assert a1["concentration"] == a2["concentration"]
        assert a1["sector_exposure"] == a2["sector_exposure"]
        assert a1["concentration_score"] == a2["concentration_score"]
        assert len(a1["flags"]) == len(a2["flags"])

    def test_does_not_mutate_input(self):
        data = _diversified_long_only()
        original_holdings = [dict(h) for h in data["holdings"]]
        compute_analytics(**data)
        # Input holdings should not have 'weight' key added
        for h in data["holdings"]:
            assert "weight" not in h or h == original_holdings[data["holdings"].index(h)]
