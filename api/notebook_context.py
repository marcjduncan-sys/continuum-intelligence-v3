"""
NotebookLM context provider for Analyst Chat and auto-provisioning.

Queries a ticker's NotebookLM notebook (if registered) and returns corpus
context for injection into the research-chat pipeline. Silent failure on
all error paths: the Analyst Chat must work identically for tickers without
notebooks or when NotebookLM is unavailable.

Notebook registry: reads from the database (notebook_registry table) with
fallback to config.NOTEBOOKLM_TICKER_NOTEBOOKS (JSON file + env var).
Auto-provisioning creates notebooks during coverage initiation.

Auth state is independent of gold_agent.py. Both modules are reset via
POST /api/notebooklm/reset-auth.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Optional

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

# ---------------------------------------------------------------------------
# Notebook registry: DB-backed with in-memory cache + JSON fallback
# ---------------------------------------------------------------------------

_registry_cache: dict[str, str] = {}
_registry_cache_ts: float = 0
_REGISTRY_CACHE_TTL = 300  # 5 minutes


async def _load_registry_from_db() -> dict[str, str]:
    """Load ticker->notebook_id mapping from the database."""
    try:
        import db
        pool = await db.get_pool()
        if pool is None:
            return {}
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT ticker, notebook_id FROM notebook_registry "
                "WHERE notebook_id IS NOT NULL AND status IN ('active', 'manual')"
            )
            return {row["ticker"]: row["notebook_id"] for row in rows}
    except Exception as exc:
        logger.debug("notebook_registry DB load failed (using fallback): %s", exc)
        return {}


async def get_notebook_id(ticker: str) -> str:
    """Look up notebook ID for a ticker. DB first, JSON fallback."""
    global _registry_cache, _registry_cache_ts

    ticker = ticker.upper()

    # Refresh cache if stale
    if time.time() - _registry_cache_ts > _REGISTRY_CACHE_TTL:
        db_map = await _load_registry_from_db()
        if db_map:
            _registry_cache = db_map
            _registry_cache_ts = time.time()

    # Try DB cache
    if ticker in _registry_cache:
        return _registry_cache[ticker]

    # Fallback to JSON-loaded config (transition safety)
    return config.NOTEBOOKLM_TICKER_NOTEBOOKS.get(ticker, "")


# ---------------------------------------------------------------------------
# Provisioning: create notebook + seed research sources
# ---------------------------------------------------------------------------

_PROVISION_TIMEOUT = 300  # seconds (deep research takes longer)

_RESEARCH_QUERY_TEMPLATE = (
    "{company_name} ASX:{ticker} annual report quarterly results "
    "investor presentation company announcements broker research "
    "analyst note filings"
)


async def provision_notebook(
    ticker: str,
    company_name: str,
    pool: Any = None,
) -> str | None:
    """Create a NotebookLM notebook for a ticker and seed with research sources.

    Returns notebook_id on success, None on failure. Never raises.
    All errors are caught, logged, and recorded in the database.
    """
    global _nlm_auth_ok, _nlm_last_error

    ticker = ticker.upper()

    if not _HAS_NOTEBOOKLM:
        logger.warning("provision_notebook: notebooklm-py not installed")
        return None

    if not _nlm_auth_ok:
        logger.warning("provision_notebook: auth expired, skipping %s", ticker)
        return None

    if not config.NOTEBOOKLM_AUTH_JSON:
        logger.warning("provision_notebook: NOTEBOOKLM_AUTH_JSON not set")
        return None

    # Check if already active
    existing = await get_notebook_id(ticker)
    if existing:
        logger.info("provision_notebook: %s already has notebook %s", ticker, existing)
        return existing

    # Get DB pool
    if pool is None:
        try:
            import db
            pool = await db.get_pool()
        except Exception:
            pass

    # Set status to provisioning
    await _update_registry(pool, ticker, company_name, None, "provisioning", None)

    notebook_id = None
    try:
        notebook_id = await asyncio.wait_for(
            _do_provision(ticker, company_name),
            timeout=_PROVISION_TIMEOUT,
        )
    except asyncio.TimeoutError:
        logger.warning("provision_notebook: timeout for %s (>%ds)", ticker, _PROVISION_TIMEOUT)
        await _update_registry(pool, ticker, company_name, notebook_id, "timeout", "Provision timed out")
        return notebook_id
    except Exception as exc:
        err_str = str(exc).lower()
        if any(marker in err_str for marker in _AUTH_ERROR_MARKERS):
            _nlm_auth_ok = False
            _nlm_last_error = f"NotebookLM auth expired during provisioning: {exc}"
            logger.warning("provision_notebook: auth expired for %s: %s", ticker, exc)
        else:
            logger.warning("provision_notebook: failed for %s: %s", ticker, exc)
        await _update_registry(pool, ticker, company_name, notebook_id, "failed", str(exc)[:500])
        return None

    if notebook_id:
        await _update_registry(pool, ticker, company_name, notebook_id, "active", None)
        # Refresh cache so immediate queries find the new notebook
        _registry_cache[ticker] = notebook_id
        logger.info("provision_notebook: %s provisioned as %s", ticker, notebook_id)
    else:
        await _update_registry(pool, ticker, company_name, None, "failed", "No notebook_id returned")

    return notebook_id


async def _do_provision(ticker: str, company_name: str) -> str | None:
    """Create notebook and run research import. Raises on failure."""
    title = f"CIv3 - {ticker} - {company_name}"
    query = _RESEARCH_QUERY_TEMPLATE.format(
        company_name=company_name, ticker=ticker,
    )

    async with await NotebookLMClient.from_storage() as client:
        # Step 1: Create notebook
        notebook = await client.notebooks.create(title=title)
        notebook_id = notebook.id if hasattr(notebook, "id") else str(notebook)
        logger.info("provision_notebook: created notebook %s for %s", notebook_id, ticker)

        # Step 2: Run research import (web search for sources)
        try:
            result = await client.research.start(
                notebook_id=notebook_id,
                query=query,
                source="web",
                mode="deep",
            )
            if result:
                logger.info(
                    "provision_notebook: research import started for %s: %s",
                    ticker, str(result)[:200],
                )
                # Import discovered sources if the API supports it
                if hasattr(client.research, "import_sources"):
                    try:
                        await client.research.import_sources(
                            notebook_id=notebook_id,
                        )
                        logger.info("provision_notebook: sources imported for %s", ticker)
                    except Exception as imp_exc:
                        logger.warning(
                            "provision_notebook: source import failed for %s (notebook exists): %s",
                            ticker, imp_exc,
                        )
        except Exception as research_exc:
            logger.warning(
                "provision_notebook: research import failed for %s (notebook created): %s",
                ticker, research_exc,
            )

    return notebook_id


async def _update_registry(
    pool: Any,
    ticker: str,
    company_name: str | None,
    notebook_id: str | None,
    status: str,
    error_message: str | None,
) -> None:
    """Upsert the notebook registry entry."""
    if pool is None:
        return
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO notebook_registry
                    (ticker, notebook_id, status, company_name, error_message, updated_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (ticker) DO UPDATE SET
                    notebook_id = COALESCE($2, notebook_registry.notebook_id),
                    status = $3,
                    company_name = COALESCE($4, notebook_registry.company_name),
                    error_message = $5,
                    updated_at = NOW()
                """,
                ticker, notebook_id, status, company_name, error_message,
            )
    except Exception as exc:
        logger.warning("notebook_registry: DB upsert failed for %s: %s", ticker, exc)


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

    notebook_id = await get_notebook_id(ticker)
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


