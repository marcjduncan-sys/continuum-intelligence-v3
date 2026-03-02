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
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

import config
from ingest import ingest, get_tickers, get_passage_count
from refresh import (
    RefreshJob, refresh_jobs, get_job, is_running, run_refresh,
    batch_jobs, get_batch_job, get_latest_batch_job, is_batch_running,
    run_batch_refresh,
)
from retriever import retrieve


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
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiter (in-memory, resets on Railway restart — acceptable)
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


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
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are a senior equity research analyst at Continuum Intelligence. You speak in the first person plural ("we", "our analysis", "our framework"). You are direct, precise, and opinionated, like a fund manager talking to another fund manager.

Ground every claim in the provided research passages. Cite specific evidence. Present competing hypotheses fairly. Never default to bullish or bearish bias. Distinguish between facts (statutory filings, audited data), motivated claims (company communications), consensus views (broker research), and noise (media/social). Highlight what discriminates between hypotheses. Be direct about what is unknown or uncertain. Flag research gaps explicitly.

VOICE RULES:
Never use markdown headers (#, ##, ###). Write in flowing paragraphs.
Never use bullet point dashes or asterisks for lists. Weave points into natural sentences.
Never begin a response with "Based on" or "Here is" or "Sure" or "Great question".
Never say "I". Always "we" or speak in the declarative.
Never use em-dashes. Use commas, colons, or full stops instead.
Never use exclamation marks or rhetorical questions.
Never use filler phrases: "It's important to note", "Notably", "Importantly", "Interestingly", "In terms of", "It is worth mentioning".
Never use weak openings: "It is...", "There are...", "This is...".
When presenting numbers, weave them into sentences naturally.
Reference specific evidence items and hypothesis labels naturally: "The N2 erosion thesis is gaining weight here, margins are the tell."
Be opinionated. Take positions. "We think the market is wrong about X" is better than "There are arguments on both sides."
Use the vocabulary of an institutional investor: "the print", "the tape", "the multiple", "re-rate", "de-rate", "the street", "consensus", "buy-side", "the name".

CONSTRAINTS:
Never fabricate data, price targets, or financial metrics not in the provided research.
Never provide personal investment advice or buy/sell recommendations.
If asked about a topic not covered in the research passages, say so directly.
If the research is stale or a catalyst has passed, note this.
Be concise. Aim for 150-300 words unless the question demands more detail.
End with the key question or catalyst that would update the analysis.
"""


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
async def research_chat(request: Request, body: ResearchChatRequest, _=Depends(verify_api_key)):
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

    # Add conversation history (truncated to limit)
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

    # Call Claude
    client = _get_client()
    effective_system = body.custom_system_prompt or body.system_prompt or SYSTEM_PROMPT
    try:
        response = client.messages.create(
            model=config.ANTHROPIC_MODEL,
            max_tokens=config.CHAT_MAX_TOKENS,
            system=effective_system,
            messages=messages,
        )
    except anthropic.APIError as e:
        logger.error(f"Anthropic API error: {e}")
        raise HTTPException(status_code=502, detail=f"LLM API error: {str(e)}")

    # Extract response text
    response_text = ""
    for block in response.content:
        if block.type == "text":
            response_text += block.text

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
# Add Stock endpoint
# ---------------------------------------------------------------------------

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

    # Check if already exists
    data_dir = Path(config.PROJECT_ROOT) / "data"
    research_dir = data_dir / "research"
    if (research_dir / f"{ticker}.json").exists():
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
    industry = metadata.get("industry", "")

    logger.info(f"[AddStock] {ticker}: company={company}, sector={sector}, industry={industry}")

    # ---- Build scaffold + config entries ----
    research_data = build_research_scaffold(ticker, company, sector, industry, price_data)
    tickers_entry = build_tickers_entry(ticker, company, sector, industry, price_data)
    index_entry = build_index_entry(ticker, company, sector, industry, price_data)
    reference_entry = build_reference_entry(ticker, price_data)
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

    # ---- Re-ingest so chat API sees the new ticker ----
    try:
        ingest()
        logger.info(f"[AddStock] Re-ingested passages after adding {ticker}")
    except Exception as e:
        logger.warning(f"[AddStock] Re-ingest failed (non-fatal): {e}")

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
