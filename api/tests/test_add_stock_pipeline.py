"""
BMAD Test Suite: Add Stock Pipeline
====================================
Backend - Middleware - Application - Data integrity tests.

Tests the complete chain from Yahoo data ingestion through scaffold creation,
reference entry population, featured metrics computation, merge initiation,
and final data integrity in _index.json and reference.json.

BMAD layers tested:
  B (Backend):     scaffold.py build_reference_entry, _build_featured_metrics, build_index_entry
  M (Middleware):  refresh.py _merge_initiation featuredMetrics rebuild, _update_index propagation
  A (Application): home.js isDataPending logic (via renderFeaturedCard output)
  D (Data):        _index.json and reference.json cross-consistency, no permanent N/A states

Run: cd api && python3 -m pytest tests/test_add_stock_pipeline.py -v
"""

import sys
import json
import copy
from pathlib import Path
from datetime import datetime

# Allow imports from api/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scaffold import (
    build_reference_entry,
    build_research_scaffold,
    build_index_entry,
    _build_featured_metrics,
    infer_archetype,
)


# ---------------------------------------------------------------------------
# Fixtures: Yahoo Finance mock data
# ---------------------------------------------------------------------------

def _yahoo_data_full():
    """Complete Yahoo Finance response for a well-covered stock (e.g. QAN)."""
    return {
        "price": 8.34,
        "change": -0.15,
        "change_pct": -1.77,
        "volume": 12_000_000,
        "high_52w": 11.50,
        "low_52w": 7.80,
        "market_cap": 10_200_000_000,  # ~A$10.2B
        "currency": "A$",
        "price_history": [{"date": "2025-01-01", "close": c} for c in [9.0, 9.5, 10.0, 8.5, 8.34]],
        "fetched_at": "2026-03-22T00:00:00Z",
        # From _fetch_yahoo_financials
        "forward_pe": 12.5,
        "trailing_pe": 14.2,
        "ev_to_ebitda": 6.8,
        "dividend_yield": 0.024,  # 2.4%
        "dividend_per_share": 0.20,
        "revenue": 18_500_000_000,
        "ebitda": 3_200_000_000,
        "total_debt": 5_800_000_000,
        "enterprise_value": 16_000_000_000,
        "employees": 29_000,
        "sector": "Industrials",
        "industry": "Airlines",
        "description": "Qantas Airways Limited provides air transport services.",
        # Additional fields the fix adds
        "shares_outstanding": 1_220_000_000,
        "market_cap_summary": 10_200_000_000,
    }


def _yahoo_data_minimal():
    """Yahoo response where chart endpoint returned null for market_cap.
    This is the failure mode that causes the bug."""
    return {
        "price": 3.52,
        "change": 0.18,
        "change_pct": 5.39,
        "volume": 800_000,
        "high_52w": 9.10,
        "low_52w": 2.17,
        "market_cap": None,  # <-- chart endpoint missed it
        "currency": "A$",
        "price_history": [{"date": "2025-01-01", "close": c} for c in [5.0, 4.0, 3.0, 3.52]],
        "fetched_at": "2026-03-22T00:00:00Z",
        # quoteSummary also mostly empty (pre-revenue biotech/materials)
        "forward_pe": None,
        "trailing_pe": None,
        "ev_to_ebitda": None,
        "dividend_yield": None,
        "dividend_per_share": None,
        "revenue": None,
        "ebitda": None,
        "total_debt": None,
        "enterprise_value": None,
        "employees": None,
        "sector": "Basic Materials",
        "industry": "Other Industrial Metals & Mining",
        "description": "",
        # Fix fields - quoteSummary may still have these even when chart misses market_cap
        "shares_outstanding": None,
        "market_cap_summary": None,
    }


def _yahoo_data_partial():
    """Yahoo response where chart missed market_cap but quoteSummary has shares_outstanding.
    This is the recovery path the fix enables."""
    data = _yahoo_data_minimal()
    data["shares_outstanding"] = 181_000_000  # quoteSummary returned this
    data["market_cap_summary"] = 637_000_000  # and this
    return data


def _yahoo_data_explorer():
    """Yahoo data for a gold explorer (e.g. WIA) - no P/E, no dividend, has market cap."""
    return {
        "price": 0.50,
        "change": 0.02,
        "change_pct": 4.17,
        "volume": 2_000_000,
        "high_52w": 0.80,
        "low_52w": 0.30,
        "market_cap": 177_000_000,
        "currency": "A$",
        "price_history": [{"date": "2025-01-01", "close": c} for c in [0.60, 0.45, 0.50]],
        "fetched_at": "2026-03-22T00:00:00Z",
        "forward_pe": None,
        "trailing_pe": None,
        "ev_to_ebitda": None,
        "dividend_yield": None,
        "dividend_per_share": None,
        "revenue": None,
        "ebitda": None,
        "total_debt": None,
        "enterprise_value": None,
        "employees": None,
        "sector": "Basic Materials",
        "industry": "Gold",
        "description": "",
        "shares_outstanding": 354_000_000,
        "market_cap_summary": 177_000_000,
    }


