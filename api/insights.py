"""
Phase 9: Proactive Insights

Nightly scan that compares fresh research data against stored user memories.
When a stored view is materially CONFIRMED or CONTRADICTED by current evidence,
a notification row is inserted. A 7-day re-notification guard prevents spamming
the same memory.

Entry point: run_insight_scan(pool, tickers) -> dict
Called by POST /api/insights/scan (auth-guarded via X-Insights-Secret).
"""

import logging
import re
import time
import uuid
from datetime import datetime, timedelta, timezone

import httpx

import config

logger = logging.getLogger(__name__)

_HAIKU_MODEL = "claude-haiku-4-5"
_RENOTIFY_DAYS = 7
_CONSOLIDATE_TYPES = ["positional", "tactical"]
_GITHUB_PAGES_BASE = (
    "https://marcjduncan-sys.github.io"
    "/continuum-intelligence-v3/data/research"
)


# ---------------------------------------------------------------------------
# Research data helpers
# ---------------------------------------------------------------------------

def _fetch_research(ticker: str) -> dict | None:
    """Fetch current research JSON for a ticker from GitHub Pages."""
    url = f"{_GITHUB_PAGES_BASE}/{ticker}.json"
    try:
        resp = httpx.get(url, timeout=15.0)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.warning("Could not fetch research for %s: %s", ticker, exc)
        return None


def _build_research_summary(data: dict) -> str:
    """
    Extract a compact text summary of current research state for Haiku context.
    Includes: overall skew, top-3 hypothesis scores, narrative stability.
    """
    lines = []

    hero = data.get("hero", {})
    skew_label = hero.get("skew", "")
    skew_score = hero.get("skewScore", "")
    if skew_label or skew_score:
        lines.append(f"Overall skew: {skew_label} (score: {skew_score})")

    hypotheses = data.get("hypotheses", [])
    if hypotheses:
        sorted_hyps = sorted(
            hypotheses,
            key=lambda h: h.get("score", 0),
            reverse=True,
        )[:3]
        for h in sorted_hyps:
            name = h.get("name", h.get("title", ""))
            score = h.get("score", "")
            status = h.get("status", "")
            if name:
                lines.append(f"Hypothesis '{name}': score={score}, status={status}")

    narrative = data.get("narrative", {})
    stability = narrative.get("narrativeStability", "")
    if stability:
        clean = re.sub(r"<[^>]+>", " ", stability).strip()
        if clean:
            lines.append(f"Narrative stability: {clean[:200]}")

    return "\n".join(lines) if lines else "No research summary available."


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

async def _get_active_memories(pool, ticker: str) -> list[dict]:
    """Return all active positional/tactical memories for a ticker."""
    if pool is None:
        return []
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, user_id, guest_id, content, confidence
            FROM memories
            WHERE ticker = $1
              AND memory_type = ANY($2::text[])
              AND active = TRUE
            ORDER BY confidence DESC, created_at DESC
            """,
            ticker,
            _CONSOLIDATE_TYPES,
        )
    return [dict(r) for r in rows]


async def _already_notified(pool, memory_id) -> bool:
    """Return True if this memory was notified within the re-notification window."""
    if pool is None:
        return False
    cutoff = datetime.now(timezone.utc) - timedelta(days=_RENOTIFY_DAYS)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id FROM notifications
            WHERE memory_id = $1
              AND dismissed = FALSE
              AND last_notified_at > $2
            LIMIT 1
            """,
            memory_id,
            cutoff,
        )
    return row is not None


async def _insert_notification(
    pool,
    user_id,
    guest_id,
    memory_id,
    ticker: str,
    signal: str,
    summary: str,
) -> None:
    """Insert a new notification row."""
    if pool is None:
        return
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO notifications
                (user_id, guest_id, memory_id, ticker, signal, summary)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            user_id,
            guest_id,
            memory_id,
            ticker,
            signal,
            summary,
        )


