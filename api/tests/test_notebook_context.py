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
                    with patch("notebook_context.NotebookLMClient") as MockNLM:
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
                    with patch("notebook_context.NotebookLMClient") as MockNLM:
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
                    with patch("notebook_context.NotebookLMClient") as MockNLM:
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
                with patch("notebook_context.NotebookLMClient") as MockNLM:
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
                    with patch("notebook_context.NotebookLMClient") as MockNLM:
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
                    with patch("notebook_context.NotebookLMClient") as MockNLM:
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
                    with patch("notebook_context.NotebookLMClient") as MockNLM:
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
