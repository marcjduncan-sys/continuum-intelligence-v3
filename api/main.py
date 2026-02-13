"""
Continuum Intelligence — Research Chat API

FastAPI backend that provides LLM-powered research chat grounded in
structured equity research data.
"""

import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

import anthropic
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field

import config
from ingest import ingest, get_tickers, get_passage_count
from retriever import retrieve

logging.basicConfig(level=logging.INFO)
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
    allow_origins=config.ALLOWED_ORIGINS + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Anthropic client (lazy init)
_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        if not config.ANTHROPIC_API_KEY:
            raise HTTPException(
                status_code=500,
                detail="ANTHROPIC_API_KEY not configured. Set it as an environment variable.",
            )
        _client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    return _client


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
You are a senior equity research analyst at Continuum Intelligence, an independent research platform focused on ASX-listed companies. You provide rigorous, evidence-based analysis grounded exclusively in the research passages provided to you.

## Your Approach
- Ground every claim in the provided research passages. Cite specific evidence.
- Present competing hypotheses fairly. Never default to bullish or bearish bias.
- Distinguish between facts (statutory filings, audited data), motivated claims (company communications), consensus views (broker research), and noise (media/social).
- Highlight what discriminates between hypotheses — the key data points that would confirm or refute each thesis.
- Be direct about what is unknown or uncertain. Flag research gaps explicitly.
- Use precise financial language. Quote specific numbers when available.

## Response Style
- Be concise but thorough. Aim for 150-300 words unless the question demands more detail.
- Structure responses with clear sections when covering multiple points.
- Use markdown formatting for readability (bold for emphasis, bullet points for lists).
- When referencing hypotheses, use the tier labels (T1, T2, T3, T4) and their names.
- End with the key question or catalyst that would update the analysis.

## Constraints
- Never fabricate data, price targets, or financial metrics not in the provided research.
- Never provide personal investment advice or buy/sell recommendations.
- If asked about a topic not covered in the research passages, say so clearly.
- If the research is stale or a catalyst has passed, note this.
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
async def research_chat(request: ResearchChatRequest):
    """
    Research chat endpoint.

    Receives a ticker, question, optional thesis alignment, and conversation
    history. Retrieves relevant research passages and returns an LLM-generated
    response grounded in the research.
    """
    ticker = request.ticker.upper()

    # Validate ticker
    available = get_tickers()
    if ticker not in available:
        raise HTTPException(
            status_code=404,
            detail=f"Ticker '{ticker}' not found. Available: {', '.join(available)}",
        )

    # Retrieve relevant passages
    passages = retrieve(
        query=request.question,
        ticker=ticker,
        thesis_alignment=request.thesis_alignment,
        max_passages=config.MAX_PASSAGES,
    )

    # Build research context
    context = _build_context(passages, ticker)

    # Build messages for Claude
    messages = []

    # Add conversation history (truncated to limit)
    history = request.conversation_history[-config.MAX_CONVERSATION_TURNS * 2:]
    for msg in history:
        messages.append({"role": msg.role, "content": msg.content})

    # Add the current question with context
    user_message = (
        f"<research_context>\n{context}\n</research_context>\n\n"
        f"**Stock:** {ticker}\n"
    )
    if request.thesis_alignment:
        user_message += f"**Thesis alignment:** {request.thesis_alignment}\n"
    user_message += f"**Question:** {request.question}"

    messages.append({"role": "user", "content": user_message})

    # Call Claude
    client = _get_client()
    try:
        response = client.messages.create(
            model=config.ANTHROPIC_MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
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
# Serve frontend
# ---------------------------------------------------------------------------

@app.get("/data/{filename}")
async def serve_data(filename: str):
    """Serve data files (live-prices.json, announcements.json)."""
    data_dir = Path(config.INDEX_HTML_PATH).parent / "data"
    file_path = data_dir / filename
    if file_path.exists() and file_path.suffix == ".json":
        return FileResponse(file_path, media_type="application/json")
    raise HTTPException(status_code=404, detail="File not found")


@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    """Serve index.html for all non-API routes (SPA catch-all)."""
    return FileResponse(config.INDEX_HTML_PATH, media_type="text/html")


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=config.PORT, reload=True)
