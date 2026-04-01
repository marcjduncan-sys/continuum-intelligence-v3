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
from datetime import datetime, timezone
from typing import Any, Optional

import config

logger = logging.getLogger(__name__)

try:
    from notebooklm import NotebookLMClient
    _HAS_NOTEBOOKLM = True
except ImportError:
    NotebookLMClient = None  # allow patch() in tests
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
            question=query,
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

# ---------------------------------------------------------------------------
# Deep extraction pipeline: forensic 12-dimension extraction
# ---------------------------------------------------------------------------

NO_DATA_SENTINEL = "NO_DATA_AVAILABLE"

_ANTI_HALLUCINATION_SUFFIX = (
    " If the uploaded documents do not contain specific data to answer this, "
    "output the exact phrase 'NO_DATA_AVAILABLE'. Do not infer or guess."
)

DEEP_EXTRACTION_QUERIES: list[tuple[str, str]] = [
    ("earnings_quality", "What specific accounting policies, revenue recognition methods, and non-recurring items appear in the financial statements? Identify any changes in accounting treatment between periods." + _ANTI_HALLUCINATION_SUFFIX),
    ("earnings_composition", "Break down revenue and earnings by segment, geography, and customer concentration. What percentage of revenue comes from the top 3 customers or contracts?" + _ANTI_HALLUCINATION_SUFFIX),
    ("cash_flow_reconciliation", "Quantify the exact variance between statutory/GAAP net income, management's 'underlying/adjusted' income, and free cash flow. Identify specific add-backs, working capital anomalies, and capitalised vs expensed costs." + _ANTI_HALLUCINATION_SUFFIX),
    ("structural_growth", "What are the specific organic growth drivers vs acquisition-driven growth? Quantify the capex, R&D, and reinvestment rates relative to depreciation." + _ANTI_HALLUCINATION_SUFFIX),
    ("competitive_position", "What are the specific barriers to entry, switching costs, or network effects? How has market share moved over the last 3 years?" + _ANTI_HALLUCINATION_SUFFIX),
    ("margin_decomposition", "Decompose gross and operating margins by segment. What are the specific cost drivers, input cost exposures, and pricing power indicators?" + _ANTI_HALLUCINATION_SUFFIX),
    ("capital_allocation", "What is management's track record on capital allocation: M&A returns, buyback timing, dividend sustainability, and balance sheet leverage trajectory?" + _ANTI_HALLUCINATION_SUFFIX),
    ("governance_flags", "What are the specific related-party transactions, executive compensation structures, board independence issues, or insider trading patterns?" + _ANTI_HALLUCINATION_SUFFIX),
    ("disclosure_quality", "How transparent are the disclosures? Identify areas where management provides less detail than peers, or where disclosures have changed between periods." + _ANTI_HALLUCINATION_SUFFIX),
    ("variant_perception", "What claims does management make that are not independently verifiable from the source documents? Where does the company's narrative diverge from the financial data?" + _ANTI_HALLUCINATION_SUFFIX),
    ("key_assumptions", "What are the 3-5 assumptions that must be true for the current valuation to be justified? What evidence exists for or against each?" + _ANTI_HALLUCINATION_SUFFIX),
    ("catalyst_timeline", "What specific dated events (results, contract renewals, regulatory decisions, debt maturities) could materially change the investment thesis in the next 12 months?" + _ANTI_HALLUCINATION_SUFFIX),
]


_EXTRACTION_CONCURRENCY = 3
_EXTRACTION_STAGGER_SECONDS = 1.5