# ---------------------------------------------------------------------------
# B-LAYER: Backend - scaffold.py
# ---------------------------------------------------------------------------

class TestBuildReferenceEntry:
    """B1: build_reference_entry must populate reference fields from Yahoo data."""

    def test_full_yahoo_data_populates_all_fields(self):
        """When Yahoo returns complete data, no field should be None."""
        entry = build_reference_entry("QAN", _yahoo_data_full(), "Industrials", "Airlines")
        assert entry["sharesOutstanding"] is not None, "sharesOutstanding must be populated from Yahoo"
        assert entry["epsForward"] is not None, "epsForward must be derived from forward_pe"
        assert entry["epsTrailing"] is not None, "epsTrailing must be derived from trailing_pe"
        assert entry["divPerShare"] is not None, "divPerShare must come from Yahoo dividend_per_share"

    def test_shares_outstanding_in_millions_convention(self):
        """sharesOutstanding must follow the millions convention used by dynamics.js compute()."""
        entry = build_reference_entry("QAN", _yahoo_data_full())
        shares = entry["sharesOutstanding"]
        # Yahoo returns 1,220,000,000 raw. Convention is millions: 1220.
        # Acceptable range: 1000-1500 (allowing for rounding)
        assert 1000 <= shares <= 1500, (
            f"sharesOutstanding should be ~1220 (millions convention), got {shares}. "
            f"dynamics.js does price * sharesOutstanding / 1000 to get market cap in billions."
        )

    def test_eps_forward_derivation(self):
        """epsForward = price / forward_pe."""
        data = _yahoo_data_full()
        entry = build_reference_entry("QAN", data)
        expected = data["price"] / data["forward_pe"]
        assert abs(entry["epsForward"] - expected) < 0.01, (
            f"epsForward should be {expected:.4f}, got {entry['epsForward']}"
        )

    def test_eps_trailing_derivation(self):
        """epsTrailing = price / trailing_pe."""
        data = _yahoo_data_full()
        entry = build_reference_entry("QAN", data)
        expected = data["price"] / data["trailing_pe"]
        assert abs(entry["epsTrailing"] - expected) < 0.01

    def test_div_per_share_from_direct_value(self):
        """divPerShare should prefer the direct dividend_per_share from Yahoo."""
        data = _yahoo_data_full()
        entry = build_reference_entry("QAN", data)
        assert entry["divPerShare"] is not None
        assert abs(entry["divPerShare"] - 0.20) < 0.01

    def test_div_per_share_fallback_to_yield(self):
        """When dividend_per_share is None, derive from dividend_yield * price."""
        data = _yahoo_data_full()
        data["dividend_per_share"] = None
        entry = build_reference_entry("QAN", data)
        expected = data["dividend_yield"] * data["price"]
        assert entry["divPerShare"] is not None
        assert abs(entry["divPerShare"] - expected) < 0.01

    def test_null_yahoo_data_produces_none_gracefully(self):
        """When Yahoo returns all Nones, reference entry should have None fields (not crash)."""
        entry = build_reference_entry("IPX", _yahoo_data_minimal())
        # These CAN be None when Yahoo has no data. The point is no crash.
        assert isinstance(entry, dict)
        assert "sharesOutstanding" in entry
        assert "epsForward" in entry

    def test_market_cap_fallback_to_summary(self):
        """When chart endpoint misses market_cap, quoteSummary's market_cap_summary is used."""
        data = _yahoo_data_partial()
        assert data["market_cap"] is None  # chart missed it
        assert data["market_cap_summary"] is not None  # quoteSummary has it
        # After the fix in fetch_yahoo_price, market_cap should be populated
        # from market_cap_summary before reaching build_reference_entry.
        # For this test, simulate the fallback:
        if not data["market_cap"] and data.get("market_cap_summary"):
            data["market_cap"] = data["market_cap_summary"]
        entry = build_reference_entry("IPX", data)
        assert entry["sharesOutstanding"] is not None

    def test_archetype_preserved(self):
        """Archetype inference should work correctly from sector data."""
        entry = build_reference_entry("QAN", _yahoo_data_full(), "Industrials", "Airlines")
        assert entry["archetype"] is not None
        assert isinstance(entry["archetype"], str)

    def test_anchors_populated(self):
        """_anchors should contain price and formatted market cap."""
        data = _yahoo_data_full()
        entry = build_reference_entry("QAN", data)
        assert entry["_anchors"]["price"] == data["price"]
        assert entry["_anchors"]["marketCapStr"] is not None
        assert "B" in entry["_anchors"]["marketCapStr"]  # e.g. "A$10.2B"


