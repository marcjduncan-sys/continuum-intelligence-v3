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
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

import config
import db
import llm
import memory_extractor
import memory_selector
import prompt_builder
import batch_analysis
import insights
import summarise
from auth import decode_token, router as auth_router
from conversations import router as conversations_router
from profiles import router as profiles_router
from ingest import ingest, get_tickers, get_passage_count
from refresh import (
    RefreshJob, refresh_jobs, get_job, is_running, run_refresh,
    batch_jobs, get_batch_job, get_latest_batch_job, is_batch_running,
    run_batch_refresh, _data_dir,
)
from retriever import retrieve
from gold_agent import run_gold_analysis
from github_commit import commit_files_to_github


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
        raise HTTPException(
            status_code=400,
            detail='system_prompt exceeds maximum length',
        )
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

    yield
    await db.close_pool()


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
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(auth_router)
app.include_router(conversations_router)
app.include_router(profiles_router)


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
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


# Anthropic client (delegates to shared singleton in config)
def _get_client() -> anthropic.Anthropic:
    try:
        return config.get_anthropic_client()
    except RuntimeError:
        raise HTTPException(
            status_code=500,
            detail="ANTHROPIC_API_KEY not configured. Set it as an environment variable.",
        )


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
        raise HTTPException(status_code=400, detail=f"Invalid ticker format: '{ticker}'")

    # Validate ticker — skip for personalised chat with custom system prompt
    available = get_tickers()
    has_research = ticker in available

    if not has_research and not body.custom_system_prompt:
        raise HTTPException(
            status_code=404,
            detail=f"Ticker '{ticker}' not found. Available: {', '.join(available)}",
        )

    # Retrieve relevant passages (skip if ticker not indexed)
    passages = []
    context = ""
    if has_research:
        passages = retrieve(
            query=body.question,
            ticker=ticker,
            thesis_alignment=body.thesis_alignment,
            max_passages=config.MAX_PASSAGES,
        )
        context = _build_context(passages, ticker)

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

    # Add the current question with context
    if context:
        user_message = (
            f"<research_context>\n{context}\n</research_context>\n\n"
            f"**Stock:** {ticker}\n"
        )
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
        raise HTTPException(status_code=502, detail=f"LLM API error: {str(e)}")

    response_text = result.text

    # Build source passages for the response
    sources = [
        SourcePassage(
            section=p["section"],
            subsection=p["subsection"],
            content=p["content"][:300],  # Truncate for response size
            relevance_score=p["relevance_score"],
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
    """Health check endpoint."""
    tickers = get_tickers()
    counts = get_passage_count()
    return {
        "status": "healthy",
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
@limiter.limit("10/minute")
async def chart_proxy(ticker: str, request: Request):
    """Proxy Yahoo Finance chart data for an ASX ticker.

    Returns 3 years of daily OHLCV bars. No auth required.
    """
    ticker = ticker.upper()
    if not TICKER_PATTERN.match(ticker):
        raise HTTPException(status_code=400, detail=f"Invalid ticker format: '{ticker}'")

    url = _YAHOO_CHART_URL.format(ticker=ticker)
    params = {"range": "3y", "interval": "1d", "includePrePost": "false"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(url, params=params)
        except httpx.RequestError as exc:
            logger.error("Yahoo chart request failed for %s: %s", ticker, exc)
            raise HTTPException(status_code=502, detail="Upstream request failed")

    if resp.status_code != 200:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Yahoo Finance returned {resp.status_code}",
        )

    return resp.json()


# ---------------------------------------------------------------------------
# Gold agent endpoint
# ---------------------------------------------------------------------------


@app.get("/api/agents/gold/{ticker}", dependencies=[Depends(verify_api_key)])
@limiter.limit("2/minute")
async def gold_agent_endpoint(ticker: str, request: Request):
    """
    Run gold equities analysis for an ASX ticker.

    Queries the NotebookLM research corpus across 7 analytical dimensions
    (reserve quality, cost structure, production, balance sheet, gold price
    sensitivity, jurisdiction risk, catalysts), then synthesises the responses
    into CI v3 JSON via Claude.

    Requires NOTEBOOKLM_GOLD_NOTEBOOK_ID and NOTEBOOKLM_AUTH_JSON env vars.
    Expect 60-120 seconds latency. Rate-limited to 2 requests/minute.
    """
    ticker = ticker.upper()
    if not TICKER_PATTERN.match(ticker):
        raise HTTPException(status_code=400, detail=f"Invalid ticker format: '{ticker}'")

    try:
        result = await run_gold_analysis(ticker)
        return result
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error("Gold agent error for %s: %s", ticker, exc)
        raise HTTPException(status_code=500, detail="Gold analysis failed")


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
        raise HTTPException(status_code=401, detail="Invalid or missing batch secret")
    pool = await db.get_pool()
    try:
        result = await batch_analysis.run_batch_analysis(pool)
        return result
    except Exception as exc:
        logger.error("Batch run failed: %s", exc)
        raise HTTPException(status_code=500, detail="Batch analysis failed")


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
        raise HTTPException(status_code=401, detail="Authentication required")
    pool = await db.get_pool()
    updated = await insights.dismiss_notification(
        pool, notification_id=notification_id, user_id=user_id, guest_id=guest_id
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Notification not found or already dismissed")
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
        raise HTTPException(status_code=401, detail="Invalid or missing insights secret")
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
        raise HTTPException(status_code=500, detail="Insight scan failed")


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


async def _run_coverage_background(ticker: str, research_path: Path, token: str) -> None:
    """
    Background task: run the full coverage initiation pipeline for a newly
    scaffolded stock, then commit the populated research to GitHub.
    run_refresh() writes to dist/data/research/TICKER.json, so we commit
    from there (not from research_path, which is the scaffold).
    """
    try:
        logger.info("[Coverage] Background initiation starting for %s", ticker)
        await run_refresh(ticker)
        try:
            ingest()
        except Exception as ingest_err:
            logger.warning("[Coverage] Re-ingest after initiation failed (non-fatal): %s", ingest_err)
        dist_research_path = _data_dir() / f"{ticker}.json"
        await commit_files_to_github(
            {f"data/research/{ticker}.json": dist_research_path},
            f"Add {ticker}: coverage initiation",
            token,
        )
        logger.info("[Coverage] Background initiation committed for %s", ticker)
    except Exception as e:
        logger.warning("[Coverage] Background run failed for %s: %s", ticker, e)


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
    )
    from web_search import fetch_yahoo_price

    ticker = body.ticker.strip().upper()
    if not TICKER_PATTERN.match(ticker):
        raise HTTPException(status_code=400, detail=f"Invalid ticker: '{ticker}'")

    # Check if already exists (check both data/ and dist/data/ directories)
    data_dir = Path(config.PROJECT_ROOT) / "data"
    research_dir = data_dir / "research"
    dist_research_check = Path(config.INDEX_HTML_PATH).parent / "data" / "research"
    if (research_dir / f"{ticker}.json").exists() or (
        dist_research_check.exists() and (dist_research_check / f"{ticker}.json").exists()
    ):
        raise HTTPException(status_code=409, detail=f"{ticker} already exists")

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
        raise HTTPException(
            status_code=400,
            detail=f"Could not fetch price data for {ticker}.AX — is it a valid ASX ticker? ({detail})",
        )

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
    tickers_entry = build_tickers_entry(ticker, company, sector, industry, price_data)
    index_entry = build_index_entry(ticker, company, sector, industry, price_data)
    reference_entry = build_reference_entry(ticker, price_data)
    freshness_entry = build_freshness_entry(ticker, price_data.get("price", 0))

    # ---- Write files ----
    # 1. Research JSON — write to BOTH data/ (static serve) and dist/data/ (refresh pipeline)
    research_dir.mkdir(parents=True, exist_ok=True)
    with open(research_dir / f"{ticker}.json", "w") as f:
        json.dump(research_data, f, indent=2, ensure_ascii=False)
    logger.info(f"[AddStock] Saved data/research/{ticker}.json")

    # Also write to dist/data/research/ so refresh pipeline can find it
    dist_research_dir = Path(config.INDEX_HTML_PATH).parent / "data" / "research"
    if dist_research_dir.exists() and dist_research_dir != research_dir.resolve():
        with open(dist_research_dir / f"{ticker}.json", "w") as f:
            json.dump(research_data, f, indent=2, ensure_ascii=False)
        logger.info(f"[AddStock] Also saved dist/data/research/{ticker}.json")

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

    # Also update dist/data/research/_index.json for refresh pipeline
    dist_index_path = dist_research_dir / "_index.json" if dist_research_dir.exists() else None
    if dist_index_path and dist_index_path.resolve() != index_path.resolve() and dist_index_path.exists():
        try:
            with open(dist_index_path) as f:
                dist_index = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            dist_index = {}
        dist_index[ticker] = index_entry
        with open(dist_index_path, "w") as f:
            json.dump(dist_index, f, indent=2, ensure_ascii=False)

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

    # ---- Re-ingest so chat API sees the new ticker ----
    try:
        ingest()
        logger.info(f"[AddStock] Re-ingested passages after adding {ticker}")
    except Exception as e:
        logger.warning(f"[AddStock] Re-ingest failed (non-fatal): {e}")

    # ---- Commit scaffold files to GitHub (persists across Railway redeployments) ----
    _scaffold_files = {
        f"data/research/{ticker}.json": research_dir / f"{ticker}.json",
        "data/research/_index.json": index_path,
        "data/reference.json": reference_path,
        "data/freshness.json": freshness_path,
        "data/config/tickers.json": tickers_path,
    }
    try:
        await commit_files_to_github(
            _scaffold_files,
            f"Add {ticker}: scaffold ({company})",
            config.GITHUB_TOKEN,
        )
    except Exception as e:
        logger.warning(f"[AddStock] GitHub commit failed (non-fatal): {e}")

    # ---- Run coverage initiation synchronously ----
    coverage_status = "pending"
    coverage_error = None

    try:
        populated = await asyncio.wait_for(run_refresh(ticker), timeout=150.0)

        # Quality gate: verify the LLM actually produced content
        evidence_cards = populated.get("evidence", {}).get("cards", [])
        hypotheses = populated.get("hypotheses", [])
        has_narrative = bool(populated.get("narrative", {}).get("theNarrative"))
        has_real_scores = any(
            isinstance(h.get("score"), str) and h["score"].endswith("%")
            for h in hypotheses
        )

        if len(evidence_cards) >= 5 and has_real_scores and has_narrative:
            coverage_status = "completed"
        else:
            coverage_status = "degraded"
            coverage_error = (
                f"Partial content: {len(evidence_cards)} evidence cards, "
                f"scores={'yes' if has_real_scores else 'no'}, "
                f"narrative={'yes' if has_narrative else 'no'}"
            )

        # Re-ingest so chat API sees the populated content
        try:
            ingest()
        except Exception:
            pass

        # Commit populated research to GitHub
        dist_research_path = _data_dir() / f"{ticker}.json"
        try:
            await commit_files_to_github(
                {f"data/research/{ticker}.json": dist_research_path},
                f"Add {ticker}: coverage initiation",
                config.GITHUB_TOKEN,
            )
        except Exception as commit_err:
            logger.warning(f"[AddStock] GitHub commit of populated research failed (non-fatal): {commit_err}")

    except asyncio.TimeoutError:
        coverage_status = "timeout"
        coverage_error = "Coverage initiation timed out after 150s"
    except Exception as e:
        coverage_status = "failed"
        coverage_error = str(e)

    logger.info(f"[AddStock] Coverage initiation for {ticker}: {coverage_status}")

    return {
        "status": "added",
        "ticker": ticker,
        "company": company,
        "sector": sector,
        "industry": industry,
        "price": price_data.get("price"),
        "currency": price_data.get("currency", "A$"),
        "coverage_status": coverage_status,
        "coverage_error": coverage_error,
    }


# ---------------------------------------------------------------------------
# Refresh endpoints
# ---------------------------------------------------------------------------

def _run_refresh_background(ticker: str):
    """Run refresh in a new event loop (for BackgroundTasks)."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(run_refresh(ticker))
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
        raise HTTPException(status_code=400, detail=f"Invalid ticker format: '{ticker}'")

    # Validate ticker exists in research data
    data_dir = Path(config.INDEX_HTML_PATH).parent / "data" / "research"
    if not (data_dir / f"{ticker}.json").exists():
        raise HTTPException(
            status_code=404,
            detail=f"No research data found for '{ticker}'",
        )

    # Check if ticker is part of an active batch refresh
    if is_batch_running():
        raise HTTPException(
            status_code=409,
            detail=f"{ticker} is part of an active batch refresh",
        )

    # Check for existing running job
    if is_running(ticker):
        raise HTTPException(
            status_code=409,
            detail=f"Refresh already in progress for {ticker}",
        )

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
        raise HTTPException(
            status_code=404,
            detail=f"No refresh job found for {ticker}",
        )
    return job.to_dict()


@app.get("/api/refresh/{ticker}/result")
async def refresh_result(ticker: str):
    """Fetch updated research JSON after a refresh completes."""
    ticker = ticker.upper()
    job = get_job(ticker)

    if job is None:
        raise HTTPException(status_code=404, detail=f"No refresh job for {ticker}")

    if job.status == "failed":
        raise HTTPException(
            status_code=500,
            detail=f"Refresh failed: {job.error}",
        )

    if job.status != "completed":
        raise HTTPException(
            status_code=202,
            detail=f"Refresh still in progress: {job.stage_label}",
        )

    # Return the updated research data and free memory
    if job.result:
        data = job.result
        job.result = None  # Free memory after delivery
        return data

    # Fallback: read from disk
    data_dir = Path(config.INDEX_HTML_PATH).parent / "data" / "research"
    path = data_dir / f"{ticker}.json"
    if path.exists():
        with open(path) as f:
            return json.load(f)

    raise HTTPException(status_code=404, detail="Research data not found")


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
        raise HTTPException(
            status_code=409,
            detail="A batch refresh is already in progress",
        )

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
                raise HTTPException(status_code=400, detail=f"Invalid ticker format: '{t}'")
        tickers = sorted(set(t.upper() for t in raw_body["tickers"]))
    else:
        # Discover all tickers from research data files
        data_dir = Path(config.INDEX_HTML_PATH).parent / "data" / "research"
        tickers = sorted(
            p.stem.upper()
            for p in data_dir.glob("*.json")
            if p.stem != "_index"
        )

    if not tickers:
        raise HTTPException(status_code=404, detail="No research data found")

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
        raise HTTPException(status_code=404, detail="No batch refresh found")
    return job.to_dict()


@app.get("/api/refresh-all/results")
async def batch_refresh_results():
    """Fetch all completed research JSONs from the latest batch."""
    job = get_latest_batch_job()
    if job is None:
        raise HTTPException(status_code=404, detail="No batch refresh found")

    if job.status in ("queued", "in_progress"):
        raise HTTPException(
            status_code=202,
            detail="Batch refresh still in progress",
        )

    # Collect results from individual refresh_jobs
    results = {}
    data_dir = Path(config.INDEX_HTML_PATH).parent / "data" / "research"
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

# Vite build output (assets, css, fonts, bundled JS/CSS)
DIST_ROOT = Path(config.DIST_DIR).resolve()
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
        raise HTTPException(status_code=403, detail="Access denied")
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    mime = MIME_TYPES.get(full_path.suffix, "application/octet-stream")
    headers: dict[str, str] = {}
    cc = _CACHE_RULES.get(full_path.suffix)
    if cc:
        headers["Cache-Control"] = cc
    return FileResponse(full_path, media_type=mime, headers=headers if headers else None)


@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    """Serve static files from dist/, falling back to index.html for SPA routes."""
    if full_path:
        candidate = (DIST_ROOT / full_path).resolve()
        if (str(candidate).startswith(str(DIST_ROOT))
                and candidate.exists()
                and candidate.is_file()):
            mime = MIME_TYPES.get(candidate.suffix, "application/octet-stream")
            headers: dict[str, str] = {}
            cc = _CACHE_RULES.get(candidate.suffix)
            if cc:
                headers["Cache-Control"] = cc
            return FileResponse(candidate, media_type=mime, headers=headers if headers else None)
    return FileResponse(config.INDEX_HTML_PATH, media_type="text/html")


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=config.PORT, reload=True)
