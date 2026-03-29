"""
Economist Chat API endpoints.

Provides macro data snapshot, health check, chat with streaming,
conversation management, and state retrieval for the Economist module.
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, AsyncGenerator

from fastapi import APIRouter, BackgroundTasks, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

import config
import db
import llm
from auth import decode_token
from economist_prompt_builder import build_system_prompt, build_messages
from errors import api_error, APIError, ErrorCode
from task_monitor import monitored_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/economist", tags=["economist"])

# LLM semaphore: max 2 concurrent Economist LLM calls
_llm_semaphore: asyncio.Semaphore | None = None
_llm_semaphore_loop: asyncio.AbstractEventLoop | None = None


def _get_llm_semaphore() -> asyncio.Semaphore:
    """Return the LLM semaphore, creating it if needed for the current loop."""
    global _llm_semaphore, _llm_semaphore_loop
    loop = asyncio.get_running_loop()
    if _llm_semaphore is None or _llm_semaphore_loop is not loop:
        _llm_semaphore = asyncio.Semaphore(2)
        _llm_semaphore_loop = loop
    return _llm_semaphore


# ---------------------------------------------------------------------------
# Identity helper
# ---------------------------------------------------------------------------

def _get_identity(request: Request, user_id_param: str | None = None):
    """Extract user identity from JWT (preferred) or user_id param fallback."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        payload = decode_token(auth_header[7:])
        if payload:
            return payload.get("sub")
    return user_id_param


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class EconomistChatRequest(BaseModel):
    conversation_id: str | None = Field(
        None, description="Existing conversation ID. Generated if omitted."
    )
    message: str = Field(..., description="User message text", max_length=10000)
    user_id: str | None = Field(None, description="User ID (fallback if no JWT)")
    personalisation_profile: str | None = Field(
        None,
        description="Assembled personalisation prompt text from pnBuildSystemPrompt. "
        "If provided, injected as [USER PROFILE] block in the system prompt.",
    )


def _decimal_to_float(val: Any) -> Any:
    """Convert Decimal to float for JSON serialisation."""
    if isinstance(val, Decimal):
        return float(val)
    return val


@router.get("/health")
async def economist_health() -> dict:
    """Health check for the Economist module."""
    pool = await db.get_pool()
    if pool is None:
        return {"status": "ok", "database": "unavailable"}

    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT COUNT(*) AS cnt FROM macro_series"
            )
            series_count = row["cnt"] if row else 0
        return {
            "status": "ok",
            "database": "connected",
            "macro_series_count": series_count,
        }
    except Exception as exc:
        logger.error("Economist health check DB error: %s", exc)
        return {"status": "ok", "database": "error"}


@router.post("/refresh")
async def economist_refresh(background_tasks: BackgroundTasks):
    """Trigger an immediate refresh of all economist data sources.

    Returns 202 immediately; the actual refresh runs in the background
    so that Fly.io proxy timeouts do not kill the request.
    """
    pool = await db.get_pool()
    if pool is None:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "message": "Database unavailable"},
        )

    async def _run_full_refresh():
        try:
            from clients.scheduler import run_all_now
            results = await run_all_now(pool)
            logger.info("Economist refresh completed: %s", results)
        except Exception as exc:
            logger.exception("Economist background refresh failed: %s", exc)

    background_tasks.add_task(_run_full_refresh)
    return JSONResponse(
        status_code=202,
        content={"status": "accepted", "message": "Refresh started in background"},
    )