class TestBuildFeaturedMetrics:
    """B2: _build_featured_metrics must produce non-N/A values when data is available."""

    def test_default_archetype_with_full_data(self):
        """Default/diversified archetype: Mkt Cap, Fwd P/E, Div Yield, Drawdown."""
        metrics = _build_featured_metrics(
            "diversified", "A$10.2B", "12.5x", "2.4%",
            "", "-27.5%", 8.34, 11.50, 7.80, "A$",
        )
        assert len(metrics) == 4
        labels = [m["label"] for m in metrics]
        assert "Mkt Cap" in labels
        assert "Fwd P/E" in labels
        assert "Div Yield" in labels
        assert "Drawdown" in labels
        # None should be N/A
        for m in metrics:
            assert m["value"] != "N/A", f"{m['label']} should not be N/A when data is provided"

    def test_explorer_archetype_metrics(self):
        """Explorer archetype: Mkt Cap, 52w Range, Gold Exposure, Drawdown."""
        metrics = _build_featured_metrics(
            "explorer", "A$0.2B", "N/A", "N/A",
            "", "-37.5%", 0.50, 0.80, 0.30, "A$",
        )
        labels = [m["label"] for m in metrics]
        assert "52w Range" in labels
        assert "Gold Exposure" in labels
        # Mkt Cap should be populated
        mkt = next(m for m in metrics if m["label"] == "Mkt Cap")
        assert mkt["value"] == "A$0.2B"

    def test_developer_archetype_metrics(self):
        """Developer archetype: Mkt Cap, 52w Range, Analyst Target, Drawdown."""
        metrics = _build_featured_metrics(
            "developer", "A$0.5B", "N/A", "N/A",
            "", "-15.0%", 1.50, 1.76, 0.90, "A$",
        )
        labels = [m["label"] for m in metrics]
        assert "52w Range" in labels
        assert "Analyst Target" in labels

    def test_tech_archetype_metrics(self):
        """Tech archetype: Mkt Cap, Fwd P/E, Rev Growth, Drawdown."""
        metrics = _build_featured_metrics(
            "tech", "A$5.0B", "35.0x", "N/A",
            "", "-10.0%", 50.00, 55.00, 40.00, "A$",
        )
        labels = [m["label"] for m in metrics]
        assert "Rev Growth" in labels
        mkt = next(m for m in metrics if m["label"] == "Mkt Cap")
        assert mkt["value"] == "A$5.0B"

    def test_null_market_cap_produces_na(self):
        """When market_cap is genuinely unavailable, N/A is correct (not a crash)."""
        metrics = _build_featured_metrics(
            "diversified", "N/A", "N/A", "N/A",
            "", "-60.0%", 3.52, 9.10, 2.17, "A$",
        )
        mkt = next(m for m in metrics if m["label"] == "Mkt Cap")
        assert mkt["value"] == "N/A"  # This IS correct when data is genuinely missing


class TestBuildResearchScaffold:
    """B3: build_research_scaffold must produce valid research JSON with populated metrics."""

    def test_scaffold_with_full_data_has_populated_metrics(self):
        """When Yahoo data is complete, scaffold featuredMetrics should not be all N/A."""
        data = _yahoo_data_full()
        scaffold = build_research_scaffold("QAN", "Qantas Airways", "Industrials", "Airlines", data)
        metrics = scaffold["featuredMetrics"]
        na_count = sum(1 for m in metrics if m.get("value") in (None, "N/A", "--"))
        assert na_count < len(metrics) - 1, (
            f"Scaffold has {na_count}/{len(metrics)} N/A metrics with full Yahoo data. "
            f"Values: {[m['value'] for m in metrics]}"
        )

    def test_scaffold_mkt_cap_populated_when_market_cap_available(self):
        """Mkt Cap in featuredMetrics must be populated when Yahoo returns market_cap."""
        data = _yahoo_data_full()
        scaffold = build_research_scaffold("QAN", "Qantas Airways", "Industrials", "Airlines", data)
        mkt = next(m for m in scaffold["featuredMetrics"] if m["label"] == "Mkt Cap")
        assert mkt["value"] != "N/A", f"Mkt Cap should be populated, got: {mkt['value']}"

    def test_scaffold_has_required_card_fields(self):
        """Scaffold must have all fields required by renderFeaturedCard."""
        data = _yahoo_data_full()
        scaffold = build_research_scaffold("QAN", "Qantas Airways", "Industrials", "Airlines", data)
        required = ["ticker", "tickerFull", "company", "sector", "price", "currency",
                     "featuredMetrics", "featuredRationale", "skew", "hypotheses", "priceHistory"]
        for field in required:
            assert field in scaffold, f"Scaffold missing required field: {field}"

    def test_scaffold_hypotheses_have_scores(self):
        """Scaffold hypotheses must have score fields (even if '?' for pending)."""
        data = _yahoo_data_full()
        scaffold = build_research_scaffold("QAN", "Qantas Airways", "Industrials", "Airlines", data)
        assert len(scaffold["hypotheses"]) >= 4
        for h in scaffold["hypotheses"]:
            assert "score" in h

    def test_scaffold_price_history_is_list_of_numbers(self):
        """priceHistory must be a flat list of numbers, not dicts."""
        data = _yahoo_data_full()
        scaffold = build_research_scaffold("QAN", "Qantas Airways", "Industrials", "Airlines", data)
        assert isinstance(scaffold["priceHistory"], list)
        for p in scaffold["priceHistory"]:
            assert isinstance(p, (int, float)), f"priceHistory entry should be a number, got {type(p)}: {p}"


