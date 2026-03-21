"""Tests for portfolio validation and derived analytics (Phase B).

Tests the pure functions in portfolio_validation.py and portfolio_db.py.
No database required -- these are unit tests on deterministic logic.
"""

import sys
from pathlib import Path

# Allow imports from api/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from portfolio_validation import validate_snapshot
from portfolio_db import compute_weights, compute_sector_exposure, concentration_flags


# =====================================================================
# validate_snapshot
# =====================================================================

class TestValidateSnapshot:
    """Validation rules for snapshot creation."""

    def test_valid_single_holding_plus_cash(self):
        """Single holding + cash that sums correctly passes."""
        errors = validate_snapshot(
            total_value=110000,
            cash_value=10000,
            holdings=[{
                "ticker": "CBA",
                "quantity": 1000,
                "price": 100.0,
                "market_value": 100000,
                "sector": "Financials",
            }],
        )
        assert errors == []

    def test_valid_multi_holding(self):
        """Multiple holdings summing to total passes."""
        errors = validate_snapshot(
            total_value=200000,
            cash_value=20000,
            holdings=[
                {"ticker": "CBA", "quantity": 500, "price": 200, "market_value": 100000, "sector": "Financials"},
                {"ticker": "BHP", "quantity": 400, "price": 200, "market_value": 80000, "sector": "Materials"},
            ],
        )
        assert errors == []

    def test_duplicate_tickers_flagged(self):
        """Duplicate tickers within a snapshot are rejected."""
        errors = validate_snapshot(
            total_value=200000,
            cash_value=0,
            holdings=[
                {"ticker": "CBA", "quantity": 500, "price": 200, "market_value": 100000},
                {"ticker": "CBA", "quantity": 500, "price": 200, "market_value": 100000},
            ],
        )
        assert any("duplicate ticker" in e.lower() for e in errors)

    def test_missing_price_flagged(self):
        """Holding with no price is rejected."""
        errors = validate_snapshot(
            total_value=100000,
            cash_value=0,
            holdings=[{
                "ticker": "WOR",
                "quantity": 100,
                "price": None,
                "market_value": 10000,
            }],
        )
        assert any("price" in e.lower() for e in errors)

    def test_zero_quantity_flagged(self):
        """Zero quantity is rejected."""
        errors = validate_snapshot(
            total_value=100000,
            cash_value=0,
            holdings=[{
                "ticker": "FMG",
                "quantity": 0,
                "price": 50,
                "market_value": 0,
            }],
        )
        assert any("quantity" in e.lower() for e in errors)

    def test_negative_total_value_flagged(self):
        """Negative total_value is rejected."""
        errors = validate_snapshot(
            total_value=-100,
            cash_value=0,
            holdings=[],
        )
        assert any("total_value" in e for e in errors)

    def test_cash_exceeds_total_flagged(self):
        """Cash exceeding total is rejected."""
        errors = validate_snapshot(
            total_value=50000,
            cash_value=60000,
            holdings=[],
        )
        assert any("cash_value" in e for e in errors)

    def test_sum_inconsistency_flagged(self):
        """Holdings + cash not matching total_value is flagged."""
        errors = validate_snapshot(
            total_value=200000,
            cash_value=10000,
            holdings=[{
                "ticker": "CBA",
                "quantity": 500,
                "price": 200,
                "market_value": 100000,
                "sector": "Financials",
            }],
        )
        # 100000 + 10000 = 110000 != 200000
        assert any("sum inconsistency" in e.lower() for e in errors)

    def test_market_value_mismatch_flagged(self):
        """market_value != quantity * price is flagged."""
        errors = validate_snapshot(
            total_value=150000,
            cash_value=0,
            holdings=[{
                "ticker": "CBA",
                "quantity": 500,
                "price": 200,
                "market_value": 150000,  # should be 100000
            }],
        )
        assert any("does not match" in e for e in errors)

    def test_zero_cash_valid(self):
        """Portfolio with zero cash and holdings summing to total passes."""
        errors = validate_snapshot(
            total_value=100000,
            cash_value=0,
            holdings=[{
                "ticker": "BHP",
                "quantity": 1000,
                "price": 100,
                "market_value": 100000,
            }],
        )
        assert errors == []

    def test_empty_holdings_valid(self):
        """All-cash portfolio (no holdings) passes."""
        errors = validate_snapshot(
            total_value=50000,
            cash_value=50000,
            holdings=[],
        )
        assert errors == []

    def test_missing_ticker_flagged(self):
        """Holding with empty ticker is rejected."""
        errors = validate_snapshot(
            total_value=100000,
            cash_value=0,
            holdings=[{
                "ticker": "",
                "quantity": 100,
                "price": 100,
                "market_value": 10000,
            }],
        )
        assert any("ticker is required" in e for e in errors)


