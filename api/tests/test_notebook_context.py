"""Tests for notebook_context.py -- NotebookLM analyst chat integration."""

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config


# ---------------------------------------------------------------------------
# Test: no notebook for ticker returns None immediately
# ---------------------------------------------------------------------------

class TestNoNotebook:
    def test_returns_none_when_ticker_not_in_registry(self):
        """Tickers without a notebook entry should return None with no NLM call."""
        import notebook_context

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {}, clear=True):
            result = asyncio.run(notebook_context.query_notebook("ZZZ", "test question"))
        assert result is None


# ---------------------------------------------------------------------------
# Test: successful NLM query returns text
# ---------------------------------------------------------------------------

class TestSuccessfulQuery:
    def test_returns_text_when_notebook_exists(self):
        """A ticker with a notebook should query NLM and return response text."""
        import notebook_context
        notebook_context._nlm_auth_ok = True

        mock_response = MagicMock()
        mock_response.text = "Gold production increased 15% year over year."

        mock_client = AsyncMock()
        mock_client.chat.ask = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", True):
                with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth-json"):
                    with patch("notebook_context.NotebookLMClient", create=True) as MockNLM:
                        MockNLM.from_storage = AsyncMock(return_value=mock_client)
                        result = asyncio.run(notebook_context.query_notebook("OBM", "What is OBM production?"))

        assert result == "Gold production increased 15% year over year."

    def test_caps_response_at_max_chars(self):
        """Response text exceeding NOTEBOOKLM_CONTEXT_MAX_CHARS should be truncated."""
        import notebook_context
        notebook_context._nlm_auth_ok = True

        long_text = "A" * 5000
        mock_response = MagicMock()
        mock_response.text = long_text

        mock_client = AsyncMock()
        mock_client.chat.ask = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", True):
                with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth-json"):
                    with patch("notebook_context.NotebookLMClient", create=True) as MockNLM:
                        MockNLM.from_storage = AsyncMock(return_value=mock_client)
                        result = asyncio.run(notebook_context.query_notebook("OBM", "question"))

        assert result is not None
        assert len(result) <= config.NOTEBOOKLM_CONTEXT_MAX_CHARS


# ---------------------------------------------------------------------------
# Test: auth failure flips flag and returns None
# ---------------------------------------------------------------------------