@router.get("/debug-sources")
async def debug_sources() -> dict:
    """Diagnostic endpoint: test connectivity to each external data source.

    Makes a single lightweight request to each source with a 10s timeout
    and reports the result.  For debugging only.
    """
    import os
    import httpx
    import traceback

    _ua = {"User-Agent": "ContinuumIntelligence/1.0 (macro-data-service)"}
    results: dict[str, dict] = {}

    async def _probe(name: str, url: str, **kwargs):
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                resp = await c.get(url, **kwargs)
                if resp.status_code == 200:
                    results[name] = {"status": "ok", "code": 200, "url": url}
                else:
                    results[name] = {
                        "status": "error",
                        "code": resp.status_code,
                        "url": url,
                        "body_preview": resp.text[:500],
                    }
        except Exception as exc:
            results[name] = {
                "status": "error",
                "url": url,
                "exception": f"{type(exc).__name__}: {exc}",
                "traceback": traceback.format_exc()[-500:],
            }

    # FRED
    fred_key = os.getenv("FRED_API_KEY", "")
    await _probe(
        "fred",
        "https://api.stlouisfed.org/fred/series/observations",
        params={"series_id": "DGS10", "api_key": fred_key, "file_type": "json",
                "sort_order": "desc", "limit": 1},
        headers=_ua,
    )

    # EIA
    eia_key = os.getenv("EIA_API_KEY", os.getenv("EIA_API", ""))
    await _probe(
        "eia",
        "https://api.eia.gov/v2/petroleum/pri/spt/data/",
        params={"api_key": eia_key, "frequency": "daily", "data[0]": "value",
                "facets[product][]": "EPCBRENT", "sort[0][column]": "period",
                "sort[0][direction]": "desc", "length": 1},
        headers=_ua,
    )

    # RBA
    _rba_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-AU,en;q=0.9",
    }
    await _probe(
        "rba",
        "https://www.rba.gov.au/statistics/tables/csv/a02hist.csv",
        headers=_rba_headers,
    )

    # ABS
    await _probe(
        "abs",
        "https://data.api.abs.gov.au/rest/data/ABS,CPI,1.1.0/1.10001.10.Q",
        params={"format": "csv", "detail": "dataonly"},
        headers={"Accept": "text/csv", **_ua},
    )

    # BIS
    await _probe(
        "bis",
        "https://stats.bis.org/api/v1/data/WS_CBPOL/D..",
        params={"format": "csv", "detail": "dataonly"},
        headers={"Accept": "text/csv", **_ua},
    )

    # Finnhub
    fh_key = os.getenv("FINNHUB_API_KEY", os.getenv("FINNHUB_API", ""))
    await _probe(
        "finnhub",
        "https://finnhub.io/api/v1/calendar/economic",
        params={"from": "2026-03-29", "to": "2026-03-30", "token": fh_key},
        headers=_ua,
    )

    # Alpha Vantage
    av_key = os.getenv("ALPHA_VANTAGE_API_KEY", os.getenv("ALPHA_VANTAGE", ""))
    await _probe(
        "alpha_vantage",
        "https://www.alphavantage.co/query",
        params={"function": "CURRENCY_EXCHANGE_RATE",
                "from_currency": "AUD", "to_currency": "USD", "apikey": av_key},
        headers=_ua,
    )

    return results