async def run_deep_extraction(ticker: str) -> dict[str, str | None]:
    """Query the ticker's NotebookLM notebook with deep extraction queries.

    Runs all DEEP_EXTRACTION_QUERIES with semaphore-controlled concurrency (max 3).
    Returns a dict keyed by dimension name with metadata fields (_extractedAt,
    _notebookId, _queryCount, _dimensionsPopulated). Filters out NO_DATA_SENTINEL
    and responses < 20 chars. Returns empty dict if no notebook, auth expired,
    or library not installed.
    """
    global _nlm_auth_ok, _nlm_last_error

    notebook_id = await get_notebook_id(ticker)
    if not notebook_id:
        logger.warning(
            "Deep extraction: no notebook registered for %s -- corpus will be empty. "
            "Provision via POST /api/notebooks/ensure-all or add to notebooklm-notebooks.json",
            ticker,
        )
        return {}

    if not _HAS_NOTEBOOKLM:
        logger.warning("Deep extraction: notebooklm-py not installed, skipping %s", ticker)
        return {}

    if not _nlm_auth_ok:
        logger.warning("Deep extraction: auth expired, skipping %s", ticker)
        return {}

    if not config.NOTEBOOKLM_AUTH_JSON:
        logger.warning("Deep extraction: NOTEBOOKLM_AUTH_JSON not set, skipping %s", ticker)
        return {}

    results: dict[str, str | None] = {}
    semaphore = asyncio.Semaphore(_EXTRACTION_CONCURRENCY)

    try:
        async with await NotebookLMClient.from_storage() as client:

            async def _query_one(dimension: str, question: str) -> tuple[str, str | None]:
                async with semaphore:
                    query = f"Regarding {ticker}: {question}"
                    try:
                        response = await asyncio.wait_for(
                            client.chat.ask(notebook_id=notebook_id, question=query),
                            timeout=config.NOTEBOOKLM_QUERY_TIMEOUT_SECONDS,
                        )
                        text = response.text if hasattr(response, "text") else str(response)

                        # Filter out NO_DATA_SENTINEL
                        if NO_DATA_SENTINEL in text:
                            logger.info("Deep extraction: %s/%s returned NO_DATA_AVAILABLE", ticker, dimension)
                            return dimension, None

                        # Filter out responses < 20 chars
                        if not text or len(text) < 20:
                            logger.info("Deep extraction: empty response for %s/%s", ticker, dimension)
                            return dimension, None

                        # Cap at max chars
                        if len(text) > config.NOTEBOOKLM_CONTEXT_MAX_CHARS:
                            text = text[:config.NOTEBOOKLM_CONTEXT_MAX_CHARS]

                        return dimension, text
                    except asyncio.TimeoutError:
                        logger.warning("Deep extraction timeout for %s/%s", ticker, dimension)
                        return dimension, None
                    except Exception as exc:
                        err_str = str(exc).lower()
                        if any(marker in err_str for marker in _AUTH_ERROR_MARKERS):
                            if _nlm_auth_ok:
                                _nlm_auth_ok = False
                                _nlm_last_error = f"NotebookLM auth expired: {exc}"
                                logger.warning("Deep extraction: auth expired for %s: %s", ticker, exc)
                        else:
                            logger.warning("Deep extraction query failed for %s/%s: %s", ticker, dimension, exc)
                        return dimension, None
                    finally:
                        # Stagger the requests to avoid rate limiting
                        await asyncio.sleep(_EXTRACTION_STAGGER_SECONDS)

            pairs = await asyncio.gather(
                *[_query_one(dim, q) for dim, q in DEEP_EXTRACTION_QUERIES]
            )
            results = dict(pairs)

    except Exception as exc:
        err_str = str(exc).lower()
        if any(marker in err_str for marker in _AUTH_ERROR_MARKERS):
            _nlm_auth_ok = False
            _nlm_last_error = f"NotebookLM auth expired: {exc}"
            logger.warning("Deep extraction: auth expired during session for %s: %s", ticker, exc)
        else:
            logger.warning("Deep extraction session failed for %s: %s", ticker, exc)
        return {}

    # Add metadata fields
    dimensions_with_content = sum(1 for v in results.values() if v is not None)
    results["_extractedAt"] = datetime.now(timezone.utc).isoformat()
    results["_notebookId"] = notebook_id
    results["_queryCount"] = 12
    results["_dimensionsPopulated"] = dimensions_with_content

    return results


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
        logger.warning(
            "Notebook batch query: no notebook registered for %s -- skipping",
            ticker,
        )
        return {}

    if not _HAS_NOTEBOOKLM:
        logger.warning("Notebook batch query: notebooklm-py not installed, skipping %s", ticker)
        return {}

    if not _nlm_auth_ok:
        logger.warning("Notebook batch query: auth expired, skipping %s", ticker)
        return {}

    if not config.NOTEBOOKLM_AUTH_JSON:
        logger.warning("Notebook batch query: NOTEBOOKLM_AUTH_JSON not set, skipping %s", ticker)
        return {}

    results: dict[str, str | None] = {}

    try:
        async with await NotebookLMClient.from_storage() as client:

            async def _query_one(dimension: str, question: str) -> tuple[str, str | None]:
                query = f"Regarding {ticker}: {question}"
                try:
                    response = await asyncio.wait_for(
                        client.chat.ask(notebook_id=notebook_id, question=query),
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


_DEFAULT_CORPUS_MAX_CHARS = 48_000

_DIMENSION_LABELS: dict[str, str] = {
    # v2 deep extraction dimensions
    "earnings_quality": "Earnings Quality Assessment",
    "earnings_composition": "Revenue & Earnings Composition",
    "cash_flow_reconciliation": "Cash Flow Reconciliation",
    "structural_growth": "Structural Growth Analysis",
    "competitive_position": "Competitive Position & Moat",
    "margin_decomposition": "Margin Decomposition",
    "capital_allocation": "Capital Allocation Track Record",
    "governance_flags": "Governance & Red Flags",
    "disclosure_quality": "Disclosure Quality",
    "variant_perception": "Variant Perception",
    "key_assumptions": "Key Thesis Assumptions",
    "catalyst_timeline": "Catalyst Timeline",
    # v1 backward compatibility
    "operations": "Operations & Assets",
    "financials": "Financials & Guidance",
    "risks": "Risks & Controversies",
    "catalysts": "Catalysts & Strategy",
}

# Priority order for truncation: key_assumptions, variant_perception,
# cash_flow_reconciliation, earnings_quality, catalyst_timeline, then alphabetically
_TRUNCATION_PRIORITY = [
    "key_assumptions",
    "variant_perception",
    "cash_flow_reconciliation",
    "earnings_quality",
    "catalyst_timeline",
]


def build_corpus_section(ticker: str, corpus: dict[str, str | None], max_chars: int = _DEFAULT_CORPUS_MAX_CHARS) -> str:
    """Format notebook corpus responses into a prompt section.

    Handles all 12 deep extraction dimensions plus 4 v1 dimensions.
    Skips keys starting with _ (metadata). Applies proportional truncation if
    total exceeds max_chars, with priority order.

    Returns empty string if no dimension has content.
    """
    header = [
        f"\n## Source Document Context for {ticker}",
        "The following is grounded in curated research documents (annual reports, "
        "filings, presentations). Use it to anchor your analysis with specific "
        "facts, figures, and operational detail. Do not reproduce verbatim.",
    ]
    header_text = "\n".join(header)

    # Filter and format corpus sections (skip metadata keys starting with _)
    sections: list[tuple[str, str, str]] = []  # (key, label, text)
    for key, label in _DIMENSION_LABELS.items():
        text = corpus.get(key)
        if text and not key.startswith("_"):
            sections.append((key, label, text))

    if not sections:
        return ""

    # If total length is under budget, include all sections
    total_length = sum(len(f"\n### {label}\n{text}") for _, label, text in sections)
    if total_length + len(header_text) <= max_chars:
        parts = [header_text]
        for _, label, text in sections:
            parts.append(f"\n### {label}")
            parts.append(text)
        return "\n".join(parts)

    # Otherwise, apply proportional truncation with priority
    available_chars = max(500, max_chars - len(header_text))  # Minimum 500 chars for content
    section_chars = available_chars // len(sections)

    # Sort sections by truncation priority
    def priority_index(section: tuple[str, str, str]) -> tuple[int, str]:
        key = section[0]
        if key in _TRUNCATION_PRIORITY:
            return (_TRUNCATION_PRIORITY.index(key), key)
        return (len(_TRUNCATION_PRIORITY), key)

    sections.sort(key=priority_index)

    parts = [header_text]
    current_length = len(header_text)
    for _, label, text in sections:
        if current_length >= max_chars:
            break
        # Truncate to fit remaining budget
        remaining = max_chars - current_length
        label_len = len(f"\n### {label}\n")
        if remaining > label_len:
            truncated = text[:remaining - label_len] if len(text) > remaining - label_len else text
            if truncated:
                parts.append(f"\n### {label}")
                parts.append(truncated)
                current_length += label_len + len(truncated)

    result = "\n".join(parts)
    # Final safety truncation
    if len(result) > max_chars:
        result = result[:max_chars]
    return result


async def ensure_all_notebooks() -> dict[str, str]:
    """Provision notebooks for all tickers that have research but no notebook.

    Cross-references research files in data/research/ against the notebook
    registry (DB + JSON fallback). Any ticker without an active or manual
    notebook gets provisioned sequentially to respect NotebookLM rate limits.

    Returns a dict of {ticker: notebook_id} for newly provisioned notebooks.
    Never raises -- all errors are caught and logged.
    """
    from pathlib import Path

    if not _HAS_NOTEBOOKLM:
        logger.info("ensure_all_notebooks: notebooklm-py not installed, skipping")
        return {}

    if not _nlm_auth_ok:
        logger.warning("ensure_all_notebooks: auth expired, skipping")
        return {}

    if not config.NOTEBOOKLM_AUTH_JSON:
        logger.warning("ensure_all_notebooks: NOTEBOOKLM_AUTH_JSON not set, skipping")
        return {}

    data_dir = Path(config.PROJECT_ROOT) / "data" / "research"
    if not data_dir.exists():
        logger.info("ensure_all_notebooks: no data/research directory, skipping")
        return {}

    # Collect all tickers with research files
    all_tickers = []
    ticker_companies: dict[str, str] = {}
    for f in sorted(data_dir.glob("*.json")):
        if f.name.startswith("_"):
            continue
        ticker = f.stem.upper()
        try:
            import json as _json
            with open(f) as fh:
                research = _json.load(fh)
            ticker_companies[ticker] = research.get("company", ticker)
            all_tickers.append(ticker)
        except Exception:
            continue

    if not all_tickers:
        logger.info("ensure_all_notebooks: no research files found")
        return {}

    # Load current registry from DB
    db_registry = await _load_registry_from_db()

    # Also check JSON fallback for manual entries
    json_registry = config.NOTEBOOKLM_TICKER_NOTEBOOKS or {}

    # Identify tickers without active notebooks
    missing = []
    for ticker in all_tickers:
        if ticker in db_registry:
            continue
        if json_registry.get(ticker, ""):
            continue
        missing.append(ticker)

    if not missing:
        logger.info(
            "ensure_all_notebooks: all %d tickers have notebooks", len(all_tickers)
        )
        return {}

    logger.info(
        "ensure_all_notebooks: %d of %d tickers missing notebooks: %s",
        len(missing), len(all_tickers), missing,
    )

    # Also find tickers with failed/timed-out status that should be retried
    try:
        import db
        pool = await db.get_pool()
        if pool:
            async with pool.acquire() as conn:
                failed_rows = await conn.fetch(
                    "SELECT ticker FROM notebook_registry "
                    "WHERE status IN ('failed', 'timeout') "
                    "AND (updated_at IS NULL OR updated_at < NOW() - INTERVAL '1 hour')"
                )
                failed_tickers = {row["ticker"] for row in failed_rows}
                # Add failed tickers that are not already in missing
                for t in failed_tickers:
                    if t not in missing and t in ticker_companies:
                        missing.append(t)
                if failed_tickers:
                    logger.info(
                        "ensure_all_notebooks: %d failed/timed-out tickers eligible for retry: %s",
                        len(failed_tickers), sorted(failed_tickers),
                    )
    except Exception as exc:
        logger.warning("ensure_all_notebooks: failed to query failed tickers: %s", exc)

    # Provision sequentially (respect NotebookLM rate limits + Fly.io memory)
    provisioned: dict[str, str] = {}
    for ticker in missing:
        if not _nlm_auth_ok:
            logger.warning(
                "ensure_all_notebooks: auth expired mid-run after %d provisions, stopping",
                len(provisioned),
            )
            break

        company = ticker_companies.get(ticker, ticker)
        try:
            nb_id = await provision_notebook(ticker, company)
            if nb_id:
                provisioned[ticker] = nb_id
                logger.info(
                    "ensure_all_notebooks: provisioned %s (%s) -> %s",
                    ticker, company, nb_id,
                )
            else:
                logger.warning(
                    "ensure_all_notebooks: provisioning returned None for %s", ticker
                )
        except Exception as exc:
            logger.warning(
                "ensure_all_notebooks: provisioning failed for %s: %s", ticker, exc
            )

        # Brief pause between provisions to avoid rate limiting
        await asyncio.sleep(5)

    logger.info(
        "ensure_all_notebooks: completed. Provisioned %d of %d missing tickers. "
        "Total coverage: %d/%d",
        len(provisioned), len(missing),
        len(all_tickers) - len(missing) + len(provisioned), len(all_tickers),
    )
    return provisioned


def select_dimensions(question: str) -> list[str]:
    """Select relevant dimensions for a Strategist Chat question.

    Routes based on keyword matches in the question. Returns a list of dimension
    keys to extract. Falls back to all 12 dimensions if no keywords match.

    Routing rules:
    - earnings/profit/revenue/income/accounting -> earnings_quality, earnings_composition, cash_flow_reconciliation
    - growth/market share/moat/competitive/barriers -> structural_growth, competitive_position
    - margin/cost/pricing/input/opex/scale -> margin_decomposition, capital_allocation
    - governance/board/insider/compensation/related party/disclosure/transparency -> governance_flags, disclosure_quality
    - thesis/assumption/valuation/catalyst/event/trigger/risk/variant -> variant_perception, key_assumptions, catalyst_timeline
    - cash flow/fcf/working capital/capex/free cash/add-back/adjusted/underlying/statutory -> cash_flow_reconciliation, capital_allocation
    - m&a/acquisition/goodwill/intangible/synergy -> structural_growth, capital_allocation
    """
    question_lower = question.lower()

    # Build a set of matching dimensions
    matched = set()

    # Earnings group
    earnings_keywords = ("earnings", "profit", "revenue", "income", "accounting", "fiscal", "net income")
    if any(kw in question_lower for kw in earnings_keywords):
        matched.update(["earnings_quality", "earnings_composition", "cash_flow_reconciliation"])

    # Growth & competitive group
    growth_keywords = ("growth", "market share", "moat", "competitive", "barriers", "organic", "expansion")
    if any(kw in question_lower for kw in growth_keywords):
        matched.update(["structural_growth", "competitive_position"])

    # Margin & cost group
    margin_keywords = ("margin", "cost", "pricing", "input", "opex", "cogs", "scale", "efficiency")
    if any(kw in question_lower for kw in margin_keywords):
        matched.update(["margin_decomposition", "capital_allocation"])

    # Governance & disclosure group
    governance_keywords = ("governance", "board", "insider", "compensation", "related party", "disclosure", "transparency")
    if any(kw in question_lower for kw in governance_keywords):
        matched.update(["governance_flags", "disclosure_quality"])

    # Thesis & assumptions group
    thesis_keywords = ("thesis", "assumption", "valuation", "catalyst", "event", "trigger", "risk", "variant")
    if any(kw in question_lower for kw in thesis_keywords):
        matched.update(["variant_perception", "key_assumptions", "catalyst_timeline"])

    # Cash flow & capital group
    cashflow_keywords = ("cash flow", "fcf", "working capital", "capex", "free cash", "add-back", "adjusted", "underlying", "statutory")
    if any(kw in question_lower for kw in cashflow_keywords):
        matched.update(["cash_flow_reconciliation", "capital_allocation"])

    # M&A group
    mna_keywords = ("m&a", "acquisition", "goodwill", "intangible", "synergy", "merger")
    if any(kw in question_lower for kw in mna_keywords):
        matched.update(["structural_growth", "capital_allocation"])

    # If matches found, return the matched set (deduplicated)
    if matched:
        return sorted(list(matched))

    # No match: return all 12 deep extraction dimensions
    return [dim for dim, _ in DEEP_EXTRACTION_QUERIES]
