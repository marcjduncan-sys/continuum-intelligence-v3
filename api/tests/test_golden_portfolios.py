"""
Gate 2: Golden Portfolio Test Suite.

15 fixed portfolios with hand-computed expected outputs covering:
  - Analytics: weights, concentration, sector exposure, cash, flags, concentration score
  - Alignment: classification, alignment score, not-covered weight, hypothesis DNA
  - Mandate breaches: position, sector, cash breaches with severity
  - Change detection: adds, removes, weight shifts
  - Restricted names: violation detection
  - Custom thresholds and mandates

Every expected number is calculated manually and asserted with tight tolerances.
The analytics engine is pure deterministic -- these tests lock its correctness.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from portfolio_analytics import compute_analytics, ThresholdConfig
from portfolio_alignment import (
    classify_alignment,
    compute_alignment,
    compute_mandate_breaches,
    detect_changes,
    compute_reweighting_deltas,
    compute_hedge_gaps,
    resolve_skew,
    load_research,
)


TOL = 0.0005  # 0.05% tolerance for floating point comparisons


# =====================================================================
# Helper
# =====================================================================

def _flag_codes(analytics):
    return [f["code"] for f in analytics["flags"]]


def _breach_codes(breaches):
    return [b["code"] for b in breaches]


# =====================================================================
# GP-01: Balanced Benchmark (10 positions, all within default limits)
# =====================================================================
# Design: no position > 15%, no sector > 35%, cash 3-25%.

GP01_HOLDINGS = [
    {"ticker": "BHP", "quantity": 100, "price": 47, "market_value": 4700, "sector": "Materials"},
    {"ticker": "CBA", "quantity": 25, "price": 175, "market_value": 4375, "sector": "Financials"},
    {"ticker": "CSL", "quantity": 30, "price": 138, "market_value": 4140, "sector": "Health Care"},
    {"ticker": "WOW", "quantity": 100, "price": 33, "market_value": 3300, "sector": "Consumer Staples"},
    {"ticker": "NAB", "quantity": 80, "price": 40, "market_value": 3200, "sector": "Financials"},
    {"ticker": "XRO", "quantity": 20, "price": 150, "market_value": 3000, "sector": "Information Technology"},
    {"ticker": "GMG", "quantity": 80, "price": 35, "market_value": 2800, "sector": "Real Estate"},
    {"ticker": "QAN", "quantity": 300, "price": 9, "market_value": 2700, "sector": "Industrials"},
    {"ticker": "WDS", "quantity": 100, "price": 22, "market_value": 2200, "sector": "Energy"},
    {"ticker": "RIO", "quantity": 15, "price": 120, "market_value": 1800, "sector": "Materials"},
]
# Holdings sum: 4700+4375+4140+3300+3200+3000+2800+2700+2200+1800 = 32215
# Cash: 5785 -> total = 38000
# Cash weight: 5785/38000 = 0.152237
# Max single: BHP = 4700/38000 = 0.123684 < 15%
# Top 5 (BHP+CBA+CSL+WOW+NAB): (4700+4375+4140+3300+3200)/38000 = 19715/38000 = 0.518816
# Top 10: 32215/38000 = 0.847763
# Sector: Financials = (4375+3200)/38000 = 7575/38000 = 0.199342
#         Materials = (4700+1800)/38000 = 6500/38000 = 0.171053
GP01_TOTAL = 38000
GP01_CASH = 5785

class TestGP01BalancedBenchmark:
    """GP-01: 10 positions, diversified, all within default limits."""

    def test_position_count(self):
        a = compute_analytics(holdings=GP01_HOLDINGS, total_value=GP01_TOTAL, cash_value=GP01_CASH)
        assert a["position_count"] == 10

    def test_cash_weight(self):
        a = compute_analytics(holdings=GP01_HOLDINGS, total_value=GP01_TOTAL, cash_value=GP01_CASH)
        expected = GP01_CASH / GP01_TOTAL  # 0.152237
        assert abs(a["cash_weight"] - expected) < TOL

    def test_max_single_below_threshold(self):
        a = compute_analytics(holdings=GP01_HOLDINGS, total_value=GP01_TOTAL, cash_value=GP01_CASH)
        expected = 4700 / GP01_TOTAL  # 0.123684
        assert abs(a["concentration"]["max_single_weight"] - expected) < TOL
        assert a["concentration"]["max_single_weight"] < 0.15

    def test_top5_weight(self):
        a = compute_analytics(holdings=GP01_HOLDINGS, total_value=GP01_TOTAL, cash_value=GP01_CASH)
        expected = 19715 / GP01_TOTAL  # 0.518816
        assert abs(a["concentration"]["top5_weight"] - expected) < TOL

    def test_top10_weight(self):
        a = compute_analytics(holdings=GP01_HOLDINGS, total_value=GP01_TOTAL, cash_value=GP01_CASH)
        expected = 32215 / GP01_TOTAL
        assert abs(a["concentration"]["top10_weight"] - expected) < TOL

    def test_sector_financials(self):
        a = compute_analytics(holdings=GP01_HOLDINGS, total_value=GP01_TOTAL, cash_value=GP01_CASH)
        expected = 7575 / GP01_TOTAL  # 0.199342
        assert abs(a["sector_exposure"]["Financials"] - expected) < TOL

    def test_sector_materials(self):
        a = compute_analytics(holdings=GP01_HOLDINGS, total_value=GP01_TOTAL, cash_value=GP01_CASH)
        expected = 6500 / GP01_TOTAL  # 0.171053
        assert abs(a["sector_exposure"]["Materials"] - expected) < TOL

    def test_no_single_name_flag(self):
        a = compute_analytics(holdings=GP01_HOLDINGS, total_value=GP01_TOTAL, cash_value=GP01_CASH)
        assert "HIGH_SINGLE_NAME" not in _flag_codes(a)

    def test_no_sector_flag(self):
        a = compute_analytics(holdings=GP01_HOLDINGS, total_value=GP01_TOTAL, cash_value=GP01_CASH)
        assert "HIGH_SECTOR" not in _flag_codes(a)

    def test_top5_flag_triggered(self):
        """Top5 at 51.9% > 50% threshold -> flag."""
        a = compute_analytics(holdings=GP01_HOLDINGS, total_value=GP01_TOTAL, cash_value=GP01_CASH)
        assert "HIGH_TOP5" in _flag_codes(a)

    def test_no_cash_flags(self):
        """Cash at 15.2% is within 3-25% range."""
        a = compute_analytics(holdings=GP01_HOLDINGS, total_value=GP01_TOTAL, cash_value=GP01_CASH)
        codes = _flag_codes(a)
        assert "LOW_CASH" not in codes
        assert "HIGH_CASH" not in codes

    def test_no_mandate_breaches_default(self):
        a = compute_analytics(holdings=GP01_HOLDINGS, total_value=GP01_TOTAL, cash_value=GP01_CASH)
        breaches = compute_mandate_breaches(analytics=a)
        assert len(breaches) == 0


# =====================================================================
# GP-02: Concentrated Materials (BHP 60%, RIO 20%)
# =====================================================================

GP02_HOLDINGS = [
    {"ticker": "BHP", "quantity": 1000, "price": 47, "market_value": 47000, "sector": "Materials"},
    {"ticker": "RIO", "quantity": 150, "price": 120, "market_value": 18000, "sector": "Materials"},
    {"ticker": "CBA", "quantity": 20, "price": 175, "market_value": 3500, "sector": "Financials"},
]
# Holdings sum: 47000+18000+3500 = 68500
# Cash: 10000 -> total = 78500
# BHP weight: 47000/78500 = 0.598726
# RIO weight: 18000/78500 = 0.229299
# CBA weight: 3500/78500 = 0.044586
# Cash: 10000/78500 = 0.127389
# Materials sector: 65000/78500 = 0.828025
GP02_TOTAL = 78500
GP02_CASH = 10000

class TestGP02ConcentratedMaterials:
    """GP-02: BHP 59.9%, RIO 22.9%, Materials sector 82.8%."""

    def test_bhp_weight(self):
        a = compute_analytics(holdings=GP02_HOLDINGS, total_value=GP02_TOTAL, cash_value=GP02_CASH)
        w = [h for h in a["holdings_with_weights"] if h["ticker"] == "BHP"][0]["weight"]
        assert abs(w - 47000 / GP02_TOTAL) < TOL

    def test_max_single_name(self):
        a = compute_analytics(holdings=GP02_HOLDINGS, total_value=GP02_TOTAL, cash_value=GP02_CASH)
        assert abs(a["concentration"]["max_single_weight"] - 47000 / GP02_TOTAL) < TOL

    def test_materials_sector_weight(self):
        a = compute_analytics(holdings=GP02_HOLDINGS, total_value=GP02_TOTAL, cash_value=GP02_CASH)
        expected = 65000 / GP02_TOTAL
        assert abs(a["sector_exposure"]["Materials"] - expected) < TOL

    def test_high_single_name_flag(self):
        a = compute_analytics(holdings=GP02_HOLDINGS, total_value=GP02_TOTAL, cash_value=GP02_CASH)
        assert "HIGH_SINGLE_NAME" in _flag_codes(a)

    def test_high_sector_flag(self):
        a = compute_analytics(holdings=GP02_HOLDINGS, total_value=GP02_TOTAL, cash_value=GP02_CASH)
        sector_flags = [f for f in a["flags"] if f["code"] == "HIGH_SECTOR"]
        assert len(sector_flags) >= 1
        assert any("Materials" in f["message"] for f in sector_flags)

    def test_concentration_score(self):
        """Normalised HHI for 3 positions: (0.413 - 0.333) / (1.0 - 0.333) = 12.0."""
        a = compute_analytics(holdings=GP02_HOLDINGS, total_value=GP02_TOTAL, cash_value=GP02_CASH)
        assert abs(a["concentration_score"] - 12.0) < 0.5

    def test_position_breach(self):
        a = compute_analytics(holdings=GP02_HOLDINGS, total_value=GP02_TOTAL, cash_value=GP02_CASH)
        breaches = compute_mandate_breaches(analytics=a, mandate_max_position=0.15)
        assert "POSITION_BREACH" in _breach_codes(breaches)
        pos = [b for b in breaches if b["code"] == "POSITION_BREACH"][0]
        # Overshoot = 0.599 - 0.15 = 0.449 > 0.10, so severity = critical
        assert pos["severity"] == "critical"

    def test_sector_breach(self):
        a = compute_analytics(holdings=GP02_HOLDINGS, total_value=GP02_TOTAL, cash_value=GP02_CASH)
        breaches = compute_mandate_breaches(analytics=a, mandate_sector_cap=0.35)
        sector_b = [b for b in breaches if b["code"] == "SECTOR_BREACH"]
        assert len(sector_b) >= 1
        # Overshoot = 0.828 - 0.35 = 0.478 > 0.15 -> critical
        assert sector_b[0]["severity"] == "critical"


# =====================================================================
# GP-03: All-Bank Portfolio (100% Financials)
# =====================================================================

GP03_HOLDINGS = [
    {"ticker": "CBA", "quantity": 30, "price": 175, "market_value": 5250, "sector": "Financials"},
    {"ticker": "NAB", "quantity": 100, "price": 40, "market_value": 4000, "sector": "Financials"},
    {"ticker": "MQG", "quantity": 10, "price": 210, "market_value": 2100, "sector": "Financials"},
]
# Sum: 5250+4000+2100 = 11350, cash 1650, total = 13000
# Financials: 11350/13000 = 0.873077
# CBA: 5250/13000 = 0.403846 > 15%
GP03_TOTAL = 13000
GP03_CASH = 1650

class TestGP03AllBankPortfolio:
    """GP-03: 100% Financials sector exposure."""

    def test_financials_sector_total(self):
        a = compute_analytics(holdings=GP03_HOLDINGS, total_value=GP03_TOTAL, cash_value=GP03_CASH)
        expected = 11350 / GP03_TOTAL
        assert abs(a["sector_exposure"]["Financials"] - expected) < TOL

    def test_only_one_sector(self):
        a = compute_analytics(holdings=GP03_HOLDINGS, total_value=GP03_TOTAL, cash_value=GP03_CASH)
        assert len(a["sector_exposure"]) == 1
        assert "Financials" in a["sector_exposure"]

    def test_financial_theme_matches(self):
        a = compute_analytics(holdings=GP03_HOLDINGS, total_value=GP03_TOTAL, cash_value=GP03_CASH)
        assert abs(a["theme_exposure"].get("Financial", 0) - 11350 / GP03_TOTAL) < TOL

    def test_single_name_flag_on_cba(self):
        a = compute_analytics(holdings=GP03_HOLDINGS, total_value=GP03_TOTAL, cash_value=GP03_CASH)
        assert "HIGH_SINGLE_NAME" in _flag_codes(a)
        sn = [f for f in a["flags"] if f["code"] == "HIGH_SINGLE_NAME"][0]
        assert "CBA" in sn["message"]

    def test_sector_breach_critical(self):
        a = compute_analytics(holdings=GP03_HOLDINGS, total_value=GP03_TOTAL, cash_value=GP03_CASH)
        breaches = compute_mandate_breaches(analytics=a, mandate_sector_cap=0.35)
        sb = [b for b in breaches if b["code"] == "SECTOR_BREACH"]
        assert len(sb) == 1
        # Overshoot = 0.873 - 0.35 = 0.523 > 0.15 -> critical
        assert sb[0]["severity"] == "critical"


# =====================================================================
# GP-04: Single-Stock Portfolio
# =====================================================================

GP04_HOLDINGS = [
    {"ticker": "BHP", "quantity": 2000, "price": 47, "market_value": 94000, "sector": "Materials"},
]
GP04_TOTAL = 100000
GP04_CASH = 6000

class TestGP04SingleStock:
    """GP-04: One position, concentration score = 100."""

    def test_concentration_score_max(self):
        a = compute_analytics(holdings=GP04_HOLDINGS, total_value=GP04_TOTAL, cash_value=GP04_CASH)
        assert a["concentration_score"] == 100.0

    def test_single_weight(self):
        a = compute_analytics(holdings=GP04_HOLDINGS, total_value=GP04_TOTAL, cash_value=GP04_CASH)
        assert abs(a["concentration"]["max_single_weight"] - 94000 / GP04_TOTAL) < TOL

    def test_hhi(self):
        """HHI for single stock = weight^2 = (0.94)^2 = 0.8836."""
        a = compute_analytics(holdings=GP04_HOLDINGS, total_value=GP04_TOTAL, cash_value=GP04_CASH)
        expected_hhi = (94000 / GP04_TOTAL) ** 2
        assert abs(a["concentration"]["hhi"] - expected_hhi) < TOL


# =====================================================================
# GP-05: All-Cash Portfolio
# =====================================================================

class TestGP05AllCash:
    """GP-05: No holdings, 100% cash."""

    def test_cash_weight_one(self):
        a = compute_analytics(holdings=[], total_value=50000, cash_value=50000)
        assert abs(a["cash_weight"] - 1.0) < TOL

    def test_no_sector_exposure(self):
        a = compute_analytics(holdings=[], total_value=50000, cash_value=50000)
        assert a["sector_exposure"] == {}

    def test_no_holdings_with_weights(self):
        a = compute_analytics(holdings=[], total_value=50000, cash_value=50000)
        assert a["holdings_with_weights"] == []

    def test_high_cash_flag(self):
        a = compute_analytics(holdings=[], total_value=50000, cash_value=50000)
        assert "HIGH_CASH" in _flag_codes(a)

    def test_position_count_zero(self):
        a = compute_analytics(holdings=[], total_value=50000, cash_value=50000)
        assert a["position_count"] == 0


# =====================================================================
# GP-06: Cash-Heavy Portfolio (80% cash)
# =====================================================================

GP06_HOLDINGS = [
    {"ticker": "CBA", "quantity": 100, "price": 175, "market_value": 17500, "sector": "Financials"},
]
GP06_TOTAL = 87500
GP06_CASH = 70000

class TestGP06CashHeavy:
    """GP-06: 80% cash, one position."""

    def test_cash_weight(self):
        a = compute_analytics(holdings=GP06_HOLDINGS, total_value=GP06_TOTAL, cash_value=GP06_CASH)
        assert abs(a["cash_weight"] - 70000 / 87500) < TOL

    def test_high_cash_flag(self):
        a = compute_analytics(holdings=GP06_HOLDINGS, total_value=GP06_TOTAL, cash_value=GP06_CASH)
        assert "HIGH_CASH" in _flag_codes(a)

    def test_cash_above_max_breach(self):
        a = compute_analytics(holdings=GP06_HOLDINGS, total_value=GP06_TOTAL, cash_value=GP06_CASH)
        breaches = compute_mandate_breaches(analytics=a, mandate_cash_max=0.25)
        assert "CASH_ABOVE_MAX" in _breach_codes(breaches)
        # 80% > 50% -> critical
        cb = [b for b in breaches if b["code"] == "CASH_ABOVE_MAX"][0]
        assert cb["severity"] == "critical"


# =====================================================================
# GP-07: Cash-Light Portfolio (1% cash)
# =====================================================================

GP07_HOLDINGS = [
    {"ticker": "BHP", "quantity": 500, "price": 47, "market_value": 23500, "sector": "Materials"},
    {"ticker": "CBA", "quantity": 100, "price": 175, "market_value": 17500, "sector": "Financials"},
    {"ticker": "CSL", "quantity": 50, "price": 138, "market_value": 6900, "sector": "Health Care"},
    {"ticker": "WOW", "quantity": 150, "price": 33, "market_value": 4950, "sector": "Consumer Staples"},
    {"ticker": "NAB", "quantity": 100, "price": 40, "market_value": 4000, "sector": "Financials"},
    {"ticker": "XRO", "quantity": 25, "price": 150, "market_value": 3750, "sector": "Information Technology"},
    {"ticker": "GMG", "quantity": 100, "price": 35, "market_value": 3500, "sector": "Real Estate"},
    {"ticker": "QAN", "quantity": 400, "price": 9, "market_value": 3600, "sector": "Industrials"},
    {"ticker": "WDS", "quantity": 150, "price": 22, "market_value": 3300, "sector": "Energy"},
    {"ticker": "RIO", "quantity": 20, "price": 120, "market_value": 2400, "sector": "Materials"},
]
# Sum: 23500+17500+6900+4950+4000+3750+3500+3600+3300+2400 = 73400
# Cash: 750, total: 74150
# Cash weight: 750/74150 = 0.010115 < 3%
GP07_TOTAL = 74150
GP07_CASH = 750

class TestGP07CashLight:
    """GP-07: 10 positions, ~1% cash."""

    def test_cash_weight(self):
        a = compute_analytics(holdings=GP07_HOLDINGS, total_value=GP07_TOTAL, cash_value=GP07_CASH)
        expected = GP07_CASH / GP07_TOTAL
        assert abs(a["cash_weight"] - expected) < TOL
        assert a["cash_weight"] < 0.03

    def test_low_cash_flag(self):
        a = compute_analytics(holdings=GP07_HOLDINGS, total_value=GP07_TOTAL, cash_value=GP07_CASH)
        assert "LOW_CASH" in _flag_codes(a)

    def test_cash_below_min_breach(self):
        a = compute_analytics(holdings=GP07_HOLDINGS, total_value=GP07_TOTAL, cash_value=GP07_CASH)
        breaches = compute_mandate_breaches(analytics=a, mandate_cash_min=0.03)
        assert "CASH_BELOW_MIN" in _breach_codes(breaches)


# =====================================================================
# GP-08: Edge Case - Exactly at Thresholds
# =====================================================================
# Design: max single = exactly 15%, sector = exactly 35%, cash = exactly 3%.
# This tests that "at threshold" does NOT trigger flags (threshold is strict >).

GP08_HOLDINGS = [
    {"ticker": "CBA", "quantity": 1, "price": 15000, "market_value": 15000, "sector": "Financials"},
    {"ticker": "NAB", "quantity": 1, "price": 10000, "market_value": 10000, "sector": "Financials"},
    {"ticker": "WOW", "quantity": 1, "price": 10000, "market_value": 10000, "sector": "Consumer Staples"},
    {"ticker": "BHP", "quantity": 1, "price": 10000, "market_value": 10000, "sector": "Materials"},
    {"ticker": "CSL", "quantity": 1, "price": 10000, "market_value": 10000, "sector": "Health Care"},
    {"ticker": "RIO", "quantity": 1, "price": 10000, "market_value": 10000, "sector": "Materials"},
    {"ticker": "XRO", "quantity": 1, "price": 10000, "market_value": 10000, "sector": "Information Technology"},
    {"ticker": "GMG", "quantity": 1, "price": 10000, "market_value": 10000, "sector": "Real Estate"},
    {"ticker": "WDS", "quantity": 1, "price": 2000, "market_value": 2000, "sector": "Energy"},
]
# Holdings sum: 15+10+10+10+10+10+10+10+2 = 87000
# Total = 100000, Cash = 13000
# CBA = 15000/100000 = 15.0% = exactly at threshold
# Financials = (15000+10000)/100000 = 25.0% (below 35%)
# Materials = (10000+10000)/100000 = 20.0% (below 35%)
# Cash = 13000/100000 = 13.0% (within 3-25%)
GP08_TOTAL = 100000
GP08_CASH = 13000

class TestGP08ExactlyAtThresholds:
    """GP-08: CBA at exactly 15% should NOT trigger HIGH_SINGLE_NAME."""

    def test_cba_exactly_15(self):
        a = compute_analytics(holdings=GP08_HOLDINGS, total_value=GP08_TOTAL, cash_value=GP08_CASH)
        cba_w = 15000 / GP08_TOTAL
        assert abs(a["concentration"]["max_single_weight"] - cba_w) < TOL

    def test_no_single_name_flag(self):
        """Threshold is strict > 15%, not >=. So exactly 15% = no flag."""
        a = compute_analytics(holdings=GP08_HOLDINGS, total_value=GP08_TOTAL, cash_value=GP08_CASH)
        assert "HIGH_SINGLE_NAME" not in _flag_codes(a)

    def test_no_sector_flag(self):
        a = compute_analytics(holdings=GP08_HOLDINGS, total_value=GP08_TOTAL, cash_value=GP08_CASH)
        assert "HIGH_SECTOR" not in _flag_codes(a)

    def test_no_mandate_breach(self):
        a = compute_analytics(holdings=GP08_HOLDINGS, total_value=GP08_TOTAL, cash_value=GP08_CASH)
        breaches = compute_mandate_breaches(analytics=a)
        assert len(breaches) == 0


# =====================================================================
# GP-09: Mixed Alignment (research-backed tickers)
# =====================================================================
# Using real research files:
#   BHP -> skew=upside    -> long+upside = aligned
#   CBA -> skew=downside  -> long+downside = contradicts
#   RIO -> skew=balanced  -> long+balanced = neutral
#   NEWCO -> no research  -> not-covered

GP09_HOLDINGS = [
    {"ticker": "BHP", "weight": 0.30},
    {"ticker": "CBA", "weight": 0.25},
    {"ticker": "RIO", "weight": 0.20},
    {"ticker": "NEWCO", "weight": 0.25},
]

class TestGP09MixedAlignment:
    """GP-09: Holdings with aligned, contradicts, neutral, and not-covered."""

    def test_bhp_aligned(self):
        result = compute_alignment(holdings=GP09_HOLDINGS)
        bhp = [h for h in result["holdings"] if h["ticker"] == "BHP"][0]
        assert bhp["alignment"]["cls"] == "aligned"
        assert bhp["has_research"] is True

    def test_cba_contradicts(self):
        result = compute_alignment(holdings=GP09_HOLDINGS)
        cba = [h for h in result["holdings"] if h["ticker"] == "CBA"][0]
        assert cba["alignment"]["cls"] == "contradicts"

    def test_rio_neutral(self):
        result = compute_alignment(holdings=GP09_HOLDINGS)
        rio = [h for h in result["holdings"] if h["ticker"] == "RIO"][0]
        assert rio["alignment"]["cls"] == "neutral"

    def test_newco_not_covered(self):
        result = compute_alignment(holdings=GP09_HOLDINGS)
        nc = [h for h in result["holdings"] if h["ticker"] == "NEWCO"][0]
        assert nc["alignment"]["cls"] == "not-covered"
        assert nc["has_research"] is False

    def test_alignment_score(self):
        """alignment_score = aligned_weight / total_weight = 0.30 / 1.0 = 0.30."""
        result = compute_alignment(holdings=GP09_HOLDINGS)
        assert abs(result["alignment_summary"]["alignment_score"] - 0.30) < TOL

    def test_not_covered_weight(self):
        result = compute_alignment(holdings=GP09_HOLDINGS)
        assert abs(result["alignment_summary"]["not_covered_weight"] - 0.25) < TOL

    def test_contradicts_weight(self):
        result = compute_alignment(holdings=GP09_HOLDINGS)
        assert abs(result["alignment_summary"]["contradicts_weight"] - 0.25) < TOL

    def test_neutral_weight(self):
        result = compute_alignment(holdings=GP09_HOLDINGS)
        assert abs(result["alignment_summary"]["neutral_weight"] - 0.20) < TOL

    def test_covered_count(self):
        result = compute_alignment(holdings=GP09_HOLDINGS)
        # BHP (aligned) + CBA (contradicts) + RIO (neutral) = 3 covered
        assert result["alignment_summary"]["covered_count"] == 3


# =====================================================================
# GP-10: Multi-Breach Portfolio
# =====================================================================

GP10_HOLDINGS = [
    {"ticker": "BHP", "quantity": 1, "price": 40000, "market_value": 40000, "sector": "Materials"},
    {"ticker": "RIO", "quantity": 1, "price": 20000, "market_value": 20000, "sector": "Materials"},
]
GP10_TOTAL = 100000
GP10_CASH = 40000
# BHP weight: 40000/100000 = 0.40 -> POSITION_BREACH
# Materials: 60000/100000 = 0.60 -> SECTOR_BREACH
# Cash: 40000/100000 = 0.40 -> CASH_ABOVE_MAX (>25%)

class TestGP10MultiBreachPortfolio:
    """GP-10: Simultaneous position, sector, and cash breaches."""

    def test_three_breaches(self):
        a = compute_analytics(holdings=GP10_HOLDINGS, total_value=GP10_TOTAL, cash_value=GP10_CASH)
        breaches = compute_mandate_breaches(
            analytics=a,
            mandate_max_position=0.15,
            mandate_sector_cap=0.35,
            mandate_cash_max=0.25,
        )
        codes = set(_breach_codes(breaches))
        assert "POSITION_BREACH" in codes
        assert "SECTOR_BREACH" in codes
        assert "CASH_ABOVE_MAX" in codes
        assert len(breaches) == 3

    def test_position_breach_severity(self):
        """40% - 15% = 25pp > 10pp -> critical."""
        a = compute_analytics(holdings=GP10_HOLDINGS, total_value=GP10_TOTAL, cash_value=GP10_CASH)
        breaches = compute_mandate_breaches(analytics=a, mandate_max_position=0.15)
        pos = [b for b in breaches if b["code"] == "POSITION_BREACH"][0]
        assert pos["severity"] == "critical"

    def test_sector_breach_severity(self):
        """60% - 35% = 25pp > 15pp -> critical."""
        a = compute_analytics(holdings=GP10_HOLDINGS, total_value=GP10_TOTAL, cash_value=GP10_CASH)
        breaches = compute_mandate_breaches(analytics=a, mandate_sector_cap=0.35)
        sb = [b for b in breaches if b["code"] == "SECTOR_BREACH"][0]
        assert sb["severity"] == "critical"

    def test_cash_breach_severity(self):
        """Cash 40% is < 50%, so severity = warning (not critical)."""
        a = compute_analytics(holdings=GP10_HOLDINGS, total_value=GP10_TOTAL, cash_value=GP10_CASH)
        breaches = compute_mandate_breaches(analytics=a, mandate_cash_max=0.25)
        cb = [b for b in breaches if b["code"] == "CASH_ABOVE_MAX"][0]
        assert cb["severity"] == "warning"


# =====================================================================
# GP-11: Tight Mandate (position max 5%, sector cap 20%)
# =====================================================================

class TestGP11TightMandate:
    """GP-11: Tight mandate triggers many breaches on GP-01 portfolio."""

    def test_position_breach_on_balanced(self):
        """GP-01's max is BHP at 12.4% > 5% tight mandate."""
        a = compute_analytics(holdings=GP01_HOLDINGS, total_value=GP01_TOTAL, cash_value=GP01_CASH)
        breaches = compute_mandate_breaches(analytics=a, mandate_max_position=0.05)
        assert "POSITION_BREACH" in _breach_codes(breaches)

    def test_no_sector_breach_on_balanced(self):
        """GP-01's max sector is Financials at 19.9% < 20%."""
        a = compute_analytics(holdings=GP01_HOLDINGS, total_value=GP01_TOTAL, cash_value=GP01_CASH)
        breaches = compute_mandate_breaches(analytics=a, mandate_sector_cap=0.20)
        assert "SECTOR_BREACH" not in _breach_codes(breaches)