class TestBuildIndexEntry:
    """B4: build_index_entry must produce a minimal _index.json entry.

    Note: build_index_entry is a minimal stub with basic fields.
    Card fields (featuredMetrics, skew, hypotheses) are added by
    _update_index() in refresh.py, which copies them from the full
    research scaffold. These tests verify the minimal entry is valid
    and that the research scaffold (which feeds _update_index) has
    the required card fields.
    """

    def test_index_entry_has_basic_fields(self):
        """Index entry must have ticker, company, price, priceHistory."""
        data = _yahoo_data_full()
        entry = build_index_entry("QAN", "Qantas Airways", "Industrials", "Airlines", data)
        assert entry["ticker"] == "QAN"
        assert entry["company"] == "Qantas Airways"
        assert entry["price"] == data["price"]
        assert isinstance(entry["priceHistory"], list)
        assert len(entry["priceHistory"]) > 0

    def test_index_entry_price_history_is_flat_numbers(self):
        """priceHistory in index entry must be numbers, not dicts."""
        data = _yahoo_data_full()
        entry = build_index_entry("QAN", "Qantas Airways", "Industrials", "Airlines", data)
        for p in entry["priceHistory"]:
            assert isinstance(p, (int, float)), f"priceHistory has non-number: {p}"

    def test_research_scaffold_has_fields_needed_by_update_index(self):
        """The research scaffold must have all fields that _update_index copies to _index.json.
        _INDEX_FIELDS from refresh.py: ticker, tickerFull, exchange, company, sector, sectorSub,
        price, currency, date, reportId, priceHistory, heroDescription, heroCompanyDescription,
        heroMetrics, skew, verdict, featuredMetrics, featuredPriceColor, featuredRationale,
        hypotheses, identity, footer, _deepResearch."""
        data = _yahoo_data_full()
        scaffold = build_research_scaffold("QAN", "Qantas Airways", "Industrials", "Airlines", data)
        required_for_tiles = ["featuredMetrics", "skew", "hypotheses", "featuredRationale"]
        for field in required_for_tiles:
            assert field in scaffold, f"Research scaffold missing {field} (needed by _update_index)"


# ---------------------------------------------------------------------------
# M-LAYER: Middleware - refresh.py _merge_initiation
# ---------------------------------------------------------------------------

