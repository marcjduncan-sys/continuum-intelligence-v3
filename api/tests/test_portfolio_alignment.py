"""
Tests for portfolio_alignment.py (Phase D0.4).

Tests alignment classification, hypothesis DNA, hedge gaps, reweighting
suggestions, and change detection.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from portfolio_alignment import (
    classify_alignment,
    _parse_score,
    parse_hypotheses,
    resolve_skew,
    compute_hypothesis_dna,
    compute_hedge_gaps,
    compute_reweighting_deltas,
    detect_changes,
    compute_alignment,
)


# ---------------------------------------------------------------------------
# classify_alignment
# ---------------------------------------------------------------------------

class TestClassifyAlignment:
    def test_long_upside_aligned(self):
        result = classify_alignment("long", "upside")
        assert result["label"] == "Aligned"
        assert result["cls"] == "aligned"

    def test_long_downside_contradicts(self):
        result = classify_alignment("long", "downside")
        assert result["label"] == "Contradictory"
        assert result["cls"] == "contradicts"

    def test_long_balanced_neutral(self):
        result = classify_alignment("long", "balanced")
        assert result["label"] == "Neutral"
        assert result["cls"] == "neutral"

    def test_short_downside_aligned(self):
        result = classify_alignment("short", "downside")
        assert result["label"] == "Aligned"
        assert result["cls"] == "aligned"

    def test_short_upside_contradicts(self):
        result = classify_alignment("short", "upside")
        assert result["label"] == "Contradictory"
        assert result["cls"] == "contradicts"

    def test_no_evidence(self):
        result = classify_alignment("long", "")
        assert result["cls"] == "not-covered"

    def test_none_evidence(self):
        result = classify_alignment("long", "none")
        assert result["cls"] == "not-covered"


# ---------------------------------------------------------------------------
# _parse_score
# ---------------------------------------------------------------------------

class TestParseScore:
    def test_percentage_string(self):
        assert _parse_score("40%") == 0.40

    def test_integer(self):
        assert _parse_score(40) == 0.40

    def test_decimal(self):
        assert _parse_score(0.40) == 0.40

    def test_invalid_string(self):
        assert _parse_score("N/A") == 0.0


# ---------------------------------------------------------------------------
# resolve_skew
# ---------------------------------------------------------------------------

class TestResolveSkew:
    def test_computed_skew_preferred(self):
        research = {
            "_skew": {"direction": "upside", "score": 60},
            "skew": {"direction": "downside", "rationale": "test"},
        }
        result = resolve_skew(research)
        assert result["direction"] == "upside"
        assert result["source"] == "computed"

    def test_fallback_to_raw(self):
        research = {"skew": {"direction": "downside", "rationale": "bear case"}}
        result = resolve_skew(research)
        assert result["direction"] == "downside"
        assert result["source"] == "raw"

    def test_no_skew(self):
        result = resolve_skew({})
        assert result["direction"] == "balanced"
        assert result["source"] == "none"


# ---------------------------------------------------------------------------
# compute_hypothesis_dna
# ---------------------------------------------------------------------------

class TestHypothesisDNA:
    def test_basic_dna(self):
        holdings = [
            {
                "weight": 0.30,
                "hypotheses": [
                    {"tier": "n1", "direction": "upside", "score": 0.60},
                    {"tier": "n2", "direction": "downside", "score": 0.40},
                ],
            },
            {
                "weight": 0.20,
                "hypotheses": [
                    {"tier": "n1", "direction": "upside", "score": 0.70},
                ],
            },
        ]
        dna = compute_hypothesis_dna(holdings)
        assert dna["total_covered_weight"] == 0.50
        assert dna["upside_exposure"] > 0
        assert dna["downside_exposure"] > 0
        assert "n1" in dna["hypothesis_weights"]

    def test_empty_holdings(self):
        dna = compute_hypothesis_dna([])
        assert dna["upside_exposure"] == 0.0
        assert dna["total_covered_weight"] == 0.0

    def test_concentration_risk(self):
        # All weight on same hypothesis
        holdings = [
            {"weight": 0.40, "hypotheses": [{"tier": "n1", "direction": "upside", "score": 0.80}]},
            {"weight": 0.30, "hypotheses": [{"tier": "n1", "direction": "upside", "score": 0.70}]},
        ]
        dna = compute_hypothesis_dna(holdings)
        assert dna["concentration_risk"] is True


# ---------------------------------------------------------------------------
# compute_hedge_gaps
# ---------------------------------------------------------------------------

class TestHedgeGaps:
    def test_correlated_downside(self):
        holdings = [
            {
                "ticker": "A",
                "weight": 0.15,
                "hypotheses": [{"tier": "n2", "direction": "downside", "score": 0.45, "title": "Macro Risk"}],
            },
            {
                "ticker": "B",
                "weight": 0.10,
                "hypotheses": [{"tier": "n2", "direction": "downside", "score": 0.40, "title": "Macro Risk"}],
            },
        ]
        gaps = compute_hedge_gaps(holdings)
        correlated = [g for g in gaps if g["risk"] == "correlated_downside"]
        assert len(correlated) >= 1
        assert "A" in correlated[0]["affected_tickers"]
        assert "B" in correlated[0]["affected_tickers"]

    def test_unhedged_single(self):
        holdings = [
            {
                "ticker": "C",
                "weight": 0.10,
                "hypotheses": [{"tier": "n3", "direction": "downside", "score": 0.55, "title": "Regulatory"}],
            },
        ]
        gaps = compute_hedge_gaps(holdings)
        unhedged = [g for g in gaps if g["risk"] == "unhedged_downside"]
        assert len(unhedged) >= 1

    def test_no_gaps_low_probability(self):
        holdings = [
            {
                "ticker": "D",
                "weight": 0.05,
                "hypotheses": [{"tier": "n4", "direction": "downside", "score": 0.10, "title": "Minor"}],
            },
        ]
        gaps = compute_hedge_gaps(holdings)
        assert len(gaps) == 0


# ---------------------------------------------------------------------------
# compute_reweighting_deltas
# ---------------------------------------------------------------------------

class TestReweightingDeltas:
    def test_contradicts_suggests_trim(self):
        holdings = [
            {"ticker": "X", "weight": 0.10, "alignment": {"cls": "contradicts", "label": "Contradictory"}},
        ]
        suggestions = compute_reweighting_deltas(holdings, mandate_max_position=0.15)
        assert len(suggestions) == 1
        assert suggestions[0]["suggested_direction"] == "trim"

    def test_aligned_below_half_max(self):
        holdings = [
            {"ticker": "Y", "weight": 0.03, "alignment": {"cls": "aligned", "label": "Aligned"}},
        ]
        suggestions = compute_reweighting_deltas(holdings, mandate_max_position=0.15)
        review = [s for s in suggestions if s["suggested_direction"] == "review_for_increase"]
        assert len(review) == 1

    def test_exceeds_max(self):
        holdings = [
            {"ticker": "Z", "weight": 0.25, "alignment": {"cls": "aligned", "label": "Aligned"}},
        ]
        suggestions = compute_reweighting_deltas(holdings, mandate_max_position=0.15)
        trim_to = [s for s in suggestions if s["suggested_direction"] == "trim_to_limit"]
        assert len(trim_to) == 1

    def test_no_suggestions_when_normal(self):
        holdings = [
            {"ticker": "W", "weight": 0.10, "alignment": {"cls": "aligned", "label": "Aligned"}},
        ]
        suggestions = compute_reweighting_deltas(holdings, mandate_max_position=0.15)
        assert len(suggestions) == 0


# ---------------------------------------------------------------------------
# detect_changes
# ---------------------------------------------------------------------------

class TestDetectChanges:
    def test_new_position(self):
        current = [{"ticker": "A", "weight": 0.10}, {"ticker": "B", "weight": 0.05}]
        previous = [{"ticker": "A", "weight": 0.10}]
        changes = detect_changes(current, previous)
        new = [c for c in changes if c["change_type"] == "new_position"]
        assert len(new) == 1
        assert new[0]["ticker"] == "B"

    def test_removed_position(self):
        current = [{"ticker": "A", "weight": 0.10}]
        previous = [{"ticker": "A", "weight": 0.10}, {"ticker": "B", "weight": 0.05}]
        changes = detect_changes(current, previous)
        removed = [c for c in changes if c["change_type"] == "removed_position"]
        assert len(removed) == 1
        assert removed[0]["ticker"] == "B"

    def test_weight_increase(self):
        current = [{"ticker": "A", "weight": 0.15}]
        previous = [{"ticker": "A", "weight": 0.10}]
        changes = detect_changes(current, previous)
        assert len(changes) == 1
        assert "increased" in changes[0]["change_type"]

    def test_no_changes(self):
        holdings = [{"ticker": "A", "weight": 0.10}]
        changes = detect_changes(holdings, holdings)
        assert len(changes) == 0

    def test_no_previous(self):
        current = [{"ticker": "A", "weight": 0.10}]
        changes = detect_changes(current, None)
        assert len(changes) == 0


# ---------------------------------------------------------------------------
# compute_alignment (integration)
# ---------------------------------------------------------------------------

class TestComputeAlignment:
    def test_basic_computation(self):
        # Use tickers that may or may not have research files
        holdings = [
            {"ticker": "FAKE1", "weight": 0.30},
            {"ticker": "FAKE2", "weight": 0.20},
        ]
        result = compute_alignment(holdings=holdings)
        assert "holdings" in result
        assert "alignment_summary" in result
        assert "hypothesis_dna" in result
        assert "hedge_gaps" in result
        assert "reweighting_suggestions" in result
        assert "changes" in result
        assert "restricted_violations" in result
        assert len(result["holdings"]) == 2

    def test_restricted_name_detected(self):
        holdings = [
            {"ticker": "CBA", "weight": 0.10},
            {"ticker": "BHP", "weight": 0.15},
        ]
        result = compute_alignment(
            holdings=holdings,
            restricted_names=["CBA"],
        )
        violations = result["restricted_violations"]
        assert len(violations) == 1
        assert violations[0]["ticker"] == "CBA"

    def test_empty_holdings(self):
        result = compute_alignment(holdings=[])
        assert result["alignment_summary"]["total_count"] == 0
        assert len(result["hedge_gaps"]) == 0

    def test_alignment_score_calculation(self):
        """Even without research, alignment_score should not error."""
        holdings = [
            {"ticker": "NOEXIST1", "weight": 0.50},
            {"ticker": "NOEXIST2", "weight": 0.50},
        ]
        result = compute_alignment(holdings=holdings)
        # No research means "not covered" -- alignment score = 0
        assert result["alignment_summary"]["alignment_score"] == 0.0
        assert result["alignment_summary"]["not_covered_weight"] == 1.0


# ---------------------------------------------------------------------------
# Mandate breach tests
# ---------------------------------------------------------------------------

class TestMandateBreaches:
    def test_no_analytics_returns_empty(self):
        from portfolio_alignment import compute_mandate_breaches
        assert compute_mandate_breaches(analytics=None) == []

    def test_position_breach_detected(self):
        from portfolio_alignment import compute_mandate_breaches
        analytics = {
            "concentration": {"max_single_weight": 0.30},
            "holdings_with_weights": [
                {"ticker": "CBA", "weight": 0.30},
                {"ticker": "BHP", "weight": 0.10},
            ],
            "sector_exposure": {"Financials": 0.30, "Materials": 0.10},
            "cash_weight": 0.10,
        }
        breaches = compute_mandate_breaches(
            analytics=analytics,
            mandate_max_position=0.15,
        )
        pos_breaches = [b for b in breaches if b["code"] == "POSITION_BREACH"]
        assert len(pos_breaches) == 1
        assert pos_breaches[0]["ticker"] == "CBA"
        assert pos_breaches[0]["recommended_posture"] == "trim"
        assert pos_breaches[0]["metric_name"] == "max_single_position"

    def test_sector_breach_detected(self):
        from portfolio_alignment import compute_mandate_breaches
        analytics = {
            "concentration": {"max_single_weight": 0.10},
            "holdings_with_weights": [],
            "sector_exposure": {"Financials": 0.50, "Materials": 0.10},
            "cash_weight": 0.10,
        }
        breaches = compute_mandate_breaches(
            analytics=analytics,
            mandate_sector_cap=0.35,
        )
        sector_breaches = [b for b in breaches if b["code"] == "SECTOR_BREACH"]
        assert len(sector_breaches) == 1
        assert sector_breaches[0]["sector"] == "Financials"
        assert sector_breaches[0]["recommended_posture"] == "trim"

    def test_cash_below_min(self):
        from portfolio_alignment import compute_mandate_breaches
        analytics = {
            "concentration": {"max_single_weight": 0.10},
            "holdings_with_weights": [],
            "sector_exposure": {},
            "cash_weight": 0.01,
        }
        breaches = compute_mandate_breaches(
            analytics=analytics,
            mandate_cash_min=0.03,
        )
        cash_breaches = [b for b in breaches if b["code"] == "CASH_BELOW_MIN"]
        assert len(cash_breaches) == 1
        assert cash_breaches[0]["recommended_posture"] == "block_add"

    def test_cash_above_max(self):
        from portfolio_alignment import compute_mandate_breaches
        analytics = {
            "concentration": {"max_single_weight": 0.10},
            "holdings_with_weights": [],
            "sector_exposure": {},
            "cash_weight": 0.60,
        }
        breaches = compute_mandate_breaches(
            analytics=analytics,
            mandate_cash_max=0.25,
        )
        cash_breaches = [b for b in breaches if b["code"] == "CASH_ABOVE_MAX"]
        assert len(cash_breaches) == 1
        assert cash_breaches[0]["severity"] == "critical"  # > 50%
        assert cash_breaches[0]["recommended_posture"] == "review"

    def test_no_breaches_when_within_limits(self):
        from portfolio_alignment import compute_mandate_breaches
        analytics = {
            "concentration": {"max_single_weight": 0.10},
            "holdings_with_weights": [{"ticker": "CBA", "weight": 0.10}],
            "sector_exposure": {"Financials": 0.10},
            "cash_weight": 0.10,
        }
        breaches = compute_mandate_breaches(
            analytics=analytics,
            mandate_max_position=0.15,
            mandate_sector_cap=0.35,
            mandate_cash_min=0.03,
            mandate_cash_max=0.25,
        )
        assert len(breaches) == 0

    def test_multiple_breaches(self):
        from portfolio_alignment import compute_mandate_breaches
        analytics = {
            "concentration": {"max_single_weight": 0.40},
            "holdings_with_weights": [{"ticker": "CBA", "weight": 0.40}],
            "sector_exposure": {"Financials": 0.50},
            "cash_weight": 0.01,
        }
        breaches = compute_mandate_breaches(
            analytics=analytics,
            mandate_max_position=0.15,
            mandate_sector_cap=0.35,
            mandate_cash_min=0.03,
        )
        codes = {b["code"] for b in breaches}
        assert "POSITION_BREACH" in codes
        assert "SECTOR_BREACH" in codes
        assert "CASH_BELOW_MIN" in codes

    def test_critical_severity_on_large_overshoot(self):
        from portfolio_alignment import compute_mandate_breaches
        analytics = {
            "concentration": {"max_single_weight": 0.60},
            "holdings_with_weights": [{"ticker": "CBA", "weight": 0.60}],
            "sector_exposure": {"Financials": 0.60},
            "cash_weight": 0.10,
        }
        breaches = compute_mandate_breaches(
            analytics=analytics,
            mandate_max_position=0.15,
            mandate_sector_cap=0.35,
        )
        # Position overshoot = 45pp > 10pp threshold
        pos = [b for b in breaches if b["code"] == "POSITION_BREACH"][0]
        assert pos["severity"] == "critical"
        # Sector overshoot = 25pp > 15pp threshold
        sec = [b for b in breaches if b["code"] == "SECTOR_BREACH"][0]
        assert sec["severity"] == "critical"

    def test_unclassified_sector_ignored(self):
        from portfolio_alignment import compute_mandate_breaches
        analytics = {
            "concentration": {"max_single_weight": 0.10},
            "holdings_with_weights": [],
            "sector_exposure": {"Unclassified": 0.80, "Financials": 0.10},
            "cash_weight": 0.10,
        }
        breaches = compute_mandate_breaches(
            analytics=analytics,
            mandate_sector_cap=0.35,
        )
        sector_breaches = [b for b in breaches if b["code"] == "SECTOR_BREACH"]
        assert len(sector_breaches) == 0  # Unclassified is not a real sector breach


class TestComputeAlignmentWithBreaches:
    def test_mandate_breaches_in_result(self):
        """compute_alignment returns mandate_breaches when analytics provided."""
        holdings = [
            {"ticker": "FAKE1", "weight": 0.50},
            {"ticker": "FAKE2", "weight": 0.20},
        ]
        analytics = {
            "concentration": {"max_single_weight": 0.50},
            "holdings_with_weights": [
                {"ticker": "FAKE1", "weight": 0.50},
                {"ticker": "FAKE2", "weight": 0.20},
            ],
            "sector_exposure": {},
            "cash_weight": 0.10,
        }
        result = compute_alignment(
            holdings=holdings,
            mandate_max_position=0.15,
            analytics=analytics,
        )
        assert "mandate_breaches" in result
        assert len(result["mandate_breaches"]) >= 1
        codes = {b["code"] for b in result["mandate_breaches"]}
        assert "POSITION_BREACH" in codes

    def test_no_breaches_without_analytics(self):
        """Without analytics, mandate_breaches should be empty."""
        holdings = [{"ticker": "FAKE1", "weight": 0.50}]
        result = compute_alignment(holdings=holdings)
        assert result["mandate_breaches"] == []


# ---------------------------------------------------------------------------
# Prompt builder integration tests
# ---------------------------------------------------------------------------

class TestPromptBuilderWithMandate:
    def test_mandate_section_in_prompt(self):
        from pm_prompt_builder import build_pm_system_prompt
        from personalisation_context import PersonalisationContext, MandateSettings

        ctx = PersonalisationContext(
            mandate=MandateSettings(max_position_size=0.20, restricted_names=["CBA"]),
            firm_name="Test Corp",
            firm_type="Family Office",
        )
        prompt = build_pm_system_prompt(personalisation=ctx)
        assert "USER MANDATE" in prompt
        assert "20%" in prompt
        assert "CBA" in prompt
        assert "RESTRICTED" in prompt

    def test_firm_context_in_prompt(self):
        from pm_prompt_builder import build_pm_system_prompt
        from personalisation_context import PersonalisationContext

        ctx = PersonalisationContext(
            firm_name="Alpha Fund",
            firm_type="Boutique",
            fund_name="Growth Fund",
            fund_strategy="Long Only",
        )
        prompt = build_pm_system_prompt(personalisation=ctx)
        assert "Alpha Fund" in prompt
        assert "Growth Fund" in prompt

    def test_cognitive_profile_in_prompt(self):
        from pm_prompt_builder import build_pm_system_prompt
        from personalisation_context import PersonalisationContext, MandateSettings, CognitiveProfile

        ctx = PersonalisationContext(
            cognitive_profile=CognitiveProfile(
                big_five={"E": 12, "A": 14, "C": 16, "N": 16, "O": 18},
                crt_score=5,
                crt_label="High System 2",
                biases=[{"bias": "Anchoring", "intervention": "Challenge anchors"}],
            ),
        )
        prompt = build_pm_system_prompt(personalisation=ctx)
        assert "COGNITIVE PROFILE" in prompt
        assert "HIGH NEUROTICISM" in prompt
        assert "Socratic" in prompt
        assert "Anchoring" in prompt

    def test_no_personalisation(self):
        """Prompt still builds cleanly without personalisation."""
        from pm_prompt_builder import build_pm_system_prompt
        prompt = build_pm_system_prompt()
        assert "PM CONSTITUTION" in prompt
        assert "USER MANDATE" not in prompt

    def test_alignment_section_in_prompt(self):
        from pm_prompt_builder import build_pm_system_prompt

        diagnostics = {
            "alignment_summary": {
                "aligned_weight": 0.40,
                "contradicts_weight": 0.10,
                "neutral_weight": 0.20,
                "not_covered_weight": 0.30,
                "covered_count": 7,
                "total_count": 10,
                "alignment_score": 0.40,
            },
            "hypothesis_dna": {
                "upside_exposure": 0.55,
                "downside_exposure": 0.20,
                "concentration_risk": False,
            },
            "hedge_gaps": [
                {"severity": "high", "description": "Correlated downside in Financials"},
            ],
            "restricted_violations": [],
            "reweighting_suggestions": [],
            "changes": [],
        }
        prompt = build_pm_system_prompt(alignment_diagnostics=diagnostics)
        assert "ALIGNMENT DIAGNOSTICS" in prompt
        assert "40%" in prompt
        assert "Correlated downside" in prompt

    def test_mandate_breaches_in_prompt(self):
        from pm_prompt_builder import build_pm_system_prompt

        diagnostics = {
            "alignment_summary": {
                "aligned_weight": 0.20,
                "contradicts_weight": 0.10,
                "neutral_weight": 0.10,
                "not_covered_weight": 0.10,
                "covered_count": 4,
                "total_count": 5,
                "alignment_score": 0.20,
            },
            "hypothesis_dna": {},
            "hedge_gaps": [],
            "restricted_violations": [],
            "reweighting_suggestions": [],
            "changes": [],
            "mandate_breaches": [
                {
                    "code": "POSITION_BREACH",
                    "severity": "critical",
                    "description": "CBA at 40.0% exceeds mandate max 15% by 25.0pp",
                },
                {
                    "code": "SECTOR_BREACH",
                    "severity": "warning",
                    "description": "Financials at 45.0% exceeds mandate sector cap 35% by 10.0pp",
                },
            ],
        }
        prompt = build_pm_system_prompt(alignment_diagnostics=diagnostics)
        assert "ACTIVE MANDATE BREACHES" in prompt
        assert "CBA at 40.0%" in prompt
        assert "Financials at 45.0%" in prompt
        assert "CRITICAL" in prompt
        assert "Address these before responding" in prompt

    def test_answer_types_in_prompt(self):
        """Verify the five answer types are codified in the prompt."""
        from pm_prompt_builder import build_pm_system_prompt
        prompt = build_pm_system_prompt()
        assert "PM ANSWER TYPES" in prompt
        assert "Mandate-aware recommendations" in prompt
        assert "Evidence contradictions" in prompt
        assert "Hypothesis concentration risks" in prompt
        assert "Source-of-funds within mandate" in prompt
        assert "Change-driven alerts" in prompt

    def test_not_covered_rules_in_prompt(self):
        from pm_prompt_builder import build_pm_system_prompt
        prompt = build_pm_system_prompt()
        assert "NOT-COVERED NAME RULES" in prompt
        assert "information gap, not a sell signal" in prompt

    def test_reweighting_rules_in_prompt(self):
        from pm_prompt_builder import build_pm_system_prompt
        prompt = build_pm_system_prompt()
        assert "REWEIGHTING SIGNAL RULES" in prompt
        assert "EVIDENCE INPUTS, not instructions" in prompt

    def test_mandate_thresholds_flow_to_constitution(self):
        """When mandate has custom values, Constitution uses mandate thresholds."""
        from pm_prompt_builder import build_pm_system_prompt
        from personalisation_context import PersonalisationContext, MandateSettings

        ctx = PersonalisationContext(
            mandate=MandateSettings(max_position_size=0.25, sector_cap=0.45),
        )
        thresholds = ctx.mandate.to_thresholds()
        prompt = build_pm_system_prompt(thresholds=thresholds, personalisation=ctx)
        # Constitution should show 25% not default 15%
        assert "25%" in prompt
        assert "45%" in prompt