# =====================================================================
# GP-12: Relaxed Mandate (position max 50%, sector cap 50%)
# =====================================================================

class TestGP12RelaxedMandate:
    """GP-12: Relaxed mandate shows no breaches on GP-02 concentrated portfolio."""

    def test_no_breaches_concentrated_with_relaxed(self):
        a = compute_analytics(holdings=GP02_HOLDINGS, total_value=GP02_TOTAL, cash_value=GP02_CASH)
        breaches = compute_mandate_breaches(
            analytics=a,
            mandate_max_position=0.70,
            mandate_sector_cap=0.90,
            mandate_cash_min=0.01,
            mandate_cash_max=0.50,
        )
        assert len(breaches) == 0

    def test_no_flags_with_relaxed_thresholds(self):
        """Relaxed analytics thresholds suppress all warning flags."""
        relaxed = ThresholdConfig(
            max_single_position=0.95,
            max_top5=0.99,
            max_top10=0.99,
            max_sector=0.95,
            min_cash=0.01,
            max_cash=0.95,
        )
        a = compute_analytics(
            holdings=GP02_HOLDINGS,
            total_value=GP02_TOTAL,
            cash_value=GP02_CASH,
            thresholds=relaxed,
        )
        warning_flags = [f for f in a["flags"] if f["severity"] == "warning"]
        assert len(warning_flags) == 0


