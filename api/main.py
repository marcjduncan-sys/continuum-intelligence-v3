"""
Continuum Intelligence — Research Chat API

FastAPI backend that provides LLM-powered research chat grounded in
structured equity research data.
"""

import asyncio
import json
import logging
import os
import re
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import anthropic
import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from errors import api_error, APIError, api_error_handler, rate_limit_handler, ErrorCode

import config
import db
import embeddings
import llm
import memory_extractor
import validator
import memory_selector
import prompt_builder
import batch_analysis
import insights
import summarise
from auth import decode_token, router as auth_router
from conversations import router as conversations_router
from profiles import router as profiles_router
from pm_chat import router as pm_chat_router
from pm_conversations import router as pm_conversations_router
from pm_journal import router as pm_journal_router
from handoff_api import router as handoff_router
from portfolio_api import router as portfolio_router
from pm_ops import router as pm_ops_router
from source_upload import router as source_upload_router
from economist_api import router as economist_router
from ingest import ingest, embed_all_passages, get_tickers, get_passage_count
from refresh import (
    RefreshJob, refresh_jobs, get_job, is_running, run_refresh,
    batch_jobs, get_batch_job, get_latest_batch_job, is_batch_running,
    run_batch_refresh, _data_dir,
)
from retriever import retrieve
from source_db import get_source_passages
from task_monitor import monitored_task, get_failure_count
import gold_agent
from gold_agent import run_gold_analysis, check_gold_health, get_cached_result
from github_commit import commit_files_to_github
import notebook_context
from price_drivers import (
    run_price_driver_analysis, run_price_driver_scan,
    get_latest_report as get_latest_driver_report,
    check_drivers_health,
)


# ---------------------------------------------------------------------------
# Structured JSON logging
# ---------------------------------------------------------------------------

class _JSONFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            "time": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0]:
            log_obj["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_obj)


_handler = logging.StreamHandler()
_handler.setFormatter(_JSONFormatter())
logging.basicConfig(level=logging.INFO, handlers=[_handler])
logger = logging.getLogger(__name__)



# ---------------------------------------------------------------------------
# Security helpers
# ---------------------------------------------------------------------------

_INJECTION_MARKERS = [
    '</system>',
    '<human>',
    '[INST]',
    '[/INST]',
    '###SYSTEM',
    'IGNORE PREVIOUS INSTRUCTIONS',
    '\x00',
]


def _sanitise_system_prompt(text: str | None) -> str | None:
    """Sanitise a client-supplied system prompt.

    Raises HTTPException(400) if the text exceeds 6000 characters.
    Strips known prompt-injection markers (case-insensitive) in place.
    Returns None unchanged.
    """
    if text is None:
        return None
    if len(text) > 6000:
        raise api_error(400, ErrorCode.VALIDATION_ERROR, 'system_prompt exceeds maximum length')
    lowered = text.lower()
    for marker in _INJECTION_MARKERS:
        if marker.lower() in lowered:
            import re as _re
            text = _re.sub(_re.escape(marker), '', text, flags=_re.IGNORECASE)
            lowered = text.lower()
    return text


# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ingest research data on startup."""
    # Validate API key
    if not config.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY is NOT set — chat will return 500 errors")
    elif not config.ANTHROPIC_API_KEY.startswith("sk-ant-"):
        logger.warning("ANTHROPIC_API_KEY does not look like a valid Anthropic key")
    else:
        logger.info("ANTHROPIC_API_KEY is configured (starts with sk-ant-...)")

    # Validate Gemini API key
    if not config.GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY is NOT set — refresh will fall back to Claude only")
    else:
        logger.info("GEMINI_API_KEY is configured")

    logger.info("Ingesting research data from index.html...")
    t0 = time.time()
    store = ingest()
    counts = get_passage_count()
    total = sum(counts.values())
    logger.info(
        f"Ingested {total} passages across {len(store)} stocks "
        f"in {time.time() - t0:.2f}s"
    )
    for ticker, count in sorted(counts.items()):
        logger.info(f"  {ticker}: {count} passages")

    # Run embedding in background so health check passes during deploy.
    # embed_all_passages() can take 2-6 minutes with 3000+ passages;
    # blocking here causes Fly.io deploy timeout (--wait-timeout=300).
    async def _embed_background():
        try:
            await embed_all_passages()
            logger.info("Background embedding complete")
        except Exception:
            logger.exception("Background embedding failed (non-fatal)")

    monitored_task(_embed_background(), name="embed_all_passages")

    # Auto-retry incomplete coverage initiations (scaffolds stuck from failed adds)
    async def _retry_incomplete_coverage():
        await asyncio.sleep(60)  # Let embedding and health check stabilise
        from refresh import _is_scaffold, _load_research, is_running, run_refresh, _data_dir
        data_dir = _data_dir()
        if not data_dir.exists():
            logger.info("[AutoRetry] No data directory found, skipping")
            return
        retried = []
        for f in sorted(data_dir.glob("*.json")):
            if f.name.startswith("_"):
                continue
            ticker = f.stem
            try:
                research = _load_research(ticker)
                if not _is_scaffold(research):
                    continue
                if is_running(ticker):
                    logger.info("[AutoRetry] %s is already running, skipping", ticker)
                    continue
                logger.info("[AutoRetry] %s is a scaffold, retrying coverage initiation", ticker)
                await run_refresh(ticker)
                retried.append(ticker)
                logger.info("[AutoRetry] %s coverage initiation completed", ticker)
                try:
                    ingest()
                    await embed_all_passages()
                except Exception as e:
                    logger.warning("[AutoRetry] Re-ingest after %s failed: %s", ticker, e)
            except Exception as e:
                logger.error("[AutoRetry] %s retry failed: %s", ticker, e, exc_info=True)
        if retried:
            logger.info("[AutoRetry] Retried %d scaffolds: %s", len(retried), retried)
        else:
            logger.info("[AutoRetry] No scaffolds found, all stocks have coverage")

    monitored_task(_retry_incomplete_coverage(), name="retry_incomplete_coverage")

    # Periodic database pool health check (every 60s)
    async def _db_health_loop():
        while True:
            await asyncio.sleep(60)
            status = await db.health_check()
            if status != "ok":
                logger.warning("Periodic DB health check: %s", status)

    health_task = monitored_task(_db_health_loop(), name="db_health_loop")

    # Start Economist data refresh scheduler
    try:
        from clients.scheduler import start_scheduler, stop_scheduler
        pool = await db.get_pool()
        await start_scheduler(pool)
        logger.info("Economist scheduler started")
    except Exception as exc:
        logger.warning("Economist scheduler failed to start: %s", exc)

    yield

    # Stop Economist scheduler
    try:
        from clients.scheduler import stop_scheduler
        await stop_scheduler()
    except Exception:
        pass

    health_task.cancel()
    try:
        await health_task
    except asyncio.CancelledError:
        pass
    await embeddings.close_client()
    await db.close_pool()


# ---------------------------------------------------------------------------
# Sentry error monitoring (Phase 5)
# ---------------------------------------------------------------------------

_sentry_dsn = os.environ.get("SENTRY_DSN", "")
if _sentry_dsn:
    import sentry_sdk
    sentry_sdk.init(dsn=_sentry_dsn, traces_sample_rate=0.1)
    logger.info("Sentry initialised")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Continuum Intelligence Research Chat API",
    version="1.0.0",
    description="RAG-powered equity research assistant backed by structured research data.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiter (in-memory, resets on Railway restart — acceptable)
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(APIError, api_error_handler)
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)

app.include_router(auth_router)
app.include_router(conversations_router)
app.include_router(profiles_router)
if os.environ.get("ENABLE_PM", "true").lower() == "true":
    app.include_router(pm_chat_router)
    app.include_router(pm_conversations_router)
    app.include_router(pm_journal_router)
    app.include_router(handoff_router)
    app.include_router(portfolio_router)
    app.include_router(pm_ops_router)
    app.include_router(source_upload_router)
    logger.info("PM endpoints enabled")