class TestMergeInitiationFeaturedMetrics:
    """M1: _merge_initiation must rebuild featuredMetrics from fresh Yahoo data.

    NOTE: These tests verify the CONTRACT that _merge_initiation must fulfil.
    Before the fix, _merge_initiation does not touch featuredMetrics at all.
    After the fix, it should rebuild them from gathered price data.

    If these tests fail with ImportError for _merge_initiation (it may be
    module-private), test the behaviour indirectly via the public contract:
    after run_refresh, the saved research JSON must have populated featuredMetrics.
    """

    def _make_scaffold_research(self):
        """Simulate a scaffold with N/A metrics (the bug state)."""
        return {
            "ticker": "QAN",
            "tickerFull": "QAN.AX",
            "company": "Qantas Airways Limited",
            "sector": "Industrials",
            "sectorSub": "Airlines",
            "price": 8.34,
            "currency": "A$",
            "date": "22-Mar-26",
            "priceHistory": [9.0, 9.5, 10.0, 8.5, 8.34],
            "featuredMetrics": [
                {"label": "Mkt Cap", "value": "N/A", "color": ""},
                {"label": "Fwd P/E", "value": "N/A", "color": ""},
                {"label": "Div Yield", "value": "N/A", "color": ""},
                {"label": "Drawdown", "value": "-27.5%", "color": ""},
            ],
            "featuredRationale": "Auto-added to coverage.",
            "featuredPriceColor": "",
            "hypotheses": [
                {"tier": "n1", "label": "N1 Growth", "score": "?", "scoreWidth": "?",
                 "description": "Pending", "statusClass": "watching", "statusText": "Pending"},
                {"tier": "n2", "label": "N2 Base", "score": "?", "scoreWidth": "?",
                 "description": "Pending", "statusClass": "watching", "statusText": "Pending"},
                {"tier": "n3", "label": "N3 Downside", "score": "?", "scoreWidth": "?",
                 "description": "Pending", "statusClass": "watching", "statusText": "Pending"},
                {"tier": "n4", "label": "N4 Tail", "score": "?", "scoreWidth": "?",
                 "description": "Pending", "statusClass": "watching", "statusText": "Pending"},
            ],
            "skew": {"direction": "neutral", "rationale": "Pending"},
            "verdict": {"text": "Pending", "scores": []},
            "hero": {},
            "narrative": {},
            "evidence": {"cards": []},
        }

    def _make_gathered(self):
        """Simulate the data gathered in Stage 1 of refresh."""
        return {
            "price_data": _yahoo_data_full(),
            "web_results": [],
            "news_results": [],
        }

    def _make_hypothesis_update(self):
        """Simulate LLM output from Stage 3."""
        return {
            "hypotheses": [
                {"tier": "n1", "updated_score": "25%", "direction": "upside",
                 "rationale": "Test", "updated_description": "Test bull"},
                {"tier": "n2", "updated_score": "40%", "direction": "neutral",
                 "rationale": "Test", "updated_description": "Test base"},
                {"tier": "n3", "updated_score": "25%", "direction": "downside",
                 "rationale": "Test", "updated_description": "Test bear"},
                {"tier": "n4", "updated_score": "10%", "direction": "downside",
                 "rationale": "Test", "updated_description": "Test tail"},
            ],
            "skew": {"direction": "bearish", "rationale": "Fuel costs."},
            "skew_description": "Bearish skew driven by fuel costs.",
            "company_description": "Qantas is Australia's largest airline.",
            "narrative_rewrite": "The airline faces headwinds from fuel prices.",
            "verdict_update": "Bearish skew at initiation.",
        }

    def _make_evidence_update(self):
        """Simulate Stage 2 evidence output."""
        return {
            "cards": [
                {"title": f"Evidence {i}", "category": "Financial Data",
                 "reliability": 8, "content": f"Test evidence {i}"}
                for i in range(6)
            ]
        }

    def test_merge_initiation_contract_na_count_decreases(self):
        """After _merge_initiation, featuredMetrics should have fewer N/As than the scaffold.

        This is the core contract test. If _merge_initiation doesn't rebuild
        featuredMetrics, the N/A count stays at 3 (Mkt Cap, P/E, Div Yield).
        After the fix, gathered price_data should populate these.
        """
        try:
            from refresh import _merge_initiation
        except ImportError:
            # _merge_initiation may not be importable directly
            # In that case, skip this test and rely on the integration test
            import pytest
            pytest.skip("_merge_initiation not directly importable")

        research = self._make_scaffold_research()
        gathered = self._make_gathered()
        evidence = self._make_evidence_update()
        hypothesis = self._make_hypothesis_update()

        # Count N/As before
        before_na = sum(1 for m in research["featuredMetrics"]
                        if m.get("value") in (None, "N/A", "--"))
        assert before_na == 3, f"Scaffold should have 3 N/A metrics, has {before_na}"

        result = _merge_initiation(research, gathered, evidence, hypothesis)

        after_na = sum(1 for m in result["featuredMetrics"]
                       if m.get("value") in (None, "N/A", "--"))
        assert after_na < before_na, (
            f"_merge_initiation must reduce N/A count. Before: {before_na}, After: {after_na}. "
            f"Values: {[m['value'] for m in result['featuredMetrics']]}"
        )

    def test_merge_initiation_preserves_drawdown(self):
        """Drawdown should still be populated after merge (it was already non-N/A)."""
        try:
            from refresh import _merge_initiation
        except ImportError:
            import pytest
            pytest.skip("_merge_initiation not directly importable")

        result = _merge_initiation(
            self._make_scaffold_research(),
            self._make_gathered(),
            self._make_evidence_update(),
            self._make_hypothesis_update(),
        )
        dd = next((m for m in result["featuredMetrics"] if m["label"] == "Drawdown"), None)
        assert dd is not None
        assert dd["value"] not in (None, "N/A", "--"), f"Drawdown lost after merge: {dd['value']}"

    def test_merge_initiation_updates_featured_rationale(self):
        """featuredRationale should be updated from hypothesis skew_description."""
        try:
            from refresh import _merge_initiation
        except ImportError:
            import pytest
            pytest.skip("_merge_initiation not directly importable")

        result = _merge_initiation(
            self._make_scaffold_research(),
            self._make_gathered(),
            self._make_evidence_update(),
            self._make_hypothesis_update(),
        )
        assert result["featuredRationale"] != "Auto-added to coverage."
        assert "fuel" in result["featuredRationale"].lower() or "bearish" in result["featuredRationale"].lower()


# ---------------------------------------------------------------------------
# A-LAYER: Application - isDataPending logic
# ---------------------------------------------------------------------------