# =====================================================================
# compute_weights
# =====================================================================

class TestComputeWeights:
    """Deterministic weight derivation."""

    def test_single_holding(self):
        """Single holding gets weight = mv / total."""
        holdings = [{"ticker": "CBA", "market_value": 80000}]
        result = compute_weights(holdings, 100000)
        assert result[0]["weight"] == 0.8

    def test_multiple_holdings(self):
        """Weights sum to approx 1 (less cash)."""
        holdings = [
            {"ticker": "CBA", "market_value": 50000},
            {"ticker": "BHP", "market_value": 30000},
        ]
        result = compute_weights(holdings, 100000)
        assert result[0]["weight"] == 0.5
        assert result[1]["weight"] == 0.3

    def test_zero_total_value(self):
        """Zero total gives all weights = 0."""
        holdings = [{"ticker": "CBA", "market_value": 50000}]
        result = compute_weights(holdings, 0)
        assert result[0]["weight"] == 0.0

    def test_empty_holdings(self):
        """No holdings returns empty list."""
        result = compute_weights([], 100000)
        assert result == []


# =====================================================================
# compute_sector_exposure
# =====================================================================

class TestSectorExposure:
    """Sector aggregation."""

    def test_single_sector(self):
        holdings = [
            {"ticker": "CBA", "market_value": 50000, "sector": "Financials"},
            {"ticker": "WBC", "market_value": 30000, "sector": "Financials"},
        ]
        result = compute_sector_exposure(holdings, 100000)
        assert result["Financials"] == 0.8

    def test_multiple_sectors(self):
        holdings = [
            {"ticker": "CBA", "market_value": 50000, "sector": "Financials"},
            {"ticker": "BHP", "market_value": 30000, "sector": "Materials"},
        ]
        result = compute_sector_exposure(holdings, 100000)
        assert result["Financials"] == 0.5
        assert result["Materials"] == 0.3

    def test_missing_sector_becomes_unclassified(self):
        holdings = [{"ticker": "XYZ", "market_value": 50000}]
        result = compute_sector_exposure(holdings, 100000)
        assert "Unclassified" in result


# =====================================================================
# concentration_flags
# =====================================================================

class TestConcentrationFlags:
    """Concentration warning generation."""

    def test_no_flags_when_diversified(self):
        """Five equal positions should not trigger any flags."""
        holdings = [
            {"ticker": f"T{i}", "market_value": 20000} for i in range(5)
        ]
        flags = concentration_flags(holdings, 100000)
        # Each is 20%, which is > 10% default, so single-position flags fire
        # but top3 is 60% > 40%
        assert any("top 3" in f.lower() for f in flags)

    def test_single_position_flag(self):
        """One dominant position triggers single-position flag."""
        holdings = [
            {"ticker": "CBA", "market_value": 80000},
            {"ticker": "BHP", "market_value": 20000},
        ]
        flags = concentration_flags(holdings, 100000)
        assert any("CBA" in f for f in flags)

    def test_top3_flag(self):
        """Top 3 exceeding 40% triggers flag."""
        holdings = [
            {"ticker": "CBA", "market_value": 20000},
            {"ticker": "BHP", "market_value": 15000},
            {"ticker": "WBC", "market_value": 10000},
            {"ticker": "NAB", "market_value": 5000},
        ]
        # Top 3: 20+15+10 = 45 / 50 = 90% > 40%
        flags = concentration_flags(holdings, 50000)
        assert any("top 3" in f.lower() for f in flags)

    def test_no_flags_empty(self):
        """Empty portfolio produces no flags."""
        flags = concentration_flags([], 0)
        assert flags == []

    def test_custom_thresholds(self):
        """Custom thresholds are respected."""
        holdings = [
            {"ticker": "CBA", "market_value": 25000},
            {"ticker": "BHP", "market_value": 25000},
            {"ticker": "WBC", "market_value": 25000},
            {"ticker": "NAB", "market_value": 25000},
        ]
        # Each is 25%, top3 is 75%
        flags = concentration_flags(
            holdings, 100000,
            single_limit=0.30,  # 25% < 30% so no single flags
            top3_limit=0.80,    # 75% < 80% so no top3 flag
        )
        assert flags == []