# Economist endpoints registered below after verify_api_key is defined
else:
    logger.info("PM endpoints disabled (ENABLE_PM != true)")


# ---------------------------------------------------------------------------
# API key authentication
# ---------------------------------------------------------------------------

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

TICKER_PATTERN = re.compile(r"^[A-Z0-9]{1,6}$")


async def verify_api_key(api_key: str | None = Depends(_api_key_header)):
    """Validate API key on protected endpoints.

    If CI_API_KEY is empty, authentication is disabled (dev mode).
    """
    if not config.CI_API_KEY:
        return
    if not api_key or api_key != config.CI_API_KEY:
        raise api_error(401, ErrorCode.AUTH_ERROR, "Invalid or missing API key")


# Economist endpoints (always enabled, auth-gated except /health)
app.include_router(economist_router, dependencies=[Depends(verify_api_key)])


# Anthropic client (delegates to shared singleton in config)
def _get_client() -> anthropic.Anthropic:
    try:
        return config.get_anthropic_client()
    except RuntimeError:
        raise api_error(500, ErrorCode.SERVER_ERROR, "ANTHROPIC_API_KEY not configured. Set it as an environment variable.")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'")
    content: str = Field(..., description="Message content")


class ResearchChatRequest(BaseModel):
    ticker: str = Field(..., description="Stock ticker (e.g. 'WOW')")
    question: str = Field(..., description="User's research question")
    thesis_alignment: str | None = Field(
        None,
        description="Optional thesis alignment: 'bullish', 'bearish', 'neutral', or tier like 't1', 't2'",
    )
    conversation_history: list[ChatMessage] = Field(
        default_factory=list,
        description="Prior conversation messages for context",
    )
    conversation_id: str | None = Field(
        None,
        description="DB conversation ID -- enables server-side context and rolling summarisation",
    )
    custom_system_prompt: str | None = Field(
        None,
        description="Optional custom system prompt (overrides default for personalised chat)",
    )
    system_prompt: str | None = Field(
        None,
        description="Legacy alias for custom_system_prompt (backwards compatibility)",
    )


class SourcePassage(BaseModel):
    section: str
    subsection: str
    content: str
    relevance_score: float
    source_origin: str = "platform"


class ResearchChatResponse(BaseModel):
    response: str = Field(..., description="LLM-generated response")
    ticker: str
    sources: list[SourcePassage] = Field(
        default_factory=list,
        description="Research passages used to ground the response",
    )
    model: str = Field(..., description="Model used for generation")


# ---------------------------------------------------------------------------
# System prompt (canonical copy lives in prompt_builder.py -- Phase 5)
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = prompt_builder.DEFAULT_SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# Build context from retrieved passages
# ---------------------------------------------------------------------------

def _build_context(passages: list[dict], ticker: str) -> str:
    """Format retrieved passages into a context block for the LLM."""
    if not passages:
        return f"No research passages found for {ticker}."

    lines = [f"## Research Context for {ticker}\n"]
    for i, p in enumerate(passages, 1):
        lines.append(f"### Passage {i} [{p['section']}/{p['subsection']}]")
        lines.append(p["content"])
        lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/api/research-chat", response_model=ResearchChatResponse)
@limiter.limit("30/minute")
async def research_chat(request: Request, body: ResearchChatRequest, background_tasks: BackgroundTasks, _=Depends(verify_api_key)):
    """
    Research chat endpoint.

    Receives a ticker, question, optional thesis alignment, and conversation
    history. Retrieves relevant research passages and returns an LLM-generated
    response grounded in the research.
    """
    ticker = body.ticker.upper()
    if not TICKER_PATTERN.match(ticker):
        raise api_error(400, ErrorCode.INVALID_TICKER, f"Invalid ticker format: '{ticker}'")

    # Validate ticker — skip for personalised chat with custom system prompt
    available = get_tickers()
    has_research = ticker in available

    if not has_research and not body.custom_system_prompt:
        raise api_error(404, ErrorCode.NOT_FOUND, f"Ticker '{ticker}' not found", detail=f"Available: {', '.join(available)}")

    # Load user-uploaded source passages for multi-source retrieval
    _auth_header_r = request.headers.get("Authorization", "")
    _uid_r = None
    _gid_r = None
    if _auth_header_r.startswith("Bearer "):
        _payload_r = decode_token(_auth_header_r[7:])
        if _payload_r:
            _uid_r = _payload_r.get("sub")
    if not _uid_r:
        _gid_r = request.query_params.get("guest_id")

    _user_source_passages = None
    if _uid_r or _gid_r:
        _src_pool = await db.get_pool()
        if _src_pool:
            _user_source_passages = await get_source_passages(
                _src_pool, ticker=ticker, user_id=_uid_r, guest_id=_gid_r,
            )

    # Retrieve relevant passages (skip if ticker not indexed and no user sources)
    passages = []
    context = ""
    if has_research or _user_source_passages:
        passages = await retrieve(
            query=body.question,
            ticker=ticker,
            thesis_alignment=body.thesis_alignment,
            max_passages=config.MAX_PASSAGES,
            user_passages=_user_source_passages,
        )
        context = _build_context(passages, ticker)

    # Query NotebookLM corpus (supplementary context, silent failure)
    nlm_context = await notebook_context.query_notebook(ticker, body.question)

    # Build messages for Claude
    messages = []

    # Add conversation history (with rolling summarisation if conversation_id provided)
    if body.conversation_id:
        pool = await db.get_pool()
        summary, db_messages = await summarise.summarise_if_needed(
            pool, body.conversation_id, ticker, config.get_anthropic_client()
        )
        history_msgs = db_messages[-(config.MAX_CONVERSATION_TURNS * 2):]
        if summary:
            messages.append({"role": "user", "content": "[PRIOR CONTEXT SUMMARY]\n" + summary})
        for msg in history_msgs:
            messages.append({"role": msg["role"], "content": msg["content"]})
    else:
        history = body.conversation_history[-config.MAX_CONVERSATION_TURNS * 2:]
        for msg in history:
            messages.append({"role": msg.role, "content": msg.content})

    # Enforce token budget on conversation history (B4)
    history_tokens = sum(len(m["content"]) // 4 for m in messages)
    if history_tokens > config.HISTORY_TOKEN_BUDGET:
        while len(messages) > 1 and history_tokens > config.HISTORY_TOKEN_BUDGET:
            removed = messages.pop(0)
            history_tokens -= len(removed["content"]) // 4
        messages.insert(0, {
            "role": "user",
            "content": "[Conversation truncated - earlier messages removed to stay within context budget]",
        })

    # Add the current question with structured research + passage context
    structured_ctx = prompt_builder.build_structured_research_context(ticker)
    if structured_ctx or context or nlm_context:
        user_message = ""
        if structured_ctx:
            user_message += structured_ctx + "\n\n"
        if context:
            user_message += f"<research_context>\n{context}\n</research_context>\n\n"
        if nlm_context:
            user_message += (
                f"<notebook_context>\n"
                f"## Supplementary Corpus Context for {ticker}\n"
                f"Source: NotebookLM corpus (curated research documents)\n\n"
                f"{nlm_context}\n"
                f"</notebook_context>\n\n"
            )
        user_message += f"**Stock:** {ticker}\n"
    else:
        user_message = f"**Stock:** {ticker}\n"
    if body.thesis_alignment:
        user_message += f"**Thesis alignment:** {body.thesis_alignment}\n"
    user_message += f"**Question:** {body.question}"

    messages.append({"role": "user", "content": user_message})

    # Build effective system prompt (Phase 5: server-side assembly)
    # Priority: server-side profile > client system_prompt (deprecated) > default
    effective_system = SYSTEM_PROMPT
    _csp = _sanitise_system_prompt(body.custom_system_prompt)
    _sp = _sanitise_system_prompt(body.system_prompt)
    if _csp or _sp:
        logger.warning(
            "DEPRECATED: client-sent system_prompt received; will be removed in a future release",
            extra={"ticker": ticker, "length": len(_csp or _sp or "")},
        )

    # Try loading the server-side profile for the authenticated user/guest
    _auth_header = request.headers.get("Authorization", "")
    _user_id = None
    _guest_id = None
    if _auth_header.startswith("Bearer "):
        _payload = decode_token(_auth_header[7:])
        if _payload:
            _user_id = _payload.get("sub")
    if not _user_id:
        _guest_id = request.query_params.get("guest_id")

    if _user_id or _guest_id:
        _pool = await db.get_pool()
        _profile_data = await db.get_profile(_pool, user_id=_user_id, guest_id=_guest_id)
        if _profile_data and _profile_data.get("profile"):
            effective_system = prompt_builder.build_personalised_prompt(_profile_data)
            logger.info("Server-side personalised prompt built", extra={"ticker": ticker, "user_id": _user_id})
        elif _csp or _sp:
            effective_system = _csp or _sp
    elif _csp or _sp:
        effective_system = _csp or _sp

    # Inject relevant memories into the prompt (Phase 7)
    if _user_id or _guest_id:
        selected_memories = await memory_selector.select_memories(
            user_id=_user_id, guest_id=_guest_id, ticker=ticker, question=body.question,
        )
        effective_system += prompt_builder.format_memories_section(selected_memories)

    try:
        result = await llm.complete(
            model=config.ANTHROPIC_MODEL,
            system=effective_system,
            messages=messages,
            max_tokens=config.CHAT_MAX_TOKENS,
            feature="research-chat",
            ticker=ticker,
        )
    except Exception as e:
        logger.error(f"LLM API error: {e}")
        raise api_error(502, ErrorCode.LLM_ERROR, "LLM API error", detail=str(e))

    response_text = result.text

    # Validate claims against retrieved passages (Phase 1 hallucination detection)
    validation = validator.validate_response(response_text, passages)
    if validation.flagged_claims:
        response_text = validation.annotated_text

    # Build source passages for the response
    sources = [
        SourcePassage(
            section=p["section"],
            subsection=p["subsection"],
            content=p["content"][:300],  # Truncate for response size
            relevance_score=p["relevance_score"],
            source_origin=p.get("source_origin", "platform"),
        )
        for p in passages[:6]  # Top 6 sources
    ]

    # Fire memory extraction in the background (Phase 6)
    if _user_id or _guest_id:
        background_tasks.add_task(
            memory_extractor.extract_memories,
            user_id=_user_id,
            guest_id=_guest_id,
            ticker=ticker,
            question=body.question,
            response_text=response_text,
            conversation_id=body.conversation_id,
        )

    return ResearchChatResponse(
        response=response_text,
        ticker=ticker,
        sources=sources,
        model=config.ANTHROPIC_MODEL,
    )


@app.get("/api/health")
async def health():
    """Full system health check with subsystem status reporting.

    Returns HTTP 200 with structured JSON even when degraded.
    Top-level 'status': 'healthy' | 'degraded' | 'unhealthy'.
    """
    # -- Subsystem checks --
    db_status = await db.health_check()
    embedding_status = await embeddings.health_check()
    llm_status = llm.get_llm_status()
    bg_failures = get_failure_count()
    tickers = get_tickers()
    counts = get_passage_count()

    # -- Determine overall status --
    # Critical: DB or LLM (no successful call ever recorded)
    db_ok = db_status == "ok"
    llm_ok = len(llm_status) > 0  # at least one provider has succeeded
    # Non-critical: embeddings, background tasks
    embedding_ok = embedding_status == "ok"
    bg_ok = bg_failures < 10

    if not db_ok or not llm_ok:
        overall = "unhealthy"
    elif not embedding_ok or not bg_ok:
        overall = "degraded"
    else:
        overall = "healthy"

    return {
        "status": overall,
        "subsystems": {
            "database": db_status,
            "llm": {"providers": llm_status} if llm_status else {"providers": {}, "note": "no calls recorded yet"},
            "embeddings": embedding_status,
            "background_tasks": {"failures_1h": bg_failures, "status": "ok" if bg_ok else "threshold_breached"},
        },
        "tickers": tickers,
        "passage_counts": counts,
        "total_passages": sum(counts.values()),
    }


@app.get("/api/tickers")
async def list_tickers():
    """List available tickers and their passage counts."""
    return {
        "tickers": get_tickers(),
        "counts": get_passage_count(),
    }


# ---------------------------------------------------------------------------
# Chart proxy (Yahoo Finance OHLCV)
# ---------------------------------------------------------------------------

_YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}.AX"


