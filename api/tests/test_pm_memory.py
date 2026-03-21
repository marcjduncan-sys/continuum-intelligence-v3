"""
Phase E: PM Memory Quality tests.

Tests the PM database layer, decision logging, insight extraction,
journal API, and conversation persistence. Does NOT require a real
database -- uses mocks for async DB calls.
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import pm_db
import pm_memory_extractor
import pm_journal
import pm_conversations


# ---------------------------------------------------------------------------
# pm_memory_extractor.build_decision_basis
# ---------------------------------------------------------------------------

class TestDecisionBasis:
    """Decision basis object construction."""

    def test_minimal_basis(self):
        basis = pm_memory_extractor.build_decision_basis()
        assert basis["version"] == "F.1"
        assert basis["snapshot_id"] is None
        assert basis["breach_codes"] == []
        assert basis["related_tickers"] == []

    def test_full_basis(self):
        basis = pm_memory_extractor.build_decision_basis(
            snapshot_id="snap-123",
            alignment_score=0.72,
            breach_codes=["POSITION_BREACH", "SECTOR_BREACH"],
            uncovered_count=2,
            related_tickers=["CBA", "BHP"],
            mandate_hash="abc12345",
        )
        assert basis["snapshot_id"] == "snap-123"
        assert basis["alignment_score"] == 0.72
        assert basis["breach_codes"] == ["POSITION_BREACH", "SECTOR_BREACH"]
        assert basis["uncovered_count"] == 2
        assert basis["related_tickers"] == ["CBA", "BHP"]
        assert basis["mandate_hash"] == "abc12345"
        assert basis["version"] == "F.1"

    def test_breach_codes_default_empty_list(self):
        basis = pm_memory_extractor.build_decision_basis(breach_codes=None)
        assert basis["breach_codes"] == []

    def test_related_tickers_default_empty_list(self):
        basis = pm_memory_extractor.build_decision_basis(related_tickers=None)
        assert basis["related_tickers"] == []


# ---------------------------------------------------------------------------
# pm_memory_extractor.extract_pm_memory -- extraction pipeline
# ---------------------------------------------------------------------------

class TestPMExtraction:
    """PM memory extraction pipeline."""

    @pytest.mark.asyncio
    async def test_skips_without_identity(self):
        """Should return early if no user_id or guest_id."""
        with patch("pm_memory_extractor.llm") as mock_llm:
            await pm_memory_extractor.extract_pm_memory(
                user_id=None,
                guest_id=None,
                question="test",
                response_text="test response",
            )
            mock_llm.complete.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_empty_response(self):
        """Should return early if response_text is empty."""
        with patch("pm_memory_extractor.llm") as mock_llm:
            await pm_memory_extractor.extract_pm_memory(
                user_id="user-1",
                question="test",
                response_text="  ",
            )
            mock_llm.complete.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_without_pool(self):
        """Should return early if DB pool is None."""
        with patch("pm_memory_extractor.db") as mock_db, \
             patch("pm_memory_extractor.llm") as mock_llm:
            mock_db.get_pool = AsyncMock(return_value=None)
            await pm_memory_extractor.extract_pm_memory(
                user_id="user-1",
                question="test",
                response_text="PM recommends trimming CBA",
            )
            mock_llm.complete.assert_not_called()

    @pytest.mark.asyncio
    async def test_extracts_decisions_and_insights(self):
        """Should parse LLM output and insert decisions + insights."""
        mock_llm_result = MagicMock()
        mock_llm_result.json = {
            "decisions": [
                {
                    "action_type": "trim",
                    "ticker": "CBA",
                    "rationale": "CBA exceeds 10% mandate max at 60%",
                    "sizing_band": "8-10%",
                    "source_of_funds": None,
                    "mandate_basis": "max_position_size: 10%",
                }
            ],
            "insights": [
                {
                    "insight_type": "mandate_breach",
                    "content": "CBA position at 60% breaches 10% mandate maximum",
                    "tickers": ["CBA"],
                    "tags": ["concentration", "mandate"],
                    "confidence": 0.95,
                }
            ],
        }

        mock_pool = MagicMock()

        with patch("pm_memory_extractor.db") as mock_db, \
             patch("pm_memory_extractor.llm") as mock_llm, \
             patch("pm_memory_extractor.pm_db") as mock_pm_db:
            mock_db.get_pool = AsyncMock(return_value=mock_pool)
            mock_llm.complete = AsyncMock(return_value=mock_llm_result)
            mock_pm_db.insert_pm_decision = AsyncMock(return_value="dec-1")
            mock_pm_db.insert_pm_insight = AsyncMock(return_value="ins-1")

            await pm_memory_extractor.extract_pm_memory(
                user_id="user-1",
                question="Am I within my limits?",
                response_text="CBA at 60% breaches your 10% mandate maximum. Trim to 8-10%.",
                alignment_score=0.4,
                breach_codes=["POSITION_BREACH"],
                uncovered_count=0,
            )

            # Verify decision was inserted
            mock_pm_db.insert_pm_decision.assert_called_once()
            call_kwargs = mock_pm_db.insert_pm_decision.call_args.kwargs
            assert call_kwargs["action_type"] == "trim"
            assert call_kwargs["ticker"] == "CBA"
            assert call_kwargs["rationale"] == "CBA exceeds 10% mandate max at 60%"
            assert "decision_basis" in call_kwargs
            assert call_kwargs["decision_basis"]["version"] == "F.1"

            # Verify insight was inserted
            mock_pm_db.insert_pm_insight.assert_called_once()
            ins_kwargs = mock_pm_db.insert_pm_insight.call_args.kwargs
            assert ins_kwargs["insight_type"] == "mandate_breach"
            assert ins_kwargs["tickers"] == ["CBA"]
            assert ins_kwargs["confidence"] == 0.95

    @pytest.mark.asyncio
    async def test_rejects_invalid_action_types(self):
        """Should skip decisions with invalid action_type."""
        mock_llm_result = MagicMock()
        mock_llm_result.json = {
            "decisions": [
                {"action_type": "invalid_action", "rationale": "test"},
                {"action_type": "trim", "ticker": "BHP", "rationale": "valid trim"},
            ],
            "insights": [],
        }
        mock_pool = MagicMock()

        with patch("pm_memory_extractor.db") as mock_db, \
             patch("pm_memory_extractor.llm") as mock_llm, \
             patch("pm_memory_extractor.pm_db") as mock_pm_db:
            mock_db.get_pool = AsyncMock(return_value=mock_pool)
            mock_llm.complete = AsyncMock(return_value=mock_llm_result)
            mock_pm_db.insert_pm_decision = AsyncMock(return_value="dec-1")

            await pm_memory_extractor.extract_pm_memory(
                user_id="user-1",
                question="test",
                response_text="test response",
            )

            # Only the valid trim should be inserted
            assert mock_pm_db.insert_pm_decision.call_count == 1
            assert mock_pm_db.insert_pm_decision.call_args.kwargs["action_type"] == "trim"

    @pytest.mark.asyncio
    async def test_rejects_invalid_insight_types(self):
        """Should skip insights with invalid insight_type."""
        mock_llm_result = MagicMock()
        mock_llm_result.json = {
            "decisions": [],
            "insights": [
                {"insight_type": "invalid_type", "content": "test"},
                {"insight_type": "portfolio_risk", "content": "valid risk", "tickers": [], "tags": [], "confidence": 0.8},
            ],
        }
        mock_pool = MagicMock()

        with patch("pm_memory_extractor.db") as mock_db, \
             patch("pm_memory_extractor.llm") as mock_llm, \
             patch("pm_memory_extractor.pm_db") as mock_pm_db:
            mock_db.get_pool = AsyncMock(return_value=mock_pool)
            mock_llm.complete = AsyncMock(return_value=mock_llm_result)
            mock_pm_db.insert_pm_insight = AsyncMock(return_value="ins-1")

            await pm_memory_extractor.extract_pm_memory(
                user_id="user-1",
                question="test",
                response_text="test response",
            )

            assert mock_pm_db.insert_pm_insight.call_count == 1
            assert mock_pm_db.insert_pm_insight.call_args.kwargs["insight_type"] == "portfolio_risk"

    @pytest.mark.asyncio
    async def test_caps_decisions_at_three(self):
        """Should only process first 3 decisions."""
        mock_llm_result = MagicMock()
        mock_llm_result.json = {
            "decisions": [
                {"action_type": "trim", "ticker": f"T{i}", "rationale": f"reason {i}"}
                for i in range(5)
            ],
            "insights": [],
        }
        mock_pool = MagicMock()

        with patch("pm_memory_extractor.db") as mock_db, \
             patch("pm_memory_extractor.llm") as mock_llm, \
             patch("pm_memory_extractor.pm_db") as mock_pm_db:
            mock_db.get_pool = AsyncMock(return_value=mock_pool)
            mock_llm.complete = AsyncMock(return_value=mock_llm_result)
            mock_pm_db.insert_pm_decision = AsyncMock(return_value="dec-1")

            await pm_memory_extractor.extract_pm_memory(
                user_id="user-1",
                question="test",
                response_text="test response",
            )

            assert mock_pm_db.insert_pm_decision.call_count == 3

    @pytest.mark.asyncio
    async def test_caps_insights_at_five(self):
        """Should only process first 5 insights."""
        mock_llm_result = MagicMock()
        mock_llm_result.json = {
            "decisions": [],
            "insights": [
                {"insight_type": "portfolio_risk", "content": f"risk {i}", "tickers": [], "tags": [], "confidence": 0.7}
                for i in range(8)
            ],
        }
        mock_pool = MagicMock()

        with patch("pm_memory_extractor.db") as mock_db, \
             patch("pm_memory_extractor.llm") as mock_llm, \
             patch("pm_memory_extractor.pm_db") as mock_pm_db:
            mock_db.get_pool = AsyncMock(return_value=mock_pool)
            mock_llm.complete = AsyncMock(return_value=mock_llm_result)
            mock_pm_db.insert_pm_insight = AsyncMock(return_value="ins-1")

            await pm_memory_extractor.extract_pm_memory(
                user_id="user-1",
                question="test",
                response_text="test response",
            )

            assert mock_pm_db.insert_pm_insight.call_count == 5

    @pytest.mark.asyncio
    async def test_no_action_is_valid_decision(self):
        """no_action should be extracted as a valid decision type."""
        mock_llm_result = MagicMock()
        mock_llm_result.json = {
            "decisions": [
                {"action_type": "no_action", "rationale": "Portfolio within all mandate limits, no trade warranted"},
            ],
            "insights": [],
        }
        mock_pool = MagicMock()

        with patch("pm_memory_extractor.db") as mock_db, \
             patch("pm_memory_extractor.llm") as mock_llm, \
             patch("pm_memory_extractor.pm_db") as mock_pm_db:
            mock_db.get_pool = AsyncMock(return_value=mock_pool)
            mock_llm.complete = AsyncMock(return_value=mock_llm_result)
            mock_pm_db.insert_pm_decision = AsyncMock(return_value="dec-1")

            await pm_memory_extractor.extract_pm_memory(
                user_id="user-1",
                question="Should I trade?",
                response_text="Portfolio within limits, no trade warranted.",
            )

            assert mock_pm_db.insert_pm_decision.call_count == 1
            assert mock_pm_db.insert_pm_decision.call_args.kwargs["action_type"] == "no_action"


# ---------------------------------------------------------------------------
# PM extraction prompt quality
# ---------------------------------------------------------------------------

class TestPMExtractionPrompt:
    """Verify extraction prompt contains required taxonomy."""

    def test_system_prompt_has_all_seven_insight_types(self):
        prompt = pm_memory_extractor.PM_DECISION_EXTRACTION_SYSTEM
        for itype in [
            "pm_decision", "portfolio_risk", "mandate_breach",
            "sizing_principle", "rebalance_suggestion",
            "uncovered_exposure", "change_alert",
        ]:
            assert itype in prompt, f"Missing insight type: {itype}"

    def test_system_prompt_has_all_action_types(self):
        prompt = pm_memory_extractor.PM_DECISION_EXTRACTION_SYSTEM
        for action in ["trim", "add", "exit", "hold", "rebalance", "watch", "no_action"]:
            assert action in prompt, f"Missing action type: {action}"

    def test_system_prompt_enforces_caps(self):
        prompt = pm_memory_extractor.PM_DECISION_EXTRACTION_SYSTEM
        assert "Maximum 3 decisions" in prompt
        assert "5 insights" in prompt

    def test_system_prompt_no_action_explicitly_valid(self):
        prompt = pm_memory_extractor.PM_DECISION_EXTRACTION_SYSTEM
        assert "no_action" in prompt
        assert "valid and important decision" in prompt


# ---------------------------------------------------------------------------
# PM Chat endpoint -- conversation persistence wiring
# ---------------------------------------------------------------------------

class TestPMChatPersistence:
    """Verify pm_chat.py includes Phase E fields."""

    def test_request_model_has_pm_conversation_id(self):
        from pm_chat import PMChatRequest
        fields = PMChatRequest.model_fields
        assert "pm_conversation_id" in fields
        assert "guest_id" in fields

    def test_response_model_has_pm_conversation_id(self):
        from pm_chat import PMChatResponse
        fields = PMChatResponse.model_fields
        assert "pm_conversation_id" in fields

    def test_mandate_hash_deterministic(self):
        from pm_chat import _mandate_hash
        from personalisation_context import parse_personalisation_context

        ctx1 = parse_personalisation_context({
            "mandate": {"maxPositionSize": 0.10, "sectorCap": 0.25}
        })
        ctx2 = parse_personalisation_context({
            "mandate": {"maxPositionSize": 0.10, "sectorCap": 0.25}
        })
        h1 = _mandate_hash(ctx1)
        h2 = _mandate_hash(ctx2)
        assert h1 == h2
        assert h1 is not None
        assert len(h1) == 8

    def test_mandate_hash_none_for_default(self):
        from pm_chat import _mandate_hash
        from personalisation_context import parse_personalisation_context

        ctx = parse_personalisation_context(None)
        h = _mandate_hash(ctx)
        assert h is None


# ---------------------------------------------------------------------------
# PM DB layer -- unit tests (no real database)
# ---------------------------------------------------------------------------

class TestPMDB:
    """PM database helper functions with mocked pool."""

    @pytest.mark.asyncio
    async def test_create_pm_conversation_returns_none_without_pool(self):
        result = await pm_db.create_pm_conversation(
            None, user_id="user-1"
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_create_pm_conversation_returns_none_without_identity(self):
        mock_pool = MagicMock()
        result = await pm_db.create_pm_conversation(
            mock_pool, user_id=None, guest_id=None
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_get_pm_conversation_returns_empty_without_pool(self):
        cid, msgs = await pm_db.get_pm_conversation(
            None, user_id="user-1"
        )
        assert cid is None
        assert msgs == []

    @pytest.mark.asyncio
    async def test_get_pm_insights_returns_empty_without_pool(self):
        result = await pm_db.get_pm_insights(
            None, user_id="user-1"
        )
        assert result == []

    @pytest.mark.asyncio
    async def test_get_pm_decisions_returns_empty_without_pool(self):
        result = await pm_db.get_pm_decisions(
            None, user_id="user-1"
        )
        assert result == []

    @pytest.mark.asyncio
    async def test_archive_returns_false_without_pool(self):
        result = await pm_db.archive_pm_insight(None, "some-id")
        assert result is False

    @pytest.mark.asyncio
    async def test_restore_returns_false_without_pool(self):
        result = await pm_db.restore_pm_insight(None, "some-id")
        assert result is False

    @pytest.mark.asyncio
    async def test_insert_pm_insight_returns_none_without_identity(self):
        mock_pool = MagicMock()
        result = await pm_db.insert_pm_insight(
            mock_pool,
            user_id=None,
            guest_id=None,
            insight_type="portfolio_risk",
            content="test",
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_insert_pm_decision_returns_none_without_identity(self):
        mock_pool = MagicMock()
        result = await pm_db.insert_pm_decision(
            mock_pool,
            user_id=None,
            guest_id=None,
            action_type="trim",
            rationale="test",
            decision_basis={"version": "F.1"},
        )
        assert result is None


# ---------------------------------------------------------------------------
# PM eval scenario coverage
# ---------------------------------------------------------------------------

class TestPMEvalScenarioCoverage:
    """Verify eval scenarios cover PM memory-relevant patterns."""

    def test_all_18_scenarios_parseable(self):
        from tests.pm_eval_pack import EVAL_SCENARIOS, list_scenarios
        assert len(EVAL_SCENARIOS) == 24
        names = list_scenarios()
        assert len(names) == 24
        assert len(set(names)) == 24  # all unique

    def test_no_action_scenario_exists(self):
        from tests.pm_eval_pack import get_scenario
        s = get_scenario("do_nothing_despite_signals")
        assert s is not None
        assert "no_action" in str(s["expected_behaviours"]).lower() or "no action" in str(s["expected_behaviours"]).lower()

    def test_restricted_name_scenario_exists(self):
        from tests.pm_eval_pack import get_scenario
        s = get_scenario("restricted_name_violation")
        assert s is not None
        assert "mandate" in s
        assert "BHP" in s["mandate"]["restricted_names"]

    def test_mandate_tighter_scenario_exists(self):
        from tests.pm_eval_pack import get_scenario
        s = get_scenario("mandate_tighter_than_default")
        assert s is not None
        assert s["mandate"]["max_position_size"] == 0.10
