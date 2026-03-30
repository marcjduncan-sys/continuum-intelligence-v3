"""
NotebookLM context provider for Analyst Chat.

Queries a ticker's NotebookLM notebook (if registered) and returns corpus
context for injection into the research-chat pipeline. Silent failure on
all error paths: the Analyst Chat must work identically for tickers without
notebooks or when NotebookLM is unavailable.

Auth state is independent of gold_agent.py. Both modules are reset via
POST /api/notebooklm/reset-auth.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

import config

logger = logging.getLogger(__name__)

try:
    from notebooklm import NotebookLMClient
    _HAS_NOTEBOOKLM = True
except ImportError:
    _HAS_NOTEBOOKLM = False

# ---------------------------------------------------------------------------
# Auth state -- independent of gold_agent
# ---------------------------------------------------------------------------

_nlm_auth_ok: bool = True
_nlm_last_error: Optional[str] = None

_AUTH_ERROR_MARKERS = ("auth", "401", "cookie", "login", "forbidden", "403")


def reset_auth() -> None:
    """Reset NotebookLM auth state. Called by the unified reset-auth endpoint."""
    global _nlm_auth_ok, _nlm_last_error
    _nlm_auth_ok = True
    _nlm_last_error = None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def query_notebook(ticker: str, question: str) -> Optional[str]:
    """Query the ticker's NotebookLM notebook with the user's question.

    Returns corpus context text, or None if:
    - No notebook registered for this ticker
    - notebooklm-py not installed
    - Auth expired (flips _nlm_auth_ok to False)
    - Query timeout or network error
    - Empty/minimal response
    """
    global _nlm_auth_ok, _nlm_last_error

    notebook_id = config.NOTEBOOKLM_TICKER_NOTEBOOKS.get(ticker.upper(), "")
    if not notebook_id:
        return None

    if not _HAS_NOTEBOOKLM:
        return None

    if not _nlm_auth_ok:
        return None

    if not config.NOTEBOOKLM_AUTH_JSON:
        return None

    query = f"Regarding {ticker}: {question}"

    try:
        text = await asyncio.wait_for(
            _ask_notebook(notebook_id, query),
            timeout=config.NOTEBOOKLM_QUERY_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.warning(
            "NotebookLM query timeout for %s (>%ds)",
            ticker, config.NOTEBOOKLM_QUERY_TIMEOUT_SECONDS,
        )
        return None
    except Exception as exc:
        err_str = str(exc).lower()
        if any(marker in err_str for marker in _AUTH_ERROR_MARKERS):
            _nlm_auth_ok = False
            _nlm_last_error = f"NotebookLM auth expired: {exc}"
            logger.warning("NotebookLM auth expired for analyst chat: %s", exc)
        else:
            logger.warning("NotebookLM query failed for %s: %s", ticker, exc)
        return None

    if not text or len(text) < 20:
        logger.info("NotebookLM returned empty/minimal response for %s", ticker)
        return None

    if len(text) > config.NOTEBOOKLM_CONTEXT_MAX_CHARS:
        text = text[:config.NOTEBOOKLM_CONTEXT_MAX_CHARS]

    return text


async def _ask_notebook(notebook_id: str, query: str) -> str:
    """Raw NotebookLM API call. Separated for timeout wrapping."""
    async with await NotebookLMClient.from_storage() as client:
        response = await client.chat.ask(
            notebook_id=notebook_id,
            message=query,
        )
        return response.text if hasattr(response, "text") else str(response)