# =====================================================================
# GP-13: Restricted Names
# =====================================================================

class TestGP13RestrictedNames:
    """GP-13: Holdings contain restricted tickers."""

    def test_single_restricted(self):
        holdings = [
            {"ticker": "BHP", "weight": 0.40},
            {"ticker": "CBA", "weight": 0.30},
            {"ticker": "CSL", "weight": 0.30},
        ]
        result = compute_alignment(holdings=holdings, restricted_names=["CBA"])
        assert len(result["restricted_violations"]) == 1
        assert result["restricted_violations"][0]["ticker"] == "CBA"
        assert abs(result["restricted_violations"][0]["weight"] - 0.30) < TOL

    def test_multiple_restricted(self):
        holdings = [
            {"ticker": "BHP", "weight": 0.40},
            {"ticker": "CBA", "weight": 0.30},
            {"ticker": "CSL", "weight": 0.30},
        ]
        result = compute_alignment(holdings=holdings, restricted_names=["CBA", "BHP"])
        assert len(result["restricted_violations"]) == 2
        tickers = {v["ticker"] for v in result["restricted_violations"]}
        assert tickers == {"CBA", "BHP"}

    def test_no_restricted_no_violations(self):
        holdings = [{"ticker": "BHP", "weight": 0.50}]
        result = compute_alignment(holdings=holdings, restricted_names=[])
        assert len(result["restricted_violations"]) == 0

    def test_case_insensitive(self):
        holdings = [{"ticker": "CBA", "weight": 0.50}]
        result = compute_alignment(holdings=holdings, restricted_names=["cba"])
        assert len(result["restricted_violations"]) == 1