@router.get("/macro-snapshot")
async def macro_snapshot() -> dict:
    """Assemble the full macro data snapshot for LLM context injection.

    Reads from macro_series, macro_prices, and economic_calendar.
    Returns null for missing data rather than raising errors.
    Target: <500ms, <3000 tokens.
    """
    pool = await db.get_pool()
    now = datetime.now(timezone.utc)
    staleness_threshold = now - timedelta(hours=24)

    if pool is None:
        return {
            "timestamp": now.isoformat(),
            "data_staleness_warnings": ["Database unavailable"],
            "regime_signals": {},
            "central_banks": {},
            "yield_curves": {},
            "australia_macro": {},
            "credit_conditions": {},
            "upcoming_events": [],
            "fx_daily_change": {},
        }

    try:
        async with pool.acquire() as conn:
            # Fetch all macro_series into a lookup dict
            rows = await conn.fetch("SELECT * FROM macro_series")
            series: dict[tuple[str, str], dict] = {}
            stale_warnings: list[str] = []
            for r in rows:
                key = (r["source"], r["series_id"])
                series[key] = dict(r)
                if r["updated_at"] and r["updated_at"].replace(
                    tzinfo=timezone.utc
                ) < staleness_threshold:
                    stale_warnings.append(
                        f"{r['source']}:{r['series_id']} last updated "
                        f"{r['updated_at'].isoformat()}"
                    )

            # Fetch latest price per symbol
            price_rows = await conn.fetch("""
                SELECT DISTINCT ON (symbol) symbol, price, change_pct, source
                FROM macro_prices
                ORDER BY symbol, fetched_at DESC
            """)
            prices: dict[str, dict] = {}
            for r in price_rows:
                prices[r["symbol"]] = dict(r)

            # Fetch upcoming calendar events (next 14 days)
            cal_rows = await conn.fetch("""
                SELECT event_date, event_time, country, event_name,
                       importance, actual, forecast, previous
                FROM economic_calendar
                WHERE event_date >= CURRENT_DATE
                  AND event_date <= CURRENT_DATE + INTERVAL '14 days'
                ORDER BY event_date, event_time
                LIMIT 20
            """)

            # Fetch ACLED conflict event counts (if available)
            acled_rows = await conn.fetch("""
                SELECT series_id, last_value, updated_at
                FROM macro_series
                WHERE source = 'ACLED'
                  AND series_id LIKE 'conflict_event_count_%'
            """)

        def _sv(source: str, sid: str) -> float | None:
            """Get last_value for a source/series_id pair."""
            rec = series.get((source, sid))
            if rec and rec.get("last_value") is not None:
                return float(rec["last_value"])
            return None

        def _pv(symbol: str) -> float | None:
            """Get latest price for a symbol."""
            rec = prices.get(symbol)
            if rec and rec.get("price") is not None:
                return float(rec["price"])
            return None

        def _pc(symbol: str) -> float | None:
            """Get latest change_pct for a symbol."""
            rec = prices.get(symbol)
            if rec and rec.get("change_pct") is not None:
                return float(rec["change_pct"])
            return None

        snapshot = {
            "timestamp": now.isoformat(),
            "data_staleness_warnings": stale_warnings[:10],
            "regime_signals": {
                "us_yield_curve_2s10s_bps": _sv("FRED", "T10Y2Y"),
                "vix": _sv("FRED", "VIXCLS"),
                "us_hy_spread_bps": _sv("FRED", "BAMLH0A0HYM2"),
                "aud_usd": _pv("AUD/USD") or _sv("RBA", "AUDUSD") or _sv("FRED", "DEXUSAL"),
                "nzd_usd": _pv("NZD/USD"),
                "aud_nzd": _pv("AUD/NZD"),
                "gold_usd": _pv("XAU/USD") or _sv("RBA", "GOLD"),
                "wti_usd": _sv("EIA", "WTI_SPOT"),
                "brent_usd": _sv("EIA", "BRENT_SPOT"),
                "iron_ore_usd_tonne": _sv("RBA", "IRON_ORE") or _sv("FRED", "PIORECRUSDM"),
                "copper_usd_lb": _sv("RBA", "COPPER") or (
                    round(_sv("FRED", "PCOPPUSDM") / 2204.62, 4)
                    if _sv("FRED", "PCOPPUSDM") else None
                ),
            },
            "central_banks": {
                "rba_cash_rate": _sv("RBA", "CASH_RATE") or _sv("FRED", "IRSTCI01AUM156N"),
                "rba_last_decision_date": None,
                "rba_last_action": None,
                "rbnz_ocr": _sv("BIS", "CBPOL_NZ"),
                "fed_funds_upper": _sv("FRED", "FEDFUNDS"),
                "fed_funds_effective": _sv("FRED", "DFF"),
                "boe_rate": _sv("BIS", "CBPOL_GB"),
                "ecb_rate": _sv("BIS", "CBPOL_EU"),
                "boj_rate": _sv("BIS", "CBPOL_JP"),
                "pboc_rate": _sv("BIS", "CBPOL_CN"),
            },
            "yield_curves": {
                "au_2y": _sv("RBA", "AU_2Y"),
                "au_5y": _sv("RBA", "AU_5Y"),
                "au_10y": _sv("RBA", "AU_10Y") or _sv("FRED", "IRLTLT01AUM156N"),
                "us_2y": _sv("FRED", "DGS2"),
                "us_5y": _sv("FRED", "DGS5"),
                "us_10y": _sv("FRED", "DGS10"),
                "us_30y": _sv("FRED", "DGS30"),
                "us_10y_breakeven": _sv("FRED", "T10YIE"),
            },
            "australia_macro": {
                "cpi_yoy": _sv("ABS", "CPI_YOY") or _sv("RBA", "CPI_YOY"),
                "cpi_index": _sv("FRED", "AUSCPIALLQINMEI"),
                "unemployment": _sv("ABS", "UNEMPLOYMENT"),
                "gdp_growth": _sv("ABS", "GDP_GROWTH"),
                "credit_growth": _sv("RBA", "CREDIT_GROWTH"),
                "retail_trade_mom": _sv("ABS", "RETAIL_MOM"),
                "building_approvals": _sv("ABS", "BUILDING_APPROVALS"),
                "housing_starts": _sv("FRED", "HOUST"),
            },
            "credit_conditions": {
                "us_hy_oas_bps": _sv("FRED", "BAMLH0A0HYM2"),
                "us_ig_oas_bps": _sv("FRED", "BAMLC0A0CM"),
                "au_credit_to_gdp_gap": _sv("BIS", "CREDIT_GAP_AU"),
                "au_debt_service_ratio": _sv("BIS", "DSR_AU"),
                "nz_credit_to_gdp_gap": _sv("BIS", "CREDIT_GAP_NZ"),
                "nz_debt_service_ratio": _sv("BIS", "DSR_NZ"),
                "us_debt_service_ratio": _sv("BIS", "DSR_US"),
            },
            "upcoming_events": [
                {
                    "date": str(r["event_date"]),
                    "time": str(r["event_time"]) if r["event_time"] else None,
                    "country": r["country"],
                    "event": r["event_name"],
                    "importance": r["importance"],
                    "actual": r["actual"],
                    "forecast": r["forecast"],
                    "previous": r["previous"],
                }
                for r in cal_rows
            ],
            "fx_daily_change": {
                "aud_usd": _pc("AUD/USD"),
                "nzd_usd": _pc("NZD/USD"),
                "aud_nzd": _pc("AUD/NZD"),
                "eur_usd": _pc("EUR/USD"),
                "usd_jpy": _pc("USD/JPY"),
                "gbp_usd": _pc("GBP/USD"),
                "usd_cny": _pc("USD/CNY"),
            },
        }

        # Add event_risk section if ACLED data exists
        if acled_rows:
            acled_map: dict[str, Any] = {}
            last_updated = None
            _acled_region_map = {
                "conflict_event_count_11": "middle_east_events_30d",
                "conflict_event_count_9": "south_asia_events_30d",
                "conflict_event_count_4": "east_asia_events_30d",
                "conflict_event_count_13": "southeast_asia_events_30d",
            }
            for r in acled_rows:
                sid = r["series_id"]
                val = float(r["last_value"]) if r["last_value"] is not None else 0
                key = _acled_region_map.get(sid)
                if key:
                    acled_map[key] = int(val)
                if r["updated_at"]:
                    ts = r["updated_at"]
                    if last_updated is None or ts > last_updated:
                        last_updated = ts
            if acled_map:
                acled_map["last_updated"] = (
                    last_updated.isoformat() if last_updated else None
                )
                snapshot["event_risk"] = acled_map

        return snapshot

    except Exception as exc:
        logger.exception("macro-snapshot assembly failed: %s", exc)
        return {
            "timestamp": now.isoformat(),
            "data_staleness_warnings": ["Snapshot assembly encountered an internal error"],
            "regime_signals": {},
            "central_banks": {},
            "yield_curves": {},
            "australia_macro": {},
            "credit_conditions": {},
            "upcoming_events": [],
            "fx_daily_change": {},
        }