@app.get("/api/chart/{ticker}")
@limiter.limit("60/minute")
async def chart_proxy(ticker: str, request: Request):
    """Proxy Yahoo Finance chart data for an ASX ticker.

    Returns 3 years of daily OHLCV bars. No auth required.
    """
    ticker = ticker.upper()
    if not TICKER_PATTERN.match(ticker):
        raise api_error(400, ErrorCode.INVALID_TICKER, f"Invalid ticker format: '{ticker}'")

    url = _YAHOO_CHART_URL.format(ticker=ticker)
    params = {"range": "3y", "interval": "1d", "includePrePost": "false"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(url, params=params)
        except httpx.RequestError as exc:
            logger.error("Yahoo chart request failed for %s: %s", ticker, exc)
            raise api_error(502, ErrorCode.UPSTREAM_ERROR, "Upstream request failed")

    if resp.status_code != 200:
        raise api_error(resp.status_code, ErrorCode.UPSTREAM_ERROR, f"Yahoo Finance returned {resp.status_code}")

    return resp.json()


# ---------------------------------------------------------------------------
# Gold agent endpoint
# ---------------------------------------------------------------------------


@app.get("/api/agents/gold/health")
async def gold_agent_health():
    """Check NotebookLM and Gemini connectivity, corpus availability."""
    return await check_gold_health()


@app.post("/api/agents/gold/reset-auth", dependencies=[Depends(verify_api_key)])
async def gold_agent_reset_auth():
    """Reset NotebookLM auth flag for the gold agent only.

    Prefer POST /api/notebooklm/reset-auth to reset all modules at once.
    """
    gold_agent.reset_auth()
    return {"status": "ok", "nlm_auth_ok": True}


@app.post("/api/notebooklm/reset-auth", dependencies=[Depends(verify_api_key)])
async def notebooklm_reset_auth():
    """Reset NotebookLM auth flags in both notebook_context and gold_agent modules.

    Call this after refreshing cookies and updating NOTEBOOKLM_AUTH_JSON in Fly.io
    to avoid needing a full redeploy.
    """
    notebook_context.reset_auth()
    gold_agent.reset_auth()
    return {"status": "ok", "notebook_context_auth_ok": True, "gold_agent_auth_ok": True}


@app.get("/api/notebooks/pending", dependencies=[Depends(verify_api_key)])
async def notebooks_pending():
    """List tickers where notebook provisioning is not complete."""
    pool = await db.get_pool()
    if pool is None:
        return {"pending": []}
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT ticker, status, error_message, notebook_id, updated_at
                FROM notebook_registry
                WHERE status NOT IN ('active', 'manual')
                ORDER BY updated_at DESC
                """
            )
            return {"pending": [dict(r) for r in rows]}
    except Exception as exc:
        return {"error": str(exc), "pending": []}


@app.post("/api/notebooks/retry/{ticker}", dependencies=[Depends(verify_api_key)])
async def notebooks_retry(ticker: str):
    """Re-attempt notebook provisioning for a specific ticker."""
    ticker = ticker.upper()
    pool = await db.get_pool()

    # Look up company name from registry or research data
    company_name = ticker
    if pool:
        try:
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT company_name FROM notebook_registry WHERE ticker = $1", ticker
                )
                if row and row["company_name"]:
                    company_name = row["company_name"]
        except Exception:
            pass

    # If no company name in registry, try research data
    if company_name == ticker:
        data_path = Path(config.PROJECT_ROOT) / "data" / "research" / f"{ticker}.json"
        if data_path.exists():
            try:
                with open(data_path) as f:
                    research = json.load(f)
                    company_name = research.get("company", ticker)
            except Exception:
                pass

    nb_id = await notebook_context.provision_notebook(ticker, company_name, pool=pool)
    return {
        "ticker": ticker,
        "notebook_id": nb_id,
        "status": "active" if nb_id else "failed",
    }


@app.get("/api/notebooks/status", dependencies=[Depends(verify_api_key)])
async def notebooks_status():
    """Return full notebook registry for operational overview."""
    pool = await db.get_pool()
    if pool is None:
        return {"registry": []}
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT ticker, notebook_id, status, company_name, created_at, updated_at, error_message "
                "FROM notebook_registry ORDER BY ticker"
            )
            return {"registry": [dict(r) for r in rows]}
    except Exception as exc:
        return {"error": str(exc), "registry": []}


@app.get("/api/macro/state")
async def macro_state():
    """Return current macro variable values with rolling 30-day statistics.

    Used by the frontend staleness badge (BEAD-005) and regime detector (BEAD-004).
    No auth required -- read-only, non-sensitive aggregate data.
    """
    pool = await db.get_pool()
    if pool is None:
        return {"error": "database not available", "variables": {}}

    variables: dict = {}

    try:
        async with pool.acquire() as conn:
            # Key macro series from FRED/EIA/RBA (latest values)
            series_rows = await conn.fetch(
                """
                SELECT source, series_id, last_value, last_date, previous_value,
                       previous_date, unit, updated_at
                FROM macro_series
                WHERE series_id IN (
                    'DGS10', 'BRENT_SPOT', 'WTI_SPOT',
                    'CASH_RATE', 'AUDUSD', 'VIXCLS',
                    'AU_10Y', 'FEDFUNDS',
                    'IRON_ORE', 'GOLD', 'COPPER'
                )
                """
            )
            for row in series_rows:
                sid = row["series_id"]
                current = float(row["last_value"]) if row["last_value"] is not None else None
                previous = float(row["previous_value"]) if row["previous_value"] is not None else None
                change_pct = None
                if current is not None and previous is not None and previous != 0:
                    change_pct = ((current - previous) / abs(previous)) * 100

                variables[sid] = {
                    "source": row["source"],
                    "current": current,
                    "previous": previous,
                    "change_pct": round(change_pct, 2) if change_pct is not None else None,
                    "unit": row["unit"],
                    "last_date": row["last_date"],
                    "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
                }

            # Key FX/commodity prices from macro_prices (latest per symbol)
            price_rows = await conn.fetch(
                """
                SELECT DISTINCT ON (symbol) symbol, price, change_pct, source, fetched_at
                FROM macro_prices
                WHERE symbol IN ('AUD/USD', 'XAU/USD', 'NZD/USD', 'EUR/USD')
                ORDER BY symbol, fetched_at DESC
                """
            )
            for row in price_rows:
                symbol = row["symbol"]
                variables[symbol] = {
                    "source": row["source"],
                    "current": float(row["price"]) if row["price"] is not None else None,
                    "previous": None,
                    "change_pct": round(float(row["change_pct"]), 2) if row["change_pct"] is not None else None,
                    "unit": "rate",
                    "last_date": None,
                    "updated_at": row["fetched_at"].isoformat() if row["fetched_at"] else None,
                }

            # Rolling 30-day stats from macro_series_history
            rolling_rows = await conn.fetch(
                """
                SELECT source, series_id,
                       AVG(value) AS mean_30d,
                       STDDEV(value) AS stddev_30d,
                       COUNT(*) AS sample_count
                FROM macro_series_history
                WHERE recorded_at >= NOW() - INTERVAL '30 days'
                GROUP BY source, series_id
                """
            )
            rolling_map: dict = {}
            for row in rolling_rows:
                key = row["series_id"]
                rolling_map[key] = {
                    "mean_30d": round(float(row["mean_30d"]), 4) if row["mean_30d"] is not None else None,
                    "stddev_30d": round(float(row["stddev_30d"]), 4) if row["stddev_30d"] is not None else None,
                    "sample_count": row["sample_count"],
                }

            # Merge rolling stats into variables
            for key, var in variables.items():
                stats = rolling_map.get(key, {})
                var["rolling_30d_mean"] = stats.get("mean_30d")
                var["rolling_30d_stddev"] = stats.get("stddev_30d")
                var["rolling_30d_samples"] = stats.get("sample_count", 0)

    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("macro_state: query failed: %s", exc)
        return {"error": str(exc), "variables": {}}

    return {"variables": variables}


@app.post("/api/regime/refresh", dependencies=[Depends(verify_api_key)])
@limiter.limit("6/minute")
async def regime_refresh(request: Request, background_tasks: BackgroundTasks):
    """Trigger narrative refresh for tickers affected by a macro regime break.

    Accepts a regime event context and list of tickers. Queues refreshes
    through the existing pipeline with regime_context injected into the
    gathered data so the LLM prompts address the macro shift explicitly.

    Throttle: max 3 concurrent, max 24 per hour.
    """
    body = await request.json()
    tickers = body.get("tickers", [])
    regime_context = body.get("regime_context", {})

    if not tickers:
        raise api_error(400, ErrorCode.VALIDATION_ERROR, "No tickers provided")
    if not regime_context:
        raise api_error(400, ErrorCode.VALIDATION_ERROR, "No regime_context provided")

    # Validate tickers exist
    data_dir = Path(config.PROJECT_ROOT) / "data" / "research"
    queued = []
    unknown = []
    already_running = []

    for t in tickers:
        t = t.upper().replace(".AX", "")
        if not (data_dir / f"{t}.json").exists():
            unknown.append(t)
            continue
        if is_running(t):
            already_running.append(t)
            continue
        queued.append(t)

    # Hourly cap: 24 regime refreshes per hour
    if not hasattr(app.state, "_regime_refresh_times"):
        app.state._regime_refresh_times = []

    import time as _time
    now = _time.time()
    app.state._regime_refresh_times = [
        ts for ts in app.state._regime_refresh_times if now - ts < 3600
    ]
    remaining_budget = 24 - len(app.state._regime_refresh_times)

    rate_limited = []
    if len(queued) > remaining_budget:
        rate_limited = queued[remaining_budget:]
        queued = queued[:remaining_budget]

    # Queue each ticker refresh with regime_context
    for t in queued:
        app.state._regime_refresh_times.append(now)
        background_tasks.add_task(_run_refresh_background, t, regime_context)
        if not get_job(t) or get_job(t).status in ("completed", "failed"):
            refresh_jobs[t] = RefreshJob(ticker=t)

    return {
        "queued": queued,
        "already_running": already_running,
        "rate_limited": rate_limited,
        "unknown": unknown,
        "hourly_budget_remaining": max(0, remaining_budget - len(queued)),
    }


@app.get("/api/agents/gold/{ticker}", dependencies=[Depends(verify_api_key)])
@limiter.limit("2/minute")
async def gold_agent_endpoint(ticker: str, request: Request, force: bool = False, notebook_id: str = ""):
    """
    Run gold equities analysis for an ASX ticker.

    Hybrid corpus: NotebookLM (primary) with Gemini local fallback.
    Returns cached result if available (24h TTL). Pass ?force=true to bypass cache.
    Pass ?notebook_id=<id> to use a per-ticker NotebookLM notebook.
    Expect 60-120 seconds latency. Rate-limited to 2 requests/minute.
    """
    ticker = ticker.upper()
    if not TICKER_PATTERN.match(ticker):
        raise api_error(400, ErrorCode.INVALID_TICKER, f"Invalid ticker format: '{ticker}'")

    try:
        result = await run_gold_analysis(ticker, force=force, notebook_id=notebook_id)
        return result
    except RuntimeError as exc:
        raise api_error(503, ErrorCode.SERVICE_UNAVAILABLE, str(exc))
    except Exception as exc:
        logger.error("Gold agent error for %s: %s", ticker, exc)
        raise api_error(500, ErrorCode.SERVER_ERROR, "Gold analysis failed", detail=str(exc))


# ---------------------------------------------------------------------------
# Price driver agent endpoints
# ---------------------------------------------------------------------------

_drivers_secret_header = APIKeyHeader(name="X-Drivers-Secret", auto_error=False)


@app.get("/api/agents/drivers/health")
async def drivers_health():
    """Check price driver agent availability."""
    return await check_drivers_health()


@app.get("/api/agents/drivers/{ticker}/latest", dependencies=[Depends(verify_api_key)])
@limiter.limit("10/minute")
async def drivers_latest(ticker: str, request: Request):
    """Fetch the most recent cached price driver report for a ticker."""
    ticker = ticker.upper()
    if not TICKER_PATTERN.match(ticker):
        raise api_error(400, ErrorCode.INVALID_TICKER, f"Invalid ticker format: '{ticker}'")
    result = await get_latest_driver_report(ticker)
    if not result:
        raise api_error(404, ErrorCode.NOT_FOUND, f"No price driver report for {ticker}")
    return result


@app.get("/api/agents/drivers/{ticker}", dependencies=[Depends(verify_api_key)])
@limiter.limit("2/minute")
async def drivers_analyse(ticker: str, request: Request, force: bool = True):
    """
    Run on-demand price driver analysis for a ticker.

    Expect 30-60 seconds latency. Rate-limited to 1 request/minute.
    Pass ?force=true to bypass cache.
    """
    ticker = ticker.upper()
    if not TICKER_PATTERN.match(ticker):
        raise api_error(400, ErrorCode.INVALID_TICKER, f"Invalid ticker format: '{ticker}'")

    # Resolve company name from research data
    import os as _os
    research_path = _os.path.join(config.PROJECT_ROOT, "data", "research", f"{ticker}.json")
    company_name = ticker
    if _os.path.exists(research_path):
        import json as _json
        with open(research_path, "r") as f:
            rdata = _json.load(f)
            company_name = rdata.get("company", ticker)

    try:
        result = await run_price_driver_analysis(ticker, company_name, force=force)
        return result
    except RuntimeError as exc:
        raise api_error(503, ErrorCode.SERVICE_UNAVAILABLE, str(exc))
    except Exception as exc:
        logger.error("Price driver error for %s: %s", ticker, exc)
        raise api_error(500, ErrorCode.SERVER_ERROR, "Price driver analysis failed", detail=str(exc))


@app.post("/api/agents/drivers/scan")
async def drivers_scan(request: Request, secret: str | None = Depends(_drivers_secret_header)):
    """
    Run daily price driver scan for all tickers.

    Protected by X-Drivers-Secret header. Triggered by price-drivers GitHub
    Actions workflow at 22:00 UTC daily. Runs synchronously -- the response
    is returned only after the scan completes (30-45 minutes for ~30 tickers).
    """
    if not config.PRICE_DRIVERS_SECRET or secret != config.PRICE_DRIVERS_SECRET:
        raise api_error(401, ErrorCode.AUTH_ERROR, "Invalid or missing drivers secret")

    try:
        result = await run_price_driver_scan()
        return {"status": "complete", "result": result}
    except Exception as exc:
        logger.error("Price driver scan failed: %s", exc)
        raise api_error(500, ErrorCode.SERVER_ERROR, "Scan failed", detail=str(exc))


# ---------------------------------------------------------------------------
# Batch analysis endpoint
# ---------------------------------------------------------------------------

_batch_secret_header = APIKeyHeader(name="X-Batch-Secret", auto_error=False)


@app.post("/api/batch/run")
async def batch_run(request: Request, secret: str | None = Depends(_batch_secret_header)):
    """
    Run nightly memory consolidation.

    Protected by X-Batch-Secret header. Triggered by the batch-analysis GitHub
    Actions workflow at 16:00 UTC daily. Safe to run manually via workflow_dispatch.
    Returns a summary of users processed and memories merged/retired.
    """
    if not config.BATCH_SECRET or secret != config.BATCH_SECRET:
        raise api_error(401, ErrorCode.AUTH_ERROR, "Invalid or missing batch secret")
    pool = await db.get_pool()
    try:
        result = await batch_analysis.run_batch_analysis(pool)
        return result
    except Exception as exc:
        logger.error("Batch run failed: %s", exc)
        raise api_error(500, ErrorCode.SERVER_ERROR, "Batch analysis failed")


# ---------------------------------------------------------------------------
# Notifications endpoints (Phase 9)
# ---------------------------------------------------------------------------

_insights_secret_header = APIKeyHeader(name="X-Insights-Secret", auto_error=False)


@app.get("/api/notifications")
async def get_notifications(request: Request):
    """
    Return active (not dismissed) notifications for the caller, newest first.

    Authentication: Bearer JWT for registered users, or ?guest_id= for guests.
    """
    auth_header = request.headers.get("Authorization", "")
    user_id = None
    guest_id = None
    if auth_header.startswith("Bearer "):
        payload = decode_token(auth_header[7:])
        if payload:
            user_id = payload.get("sub")
    if not user_id:
        guest_id = request.query_params.get("guest_id")
    pool = await db.get_pool()
    return await insights.get_notifications(pool, user_id=user_id, guest_id=guest_id)


@app.get("/api/drift")
async def get_drift_alerts(request: Request):
    """
    Return evidence drift alerts for the caller.

    Compares stored user views against current research skew.
    Flags when a bullish view faces downside skew (or vice versa),
    or when significant new evidence has been added since the view was formed.
    """
    auth_header = request.headers.get("Authorization", "")
    user_id = None
    guest_id = None
    if auth_header.startswith("Bearer "):
        payload = decode_token(auth_header[7:])
        if payload:
            user_id = payload.get("sub")
    if not user_id:
        guest_id = request.query_params.get("guest_id")
    pool = await db.get_pool()
    return await insights.get_drift_alerts(pool, user_id=user_id, guest_id=guest_id)


@app.patch("/api/notifications/{notification_id}/dismiss")
async def dismiss_notification(notification_id: str, request: Request):
    """
    Dismiss a notification. Ownership check: caller must own the notification.

    Authentication: Bearer JWT for registered users, or ?guest_id= for guests.
    """
    auth_header = request.headers.get("Authorization", "")
    user_id = None
    guest_id = None
    if auth_header.startswith("Bearer "):
        payload = decode_token(auth_header[7:])
        if payload:
            user_id = payload.get("sub")
    if not user_id:
        guest_id = request.query_params.get("guest_id")
    if not user_id and not guest_id:
        raise api_error(401, ErrorCode.AUTH_ERROR, "Authentication required")
    pool = await db.get_pool()
    updated = await insights.dismiss_notification(
        pool, notification_id=notification_id, user_id=user_id, guest_id=guest_id
    )
    if not updated:
        raise api_error(404, ErrorCode.NOT_FOUND, "Notification not found or already dismissed")
    return {"dismissed": True}


@app.post("/api/insights/scan")
async def insights_scan(
    request: Request,
    secret: str | None = Depends(_insights_secret_header),
):
    """
    Run the proactive insight scan across all tickers with active memories.

    Protected by X-Insights-Secret header. Triggered by the insights-scan
    GitHub Actions workflow at 17:00 UTC daily (Mon-Fri).
    Optionally accepts {"tickers": ["WOW", ...]} to limit scope.
    """
    if not config.INSIGHTS_SECRET or secret != config.INSIGHTS_SECRET:
        raise api_error(401, ErrorCode.AUTH_ERROR, "Invalid or missing insights secret")
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    tickers = body.get("tickers", [])
    pool = await db.get_pool()
    try:
        result = await insights.run_insight_scan(pool, tickers=tickers)
        return result
    except Exception as exc:
        logger.error("Insight scan failed: %s", exc)
        raise api_error(500, ErrorCode.SERVER_ERROR, "Insight scan failed")


# ---------------------------------------------------------------------------
# Memory endpoints
# ---------------------------------------------------------------------------


@app.get("/api/memories")
async def list_memories(request: Request, guest_id: str | None = None):
    """List all active memories for the current user or guest."""
    auth_header = request.headers.get("Authorization", "")
    user_id = None
    if auth_header.startswith("Bearer "):
        payload = decode_token(auth_header[7:])
        if payload:
            user_id = payload.get("sub")
    resolved_guest_id = guest_id if not user_id else None

    if not user_id and not resolved_guest_id:
        return {"memories": [], "count": 0}

    pool = await db.get_pool()
    if not pool:
        return {"memories": [], "count": 0}

    try:
        rows = await db.get_memories(
            pool, user_id=user_id, guest_id=resolved_guest_id, active_only=True
        )
        return {"memories": rows, "count": len(rows)}
    except Exception as exc:
        logger.error("Failed to list memories: %s", exc)
        return {"memories": [], "count": 0}


@app.delete("/api/memories/{memory_id}")
async def delete_memory(memory_id: str, request: Request, guest_id: str | None = None):
    """Delete (deactivate) a specific memory."""
    auth_header = request.headers.get("Authorization", "")
    user_id = None
    if auth_header.startswith("Bearer "):
        payload = decode_token(auth_header[7:])
        if payload:
            user_id = payload.get("sub")
    resolved_guest_id = guest_id if not user_id else None

    if not user_id and not resolved_guest_id:
        raise api_error(400, ErrorCode.AUTH_ERROR, "Authentication required")

    pool = await db.get_pool()
    if not pool:
        raise api_error(503, ErrorCode.SERVICE_UNAVAILABLE, "Database unavailable")

    try:
        async with pool.acquire() as conn:
            if user_id:
                result = await conn.execute(
                    "UPDATE memories SET active = FALSE, updated_at = NOW() "
                    "WHERE id = $1::uuid AND user_id = $2",
                    memory_id, user_id,
                )
            else:
                result = await conn.execute(
                    "UPDATE memories SET active = FALSE, updated_at = NOW() "
                    "WHERE id = $1::uuid AND guest_id = $2",
                    memory_id, resolved_guest_id,
                )
        return {"deleted": True, "id": memory_id}
    except Exception as exc:
        logger.error("Failed to delete memory %s: %s", memory_id, exc)
        raise api_error(500, ErrorCode.SERVER_ERROR, "Failed to delete memory")


@app.get("/api/admin/llm-usage")
async def llm_usage(days: int = 7):
    """LLM cost breakdown by feature, model, and provider."""
    pool = await db.get_pool()
    rows = await db.get_llm_usage(pool, days=days)
    total_cost = sum(r.get("total_cost_usd", 0) or 0 for r in rows)
    total_calls = sum(r.get("call_count", 0) or 0 for r in rows)
    return {
        "period_days": days,
        "total_cost_usd": round(total_cost, 4),
        "total_calls": total_calls,
        "breakdown": rows,
    }


# ---------------------------------------------------------------------------
# Add Stock endpoint
# ---------------------------------------------------------------------------

async def _run_gold_agent_background(ticker: str, research_path: Path, token: str) -> None:
    """
    Background task: run the gold agent for a newly added gold miner and
    commit the result to GitHub, replacing the generic scaffold.
    """
    try:
        logger.info("[GoldAgent] Background analysis starting for %s", ticker)
        result = await run_gold_analysis(ticker)
        with open(research_path, "w") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        await commit_files_to_github(
            {f"data/research/{ticker}.json": research_path},
            f"Add {ticker}: gold agent analysis",
            token,
        )
        logger.info("[GoldAgent] Background analysis committed for %s", ticker)
    except Exception as e:
        logger.warning("[GoldAgent] Background run failed for %s: %s", ticker, e)



class AddStockRequest(BaseModel):
    ticker: str = Field(..., description="ASX ticker code, e.g. 'MIN'")


@app.post("/api/stocks/add")
@limiter.limit("3/minute")
async def add_stock(
    body: AddStockRequest,
    request: Request,
    _=Depends(verify_api_key),
):
    """
    Add a new stock to the coverage universe.

    Auto-detects company name, sector, and industry from Yahoo Finance,
    then creates all required data files so the stock is immediately
    available for browsing and refresh.
    """
    from scaffold import (
        fetch_company_metadata,
        fetch_company_name,
        build_research_scaffold,
        build_tickers_entry,
        build_index_entry,
        build_reference_entry,
        build_freshness_entry,
        build_stocks_entry,
    )
    from web_search import fetch_yahoo_price

    ticker = body.ticker.strip().upper()
    if not TICKER_PATTERN.match(ticker):
        raise api_error(400, ErrorCode.INVALID_TICKER, f"Invalid ticker: '{ticker}'")

    # Check if already exists
    data_dir = Path(config.PROJECT_ROOT) / "data"
    research_dir = data_dir / "research"
    if (research_dir / f"{ticker}.json").exists():
        raise api_error(409, ErrorCode.CONFLICT, f"{ticker} already exists")

    # ---- Fetch company metadata + price in parallel ----
    import asyncio as _aio
    metadata_coro = fetch_company_metadata(ticker)
    name_coro = fetch_company_name(ticker)
    price_coro = fetch_yahoo_price(ticker)

    metadata, company_name, price_data = await _aio.gather(
        metadata_coro, name_coro, price_coro, return_exceptions=True,
    )

    # Handle errors
    if isinstance(price_data, Exception) or (isinstance(price_data, dict) and "error" in price_data):
        detail = str(price_data) if isinstance(price_data, Exception) else price_data.get("error")
        raise api_error(400, ErrorCode.VALIDATION_ERROR, f"Could not fetch price data for {ticker}.AX", detail=f"Is it a valid ASX ticker? ({detail})")

    if isinstance(metadata, Exception):
        logger.warning(f"Metadata fetch failed for {ticker}: {metadata}")
        metadata = {}
    elif isinstance(metadata, dict) and "error" in metadata:
        logger.warning(f"Metadata fetch error for {ticker}: {metadata['error']}")
        metadata = {}

    if isinstance(company_name, Exception):
        company_name = None

    # Resolve fields
    company = company_name or ticker
    sector = metadata.get("sector", "Unknown")
    industry = metadata.get("industry") or ""
    description = metadata.get("description") or ""

    logger.info(f"[AddStock] {ticker}: company={company}, sector={sector}, industry={industry}")

    # ---- Build scaffold + config entries ----
    research_data = build_research_scaffold(ticker, company, sector, industry, price_data)
    stocks_data = build_stocks_entry(ticker, company, sector, price_data)
    tickers_entry = build_tickers_entry(ticker, company, sector, industry, price_data)
    index_entry = build_index_entry(ticker, company, sector, industry, price_data)
    reference_entry = build_reference_entry(ticker, price_data, sector, industry)
    freshness_entry = build_freshness_entry(ticker, price_data.get("price", 0))

    # ---- Write files ----
    # 1. Research JSON
    research_dir.mkdir(parents=True, exist_ok=True)
    with open(research_dir / f"{ticker}.json", "w") as f:
        json.dump(research_data, f, indent=2, ensure_ascii=False)
    logger.info(f"[AddStock] Saved data/research/{ticker}.json")

    # 2. _index.json
    index_path = research_dir / "_index.json"
    try:
        with open(index_path) as f:
            index = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        index = {}
    index[ticker] = index_entry
    with open(index_path, "w") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)

    # 3. tickers.json
    tickers_path = data_dir / "config" / "tickers.json"
    try:
        with open(tickers_path) as f:
            tickers_config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        tickers_config = {"_version": 1, "tickers": {}}
    tickers_config.setdefault("tickers", {})[ticker] = tickers_entry
    tickers_config["_updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with open(tickers_path, "w") as f:
        json.dump(tickers_config, f, indent=2, ensure_ascii=False)

    # 4. reference.json
    reference_path = data_dir / "reference.json"
    try:
        with open(reference_path) as f:
            reference = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        reference = {}
    reference[ticker] = reference_entry
    with open(reference_path, "w") as f:
        json.dump(reference, f, indent=2, ensure_ascii=False)

    # 5. freshness.json
    freshness_path = data_dir / "freshness.json"
    try:
        with open(freshness_path) as f:
            freshness = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        freshness = {}
    freshness[ticker] = freshness_entry
    with open(freshness_path, "w") as f:
        json.dump(freshness, f, indent=2, ensure_ascii=False)

    # 6. data/stocks/{TICKER}.json — required by the frontend loader for signal fields.
    # Without this file, src/data/loader.js silently omits three_layer_signal,
    # valuation_range, and price_signals for every API-added ticker.
    stocks_dir = data_dir / "stocks"
    stocks_dir.mkdir(parents=True, exist_ok=True)
    stocks_path = stocks_dir / f"{ticker}.json"
    with open(stocks_path, "w") as f:
        json.dump(stocks_data, f, indent=2, ensure_ascii=False)
    logger.info(f"[AddStock] Saved data/stocks/{ticker}.json")

    # ---- Re-ingest so chat API sees the new ticker ----
    try:
        ingest()
        await embed_all_passages()
        logger.info(f"[AddStock] Re-ingested passages after adding {ticker}")
    except Exception as e:
        logger.warning(f"[AddStock] Re-ingest failed (non-fatal): {e}")

    # ---- Commit scaffold files to GitHub ----
    # CRITICAL: Fly.io has an ephemeral filesystem. Files written above survive
    # only until the next redeploy. The GitHub repo is the only durable store.
    # commit_files_to_github() now returns False when any file fails to commit,
    # allowing us to surface a clear error rather than silently losing the data.
    _scaffold_files = {
        f"data/research/{ticker}.json": research_dir / f"{ticker}.json",
        "data/research/_index.json": index_path,
        "data/reference.json": reference_path,
        "data/freshness.json": freshness_path,
        "data/config/tickers.json": tickers_path,
        f"data/stocks/{ticker}.json": stocks_path,
    }
    try:
        commit_ok = await commit_files_to_github(
            _scaffold_files,
            f"Add {ticker}: scaffold ({company})",
            config.GITHUB_TOKEN,
        )
    except Exception as e:
        logger.error(f"[AddStock] GitHub commit raised exception: {e}")
        commit_ok = False

    if not commit_ok:
        # Roll back the 409 guard: remove the research file we just wrote so
        # the client can retry without hitting a false "already exists" conflict.
        try:
            (research_dir / f"{ticker}.json").unlink(missing_ok=True)
        except OSError:
            pass
        raise api_error(
            503,
            ErrorCode.UPSTREAM_ERROR,
            f"Could not persist {ticker} to GitHub. The ticker was not added. "
            f"Check GITHUB_TOKEN in the Fly.io dashboard and retry.",
        )

    # ---- Kick off coverage initiation as a tracked background task ----
    # IMPORTANT: Railway's proxy timeout is ~60s. The coverage initiation
    # pipeline takes 60-90s. We CANNOT block the HTTP response -- we must
    # return the scaffold immediately and let the frontend poll for progress.
    # The old fire-and-forget asyncio.create_task swallowed all errors.
    # This version uses the existing RefreshJob tracking so the frontend
    # can poll /api/refresh/{ticker}/status and /api/refresh/{ticker}/result.

    async def _tracked_coverage_initiation():
        """Run coverage initiation with full error visibility."""
        try:
            logger.info("[AddStock] Background coverage initiation starting for %s", ticker)
            await run_refresh(ticker)
            logger.info("[AddStock] Coverage initiation completed for %s", ticker)

            # Re-ingest so chat API sees populated content
            try:
                ingest()
                await embed_all_passages()
            except Exception as ingest_err:
                logger.warning("[AddStock] Re-ingest failed (non-fatal): %s", ingest_err)

            # Update reference.json with fresh Yahoo data from the refresh
            commit_files = {}
            dist_research_path = _data_dir() / f"{ticker}.json"
            commit_path = dist_research_path if dist_research_path.exists() else (research_dir / f"{ticker}.json")
            commit_files[f"data/research/{ticker}.json"] = commit_path

            try:
                from web_search import fetch_yahoo_price as _fetch_yp
                from scaffold import build_reference_entry as _build_ref
                fresh_price = await _fetch_yp(ticker)
                if "error" not in fresh_price:
                    ref_path = data_dir / "reference.json"
                    with open(ref_path) as _rf:
                        ref_data = json.load(_rf)
                    ref_data[ticker] = _build_ref(ticker, fresh_price, sector, industry)
                    with open(ref_path, "w") as _wf:
                        json.dump(ref_data, _wf, indent=2, ensure_ascii=False)
                    commit_files["data/reference.json"] = ref_path
                    logger.info("[AddStock] Updated reference.json for %s", ticker)
            except Exception as ref_err:
                logger.warning("[AddStock] reference.json update failed (non-fatal): %s", ref_err)

            # Also commit updated _index.json (featuredMetrics may have been rebuilt)
            if index_path.exists():
                commit_files["data/research/_index.json"] = index_path

            # Commit the POPULATED research + updated reference to GitHub
            try:
                await commit_files_to_github(
                    commit_files,
                    f"Add {ticker}: coverage initiation ({company})",
                    config.GITHUB_TOKEN,
                )
                logger.info("[AddStock] Populated research committed for %s", ticker)
            except Exception as commit_err:
                logger.warning("[AddStock] GitHub commit of populated research failed: %s", commit_err)

            # Auto-provision NotebookLM notebook (fire-and-forget, non-blocking)
            try:
                nb_id = await notebook_context.provision_notebook(ticker, company)
                if nb_id:
                    logger.info("[AddStock] NotebookLM notebook provisioned for %s: %s", ticker, nb_id)
                else:
                    logger.warning("[AddStock] NotebookLM provisioning returned None for %s (check /api/notebooks/pending)", ticker)
            except Exception as nlm_err:
                logger.warning("[AddStock] NotebookLM provisioning failed for %s (non-fatal): %s", ticker, nlm_err)

            # Auto-infer macro sensitivity mapping
            try:
                from web_search import SECTOR_COMMODITY_MAP
                import macro_sensitivity as _ms
                scm_entry = SECTOR_COMMODITY_MAP.get(ticker)
                entries = _ms.infer_macro_sensitivity(ticker, scm_entry, sector)
                if entries:
                    await _ms.write_sensitivity(ticker, entries, source="inferred")
                    logger.info("[AddStock] Macro sensitivity inferred for %s: %d entries", ticker, len(entries))
            except Exception as ms_err:
                logger.warning("[AddStock] Macro sensitivity inference failed for %s (non-fatal): %s", ticker, ms_err)

        except Exception as e:
            logger.error("[AddStock] Coverage initiation FAILED for %s: %s", ticker, e, exc_info=True)
            # RefreshJob.status is already set to "failed" by run_refresh().
            # The frontend will see this when polling /api/refresh/{ticker}/status.

    monitored_task(_tracked_coverage_initiation(), name=f"coverage_initiation:{ticker}")
    logger.info(f"[AddStock] Coverage initiation task launched for {ticker}")

    return {
        "status": "added",
        "ticker": ticker,
        "company": company,
        "sector": sector,
        "industry": industry,
        "price": price_data.get("price"),
        "currency": price_data.get("currency", "A$"),
    }


# ---------------------------------------------------------------------------
# Refresh endpoints
# ---------------------------------------------------------------------------

def _run_refresh_background(ticker: str, regime_context: dict | None = None):
    """Run refresh in a new event loop (for BackgroundTasks)."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(run_refresh(ticker, regime_context=regime_context))
    finally:
        loop.close()


@app.post("/api/refresh/{ticker}")
@limiter.limit("5/minute")
async def trigger_refresh(
    request: Request,
    ticker: str,
    background_tasks: BackgroundTasks,
    _=Depends(verify_api_key),
):
    """
    Trigger a data refresh for a single stock.

    Returns 409 if a refresh is already running for this ticker.
    """
    ticker = ticker.upper()
    if not TICKER_PATTERN.match(ticker):
        raise api_error(400, ErrorCode.INVALID_TICKER, f"Invalid ticker format: '{ticker}'")

    # Validate ticker exists in research data
    data_dir = Path(config.PROJECT_ROOT) / "data" / "research"
    if not (data_dir / f"{ticker}.json").exists():
        raise api_error(404, ErrorCode.NOT_FOUND, f"No research data found for '{ticker}'")

    # Check if ticker is part of an active batch refresh
    if is_batch_running():
        raise api_error(409, ErrorCode.CONFLICT, f"{ticker} is part of an active batch refresh")

    # Check for existing running job
    if is_running(ticker):
        raise api_error(409, ErrorCode.CONFLICT, f"Refresh already in progress for {ticker}")

    # Create job and launch in background
    background_tasks.add_task(_run_refresh_background, ticker)

    # Pre-create the job entry so status polling works immediately
    if not get_job(ticker) or get_job(ticker).status in ("completed", "failed"):
        refresh_jobs[ticker] = RefreshJob(ticker=ticker)

    return {
        "status": "started",
        "ticker": ticker,
        "message": f"Refresh started for {ticker}",
    }


@app.get("/api/refresh/{ticker}/status")
async def refresh_status(ticker: str):
    """Poll the progress of a refresh job."""
    ticker = ticker.upper()
    job = get_job(ticker)
    if job is None:
        raise api_error(404, ErrorCode.NOT_FOUND, f"No refresh job found for {ticker}")
    return job.to_dict()


@app.get("/api/refresh/{ticker}/result")
async def refresh_result(ticker: str):
    """Fetch updated research JSON after a refresh completes."""
    ticker = ticker.upper()
    job = get_job(ticker)

    if job is None:
        raise api_error(404, ErrorCode.NOT_FOUND, f"No refresh job for {ticker}")

    if job.status == "failed":
        raise api_error(500, ErrorCode.SERVER_ERROR, "Refresh failed", detail=job.error)

    if job.status != "completed":
        raise api_error(202, ErrorCode.CONFLICT, f"Refresh still in progress: {job.stage_label}")

    # Return the updated research data and free memory
    if job.result:
        data = job.result
        job.result = None  # Free memory after delivery
        return data

    # Fallback: read from disk
    data_dir = Path(config.PROJECT_ROOT) / "data" / "research"
    path = data_dir / f"{ticker}.json"
    if path.exists():
        with open(path) as f:
            return json.load(f)

    raise api_error(404, ErrorCode.NOT_FOUND, "Research data not found")


# ---------------------------------------------------------------------------
# Batch refresh endpoints
# ---------------------------------------------------------------------------

def _run_batch_background(batch_id: str, tickers: list[str]):
    """Run batch refresh in a new event loop (for BackgroundTasks)."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(run_batch_refresh(batch_id, tickers))
    finally:
        loop.close()


@app.post("/api/refresh-all")
@limiter.limit("1/hour")
async def trigger_refresh_all(
    request: Request,
    background_tasks: BackgroundTasks,
    _=Depends(verify_api_key),
):
    """Trigger a batch refresh for all (or specified) stocks."""
    if is_batch_running():
        raise api_error(409, ErrorCode.CONFLICT, "A batch refresh is already in progress")

    # Accept optional {"tickers": ["BHP", "CBA"]} to refresh only a subset
    raw_body: dict = {}
    try:
        raw_body = await request.json()
    except Exception:
        pass

    if raw_body.get("tickers"):
        # Validate each requested ticker
        for t in raw_body["tickers"]:
            if not TICKER_PATTERN.match(t.upper()):
                raise api_error(400, ErrorCode.INVALID_TICKER, f"Invalid ticker format: '{t}'")
        tickers = sorted(set(t.upper() for t in raw_body["tickers"]))
    else:
        # Discover all tickers from research data files
        data_dir = Path(config.PROJECT_ROOT) / "data" / "research"
        tickers = sorted(
            p.stem.upper()
            for p in data_dir.glob("*.json")
            if p.stem != "_index"
        )

    if not tickers:
        raise api_error(404, ErrorCode.NOT_FOUND, "No research data found")

    # Create batch ID and launch
    batch_id = time.strftime("%Y%m%d-%H%M%S")
    background_tasks.add_task(_run_batch_background, batch_id, tickers)

    # Pre-create the batch job so status polling works immediately
    from refresh import BatchRefreshJob
    batch_jobs[batch_id] = BatchRefreshJob(
        batch_id=batch_id,
        tickers=tickers,
        status="in_progress",
        per_ticker_status={
            t: {
                "ticker": t,
                "status": "queued",
                "stage_index": 0,
                "stage_label": "Queued",
                "progress_pct": 0,
                "started_at": None,
                "completed_at": None,
                "error": None,
            }
            for t in tickers
        },
    )

    return {
        "batch_id": batch_id,
        "status": "started",
        "tickers": tickers,
        "count": len(tickers),
        "message": f"Batch refresh started for {len(tickers)} tickers",
    }


@app.get("/api/refresh-all/status")
async def batch_refresh_status():
    """Poll the progress of the latest batch refresh."""
    job = get_latest_batch_job()
    if job is None:
        raise api_error(404, ErrorCode.NOT_FOUND, "No batch refresh found")
    return job.to_dict()


@app.get("/api/refresh-all/results")
async def batch_refresh_results():
    """Fetch all completed research JSONs from the latest batch."""
    job = get_latest_batch_job()
    if job is None:
        raise api_error(404, ErrorCode.NOT_FOUND, "No batch refresh found")

    if job.status in ("queued", "in_progress"):
        raise api_error(202, ErrorCode.CONFLICT, "Batch refresh still in progress")

    # Collect results from individual refresh_jobs
    results = {}
    data_dir = Path(config.PROJECT_ROOT) / "data" / "research"
    for ticker in job.tickers:
        ticker_job = get_job(ticker)
        if ticker_job and ticker_job.result:
            results[ticker] = ticker_job.result
        else:
            # Fallback: read from disk
            path = data_dir / f"{ticker}.json"
            if path.exists():
                with open(path) as f:
                    results[ticker] = json.load(f)

    return {
        "batch_id": job.batch_id,
        "status": job.status,
        "total_completed": job.total_completed,
        "total_failed": job.total_failed,
        "results": results,
    }


# ---------------------------------------------------------------------------
# Serve frontend
# ---------------------------------------------------------------------------

# Live data directory (updated by CI/CD, used for both serving and ingestion)
DATA_ROOT = Path(config.PROJECT_ROOT).resolve() / "data"

MIME_TYPES = {
    ".json": "application/json",
    ".js": "application/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".html": "text/html",
}


@app.get("/data/{file_path:path}")
async def serve_data(file_path: str):
    """Serve data files from the live data/ directory (updated by CI/CD)."""
    return _serve_file(DATA_ROOT, file_path)


_CACHE_RULES: dict[str, str] = {
    ".js": "public, max-age=31536000, immutable",
    ".css": "public, max-age=31536000, immutable",
    ".woff2": "public, max-age=31536000, immutable",
    ".woff": "public, max-age=31536000, immutable",
    ".ttf": "public, max-age=31536000, immutable",
    ".json": "public, max-age=300",
    ".svg": "public, max-age=86400",
    ".png": "public, max-age=86400",
    ".ico": "public, max-age=86400",
}


def _serve_file(base_dir: Path, file_path: str):
    """Serve a static file with path-traversal protection and cache headers."""
    base = base_dir.resolve()
    full_path = (base / file_path).resolve()
    if not str(full_path).startswith(str(base)):
        raise api_error(403, ErrorCode.ACCESS_DENIED, "Access denied")
    if not full_path.exists() or not full_path.is_file():
        raise api_error(404, ErrorCode.NOT_FOUND, "File not found")
    mime = MIME_TYPES.get(full_path.suffix, "application/octet-stream")
    headers: dict[str, str] = {}
    cc = _CACHE_RULES.get(full_path.suffix)
    if cc:
        headers["Cache-Control"] = cc
    return FileResponse(full_path, media_type=mime, headers=headers if headers else None)


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=config.PORT, reload=True)