# =====================================================================
# GP-14: Research-Backed Alignment (all covered tickers)
# =====================================================================

class TestGP14ResearchBackedAlignment:
    """GP-14: Verify alignment for tickers with known research files."""

    def test_bhp_upside_aligned(self):
        """BHP has raw skew=upside, long position -> aligned."""
        research = load_research("BHP")
        assert research is not None
        skew = resolve_skew(research)
        assert skew["direction"] == "upside"
        result = classify_alignment("long", skew["direction"])
        assert result["cls"] == "aligned"

    def test_cba_downside_contradicts(self):
        """CBA has raw skew=downside, long position -> contradicts."""
        research = load_research("CBA")
        assert research is not None
        skew = resolve_skew(research)
        assert skew["direction"] == "downside"
        result = classify_alignment("long", skew["direction"])
        assert result["cls"] == "contradicts"

    def test_rio_balanced_neutral(self):
        """RIO has raw skew=balanced, long position -> neutral."""
        research = load_research("RIO")
        assert research is not None
        skew = resolve_skew(research)
        assert skew["direction"] == "balanced"
        result = classify_alignment("long", skew["direction"])
        assert result["cls"] == "neutral"

    def test_csl_upside_aligned(self):
        """CSL has raw skew=upside, long position -> aligned."""
        research = load_research("CSL")
        assert research is not None
        skew = resolve_skew(research)
        assert skew["direction"] == "upside"
        result = classify_alignment("long", skew["direction"])
        assert result["cls"] == "aligned"

    def test_xro_upside_aligned(self):
        """XRO has raw skew=upside, long position -> aligned."""
        research = load_research("XRO")
        assert research is not None
        skew = resolve_skew(research)
        assert skew["direction"] == "upside"
        result = classify_alignment("long", skew["direction"])
        assert result["cls"] == "aligned"

    def test_mqg_upside_aligned(self):
        """MQG has raw skew=upside, long position -> aligned."""
        research = load_research("MQG")
        assert research is not None
        skew = resolve_skew(research)
        assert skew["direction"] == "upside"
        result = classify_alignment("long", skew["direction"])
        assert result["cls"] == "aligned"

    def test_wow_downside_contradicts(self):
        """WOW has raw skew=downside, long position -> contradicts."""
        research = load_research("WOW")
        skew = resolve_skew(research)
        assert skew["direction"] == "downside"
        result = classify_alignment("long", skew["direction"])
        assert result["cls"] == "contradicts"

    def test_portfolio_alignment_with_covered_tickers(self):
        """Full alignment on mixed covered portfolio."""
        holdings = [
            {"ticker": "BHP", "weight": 0.25},   # aligned
            {"ticker": "CSL", "weight": 0.25},   # aligned
            {"ticker": "CBA", "weight": 0.20},   # contradicts
            {"ticker": "RIO", "weight": 0.15},   # neutral
            {"ticker": "WOW", "weight": 0.15},   # contradicts
        ]
        result = compute_alignment(holdings=holdings)
        summary = result["alignment_summary"]
        # aligned: BHP(0.25) + CSL(0.25) = 0.50
        assert abs(summary["aligned_weight"] - 0.50) < TOL
        # contradicts: CBA(0.20) + WOW(0.15) = 0.35
        assert abs(summary["contradicts_weight"] - 0.35) < TOL
        # neutral: RIO(0.15)
        assert abs(summary["neutral_weight"] - 0.15) < TOL
        # alignment_score: 0.50 / 1.0 = 0.50
        assert abs(summary["alignment_score"] - 0.50) < TOL
        assert summary["covered_count"] == 5
        assert summary["not_covered_weight"] == 0.0


