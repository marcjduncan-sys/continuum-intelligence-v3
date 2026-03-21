"""
PM prompt builder and context assembler tests (Phase D).

Tests the deterministic parts of Phase D:
- Constitution text generation
- Context assembly
- Safe-failure logic
- Prompt construction for various portfolio states

Does NOT test LLM output (that requires the eval pack).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pm_constitution import (
    build_constitution_text,
    CONVICTION_SIZE_LADDER,
    SOURCE_OF_FUNDS_HIERARCHY,
    RECOMMENDATION_TYPES,
    RISK_FLAG_TAXONOMY,
    RECOMMENDATION_SCHEMA,
)
from pm_context import (
    build_portfolio_context,
    build_analyst_context,
    build_safe_failure_context,
    snapshot_staleness_days,
    staleness_warning,
)
from pm_prompt_builder import build_pm_system_prompt


# =====================================================================
# Constitution
# =====================================================================

class TestConstitution:

    def test_constitution_contains_position_limits(self):
        text = build_constitution_text()
        assert "15%" in text
        assert "50%" in text
        assert "35%" in text

    def test_constitution_contains_conviction_ladder(self):
        text = build_constitution_text()
        for rung in CONVICTION_SIZE_LADDER:
            assert rung["conviction"] in text

    def test_constitution_contains_source_of_funds(self):
        text = build_constitution_text()
        assert "source" in text.lower() or "Source" in text

    def test_constitution_contains_when_to_do_nothing(self):
        text = build_constitution_text()
        assert "No Action" in text or "no action" in text

    def test_constitution_contains_recommendation_schema(self):
        text = build_constitution_text()
        for key in RECOMMENDATION_SCHEMA:
            assert key in text

    def test_custom_thresholds_reflected(self):
        text = build_constitution_text({"max_single_position": 0.20})
        assert "20%" in text

    def test_conviction_ladder_has_five_rungs(self):
        assert len(CONVICTION_SIZE_LADDER) == 5

    def test_source_of_funds_has_six_steps(self):
        assert len(SOURCE_OF_FUNDS_HIERARCHY) == 6

    def test_risk_flag_taxonomy_covers_all_codes(self):
        expected = {"HIGH_SINGLE_NAME", "HIGH_TOP5", "HIGH_TOP10",
                    "HIGH_SECTOR", "LOW_CASH", "HIGH_CASH", "UNMAPPED_SECTOR"}
        assert set(RISK_FLAG_TAXONOMY.keys()) == expected


# =====================================================================
# Context assembly
# =====================================================================

def _mock_portfolio_state():
    """Portfolio state matching the diversified test case from analytics tests."""
    return {
        "portfolio_id": "test-id",
        "snapshot_id": "snap-id",
        "as_of_date": "2026-03-21",
        "total_value": 110000,
        "cash_value": 9000,
        "cash_weight": 0.081818,
        "holdings": [
            {"ticker": "CBA", "weight": 0.218182, "market_value": 24000, "sector": "Financials"},
            {"ticker": "BHP", "weight": 0.136364, "market_value": 15000, "sector": "Materials"},
        ],
        "sector_exposure": {"Financials": 0.422, "Materials": 0.202},
        "concentration_flags": [],
        "analytics": {
            "position_count": 10,
            "concentration": {
                "max_single_weight": 0.218182,
                "top5_weight": 0.686364,
                "top10_weight": 0.918182,
                "hhi": 0.12,
            },
            "concentration_score": 35.2,
            "holdings_with_weights": [
                {"ticker": "CBA", "weight": 0.218, "market_value": 24000, "sector": "Financials"},
                {"ticker": "BHP", "weight": 0.136, "market_value": 15000, "sector": "Materials"},
            ],
            "sector_exposure": {"Financials": 0.422, "Materials": 0.202},
            "theme_exposure": {"Financial": 0.422, "Cyclical": 0.202},
            "top_positions": [
                {"ticker": "CBA", "weight": 0.218, "market_value": 24000, "sector": "Financials"},
            ],
            "flags": [
                {"code": "HIGH_SINGLE_NAME", "severity": "warning",
                 "message": "CBA is 21.8% of the portfolio. Threshold is 15%."},
            ],
        },
    }


class TestContextAssembly:

    def test_portfolio_context_contains_holdings(self):
        ctx = build_portfolio_context(_mock_portfolio_state())
        assert "CBA" in ctx
        assert "BHP" in ctx

    def test_portfolio_context_contains_sector_exposure(self):
        ctx = build_portfolio_context(_mock_portfolio_state())
        assert "Financials" in ctx

    def test_portfolio_context_contains_flags(self):
        ctx = build_portfolio_context(_mock_portfolio_state())
        assert "HIGH_SINGLE_NAME" in ctx or "21.8%" in ctx

    def test_portfolio_context_contains_concentration(self):
        ctx = build_portfolio_context(_mock_portfolio_state())
        assert "Concentration" in ctx

    def test_analyst_context_with_summary(self):
        ctx = build_analyst_context("CBA", "CBA is well-positioned...")
        assert "CBA" in ctx
        assert "well-positioned" in ctx
        assert "Analyst" in ctx

    def test_analyst_context_without_summary(self):
        ctx = build_analyst_context("CBA", None)
        assert "No Analyst summary" in ctx
        assert "CBA" in ctx


# =====================================================================
# Safe-failure logic
# =====================================================================

class TestSafeFailure:

    def test_no_portfolio(self):
        ctx = build_safe_failure_context(has_portfolio=False, has_snapshot=False)
        assert "NO PORTFOLIO" in ctx
        assert "create or load" in ctx.lower()

    def test_no_snapshot(self):
        ctx = build_safe_failure_context(has_portfolio=True, has_snapshot=False)
        assert "NO SNAPSHOT" in ctx

    def test_stale_snapshot(self):
        ctx = build_safe_failure_context(
            has_portfolio=True, has_snapshot=True, stale_days=10
        )
        assert "10 days old" in ctx
        assert "stale" in ctx.lower()

    def test_unmapped_sectors(self):
        ctx = build_safe_failure_context(
            has_portfolio=True, has_snapshot=True,
            unmapped_count=3, total_positions=10
        )
        assert "3 holdings" in ctx
        assert "sector" in ctx.lower()

    def test_zero_holdings(self):
        ctx = build_safe_failure_context(
            has_portfolio=True, has_snapshot=True, total_positions=0
        )
        assert "zero holdings" in ctx.lower() or "all cash" in ctx.lower()

    def test_all_clear_returns_none(self):
        ctx = build_safe_failure_context(
            has_portfolio=True, has_snapshot=True,
            stale_days=1, unmapped_count=0, total_positions=10
        )
        assert ctx is None


# =====================================================================
# Staleness
# =====================================================================

class TestStaleness:

    def test_fresh_no_warning(self):
        assert staleness_warning(0) is None
        assert staleness_warning(1) is None

    def test_mild_staleness(self):
        w = staleness_warning(3)
        assert w is not None
        assert "3 days" in w

    def test_severe_staleness(self):
        w = staleness_warning(10)
        assert "WARNING" in w
        assert "10 days" in w


# =====================================================================
# Full prompt builder
# =====================================================================

class TestPromptBuilder:

    def test_no_portfolio_prompt(self):
        """PM prompt without portfolio still has identity and constitution."""
        prompt = build_pm_system_prompt()
        assert "portfolio manager" in prompt.lower()
        assert "CONSTITUTION" in prompt
        assert "NO PORTFOLIO" in prompt

    def test_with_portfolio_prompt(self):
        """PM prompt with portfolio includes holdings and flags."""
        state = _mock_portfolio_state()
        prompt = build_pm_system_prompt(portfolio_state=state)
        assert "CBA" in prompt
        assert "CONSTITUTION" in prompt
        assert "21.8%" in prompt or "HIGH_SINGLE_NAME" in prompt

    def test_with_candidate_security(self):
        """Candidate security adds source-of-funds framing."""
        state = _mock_portfolio_state()
        prompt = build_pm_system_prompt(
            portfolio_state=state,
            candidate_security="WOR",
        )
        assert "WOR" in prompt
        assert "CANDIDATE" in prompt

    def test_with_analyst_summary(self):
        """Analyst summary injected when selected_ticker provided."""
        state = _mock_portfolio_state()
        prompt = build_pm_system_prompt(
            portfolio_state=state,
            selected_ticker="CBA",
            analyst_summary="CBA has strong franchise value.",
        )
        assert "strong franchise" in prompt
        assert "ANALYST SUMMARY" in prompt

    def test_prompt_contains_voice_rules(self):
        prompt = build_pm_system_prompt()
        assert "sizing ranges" in prompt.lower() or "sizing range" in prompt.lower()

    def test_prompt_contains_conviction_ladder(self):
        prompt = build_pm_system_prompt()
        assert "Highest" in prompt
        assert "4-6%" in prompt