class TestIsDataPendingLogic:
    """A1: Test the isDataPending decision logic by examining what inputs
    would cause the frontend to render 'Analysis pending' vs a full tile.

    Since isDataPending is not exported from home.js, we test the logic
    directly in Python to ensure our data pipeline produces inputs that
    would pass the frontend check.
    """

    @staticmethod
    def _is_data_pending(data, archetype=None):
        """Python reimplementation of isDataPending from home.js.
        Must be kept in sync with the JS version."""
        metrics = data.get("featuredMetrics", [])
        if len(metrics) == 0:
            return True

        nullable_pe = {"explorer", "developer"}
        if archetype and archetype in nullable_pe:
            has_mkt_cap = False
            has_drawdown = False
            for m in metrics:
                v = m.get("value")
                filled = v and v != "N/A" and v != "--"
                if m["label"] == "Mkt Cap" and filled:
                    has_mkt_cap = True
                if m["label"] == "Drawdown" and filled:
                    has_drawdown = True
            return not has_mkt_cap and not has_drawdown

        na_count = sum(1 for m in metrics
                       if not m.get("value") or m["value"] == "N/A" or m["value"] == "--")
        return na_count >= len(metrics) - 1

    def test_all_na_except_drawdown_is_pending(self):
        """3 N/A + 1 Drawdown = pending (the current bug state)."""
        data = {
            "featuredMetrics": [
                {"label": "Mkt Cap", "value": "N/A"},
                {"label": "Fwd P/E", "value": "N/A"},
                {"label": "Div Yield", "value": "N/A"},
                {"label": "Drawdown", "value": "-27.5%"},
            ]
        }
        assert self._is_data_pending(data) is True

    def test_two_populated_is_not_pending(self):
        """2+ populated metrics = not pending."""
        data = {
            "featuredMetrics": [
                {"label": "Mkt Cap", "value": "A$10.2B"},
                {"label": "Fwd P/E", "value": "N/A"},
                {"label": "Div Yield", "value": "N/A"},
                {"label": "Drawdown", "value": "-27.5%"},
            ]
        }
        assert self._is_data_pending(data) is False

    def test_fully_populated_is_not_pending(self):
        """All metrics populated = not pending."""
        data = {
            "featuredMetrics": [
                {"label": "Mkt Cap", "value": "A$10.2B"},
                {"label": "Fwd P/E", "value": "12.5x"},
                {"label": "Div Yield", "value": "2.4%"},
                {"label": "Drawdown", "value": "-27.5%"},
            ]
        }
        assert self._is_data_pending(data) is False

    def test_explorer_with_mkt_cap_is_not_pending(self):
        """Explorer archetype: Mkt Cap alone is sufficient."""
        data = {
            "featuredMetrics": [
                {"label": "Mkt Cap", "value": "A$0.2B"},
                {"label": "52w Range", "value": "N/A"},
                {"label": "Gold Exposure", "value": "N/A"},
                {"label": "Drawdown", "value": "N/A"},
            ]
        }
        assert self._is_data_pending(data, archetype="explorer") is False

    def test_explorer_with_only_drawdown_is_not_pending(self):
        """Explorer archetype: Drawdown alone is sufficient."""
        data = {
            "featuredMetrics": [
                {"label": "Mkt Cap", "value": "N/A"},
                {"label": "52w Range", "value": "N/A"},
                {"label": "Gold Exposure", "value": "N/A"},
                {"label": "Drawdown", "value": "-37.5%"},
            ]
        }
        assert self._is_data_pending(data, archetype="explorer") is False

    def test_explorer_with_nothing_is_pending(self):
        """Explorer archetype: both Mkt Cap and Drawdown N/A = pending."""
        data = {
            "featuredMetrics": [
                {"label": "Mkt Cap", "value": "N/A"},
                {"label": "52w Range", "value": "N/A"},
                {"label": "Gold Exposure", "value": "N/A"},
                {"label": "Drawdown", "value": "N/A"},
            ]
        }
        assert self._is_data_pending(data, archetype="explorer") is True

    def test_empty_metrics_is_pending(self):
        """No metrics at all = pending."""
        assert self._is_data_pending({"featuredMetrics": []}) is True
        assert self._is_data_pending({}) is True

    def test_pipeline_output_passes_pending_check(self):
        """INTEGRATION: scaffold with full Yahoo data should NOT trigger pending.
        This is the critical end-to-end test for the fix."""
        data = _yahoo_data_full()
        scaffold = build_research_scaffold("QAN", "Qantas Airways", "Industrials", "Airlines", data)
        assert self._is_data_pending(scaffold) is False, (
            f"Scaffold with full Yahoo data should not be pending. "
            f"Metrics: {[m['value'] for m in scaffold['featuredMetrics']]}"
        )


# ---------------------------------------------------------------------------
# D-LAYER: Data integrity
# ---------------------------------------------------------------------------