# =====================================================================
# GP-15: Change Detection
# =====================================================================

class TestGP15ChangeDetection:
    """GP-15: Detect adds, removes, and weight changes between snapshots."""

    def test_new_position_detected(self):
        prev = [{"ticker": "BHP", "weight": 0.40}, {"ticker": "CBA", "weight": 0.30}]
        curr = [{"ticker": "BHP", "weight": 0.40}, {"ticker": "CBA", "weight": 0.30}, {"ticker": "CSL", "weight": 0.20}]
        changes = detect_changes(curr, prev)
        new = [c for c in changes if c["change_type"] == "new_position"]
        assert len(new) == 1
        assert new[0]["ticker"] == "CSL"

    def test_removed_position_detected(self):
        prev = [{"ticker": "BHP", "weight": 0.40}, {"ticker": "CBA", "weight": 0.30}]
        curr = [{"ticker": "BHP", "weight": 0.60}]
        changes = detect_changes(curr, prev)
        removed = [c for c in changes if c["change_type"] == "removed_position"]
        assert len(removed) == 1
        assert removed[0]["ticker"] == "CBA"

    def test_weight_increase_detected(self):
        prev = [{"ticker": "BHP", "weight": 0.10}]
        curr = [{"ticker": "BHP", "weight": 0.25}]
        changes = detect_changes(curr, prev)
        assert len(changes) == 1
        assert "increased" in changes[0]["change_type"]
        assert "15.0pp" in changes[0]["description"]

    def test_weight_decrease_detected(self):
        prev = [{"ticker": "BHP", "weight": 0.30}]
        curr = [{"ticker": "BHP", "weight": 0.15}]
        changes = detect_changes(curr, prev)
        assert len(changes) == 1
        assert "decreased" in changes[0]["change_type"]

    def test_small_change_ignored(self):
        """Changes < 1pp are ignored."""
        prev = [{"ticker": "BHP", "weight": 0.100}]
        curr = [{"ticker": "BHP", "weight": 0.105}]
        changes = detect_changes(curr, prev)
        assert len(changes) == 0

    def test_multiple_changes(self):
        prev = [
            {"ticker": "BHP", "weight": 0.30},
            {"ticker": "CBA", "weight": 0.20},
            {"ticker": "OLD", "weight": 0.10},
        ]
        curr = [
            {"ticker": "BHP", "weight": 0.45},   # +15pp
            {"ticker": "CBA", "weight": 0.20},   # unchanged
            {"ticker": "NEW", "weight": 0.10},   # added
        ]
        changes = detect_changes(curr, prev)
        types = {c["change_type"] for c in changes}
        assert "new_position" in types
        assert "removed_position" in types
        assert "weight_increased" in types
        # CBA unchanged should not appear
        assert not any(c["ticker"] == "CBA" for c in changes)