# ---------------------------------------------------------------------------
# Generation pipeline: batch query + corpus formatter
# ---------------------------------------------------------------------------

GENERATION_QUERIES: list[tuple[str, str]] = [
    ("operations", "What are the core business operations, key assets, production metrics, and operational performance?"),
    ("financials", "What are the key financial metrics, recent results, earnings guidance, and balance sheet position?"),
    ("risks", "What are the main risks, regulatory issues, controversies, or operational challenges?"),
    ("catalysts", "What are the upcoming catalysts, strategic initiatives, expansion plans, or corporate actions?"),
]


async def query_notebook_batch(ticker: str) -> dict[str, str | None]:
    """Query the ticker's NotebookLM notebook with the generation battery.

    Runs all GENERATION_QUERIES in parallel within a single client session.
    Returns a dict keyed by dimension name. Dimensions that fail or return
    minimal content are None. Returns empty dict if no notebook, auth expired,
    or library not installed.
    """
    global _nlm_auth_ok, _nlm_last_error

    notebook_id = await get_notebook_id(ticker)
    if not notebook_id:
        return {}

    if not _HAS_NOTEBOOKLM:
        return {}

    if not _nlm_auth_ok:
        return {}

    if not config.NOTEBOOKLM_AUTH_JSON:
        return {}

    results: dict[str, str | None] = {}

    try:
        async with await NotebookLMClient.from_storage() as client:

            async def _query_one(dimension: str, question: str) -> tuple[str, str | None]:
                query = f"Regarding {ticker}: {question}"
                try:
                    response = await asyncio.wait_for(
                        client.chat.ask(notebook_id=notebook_id, message=query),
                        timeout=config.NOTEBOOKLM_QUERY_TIMEOUT_SECONDS,
                    )
                    text = response.text if hasattr(response, "text") else str(response)
                    if not text or len(text) < 20:
                        logger.info("NotebookLM batch: empty response for %s/%s", ticker, dimension)
                        return dimension, None
                    if len(text) > config.NOTEBOOKLM_CONTEXT_MAX_CHARS:
                        text = text[:config.NOTEBOOKLM_CONTEXT_MAX_CHARS]
                    return dimension, text
                except asyncio.TimeoutError:
                    logger.warning("NotebookLM batch timeout for %s/%s", ticker, dimension)
                    return dimension, None
                except Exception as exc:
                    err_str = str(exc).lower()
                    if any(marker in err_str for marker in _AUTH_ERROR_MARKERS):
                        if _nlm_auth_ok:
                            _nlm_auth_ok = False
                            _nlm_last_error = f"NotebookLM auth expired: {exc}"
                            logger.warning("NotebookLM auth expired during batch for %s: %s", ticker, exc)
                    else:
                        logger.warning("NotebookLM batch query failed for %s/%s: %s", ticker, dimension, exc)
                    return dimension, None

            pairs = await asyncio.gather(
                *[_query_one(dim, q) for dim, q in GENERATION_QUERIES]
            )
            results = dict(pairs)

    except Exception as exc:
        err_str = str(exc).lower()
        if any(marker in err_str for marker in _AUTH_ERROR_MARKERS):
            _nlm_auth_ok = False
            _nlm_last_error = f"NotebookLM auth expired: {exc}"
            logger.warning("NotebookLM auth expired during batch session for %s: %s", ticker, exc)
        else:
            logger.warning("NotebookLM batch session failed for %s: %s", ticker, exc)
        return {}

    return results


def build_corpus_section(ticker: str, corpus: dict[str, str | None]) -> str:
    """Format notebook corpus responses into a prompt section.

    Returns empty string if no dimension has content.
    """
    _LABELS = {
        "operations": "Operations & Assets",
        "financials": "Financials & Guidance",
        "risks": "Risks & Controversies",
        "catalysts": "Catalysts & Strategy",
    }
    parts = [
        f"\n## Source Document Context for {ticker}",
        "The following is grounded in curated research documents (annual reports, "
        "filings, presentations). Use it to anchor your analysis with specific "
        "facts, figures, and operational detail. Do not reproduce verbatim.",
    ]
    has_content = False
    for key, label in _LABELS.items():
        text = corpus.get(key)
        if text:
            parts.append(f"\n### {label}")
            parts.append(text)
            has_content = True
    if not has_content:
        return ""
    return "\n".join(parts)