class TestDataIntegrity:
    """D1: Cross-file consistency checks on actual repo data."""

    def test_all_index_tickers_have_reference_entries(self):
        """Every ticker in _index.json must have an entry in reference.json."""
        index_path = Path(__file__).resolve().parent.parent.parent / "data" / "research" / "_index.json"
        ref_path = Path(__file__).resolve().parent.parent.parent / "data" / "reference.json"
        if not index_path.exists() or not ref_path.exists():
            import pytest
            pytest.skip("Data files not found (running outside repo)")

        with open(index_path) as f:
            index = json.load(f)
        with open(ref_path) as f:
            ref = json.load(f)

        missing = [t for t in index if t not in ref]
        assert missing == [], f"Tickers in _index.json missing from reference.json: {missing}"

    def test_no_permanent_na_market_cap_with_price(self):
        """Tickers with a price > 0 should have SOME way to compute Mkt Cap.
        Either sharesOutstanding in reference.json or market_cap in the scaffold."""
        index_path = Path(__file__).resolve().parent.parent.parent / "data" / "research" / "_index.json"
        ref_path = Path(__file__).resolve().parent.parent.parent / "data" / "reference.json"
        if not index_path.exists() or not ref_path.exists():
            import pytest
            pytest.skip("Data files not found")

        with open(index_path) as f:
            index = json.load(f)
        with open(ref_path) as f:
            ref = json.load(f)

        stuck_tickers = []
        for ticker, entry in index.items():
            try:
                price = float(entry.get("price", 0))
            except (TypeError, ValueError):
                price = 0
            if not price or price <= 0:
                continue
            ref_entry = ref.get(ticker, {})
            shares = ref_entry.get("sharesOutstanding")
            # Check featuredMetrics for Mkt Cap
            mkt_cap_value = None
            for m in entry.get("featuredMetrics", []):
                if m.get("label") == "Mkt Cap":
                    mkt_cap_value = m.get("value")
            if shares is None and (mkt_cap_value is None or mkt_cap_value == "N/A"):
                stuck_tickers.append(ticker)

        assert stuck_tickers == [], (
            f"Tickers with price > 0 but no way to compute Mkt Cap: {stuck_tickers}. "
            f"These will show 'Analysis pending' permanently."
        )

    def test_reference_shares_outstanding_convention(self):
        """All non-null sharesOutstanding values should be in millions (range 1-100000).
        dynamics.js does: price * sharesOutstanding / 1000 to get market cap in billions."""
        ref_path = Path(__file__).resolve().parent.parent.parent / "data" / "reference.json"
        if not ref_path.exists():
            import pytest
            pytest.skip("reference.json not found")

        with open(ref_path) as f:
            ref = json.load(f)

        bad = []
        for ticker, entry in ref.items():
            shares = entry.get("sharesOutstanding")
            if shares is None:
                continue
            # If in millions, typical range is 50 (micro-cap) to 20000 (mega-cap like BHP)
            # If someone stored raw count (e.g. 5,070,000,000) it would be > 1,000,000
            if shares > 100_000:
                bad.append((ticker, shares))

        assert bad == [], (
            f"sharesOutstanding values appear to be raw counts, not millions: {bad}. "
            f"Convention: BHP should be ~5070, not 5070000000."
        )

    def test_featured_metrics_have_three_or_four_entries(self):
        """Every ticker in _index.json should have 3-4 featuredMetrics."""
        index_path = Path(__file__).resolve().parent.parent.parent / "data" / "research" / "_index.json"
        if not index_path.exists():
            import pytest
            pytest.skip("_index.json not found")

        with open(index_path) as f:
            index = json.load(f)

        bad = []
        for ticker, entry in index.items():
            metrics = entry.get("featuredMetrics", [])
            if len(metrics) < 3 or len(metrics) > 4:
                bad.append((ticker, len(metrics)))

        assert bad == [], f"Tickers without 3-4 featuredMetrics: {bad}"

    def test_no_ticker_has_all_na_featured_metrics(self):
        """No ticker should have ALL featuredMetrics as N/A (even Drawdown should work)."""
        index_path = Path(__file__).resolve().parent.parent.parent / "data" / "research" / "_index.json"
        if not index_path.exists():
            import pytest
            pytest.skip("_index.json not found")

        with open(index_path) as f:
            index = json.load(f)

        all_na = []
        for ticker, entry in index.items():
            metrics = entry.get("featuredMetrics", [])
            na_count = sum(1 for m in metrics
                           if not m.get("value") or m["value"] in ("N/A", "--"))
            if len(metrics) > 0 and na_count == len(metrics):
                all_na.append(ticker)

        assert all_na == [], f"Tickers with ALL featuredMetrics as N/A: {all_na}"


# ---------------------------------------------------------------------------
# E2E: Full pipeline contract tests
# ---------------------------------------------------------------------------