async def get_notifications(pool, user_id, guest_id) -> list[dict]:
    """Return active (not dismissed) notifications for a caller, newest first."""
    if pool is None:
        return []
    if user_id:
        condition = "user_id = $1"
        param = user_id
    elif guest_id:
        condition = "guest_id = $1"
        param = guest_id
    else:
        return []
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT id, ticker, signal, summary, seen, created_at
            FROM notifications
            WHERE {condition}
              AND dismissed = FALSE
            ORDER BY created_at DESC
            LIMIT 50
            """,
            param,
        )
    result = []
    for r in rows:
        d = dict(r)
        d["id"] = str(d["id"])
        d["created_at"] = d["created_at"].isoformat()
        result.append(d)
    return result


async def dismiss_notification(pool, notification_id: str, user_id, guest_id) -> bool:
    """
    Mark a notification as dismissed. Returns True if a row was updated.
    Ownership check: user_id or guest_id must match the stored value.
    """
    if pool is None:
        return False
    try:
        nid = uuid.UUID(notification_id)
    except ValueError:
        return False
    if user_id:
        condition = "user_id = $2"
        param = user_id
    elif guest_id:
        condition = "guest_id = $2"
        param = guest_id
    else:
        return False
    async with pool.acquire() as conn:
        result = await conn.execute(
            f"""
            UPDATE notifications
            SET dismissed = TRUE
            WHERE id = $1 AND {condition}
            """,
            nid,
            param,
        )
    return result != "UPDATE 0"


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

def _classify(memory_content: str, research_summary: str):
    """
    Ask Haiku whether current research confirms, contradicts, or is neutral
    to the stored user view.

    Returns (signal, summary) where signal is 'confirms' or 'contradicts',
    or None if neutral or the call fails.
    """
    prompt = (
        f"Stored user view: {memory_content}\n\n"
        f"Current research data:\n{research_summary}\n\n"
        "Does the current research data CONFIRM, CONTRADICT, or is it NEUTRAL "
        "with respect to the stored user view?\n"
        "Reply in exactly this format:\n"
        "SIGNAL: <CONFIRMS|CONTRADICTS|NEUTRAL>\n"
        "SUMMARY: <one sentence explaining why>"
    )
    try:
        client = config.get_anthropic_client()
        msg = client.messages.create(
            model=_HAIKU_MODEL,
            max_tokens=80,
            messages=[{"role": "user", "content": prompt}],
        )
        text = msg.content[0].text.strip()
        signal_line = ""
        summary_line = ""
        for line in text.splitlines():
            if line.startswith("SIGNAL:"):
                signal_line = line[7:].strip().upper()
            elif line.startswith("SUMMARY:"):
                summary_line = line[8:].strip()
        if signal_line == "NEUTRAL" or not signal_line:
            return None
        if signal_line not in ("CONFIRMS", "CONTRADICTS"):
            return None
        return signal_line.lower(), summary_line or text[:200]
    except Exception as exc:
        logger.warning("Haiku classification failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Scan logic
# ---------------------------------------------------------------------------

async def scan_ticker(pool, ticker: str) -> dict:
    """
    Fetch research for one ticker, compare against active memories,
    insert notifications for confirmed/contradicted views.
    """
    research_data = _fetch_research(ticker)
    if not research_data:
        return {"ticker": ticker, "memories_checked": 0, "notifications_inserted": 0}

    research_summary = _build_research_summary(research_data)
    memories = await _get_active_memories(pool, ticker)

    memories_checked = 0
    notifications_inserted = 0

    for mem in memories:
        memories_checked += 1
        if await _already_notified(pool, mem["id"]):
            continue
        result = _classify(mem["content"], research_summary)
        if result is None:
            continue
        signal, summary = result
        await _insert_notification(
            pool,
            user_id=mem["user_id"],
            guest_id=mem["guest_id"],
            memory_id=mem["id"],
            ticker=ticker,
            signal=signal,
            summary=summary,
        )
        notifications_inserted += 1

    return {
        "ticker": ticker,
        "memories_checked": memories_checked,
        "notifications_inserted": notifications_inserted,
    }


async def run_insight_scan(pool, tickers: list) -> dict:
    """
    Scan all supplied tickers. If tickers is empty, discover tickers with
    active memories from the DB and scan those.

    Returns aggregate counts and duration.
    """
    started = time.time()

    if not tickers:
        if pool is None:
            return {
                "tickers_scanned": 0,
                "memories_checked": 0,
                "notifications_inserted": 0,
                "duration_seconds": 0.0,
            }
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT DISTINCT ticker FROM memories
                WHERE ticker IS NOT NULL
                  AND memory_type = ANY($1::text[])
                  AND active = TRUE
                """,
                _CONSOLIDATE_TYPES,
            )
        tickers = [r["ticker"] for r in rows]

    total_memories = 0
    total_notifications = 0

    for ticker in tickers:
        try:
            result = await scan_ticker(pool, ticker)
            total_memories += result["memories_checked"]
            total_notifications += result["notifications_inserted"]
        except Exception as exc:
            logger.error("scan_ticker failed for %s: %s", ticker, exc)

    duration = round(time.time() - started, 2)
    logger.info(
        "Insight scan complete: %d tickers, %d memories, %d notifications in %ss",
        len(tickers),
        total_memories,
        total_notifications,
        duration,
    )
    return {
        "tickers_scanned": len(tickers),
        "memories_checked": total_memories,
        "notifications_inserted": total_notifications,
        "duration_seconds": duration,
    }