# ---------------------------------------------------------------------------
# Conversation DB helpers
# ---------------------------------------------------------------------------

async def _load_conversation(
    pool, conversation_id: str
) -> tuple[list[dict], str | None]:
    """Load conversation messages and user_id from the DB.

    Returns (messages_list, user_id). Empty list if not found.
    """
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT messages, user_id FROM economist_conversations
                WHERE conversation_id = $1
                ORDER BY updated_at DESC LIMIT 1
                """,
                conversation_id,
            )
            if not row:
                return [], None
            messages = row["messages"]
            if isinstance(messages, str):
                messages = json.loads(messages)
            return messages, row["user_id"]
    except Exception as exc:
        logger.error("Failed to load economist conversation %s: %s", conversation_id, exc)
        return [], None


async def _save_conversation(
    pool,
    conversation_id: str,
    user_id: str | None,
    messages: list[dict],
    macro_context_summary: str | None = None,
) -> None:
    """Insert or update conversation messages in the DB.

    Uses an atomic upsert (INSERT ... ON CONFLICT) to avoid the TOCTOU
    race where two concurrent requests both SELECT (find nothing) then
    both INSERT (one fails on the UNIQUE constraint).
    """
    try:
        messages_json = json.dumps(messages)
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO economist_conversations
                    (conversation_id, user_id, messages, macro_context_summary, updated_at)
                VALUES ($1, $2, $3::jsonb, $4, NOW())
                ON CONFLICT (conversation_id) DO UPDATE SET
                    messages = EXCLUDED.messages,
                    macro_context_summary = COALESCE(EXCLUDED.macro_context_summary, economist_conversations.macro_context_summary),
                    updated_at = NOW()
                """,
                conversation_id,
                user_id,
                messages_json,
                macro_context_summary,
            )
    except Exception as exc:
        logger.error("Failed to save economist conversation %s: %s", conversation_id, exc)