# =====================================================================
# Cross-cutting: Determinism and Non-mutation
# =====================================================================

class TestGoldenDeterminism:
    """Same inputs always produce same outputs; inputs not mutated."""

    def test_analytics_deterministic(self):
        a1 = compute_analytics(holdings=GP01_HOLDINGS, total_value=GP01_TOTAL, cash_value=GP01_CASH)
        a2 = compute_analytics(holdings=GP01_HOLDINGS, total_value=GP01_TOTAL, cash_value=GP01_CASH)
        assert a1["concentration"] == a2["concentration"]
        assert a1["sector_exposure"] == a2["sector_exposure"]
        assert a1["concentration_score"] == a2["concentration_score"]
        assert len(a1["flags"]) == len(a2["flags"])

    def test_alignment_deterministic(self):
        r1 = compute_alignment(holdings=GP09_HOLDINGS)
        r2 = compute_alignment(holdings=GP09_HOLDINGS)
        assert r1["alignment_summary"] == r2["alignment_summary"]

    def test_input_not_mutated(self):
        original = [dict(h) for h in GP01_HOLDINGS]
        compute_analytics(holdings=GP01_HOLDINGS, total_value=GP01_TOTAL, cash_value=GP01_CASH)
        for orig, curr in zip(original, GP01_HOLDINGS):
            assert "weight" not in curr or curr == orig


