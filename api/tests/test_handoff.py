"""
Phase F: Analyst-to-PM Handoff tests.

Tests cover:
  - Analyst summary assembly logic
  - Handoff payload structure
  - Decision basis extensions (analyst_summary_version, analyst_coverage_state)
  - Handoff DB helpers (pool-None guards, identity-None guards)
  - Coverage state assessment
  - PM prompt injection from handoff payload
  - Eval scenario coverage
"""

import hashlib
import json
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch, MagicMock


# ---------------------------------------------------------------------------
# Test: Analyst summary assembly
# ---------------------------------------------------------------------------

class TestAnalystSummaryAssembly:
    """Tests for handoff.build_analyst_summary() and its helpers."""

    def test_summary_version_empty(self):
        from handoff import _compute_summary_version
        assert _compute_summary_version([]) == "empty"

    def test_summary_version_deterministic(self):
        from handoff import _compute_summary_version
        memories = [
            {"id": "aaa", "updated_at": "2025-01-01T00:00:00Z"},
            {"id": "bbb", "updated_at": "2025-01-02T00:00:00Z"},
        ]
        v1 = _compute_summary_version(memories)
        v2 = _compute_summary_version(memories)
        assert v1 == v2
        assert len(v1) == 10

    def test_summary_version_changes_with_different_memories(self):
        from handoff import _compute_summary_version
        m1 = [{"id": "aaa", "updated_at": "2025-01-01T00:00:00Z"}]
        m2 = [{"id": "bbb", "updated_at": "2025-01-01T00:00:00Z"}]
        assert _compute_summary_version(m1) != _compute_summary_version(m2)

    def test_extract_conviction_no_memories(self):
        from handoff import _extract_conviction
        assert _extract_conviction([]) == "none"

    def test_extract_conviction_high_tag(self):
        from handoff import _extract_conviction
        memories = [{"tags": ["high-conviction"], "confidence": 0.9}]
        assert _extract_conviction(memories) == "high"

    def test_extract_conviction_from_confidence(self):
        from handoff import _extract_conviction
        memories = [
            {"tags": [], "confidence": 0.85},
            {"tags": [], "confidence": 0.90},
        ]
        assert _extract_conviction(memories) == "high"

    def test_extract_conviction_low_confidence(self):
        from handoff import _extract_conviction
        memories = [{"tags": [], "confidence": 0.3}]
        assert _extract_conviction(memories) == "low"

    def test_extract_valuation_undervalued(self):
        from handoff import _extract_valuation_stance
        memories = [{"content": "Stock appears undervalued at 5x EV/EBITDA"}]
        assert _extract_valuation_stance(memories) == "undervalued"

    def test_extract_valuation_overvalued(self):
        from handoff import _extract_valuation_stance
        memories = [{"content": "Currently overvalued relative to peers"}]
        assert _extract_valuation_stance(memories) == "overvalued"

    def test_extract_valuation_fair(self):
        from handoff import _extract_valuation_stance
        memories = [{"content": "Trading at fair value based on DCF"}]
        assert _extract_valuation_stance(memories) == "fair"

    def test_extract_valuation_unknown(self):
        from handoff import _extract_valuation_stance
        memories = [{"content": "Iron ore outlook positive"}]
        assert _extract_valuation_stance(memories) == "unknown"

    def test_extract_risks(self):
        from handoff import _extract_risks
        memories = [
            {"tags": ["risk"], "content": "China demand slowdown", "insight_type": None},
            {"tags": ["bear-case"], "content": "Commodity price volatility", "insight_type": None},
            {"tags": ["growth"], "content": "Not a risk", "insight_type": None},
        ]
        risks = _extract_risks(memories)
        assert len(risks) == 2
        assert "China demand slowdown" in risks

    def test_extract_risks_max_5(self):
        from handoff import _extract_risks
        memories = [
            {"tags": ["risk"], "content": f"Risk {i}", "insight_type": None}
            for i in range(10)
        ]
        assert len(_extract_risks(memories)) == 5

    def test_extract_tripwires(self):
        from handoff import _extract_tripwires
        memories = [
            {"tags": ["tripwire"], "content": "Iron ore below US$80/t"},
            {"tags": ["growth"], "content": "Not a tripwire"},
        ]
        trips = _extract_tripwires(memories)
        assert len(trips) == 1
        assert "Iron ore below US$80/t" in trips

    def test_build_summary_text_no_memories(self):
        from handoff import _build_summary_text
        text = _build_summary_text([], "BHP")
        assert "No Analyst coverage" in text

    def test_build_summary_text_with_memories(self):
        from handoff import _build_summary_text
        memories = [
            {"memory_type": "structural", "content": "Strong franchise"},
            {"memory_type": "positional", "content": "Currently underweight"},
            {"memory_type": "tactical", "content": "Earnings next week"},
        ]
        text = _build_summary_text(memories, "BHP")
        assert "Strong franchise" in text
        assert "Currently underweight" in text
        assert "Earnings next week" in text