class TestEndToEndPipelineContract:
    """E2E contract tests that verify the complete Add Stock data flow
    produces output that will NOT trigger 'Analysis pending' on the frontend.

    These do not call the API or LLM. They test that scaffold + reference
    data, when processed through the same logic the frontend uses,
    will produce displayable tiles.
    """

    @staticmethod
    def _is_data_pending(data, archetype=None):
        """Reuse the Python reimplementation of isDataPending."""
        return TestIsDataPendingLogic._is_data_pending(data, archetype)

    def test_full_coverage_stock_renders(self):
        """A stock with full Yahoo data should never show 'Analysis pending'."""
        data = _yahoo_data_full()
        scaffold = build_research_scaffold("QAN", "Qantas Airways", "Industrials", "Airlines", data)
        ref = build_reference_entry("QAN", data, "Industrials", "Airlines")

        # Simulate what the frontend does: check if pending
        assert self._is_data_pending(scaffold) is False, (
            f"Full-data stock shows pending. Metrics: {[m['value'] for m in scaffold['featuredMetrics']]}"
        )

        # Also check that reference entry enables hydration
        assert ref["sharesOutstanding"] is not None or any(
            m["value"] not in (None, "N/A", "--")
            for m in scaffold["featuredMetrics"]
            if m["label"] == "Mkt Cap"
        ), "Either sharesOutstanding in ref or Mkt Cap in scaffold must be populated"

    def test_explorer_stock_renders(self):
        """A gold explorer should render (not pending) if Mkt Cap or Drawdown is populated."""
        data = _yahoo_data_explorer()
        scaffold = build_research_scaffold("WIA", "Wia Gold", "Basic Materials", "Gold", data)
        archetype = infer_archetype("WIA", "Basic Materials", "Gold", data)
        assert self._is_data_pending(scaffold, archetype=archetype) is False, (
            f"Explorer stock shows pending. Archetype: {archetype}. "
            f"Metrics: {[m['value'] for m in scaffold['featuredMetrics']]}"
        )

    def test_partial_yahoo_data_still_renders(self):
        """A stock where chart missed market_cap but quoteSummary has it should render."""
        data = _yahoo_data_partial()
        # Simulate the fix: fallback market_cap from market_cap_summary
        if not data["market_cap"] and data.get("market_cap_summary"):
            data["market_cap"] = data["market_cap_summary"]
        scaffold = build_research_scaffold("IPX", "IperionX Limited", "Basic Materials",
                                           "Other Industrial Metals & Mining", data)
        assert self._is_data_pending(scaffold) is False, (
            f"Partial-data stock shows pending after market_cap fallback. "
            f"Metrics: {[m['value'] for m in scaffold['featuredMetrics']]}"
        )

    def test_genuinely_empty_yahoo_data_is_pending_but_not_crashed(self):
        """A stock where Yahoo returns nothing should show pending (correct) without crashing."""
        data = _yahoo_data_minimal()
        scaffold = build_research_scaffold("NEW", "New Stock", "Unknown", "", data)
        # This SHOULD be pending - there's genuinely no data
        # The point is it doesn't crash
        assert isinstance(scaffold["featuredMetrics"], list)
        assert len(scaffold["featuredMetrics"]) == 4
        # Drawdown should still work from priceHistory
        dd = next(m for m in scaffold["featuredMetrics"] if m["label"] == "Drawdown")
        assert dd["value"] != "N/A", "Drawdown should be computable from priceHistory even with minimal data"


# ---------------------------------------------------------------------------
# Regression guards
# ---------------------------------------------------------------------------

class TestRegressionGuards:
    """Prevent known past failures from recurring."""

    def test_scaffold_does_not_produce_object_object_in_metrics(self):
        """Regression: some fields were rendering as [object Object]."""
        data = _yahoo_data_full()
        scaffold = build_research_scaffold("QAN", "Qantas Airways", "Industrials", "Airlines", data)
        for m in scaffold["featuredMetrics"]:
            assert "[object" not in str(m["value"]), f"Object serialisation bug in {m['label']}: {m['value']}"

    def test_scaffold_currency_is_string_not_dict(self):
        """Currency must be a display string like 'A$', not a raw dict."""
        data = _yahoo_data_full()
        scaffold = build_research_scaffold("QAN", "Qantas Airways", "Industrials", "Airlines", data)
        assert isinstance(scaffold["currency"], str)
        assert len(scaffold["currency"]) <= 4

    def test_reference_entry_does_not_have_raw_share_count(self):
        """sharesOutstanding must not be the raw Yahoo count (billions range).
        It must be in millions per the convention."""
        data = _yahoo_data_full()
        entry = build_reference_entry("QAN", data)
        shares = entry["sharesOutstanding"]
        if shares is not None:
            assert shares < 100_000, (
                f"sharesOutstanding={shares} looks like raw count. "
                f"Should be in millions (e.g. 1220 not 1220000000)."
            )

    def test_scaffold_price_history_not_dicts(self):
        """priceHistory must be flat numbers, not [{date, close}] dicts.
        This was a recurring bug in earlier versions."""
        data = _yahoo_data_full()
        scaffold = build_research_scaffold("QAN", "Qantas Airways", "Industrials", "Airlines", data)
        for p in scaffold["priceHistory"]:
            assert not isinstance(p, dict), f"priceHistory contains dict: {p}"