def _count_user_turns(messages: list[dict]) -> int:
    """Count user messages in a conversation."""
    return sum(1 for m in messages if m.get("role") == "user")


# ---------------------------------------------------------------------------
# SSE streaming helpers
# ---------------------------------------------------------------------------

async def _stream_anthropic_sse(
    system_prompt: str,
    messages: list[dict],
    conversation_id: str,
) -> AsyncGenerator[str, None]:
    """Stream Claude response as Server-Sent Events.

    Yields SSE-formatted chunks: data: {json}\\n\\n
    Each token is yielded immediately as it arrives from Anthropic,
    providing true real-time streaming to the frontend.

    Uses an asyncio.Queue to bridge the synchronous Anthropic SDK
    streaming iterator (running in a thread) with the async generator.
    """
    client = config.get_anthropic_client()
    full_text = ""
    input_tokens = 0
    output_tokens = 0

    # Queue bridges the sync thread to the async generator.
    # None is the sentinel value indicating the stream is finished.
    queue: asyncio.Queue = asyncio.Queue()
    # Capture the running loop before entering the thread so
    # call_soon_threadsafe targets the correct loop.
    _loop_ref = asyncio.get_running_loop()

    def _run_stream():
        """Run the synchronous Anthropic stream in a thread, pushing events to the queue."""
        loop = _loop_ref
        try:
            with client.messages.stream(
                model=config.ANTHROPIC_MODEL,
                max_tokens=12000,
                temperature=0.0,
                system=system_prompt,
                messages=messages,
            ) as stream:
                for event in stream:
                    loop.call_soon_threadsafe(queue.put_nowait, event)
            # Signal completion
            loop.call_soon_threadsafe(queue.put_nowait, None)
        except Exception as exc:
            loop.call_soon_threadsafe(queue.put_nowait, exc)

    try:
        # Send conversation_id as first event
        yield f"data: {json.dumps({'type': 'conversation_id', 'conversation_id': conversation_id})}\n\n"

        # Start the stream thread
        loop = asyncio.get_running_loop()
        stream_task = loop.run_in_executor(None, _run_stream)

        # Yield events as they arrive from the queue
        while True:
            event = await queue.get()

            # Sentinel: stream finished
            if event is None:
                break

            # Exception from thread
            if isinstance(event, Exception):
                raise event

            event_type = getattr(event, "type", "")

            if event_type == "content_block_delta":
                delta = getattr(event, "delta", None)
                if delta and getattr(delta, "type", "") == "text_delta":
                    text = getattr(delta, "text", "")
                    full_text += text
                    yield f"data: {json.dumps({'type': 'content_delta', 'text': text})}\n\n"

            elif event_type == "message_start":
                msg = getattr(event, "message", None)
                if msg:
                    usage = getattr(msg, "usage", None)
                    if usage:
                        input_tokens = getattr(usage, "input_tokens", 0)

            elif event_type == "message_delta":
                usage = getattr(event, "usage", None)
                if usage:
                    output_tokens = getattr(usage, "output_tokens", 0)

        # Wait for the thread to fully clean up
        await stream_task

        # Final event with complete response
        yield f"data: {json.dumps({'type': 'message_complete', 'text': full_text, 'input_tokens': input_tokens, 'output_tokens': output_tokens})}\n\n"
        yield "data: [DONE]\n\n"

    except Exception as exc:
        logger.error("Economist SSE stream error: %s", exc)
        error_msg = "An internal error occurred during generation"
        if "rate_limit" in str(exc).lower() or "429" in str(exc):
            error_msg = "Rate limited. Please wait a moment before trying again."
        yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"
        yield "data: [DONE]\n\n"