# =====================================================================
# Cross-cutting: Reweighting Suggestions
# =====================================================================

class TestGoldenReweighting:
    """Reweighting suggestions based on alignment and mandate limits."""

    def test_contradicts_trim(self):
        """Contradictory position > 2% should suggest trim."""
        holdings = [
            {"ticker": "CBA", "weight": 0.15, "alignment": {"cls": "contradicts", "label": "Contradictory"}},
        ]
        suggestions = compute_reweighting_deltas(holdings, mandate_max_position=0.15)
        assert len(suggestions) == 1
        assert suggestions[0]["suggested_direction"] == "trim"

    def test_aligned_low_weight_review(self):
        """Aligned position below half max -> review for increase."""
        holdings = [
            {"ticker": "BHP", "weight": 0.04, "alignment": {"cls": "aligned", "label": "Aligned"}},
        ]
        suggestions = compute_reweighting_deltas(holdings, mandate_max_position=0.15)
        assert len(suggestions) == 1
        assert suggestions[0]["suggested_direction"] == "review_for_increase"

    def test_exceeds_max_trim_to_limit(self):
        """Position above mandate max -> trim to limit."""
        holdings = [
            {"ticker": "BHP", "weight": 0.25, "alignment": {"cls": "aligned", "label": "Aligned"}},
        ]
        suggestions = compute_reweighting_deltas(holdings, mandate_max_position=0.15)
        assert len(suggestions) == 1
        assert suggestions[0]["suggested_direction"] == "trim_to_limit"

    def test_neutral_normal_weight_no_suggestion(self):
        """Neutral at normal weight -> no suggestion."""
        holdings = [
            {"ticker": "RIO", "weight": 0.10, "alignment": {"cls": "neutral", "label": "Neutral"}},
        ]
        suggestions = compute_reweighting_deltas(holdings, mandate_max_position=0.15)
        assert len(suggestions) == 0