# ---------------------------------------------------------------------------
# Test: Coverage state assessment
# ---------------------------------------------------------------------------

class TestCoverageState:
    """Tests for _assess_coverage_state."""

    def test_no_memories_returns_not_covered(self):
        from handoff import _assess_coverage_state
        assert _assess_coverage_state([]) == "not_covered"

    def test_fresh_memories_returns_covered(self):
        from handoff import _assess_coverage_state
        now = datetime.now(timezone.utc).isoformat()
        memories = [{"updated_at": now}]
        assert _assess_coverage_state(memories) == "covered"

    def test_old_memories_returns_stale(self):
        from handoff import _assess_coverage_state
        old = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
        memories = [{"updated_at": old}]
        assert _assess_coverage_state(memories, staleness_days=30) == "stale"

    def test_custom_staleness_threshold(self):
        from handoff import _assess_coverage_state
        recent = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        # Fresh with 30-day threshold
        assert _assess_coverage_state([{"updated_at": recent}], staleness_days=30) == "covered"
        # Stale with 3-day threshold
        assert _assess_coverage_state([{"updated_at": recent}], staleness_days=3) == "stale"


# ---------------------------------------------------------------------------
# Test: Handoff payload structure
# ---------------------------------------------------------------------------

class TestHandoffPayload:
    """Tests for the handoff payload format."""

    @pytest.mark.asyncio
    async def test_build_analyst_summary_no_pool(self):
        from handoff import build_analyst_summary
        result = await build_analyst_summary(None, ticker="BHP")
        assert result["ticker"] == "BHP"
        assert result["coverage_state"] == "not_covered"
        assert result["conviction_level"] == "none"
        assert result["summary_version"] == "empty"

    @pytest.mark.asyncio
    async def test_build_analyst_summary_no_identity(self):
        from handoff import build_analyst_summary
        pool = MagicMock()
        result = await build_analyst_summary(pool, ticker="BHP")
        assert result["coverage_state"] == "not_covered"

    @pytest.mark.asyncio
    async def test_payload_has_all_required_fields(self):
        """Verify the handoff payload schema matches Phase F spec."""
        required_fields = {
            "ticker", "analyst_summary_text", "conviction_level",
            "valuation_stance", "key_risks", "tripwires",
            "coverage_state", "timestamp", "summary_version",
        }
        from handoff import build_analyst_summary
        result = await build_analyst_summary(None, ticker="TEST")
        assert set(result.keys()) == required_fields

    @pytest.mark.asyncio
    async def test_payload_ticker_uppercased(self):
        from handoff import build_analyst_summary
        result = await build_analyst_summary(None, ticker="bhp")
        assert result["ticker"] == "BHP"


# ---------------------------------------------------------------------------
# Test: Decision basis extensions (Phase F)
# ---------------------------------------------------------------------------

class TestDecisionBasisPhaseF:
    """Tests for Phase F extensions to decision_basis."""

    def test_decision_basis_version_f1(self):
        from pm_memory_extractor import build_decision_basis
        basis = build_decision_basis()
        assert basis["version"] == "F.1"

    def test_decision_basis_has_analyst_fields(self):
        from pm_memory_extractor import build_decision_basis
        basis = build_decision_basis(
            analyst_summary_version="abc123",
            analyst_coverage_state="covered",
        )
        assert basis["analyst_summary_version"] == "abc123"
        assert basis["analyst_coverage_state"] == "covered"

    def test_decision_basis_analyst_fields_default_none(self):
        from pm_memory_extractor import build_decision_basis
        basis = build_decision_basis()
        assert basis["analyst_summary_version"] is None
        assert basis["analyst_coverage_state"] is None

    def test_decision_basis_all_fields_present(self):
        from pm_memory_extractor import build_decision_basis
        basis = build_decision_basis(
            snapshot_id="snap1",
            alignment_score=0.75,
            breach_codes=["POSITION_BREACH"],
            uncovered_count=2,
            related_tickers=["BHP"],
            mandate_hash="ab12cd34",
            analyst_summary_version="v1",
            analyst_coverage_state="stale",
        )
        assert basis["snapshot_id"] == "snap1"
        assert basis["alignment_score"] == 0.75
        assert basis["breach_codes"] == ["POSITION_BREACH"]
        assert basis["uncovered_count"] == 2
        assert basis["related_tickers"] == ["BHP"]
        assert basis["mandate_hash"] == "ab12cd34"
        assert basis["analyst_summary_version"] == "v1"
        assert basis["analyst_coverage_state"] == "stale"
        assert basis["version"] == "F.1"


# ---------------------------------------------------------------------------
# Test: Handoff DB helpers (pool-None and identity-None guards)
# ---------------------------------------------------------------------------