# ---------------------------------------------------------------------------
# POST /api/economist/chat
# ---------------------------------------------------------------------------

@router.post("/chat")
async def economist_chat(
    request: Request,
    body: EconomistChatRequest,
    background_tasks: BackgroundTasks,
):
    """Economist Chat endpoint with SSE streaming.

    Assembles macro context, conversation history, and streams the Claude
    response. Persists conversation to the database.
    """
    # Resolve identity
    resolved_user_id = _get_identity(request, body.user_id)

    # Generate or use existing conversation_id
    conversation_id = body.conversation_id or str(uuid.uuid4())

    logger.info(
        "Economist chat: user=%s, conversation=%s, msg_len=%d",
        resolved_user_id or "anonymous",
        conversation_id,
        len(body.message),
    )

    # Load existing conversation history
    pool = await db.get_pool()
    existing_messages: list[dict] = []
    if pool and body.conversation_id:
        existing_messages, _ = await _load_conversation(pool, body.conversation_id)

    # Build system prompt with macro data + optional portfolio context + personalisation
    system_prompt = await build_system_prompt(
        user_id=resolved_user_id,
        personalisation_profile=body.personalisation_profile,
    )

    # Build message array (history + current message)
    api_messages = await build_messages(
        conversation_id=body.conversation_id,
        user_message=body.message,
        user_id=resolved_user_id,
    )

    # Acquire LLM semaphore
    sem = _get_llm_semaphore()

    async def _guarded_stream() -> AsyncGenerator[str, None]:
        async with sem:
            full_response = ""
            async for chunk in _stream_anthropic_sse(
                system_prompt, api_messages, conversation_id
            ):
                # Capture full response from the complete event
                if '"type": "message_complete"' in chunk or '"type":"message_complete"' in chunk:
                    try:
                        # Extract json from "data: {...}\n\n"
                        json_str = chunk.replace("data: ", "").strip()
                        parsed = json.loads(json_str)
                        full_response = parsed.get("text", "")
                    except (json.JSONDecodeError, ValueError):
                        pass
                yield chunk

            # Persist conversation after streaming completes
            if pool and full_response:
                updated_messages = list(existing_messages)
                updated_messages.append({"role": "user", "content": body.message})
                updated_messages.append({"role": "assistant", "content": full_response})

                await _save_conversation(
                    pool, conversation_id, resolved_user_id, updated_messages
                )

                # Fire state generation if > 3 user turns
                user_turn_count = _count_user_turns(updated_messages)
                if user_turn_count > 3:
                    try:
                        from economist_state_service import generate_economist_state
                        monitored_task(
                            generate_economist_state(conversation_id, updated_messages),
                            name="economist_state_gen",
                        )
                    except ImportError:
                        logger.debug("economist_state_service not yet available")
                    except Exception as exc:
                        logger.warning("Economist state generation failed to start: %s", exc)

    return StreamingResponse(
        _guarded_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Conversation-Id": conversation_id,
        },
    )