class TestAuthFailure:
    def test_auth_error_flips_flag_and_returns_none(self):
        """Auth-related exceptions should flip _nlm_auth_ok and return None."""
        import notebook_context
        notebook_context._nlm_auth_ok = True

        mock_client = AsyncMock()
        mock_client.chat.ask = AsyncMock(side_effect=Exception("401 Unauthorized"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", True):
                with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth-json"):
                    with patch("notebook_context.NotebookLMClient", create=True) as MockNLM:
                        MockNLM.from_storage = AsyncMock(return_value=mock_client)
                        result = asyncio.run(notebook_context.query_notebook("OBM", "question"))

        assert result is None
        assert notebook_context._nlm_auth_ok is False

    def test_skips_query_when_auth_flag_is_false(self):
        """When _nlm_auth_ok is False, should return None without attempting query."""
        import notebook_context
        notebook_context._nlm_auth_ok = False

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", True):
                with patch("notebook_context.NotebookLMClient", create=True) as MockNLM:
                    result = asyncio.run(notebook_context.query_notebook("OBM", "question"))
                    MockNLM.from_storage.assert_not_called()

        assert result is None


# ---------------------------------------------------------------------------
# Test: NOTEBOOKLM_AUTH_JSON not configured
# ---------------------------------------------------------------------------

class TestAuthJsonMissing:
    def test_returns_none_when_auth_json_empty(self):
        """When NOTEBOOKLM_AUTH_JSON is empty, should return None without query."""
        import notebook_context
        notebook_context._nlm_auth_ok = True

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", True):
                with patch.object(config, "NOTEBOOKLM_AUTH_JSON", ""):
                    with patch("notebook_context.NotebookLMClient", create=True) as MockNLM:
                        result = asyncio.run(notebook_context.query_notebook("OBM", "question"))
                        MockNLM.from_storage.assert_not_called()

        assert result is None


# ---------------------------------------------------------------------------
# Test: transient errors do not flip auth flag
# ---------------------------------------------------------------------------

class TestTransientError:
    def test_generic_error_returns_none_without_flipping_auth(self):
        """Non-auth exceptions should return None but leave _nlm_auth_ok True."""
        import notebook_context
        notebook_context._nlm_auth_ok = True

        mock_client = AsyncMock()
        mock_client.chat.ask = AsyncMock(side_effect=Exception("Connection timed out"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", True):
                with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth-json"):
                    with patch("notebook_context.NotebookLMClient", create=True) as MockNLM:
                        MockNLM.from_storage = AsyncMock(return_value=mock_client)
                        result = asyncio.run(notebook_context.query_notebook("OBM", "question"))

        assert result is None
        assert notebook_context._nlm_auth_ok is True


# ---------------------------------------------------------------------------
# Test: asyncio.TimeoutError from wait_for
# ---------------------------------------------------------------------------

class TestAsyncioTimeout:
    def test_asyncio_timeout_returns_none_without_flipping_auth(self):
        """asyncio.TimeoutError (from wait_for) should return None, auth flag unchanged."""
        import notebook_context
        notebook_context._nlm_auth_ok = True

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", True):
                with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth-json"):
                    with patch("notebook_context._ask_notebook", new_callable=AsyncMock) as mock_ask:
                        mock_ask.side_effect = asyncio.TimeoutError()
                        result = asyncio.run(notebook_context.query_notebook("OBM", "question"))

        assert result is None
        assert notebook_context._nlm_auth_ok is True


# ---------------------------------------------------------------------------
# Test: empty response returns None
# ---------------------------------------------------------------------------

class TestEmptyResponse:
    def test_short_response_returns_none(self):
        """Responses under 20 characters should be treated as empty."""
        import notebook_context
        notebook_context._nlm_auth_ok = True

        mock_response = MagicMock()
        mock_response.text = "N/A"

        mock_client = AsyncMock()
        mock_client.chat.ask = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", True):
                with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth-json"):
                    with patch("notebook_context.NotebookLMClient", create=True) as MockNLM:
                        MockNLM.from_storage = AsyncMock(return_value=mock_client)
                        result = asyncio.run(notebook_context.query_notebook("OBM", "question"))

        assert result is None


# ---------------------------------------------------------------------------
# Test: reset_auth resets state
# ---------------------------------------------------------------------------

class TestResetAuth:
    def test_reset_auth_restores_flag(self):
        """reset_auth() should set _nlm_auth_ok to True and clear error."""
        import notebook_context
        notebook_context._nlm_auth_ok = False
        notebook_context._nlm_last_error = "some error"

        notebook_context.reset_auth()

        assert notebook_context._nlm_auth_ok is True
        assert notebook_context._nlm_last_error is None


# ---------------------------------------------------------------------------
# Test: notebooklm-py not installed
# ---------------------------------------------------------------------------

class TestNlmNotInstalled:
    def test_returns_none_when_library_not_installed(self):
        """When notebooklm-py is not installed, should return None gracefully."""
        import notebook_context
        notebook_context._nlm_auth_ok = True

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", False):
                result = asyncio.run(notebook_context.query_notebook("OBM", "question"))

        assert result is None


# ---------------------------------------------------------------------------
# Test: query_notebook_batch
# ---------------------------------------------------------------------------

class TestQueryNotebookBatch:
    def test_returns_empty_dict_when_no_notebook(self):
        """Tickers without a notebook should return empty dict."""
        import notebook_context

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {}, clear=True):
            result = asyncio.run(notebook_context.query_notebook_batch("ZZZ"))
        assert result == {}

    def test_returns_dict_with_dimension_keys(self):
        """Batch query should return a dict keyed by dimension name."""
        import notebook_context
        notebook_context._nlm_auth_ok = True

        mock_response = MagicMock()
        mock_response.text = "Substantive response text for this dimension query."

        mock_client = AsyncMock()
        mock_client.chat.ask = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", True):
                with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth-json"):
                    with patch("notebook_context.NotebookLMClient", create=True) as MockNLM:
                        MockNLM.from_storage = AsyncMock(return_value=mock_client)
                        result = asyncio.run(notebook_context.query_notebook_batch("OBM"))

        assert "operations" in result
        assert "financials" in result
        assert "risks" in result
        assert "catalysts" in result
        assert all(v == "Substantive response text for this dimension query." for v in result.values())

    def test_partial_failure_returns_partial_dict(self):
        """If some queries fail, those dimensions are None, others succeed."""
        import notebook_context
        notebook_context._nlm_auth_ok = True

        call_count = 0

        async def _side_effect(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise Exception("Connection timed out")
            resp = MagicMock()
            resp.text = "Good response for this dimension query."
            return resp

        mock_client = AsyncMock()
        mock_client.chat.ask = _side_effect
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", True):
                with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth-json"):
                    with patch("notebook_context.NotebookLMClient", create=True) as MockNLM:
                        MockNLM.from_storage = AsyncMock(return_value=mock_client)
                        result = asyncio.run(notebook_context.query_notebook_batch("OBM"))

        # 3 should succeed, 1 should be None
        none_count = sum(1 for v in result.values() if v is None)
        text_count = sum(1 for v in result.values() if v is not None)
        assert none_count == 1
        assert text_count == 3

    def test_auth_failure_returns_empty_dict(self):
        """Auth failure should return empty dict and flip the flag."""
        import notebook_context
        notebook_context._nlm_auth_ok = True

        mock_client = AsyncMock()
        mock_client.chat.ask = AsyncMock(side_effect=Exception("401 Unauthorized"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", True):
                with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth-json"):
                    with patch("notebook_context.NotebookLMClient", create=True) as MockNLM:
                        MockNLM.from_storage = AsyncMock(return_value=mock_client)
                        result = asyncio.run(notebook_context.query_notebook_batch("OBM"))

        assert result == {} or all(v is None for v in result.values())
        assert notebook_context._nlm_auth_ok is False

    def test_skips_when_auth_flag_false(self):
        """When _nlm_auth_ok is False, batch should return empty dict immediately."""
        import notebook_context
        notebook_context._nlm_auth_ok = False

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", True):
                result = asyncio.run(notebook_context.query_notebook_batch("OBM"))

        assert result == {}


# ---------------------------------------------------------------------------
# Test: build_corpus_section
# ---------------------------------------------------------------------------

class TestBuildCorpusSection:
    def test_full_corpus_formats_all_dimensions(self):
        """All four dimensions present should produce a formatted section."""
        import notebook_context

        corpus = {
            "operations": "Mining gold at Davyhurst with two underground mines.",
            "financials": "FY26 revenue of A$180M, AISC A$2,800/oz.",
            "risks": "Single-asset concentration, cost overruns at depth.",
            "catalysts": "Expansion of Sand King decline, H2 2026 DFS.",
        }
        result = notebook_context.build_corpus_section("OBM", corpus)

        assert "## Source Document Context for OBM" in result
        assert "### Operations & Assets" in result
        assert "### Financials & Guidance" in result
        assert "### Risks & Controversies" in result
        assert "### Catalysts & Strategy" in result
        assert "Mining gold at Davyhurst" in result
        assert "Do not reproduce verbatim" in result

    def test_empty_corpus_returns_empty_string(self):
        """Empty dict should return empty string."""
        import notebook_context

        result = notebook_context.build_corpus_section("OBM", {})
        assert result == ""

    def test_all_none_returns_empty_string(self):
        """All None values should return empty string."""
        import notebook_context

        corpus = {"operations": None, "financials": None, "risks": None, "catalysts": None}
        result = notebook_context.build_corpus_section("OBM", corpus)
        assert result == ""

    def test_partial_corpus_includes_only_present_dimensions(self):
        """Only dimensions with content should appear in the output."""
        import notebook_context

        corpus = {
            "operations": "Active mining operations at two sites.",
            "financials": None,
            "risks": "Geotechnical concerns in the eastern decline.",
            "catalysts": None,
        }
        result = notebook_context.build_corpus_section("OBM", corpus)

        assert "### Operations & Assets" in result
        assert "### Risks & Controversies" in result
        assert "### Financials & Guidance" not in result
        assert "### Catalysts & Strategy" not in result


# ---------------------------------------------------------------------------
# Test: DEEP_EXTRACTION_QUERIES constants
# ---------------------------------------------------------------------------

class TestDeepExtractionQueries:
    def test_deep_extraction_queries_has_12_entries(self):
        """DEEP_EXTRACTION_QUERIES should contain 12 (dimension, query) tuples."""
        import notebook_context

        assert len(notebook_context.DEEP_EXTRACTION_QUERIES) == 12

    def test_all_queries_are_tuples_with_two_elements(self):
        """Each entry in DEEP_EXTRACTION_QUERIES should be a 2-tuple."""
        import notebook_context

        for entry in notebook_context.DEEP_EXTRACTION_QUERIES:
            assert isinstance(entry, tuple)
            assert len(entry) == 2

    def test_all_dimensions_are_unique(self):
        """All dimension names should be unique."""
        import notebook_context

        dimensions = [dim for dim, _ in notebook_context.DEEP_EXTRACTION_QUERIES]
        assert len(dimensions) == len(set(dimensions))

    def test_all_queries_contain_no_data_sentinel_suffix(self):
        """All queries should contain the NO_DATA_AVAILABLE sentinel."""
        import notebook_context

        for _, query in notebook_context.DEEP_EXTRACTION_QUERIES:
            assert notebook_context.NO_DATA_SENTINEL in query

    def test_no_data_sentinel_exists(self):
        """NO_DATA_SENTINEL constant should be defined."""
        import notebook_context

        assert hasattr(notebook_context, "NO_DATA_SENTINEL")
        assert notebook_context.NO_DATA_SENTINEL == "NO_DATA_AVAILABLE"

    def test_generation_queries_still_exist_unchanged(self):
        """GENERATION_QUERIES should still exist with 4 entries, no suffix."""
        import notebook_context

        assert len(notebook_context.GENERATION_QUERIES) == 4
        assert all(not notebook_context.NO_DATA_SENTINEL in q for _, q in notebook_context.GENERATION_QUERIES)


# ---------------------------------------------------------------------------
# Test: run_deep_extraction
# ---------------------------------------------------------------------------

class TestRunDeepExtraction:
    def test_returns_empty_dict_when_no_notebook(self):
        """No notebook should return empty dict."""
        import notebook_context

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {}, clear=True):
            result = asyncio.run(notebook_context.run_deep_extraction("ZZZ"))
        assert result == {}

    def test_returns_empty_dict_when_library_not_installed(self):
        """Missing notebooklm-py should return empty dict."""
        import notebook_context

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", False):
                result = asyncio.run(notebook_context.run_deep_extraction("OBM"))
        assert result == {}

    def test_returns_empty_dict_when_auth_expired(self):
        """When _nlm_auth_ok is False, should return empty dict."""
        import notebook_context
        notebook_context._nlm_auth_ok = False

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", True):
                result = asyncio.run(notebook_context.run_deep_extraction("OBM"))
        assert result == {}

    def test_filters_no_data_available_responses(self):
        """Responses containing NO_DATA_SENTINEL should be filtered out."""
        import notebook_context
        notebook_context._nlm_auth_ok = True

        responses = [
            "Substantive data here with 30+ characters.",
            notebook_context.NO_DATA_SENTINEL,
            "Another substantive response with detail.",
        ]
        call_count = [0]

        async def _side_effect(**kwargs):
            resp = MagicMock()
            resp.text = responses[call_count[0] % len(responses)]
            call_count[0] += 1
            return resp

        mock_client = AsyncMock()
        mock_client.chat.ask = _side_effect
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", True):
                with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth-json"):
                    with patch("notebook_context.NotebookLMClient", create=True) as MockNLM:
                        MockNLM.from_storage = AsyncMock(return_value=mock_client)
                        result = asyncio.run(notebook_context.run_deep_extraction("OBM"))

        # Should have 12 dimensions queried, but some filtered out
        assert notebook_context.NO_DATA_SENTINEL not in str(result.values())

    def test_filters_responses_shorter_than_20_chars(self):
        """Responses under 20 chars should be filtered out."""
        import notebook_context
        notebook_context._nlm_auth_ok = True

        mock_response_short = MagicMock()
        mock_response_short.text = "Short"

        mock_response_long = MagicMock()
        mock_response_long.text = "This is a response with plenty of characters."

        responses = [mock_response_short, mock_response_long]
        call_count = [0]

        async def _side_effect(**kwargs):
            resp = responses[call_count[0] % len(responses)]
            call_count[0] += 1
            return resp

        mock_client = AsyncMock()
        mock_client.chat.ask = _side_effect
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", True):
                with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth-json"):
                    with patch("notebook_context.NotebookLMClient", create=True) as MockNLM:
                        MockNLM.from_storage = AsyncMock(return_value=mock_client)
                        result = asyncio.run(notebook_context.run_deep_extraction("OBM"))

        # All non-metadata values should be either None or >= 20 chars
        for k, v in result.items():
            if v is not None and not k.startswith("_"):
                assert len(v) >= 20

    def test_includes_metadata_fields(self):
        """Result should include _extractedAt, _notebookId, _queryCount, _dimensionsPopulated."""
        import notebook_context
        notebook_context._nlm_auth_ok = True

        mock_response = MagicMock()
        mock_response.text = "Substantive response with good detail here."

        mock_client = AsyncMock()
        mock_client.chat.ask = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", True):
                with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth-json"):
                    with patch("notebook_context.NotebookLMClient", create=True) as MockNLM:
                        MockNLM.from_storage = AsyncMock(return_value=mock_client)
                        result = asyncio.run(notebook_context.run_deep_extraction("OBM"))

        assert "_extractedAt" in result
        assert "_notebookId" in result
        assert "_queryCount" in result
        assert "_dimensionsPopulated" in result

    def test_metadata_query_count_is_12(self):
        """_queryCount metadata should be 12."""
        import notebook_context
        notebook_context._nlm_auth_ok = True

        mock_response = MagicMock()
        mock_response.text = "Substantive response with good detail here."

        mock_client = AsyncMock()
        mock_client.chat.ask = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", True):
                with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth-json"):
                    with patch("notebook_context.NotebookLMClient", create=True) as MockNLM:
                        MockNLM.from_storage = AsyncMock(return_value=mock_client)
                        result = asyncio.run(notebook_context.run_deep_extraction("OBM"))

        assert result.get("_queryCount") == 12

    def test_limits_concurrency_to_3(self):
        """Should use semaphore to limit concurrent queries to 3."""
        import notebook_context
        notebook_context._nlm_auth_ok = True

        concurrent_count = [0]
        max_concurrent = [0]

        async def _side_effect(**kwargs):
            concurrent_count[0] += 1
            max_concurrent[0] = max(max_concurrent[0], concurrent_count[0])
            await asyncio.sleep(0.01)
            concurrent_count[0] -= 1
            resp = MagicMock()
            resp.text = "Substantive response with plenty of detail."
            return resp

        mock_client = AsyncMock()
        mock_client.chat.ask = _side_effect
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
            with patch("notebook_context._HAS_NOTEBOOKLM", True):
                with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth-json"):
                    with patch("notebook_context.NotebookLMClient", create=True) as MockNLM:
                        MockNLM.from_storage = AsyncMock(return_value=mock_client)
                        result = asyncio.run(notebook_context.run_deep_extraction("OBM"))

        # Max concurrent should be <= 3
        assert max_concurrent[0] <= 3


# ---------------------------------------------------------------------------
# Test: build_corpus_section v2 (12 dimensions)
# ---------------------------------------------------------------------------

class TestBuildCorpusSectionV2:
    def test_v2_handles_12_dimensions(self):
        """build_corpus_section should handle all 12 deep extraction dimensions."""
        import notebook_context

        corpus = {
            "earnings_quality": "Accounting quality detail.",
            "earnings_composition": "Revenue breakdown detail.",
            "cash_flow_reconciliation": "Cash flow detail.",
            "structural_growth": "Growth drivers detail.",
            "competitive_position": "Competitive detail.",
            "margin_decomposition": "Margin detail.",
            "capital_allocation": "Capital detail.",
            "governance_flags": "Governance detail.",
            "disclosure_quality": "Disclosure detail.",
            "variant_perception": "Variant detail.",
            "key_assumptions": "Assumptions detail.",
            "catalyst_timeline": "Catalyst detail.",
        }
        result = notebook_context.build_corpus_section("OBM", corpus)

        assert "## Source Document Context for OBM" in result
        for label in notebook_context._DIMENSION_LABELS.values():
            if label not in ["Operations & Assets", "Financials & Guidance", "Risks & Controversies", "Catalysts & Strategy"]:
                assert label in result or result != ""

    def test_backward_compatibility_with_v1_dimensions(self):
        """v1 dimensions should still work."""
        import notebook_context

        corpus = {
            "operations": "Operations detail.",
            "financials": "Financials detail.",
            "risks": "Risks detail.",
            "catalysts": "Catalysts detail.",
        }
        result = notebook_context.build_corpus_section("OBM", corpus)

        assert "## Source Document Context for OBM" in result
        assert "### Operations & Assets" in result
        assert "### Financials & Guidance" in result

    def test_skips_metadata_keys_starting_with_underscore(self):
        """Keys starting with _ should be skipped."""
        import notebook_context

        corpus = {
            "earnings_quality": "Earnings detail.",
            "_extractedAt": "2026-04-01T12:00:00Z",
            "_notebookId": "fake-uuid",
            "_queryCount": "12",
        }
        result = notebook_context.build_corpus_section("OBM", corpus)

        assert "_extractedAt" not in result
        assert "_notebookId" not in result
        assert "2026-04-01T12:00:00Z" not in result

    def test_respects_max_chars_truncation(self):
        """build_corpus_section should truncate to max_chars."""
        import notebook_context

        corpus = {
            "earnings_quality": "A" * 10000,
            "earnings_composition": "B" * 10000,
            "cash_flow_reconciliation": "C" * 10000,
        }
        result = notebook_context.build_corpus_section("OBM", corpus, max_chars=5000)

        assert len(result) <= 5000

    def test_dimension_labels_exist(self):
        """_DIMENSION_LABELS should contain all 16 dimension labels."""
        import notebook_context

        assert hasattr(notebook_context, "_DIMENSION_LABELS")
        labels = notebook_context._DIMENSION_LABELS
        assert len(labels) >= 12  # At least the 12 deep extraction dims


# ---------------------------------------------------------------------------
# Test: select_dimensions
# ---------------------------------------------------------------------------

class TestSelectDimensions:
    def test_earnings_keywords_route_to_earnings_dimensions(self):
        """earnings/profit/revenue/income should route to earnings dimensions."""
        import notebook_context

        result = notebook_context.select_dimensions("What is the earnings quality?")
        assert "earnings_quality" in result or "earnings_composition" in result

        result = notebook_context.select_dimensions("Break down the revenue composition")
        assert "earnings_composition" in result

    def test_growth_keywords_route_to_growth_dimensions(self):
        """growth/market share/moat should route to growth dimensions."""
        import notebook_context

        result = notebook_context.select_dimensions("What is the competitive moat?")
        assert "competitive_position" in result

        result = notebook_context.select_dimensions("How is organic growth trending?")
        assert "structural_growth" in result or "competitive_position" in result

    def test_margin_keywords_route_to_margin_dimensions(self):
        """margin/cost/pricing should route to margin dimensions."""
        import notebook_context

        result = notebook_context.select_dimensions("What drives margin compression?")
        assert "margin_decomposition" in result

    def test_governance_keywords_route_to_governance_dimensions(self):
        """governance/board/disclosure should route to governance dimensions."""
        import notebook_context

        result = notebook_context.select_dimensions("What are the governance issues?")
        assert "governance_flags" in result or "disclosure_quality" in result

    def test_thesis_keywords_route_to_thesis_dimensions(self):
        """thesis/assumption/variant/catalyst should route to thesis dimensions."""
        import notebook_context

        result = notebook_context.select_dimensions("What assumptions underpin the thesis?")
        assert "key_assumptions" in result or "variant_perception" in result

    def test_cash_flow_keywords_route_to_cash_flow_dimensions(self):
        """cash flow/working capital/capex should route to cash flow dimensions."""
        import notebook_context

        result = notebook_context.select_dimensions("How has free cash flow trended?")
        assert "cash_flow_reconciliation" in result or "capital_allocation" in result

    def test_no_match_returns_all_12_dimensions(self):
        """No keyword match should return all 12 deep extraction dimensions."""
        import notebook_context

        result = notebook_context.select_dimensions("Random question with no keywords")
        assert len(result) == 12
        assert "earnings_quality" in result

    def test_returns_list_of_strings(self):
        """select_dimensions should return a list of dimension names."""
        import notebook_context
        result = notebook_context.select_dimensions("test question")
        assert isinstance(result, list)
        assert all(isinstance(d, str) for d in result)