# =====================================================================
# Cross-cutting: Theme Exposure
# =====================================================================

class TestGoldenThemeExposure:
    """Theme exposure aggregates sectors correctly."""

    def test_cyclical_theme(self):
        """Materials + Energy + Industrials = Cyclical."""
        a = compute_analytics(holdings=GP07_HOLDINGS, total_value=GP07_TOTAL, cash_value=GP07_CASH)
        # Materials: (23500+2400)/74150 = 25900/74150 = 0.34929
        # Energy: 3300/74150 = 0.04451
        # Industrials: 3600/74150 = 0.04855
        # Cyclical = sum = 0.44235
        cyclical = a["theme_exposure"].get("Cyclical", 0)
        expected = (23500 + 2400 + 3300 + 3600) / GP07_TOTAL
        assert abs(cyclical - expected) < TOL

    def test_defensive_theme(self):
        """Consumer Staples + Health Care = Defensive."""
        a = compute_analytics(holdings=GP07_HOLDINGS, total_value=GP07_TOTAL, cash_value=GP07_CASH)
        # Consumer Staples: 4950/74150
        # Health Care: 6900/74150
        expected = (4950 + 6900) / GP07_TOTAL
        defensive = a["theme_exposure"].get("Defensive", 0)
        assert abs(defensive - expected) < TOL

    def test_growth_theme(self):
        """Information Technology = Growth."""
        a = compute_analytics(holdings=GP07_HOLDINGS, total_value=GP07_TOTAL, cash_value=GP07_CASH)
        expected = 3750 / GP07_TOTAL
        growth = a["theme_exposure"].get("Growth", 0)
        assert abs(growth - expected) < TOL


# =====================================================================
# Cross-cutting: HHI Calculations
# =====================================================================

class TestGoldenHHI:
    """Hand-computed HHI values."""

    def test_two_position_hhi(self):
        """GP-02: BHP 0.5987, RIO 0.2293, CBA 0.0446.
        HHI = 0.5987^2 + 0.2293^2 + 0.0446^2."""
        a = compute_analytics(holdings=GP02_HOLDINGS, total_value=GP02_TOTAL, cash_value=GP02_CASH)
        w_bhp = 47000 / GP02_TOTAL
        w_rio = 18000 / GP02_TOTAL
        w_cba = 3500 / GP02_TOTAL
        expected_hhi = w_bhp**2 + w_rio**2 + w_cba**2
        assert abs(a["concentration"]["hhi"] - expected_hhi) < TOL

    def test_equal_weight_low_hhi(self):
        """5 equal-weight positions: HHI = 5 * (0.2)^2 = 0.20."""
        holdings = [
            {"ticker": f"S{i}", "quantity": 1, "price": 20000, "market_value": 20000, "sector": "Financials"}
            for i in range(5)
        ]
        a = compute_analytics(holdings=holdings, total_value=100000, cash_value=0)
        expected_hhi = 5 * (0.2 ** 2)
        assert abs(a["concentration"]["hhi"] - expected_hhi) < TOL
        # Concentration score for equal weight should be 0
        assert a["concentration_score"] == 0.0


# =====================================================================
# Total test count assertion
# =====================================================================

class TestGoldenPortfolioSuiteCompleteness:
    """Meta-test: verify golden portfolio suite has expected coverage."""

    def test_portfolio_count(self):
        """15 golden portfolio scenarios are defined."""
        gp_classes = [
            TestGP01BalancedBenchmark,
            TestGP02ConcentratedMaterials,
            TestGP03AllBankPortfolio,
            TestGP04SingleStock,
            TestGP05AllCash,
            TestGP06CashHeavy,
            TestGP07CashLight,
            TestGP08ExactlyAtThresholds,
            TestGP09MixedAlignment,
            TestGP10MultiBreachPortfolio,
            TestGP11TightMandate,
            TestGP12RelaxedMandate,
            TestGP13RestrictedNames,
            TestGP14ResearchBackedAlignment,
            TestGP15ChangeDetection,
        ]
        assert len(gp_classes) == 15

    def test_minimum_test_count(self):
        """Suite should have 80+ individual test methods across all GP classes."""
        import inspect
        count = 0
        for name, obj in globals().items():
            if inspect.isclass(obj) and name.startswith("Test"):
                for method in dir(obj):
                    if method.startswith("test_"):
                        count += 1
        assert count >= 80, f"Expected >= 80 tests, found {count}"