# ---------------------------------------------------------------------------
# GET /api/economist/conversations - list conversations
# ---------------------------------------------------------------------------

@router.get("/conversations")
async def list_economist_conversations(
    request: Request,
    user_id: str | None = None,
) -> dict:
    """List economist conversations for a user."""
    resolved_user_id = _get_identity(request, user_id)
    if not resolved_user_id:
        return {"conversations": []}

    pool = await db.get_pool()
    if pool is None:
        return {"conversations": []}

    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT conversation_id, macro_context_summary,
                       created_at, updated_at,
                       jsonb_array_length(messages) AS message_count
                FROM economist_conversations
                WHERE user_id = $1
                ORDER BY updated_at DESC
                LIMIT 50
                """,
                resolved_user_id,
            )
            return {
                "conversations": [
                    {
                        "conversation_id": r["conversation_id"],
                        "macro_context_summary": r["macro_context_summary"],
                        "message_count": r["message_count"],
                        "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                        "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
                    }
                    for r in rows
                ]
            }
    except Exception as exc:
        logger.error("Failed to list economist conversations: %s", exc)
        return {"conversations": []}


# ---------------------------------------------------------------------------
# GET /api/economist/conversations/{conversation_id} - get full conversation
# ---------------------------------------------------------------------------

@router.get("/conversations/{conversation_id}")
async def get_economist_conversation(
    conversation_id: str,
    request: Request,
) -> dict:
    """Get a full economist conversation by ID (ownership enforced)."""
    pool = await db.get_pool()
    if pool is None:
        raise api_error(503, ErrorCode.SERVICE_UNAVAILABLE, "Database unavailable")

    requesting_user = _get_identity(request)

    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT conversation_id, user_id, messages,
                       macro_context_summary, created_at, updated_at
                FROM economist_conversations
                WHERE conversation_id = $1
                """,
                conversation_id,
            )
            if not row:
                raise api_error(404, ErrorCode.NOT_FOUND, "Conversation not found")

            # Ownership check: requesting user must match conversation owner
            if row["user_id"] and requesting_user and row["user_id"] != requesting_user:
                raise api_error(403, ErrorCode.AUTH_ERROR, "Access denied")

            messages = row["messages"]
            if isinstance(messages, str):
                messages = json.loads(messages)

            return {
                "conversation_id": row["conversation_id"],
                "messages": messages,
                "macro_context_summary": row["macro_context_summary"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            }
    except APIError:
        raise
    except Exception as exc:
        logger.error("Failed to get economist conversation %s: %s", conversation_id, exc)
        raise api_error(500, ErrorCode.SERVER_ERROR, "Failed to retrieve conversation")


# ---------------------------------------------------------------------------
# DELETE /api/economist/conversations/{conversation_id}
# ---------------------------------------------------------------------------

@router.delete("/conversations/{conversation_id}")
async def delete_economist_conversation(
    conversation_id: str,
    request: Request,
) -> dict:
    """Delete an economist conversation (ownership enforced)."""
    pool = await db.get_pool()
    if pool is None:
        raise api_error(503, ErrorCode.SERVICE_UNAVAILABLE, "Database unavailable")

    requesting_user = _get_identity(request)

    try:
        async with pool.acquire() as conn:
            # Verify ownership before deleting
            row = await conn.fetchrow(
                "SELECT user_id FROM economist_conversations WHERE conversation_id = $1",
                conversation_id,
            )
            if not row:
                raise api_error(404, ErrorCode.NOT_FOUND, "Conversation not found")
            if row["user_id"] and requesting_user and row["user_id"] != requesting_user:
                raise api_error(403, ErrorCode.AUTH_ERROR, "Access denied")

            await conn.execute(
                "DELETE FROM economist_conversations WHERE conversation_id = $1",
                conversation_id,
            )
            return {"status": "deleted", "conversation_id": conversation_id}
    except APIError:
        raise
    except Exception as exc:
        logger.error("Failed to delete economist conversation %s: %s", conversation_id, exc)
        raise api_error(500, ErrorCode.SERVER_ERROR, "Failed to delete conversation")


# ---------------------------------------------------------------------------
# GET /api/economist/state - latest economist state
# ---------------------------------------------------------------------------

@router.get("/state")
async def get_economist_state() -> dict:
    """Return the latest economist state object."""
    pool = await db.get_pool()
    if pool is None:
        return {"state": None, "message": "Database unavailable"}

    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT state_data, summary, updated_at
                FROM economist_state
                ORDER BY updated_at DESC
                LIMIT 1
                """
            )
            if not row:
                return {"state": None, "message": "No economist state available"}

            state_data = row["state_data"]
            if isinstance(state_data, str):
                state_data = json.loads(state_data)

            return {
                "state": state_data,
                "summary": row["summary"],
                "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            }
    except Exception as exc:
        logger.error("Failed to get economist state: %s", exc)
        return {"state": None, "message": "Failed to retrieve economist state"}


# ---------------------------------------------------------------------------
# POST /api/economist/ingest-rba - accept RBA data from external push
# ---------------------------------------------------------------------------

class RBASeriesItem(BaseModel):
    series_id: str = Field(..., min_length=1, max_length=100)
    description: str = Field(..., min_length=1, max_length=500)
    value: float
    date: str = Field(..., min_length=1, max_length=20)
    unit: str = Field(default="%", max_length=50)
    frequency: str = Field(default="D", max_length=10)


class IngestRBARequest(BaseModel):
    source: str = Field(..., description="Must be 'RBA'")
    series: list[RBASeriesItem] = Field(..., min_length=1)


@router.post("/ingest-rba")
async def ingest_rba(body: IngestRBARequest) -> dict:
    """Accept RBA data pushed from an external source (local scraper).

    Validates the request, upserts each series into macro_series with
    source='RBA', and returns the count of ingested series.

    Auth: protected by verify_api_key via the router dependency in main.py.
    """
    if body.source != "RBA":
        return JSONResponse(
            status_code=400,
            content={"status": "error", "message": "source must be 'RBA'"},
        )

    pool = await db.get_pool()
    if pool is None:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "message": "Database unavailable"},
        )

    ingested = 0
    errors: list[str] = []

    try:
        async with pool.acquire() as conn:
            for item in body.series:
                try:
                    await conn.execute(
                        """
                        INSERT INTO macro_series
                            (source, series_id, description, frequency,
                             last_value, last_date, unit, updated_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                        ON CONFLICT (source, series_id) DO UPDATE SET
                            description = EXCLUDED.description,
                            frequency = EXCLUDED.frequency,
                            previous_value = macro_series.last_value,
                            previous_date = macro_series.last_date,
                            last_value = EXCLUDED.last_value,
                            last_date = EXCLUDED.last_date,
                            unit = EXCLUDED.unit,
                            updated_at = NOW()
                        """,
                        "RBA",
                        item.series_id,
                        item.description,
                        item.frequency,
                        item.value,
                        item.date,
                        item.unit,
                    )
                    ingested += 1
                except Exception as exc:
                    logger.error("RBA ingest failed for %s: %s", item.series_id, exc)
                    errors.append(f"{item.series_id}: {exc}")
    except Exception as exc:
        logger.error("RBA ingest DB error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": "Database error during ingest"},
        )

    result: dict[str, Any] = {"status": "ok", "series_ingested": ingested}
    if errors:
        result["errors"] = errors
    logger.info("RBA ingest: %d series ingested, %d errors", ingested, len(errors))
    return result