class TestHandoffDBGuards:
    """Test that handoff DB functions handle None pool/identity gracefully."""

    @pytest.mark.asyncio
    async def test_log_handoff_no_pool(self):
        from handoff import log_handoff
        result = await log_handoff(
            None, source_role="analyst", destination_role="pm",
            ticker="BHP", summary_payload={}, user_id="u1",
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_log_handoff_no_identity(self):
        from handoff import log_handoff
        pool = MagicMock()
        result = await log_handoff(
            pool, source_role="analyst", destination_role="pm",
            ticker="BHP", summary_payload={},
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_get_handoffs_no_pool(self):
        from handoff import get_handoffs
        result = await get_handoffs(None, user_id="u1")
        assert result == []

    @pytest.mark.asyncio
    async def test_get_handoffs_no_identity(self):
        from handoff import get_handoffs
        pool = MagicMock()
        result = await get_handoffs(pool)
        assert result == []

    @pytest.mark.asyncio
    async def test_get_latest_handoff_no_results(self):
        from handoff import get_latest_handoff
        result = await get_latest_handoff(
            None, ticker="BHP", user_id="u1",
        )
        assert result is None


# ---------------------------------------------------------------------------
# Test: PM context builder with handoff payload
# ---------------------------------------------------------------------------

class TestPMContextHandoff:
    """Tests for build_analyst_context with handoff payload dict."""

    def test_plain_string_still_works(self):
        from pm_context import build_analyst_context
        text = build_analyst_context("BHP", "Simple summary text")
        assert "ANALYST SUMMARY: BHP" in text
        assert "Simple summary text" in text

    def test_none_shows_no_coverage(self):
        from pm_context import build_analyst_context
        text = build_analyst_context("BHP", None)
        assert "No Analyst summary available" in text

    def test_dict_payload_covered(self):
        from pm_context import build_analyst_context
        payload = {
            "ticker": "BHP",
            "analyst_summary_text": "High conviction. Undervalued.",
            "conviction_level": "high",
            "valuation_stance": "undervalued",
            "key_risks": ["China slowdown"],
            "tripwires": ["Iron ore below 80"],
            "coverage_state": "covered",
            "summary_version": "abc",
            "timestamp": "2025-01-01T00:00:00Z",
        }
        text = build_analyst_context("BHP", payload)
        assert "ANALYST SUMMARY: BHP" in text
        assert "Conviction: high" in text
        assert "Valuation stance: undervalued" in text
        assert "China slowdown" in text
        assert "Iron ore below 80" in text
        assert "handoff" in text.lower()

    def test_dict_payload_not_covered(self):
        from pm_context import build_analyst_context
        payload = {
            "coverage_state": "not_covered",
            "analyst_summary_text": "",
        }
        text = build_analyst_context("XYZ", payload)
        assert "NOT COVERED" in text
        assert "XYZ" in text

    def test_dict_payload_stale(self):
        from pm_context import build_analyst_context
        payload = {
            "coverage_state": "stale",
            "analyst_summary_text": "Old research",
            "conviction_level": "medium",
            "valuation_stance": "fair",
            "key_risks": [],
            "tripwires": [],
            "summary_version": "old",
            "timestamp": "2025-01-01T00:00:00Z",
        }
        text = build_analyst_context("BHP", payload)
        assert "STALE" in text
        assert "Verify before relying" in text


# ---------------------------------------------------------------------------
# Test: Eval scenario coverage (Phase F)
# ---------------------------------------------------------------------------

class TestPhaseFFEvalCoverage:
    """Verify Phase F eval scenarios are present and well-formed."""

    def test_total_scenario_count(self):
        from tests.pm_eval_pack import EVAL_SCENARIOS
        assert len(EVAL_SCENARIOS) == 24

    def test_phase_f_scenarios_exist(self):
        from tests.pm_eval_pack import list_scenarios
        names = list_scenarios()
        phase_f_names = [
            "handoff_covered_stock",
            "handoff_uncovered_stock",
            "handoff_stale_analyst_summary",
            "handoff_missing_analyst_record",
            "handoff_no_duplicate_clutter",
            "handoff_recommendation_changes",
        ]
        for name in phase_f_names:
            assert name in names, f"Missing Phase F eval: {name}"

    def test_phase_f_scenarios_have_analyst_summary(self):
        """Phase F scenarios should have analyst_summary field."""
        from tests.pm_eval_pack import EVAL_SCENARIOS
        phase_f = [s for s in EVAL_SCENARIOS if s["name"].startswith("handoff_")]
        assert len(phase_f) == 6
        for s in phase_f:
            assert "analyst_summary" in s, f"{s['name']} missing analyst_summary field"

    def test_all_scenarios_have_required_fields(self):
        from tests.pm_eval_pack import EVAL_SCENARIOS
        required = {"name", "portfolio", "question", "expected_behaviours", "anti_behaviours"}
        for s in EVAL_SCENARIOS:
            missing = required - set(s.keys())
            assert not missing, f"Scenario {s['name']} missing: {missing}"
