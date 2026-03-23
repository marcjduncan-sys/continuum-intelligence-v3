"""
PM Operations Dashboard (BEAD-001 / D6-4).

GET /api/ops/pm-dashboard -- read-only aggregation of PM workflow telemetry
from existing DB tables. Gated by X-Ops-Secret header.
"""

import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Header, Query
from errors import api_error, ErrorCode

import config
import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ops", tags=["ops"])


def _verify_ops_secret(x_ops_secret: str | None):
    """Reject if OPS_SECRET is empty or header doesn't match."""
    if not config.OPS_SECRET or x_ops_secret != config.OPS_SECRET:
        raise api_error(401, ErrorCode.AUTH_ERROR, "Invalid or missing ops secret")


async def _query_rows(pool, sql: str, *params) -> list:
    """Run a read-only query; return list of dicts."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)
        return [dict(r) for r in rows]


def _classify_traffic(minutes_since: float | None) -> tuple[str, str | None]:
    """Return (traffic_status, zero_state_reason)."""
    if minutes_since is None:
        return "inactive", "No PM activity in selected window"
    if minutes_since > 1440:  # >24h
        return "inactive", "No PM activity in last 24 hours"
    if minutes_since > 240:  # >4h
        return "quiet", None
    return "normal", None


def _fill_timeseries(rows: list[dict], cutoff: datetime, days: int) -> list[dict]:
    """Ensure every date in the window has an entry (no gaps)."""
    by_date = {r["date"].isoformat() if hasattr(r["date"], "isoformat") else str(r["date"]): r["count"] for r in rows}
    result = []
    for i in range(days + 1):
        d = (cutoff + timedelta(days=i)).date()
        result.append({"date": d.isoformat(), "count": by_date.get(d.isoformat(), 0)})
    return result


@router.get("/pm-dashboard")
async def pm_dashboard(
    x_ops_secret: str | None = Header(None),
    days: int = Query(default=7, ge=1, le=90),
):
    """
    PM workflow telemetry dashboard.

    Returns aggregated metrics from pm_conversations, pm_messages,
    handoffs, pm_decisions, and pm_insights tables.
    """
    _verify_ops_secret(x_ops_secret)

    pool = await db.get_pool()
    if not pool:
        raise api_error(503, ErrorCode.SERVICE_UNAVAILABLE, "Database unavailable")

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)

    # --- Summary counts (parallel-safe: all read-only) ---
    pm_request_rows = await _query_rows(
        pool,
        "SELECT COUNT(*) AS cnt FROM pm_messages WHERE role = 'user' AND created_at >= $1",
        cutoff,
    )
    pm_requests_total = pm_request_rows[0]["cnt"] if pm_request_rows else 0

    handoff_rows = await _query_rows(
        pool,
        "SELECT COUNT(*) AS cnt FROM handoffs WHERE created_at >= $1",
        cutoff,
    )
    handoffs_total = handoff_rows[0]["cnt"] if handoff_rows else 0

    decision_rows = await _query_rows(
        pool,
        "SELECT COUNT(*) AS cnt FROM pm_decisions WHERE created_at >= $1",
        cutoff,
    )
    decisions_total = decision_rows[0]["cnt"] if decision_rows else 0

    insight_rows = await _query_rows(
        pool,
        "SELECT COUNT(*) AS cnt FROM pm_insights WHERE created_at >= $1",
        cutoff,
    )
    insights_total = insight_rows[0]["cnt"] if insight_rows else 0

    # Active portfolios (distinct portfolio_id in conversations)
    portfolio_rows = await _query_rows(
        pool,
        """SELECT COUNT(DISTINCT portfolio_id) AS cnt
           FROM pm_conversations
           WHERE started_at >= $1 AND portfolio_id IS NOT NULL""",
        cutoff,
    )
    active_portfolios = portfolio_rows[0]["cnt"] if portfolio_rows else 0

    # Active tickers (from decisions + handoffs)
    ticker_rows = await _query_rows(
        pool,
        """SELECT COUNT(DISTINCT ticker) AS cnt FROM (
             SELECT ticker FROM pm_decisions WHERE created_at >= $1 AND ticker IS NOT NULL
             UNION
             SELECT ticker FROM handoffs WHERE created_at >= $1
           ) t""",
        cutoff,
    )
    active_tickers = ticker_rows[0]["cnt"] if ticker_rows else 0

    # --- Timeseries ---
    requests_ts = await _query_rows(
        pool,
        """SELECT DATE(created_at) AS date, COUNT(*) AS count
           FROM pm_messages WHERE role = 'user' AND created_at >= $1
           GROUP BY DATE(created_at) ORDER BY date""",
        cutoff,
    )
    handoffs_ts = await _query_rows(
        pool,
        """SELECT DATE(created_at) AS date, COUNT(*) AS count
           FROM handoffs WHERE created_at >= $1
           GROUP BY DATE(created_at) ORDER BY date""",
        cutoff,
    )

    # --- Breakdowns ---
    handoffs_by_route = await _query_rows(
        pool,
        """SELECT source_role AS source, destination_role AS destination, COUNT(*) AS count
           FROM handoffs WHERE created_at >= $1
           GROUP BY source_role, destination_role ORDER BY count DESC""",
        cutoff,
    )

    decisions_by_action = await _query_rows(
        pool,
        """SELECT action_type, COUNT(*) AS count
           FROM pm_decisions WHERE created_at >= $1
           GROUP BY action_type ORDER BY count DESC""",
        cutoff,
    )

    insights_by_type = await _query_rows(
        pool,
        """SELECT insight_type, COUNT(*) AS count
           FROM pm_insights WHERE created_at >= $1
           GROUP BY insight_type ORDER BY count DESC""",
        cutoff,
    )

    context_modes = await _query_rows(
        pool,
        """SELECT COALESCE(metadata_json::json->>'context_mode', 'unset') AS mode, COUNT(*) AS count
           FROM pm_messages WHERE role = 'assistant' AND created_at >= $1
           AND metadata_json IS NOT NULL
           GROUP BY mode ORDER BY count DESC""",
        cutoff,
    )

    top_portfolios = await _query_rows(
        pool,
        """SELECT portfolio_id, COUNT(*) AS request_count
           FROM pm_conversations c
           JOIN pm_messages m ON m.pm_conversation_id = c.id
           WHERE m.role = 'user' AND m.created_at >= $1 AND c.portfolio_id IS NOT NULL
           GROUP BY c.portfolio_id ORDER BY request_count DESC LIMIT 10""",
        cutoff,
    )
    top_portfolios = [{"portfolio_id": str(r["portfolio_id"]), "request_count": r["request_count"]} for r in top_portfolios]

    top_tickers = await _query_rows(
        pool,
        """SELECT ticker, COUNT(*) AS mention_count FROM (
             SELECT ticker FROM pm_decisions WHERE created_at >= $1 AND ticker IS NOT NULL
             UNION ALL
             SELECT ticker FROM handoffs WHERE created_at >= $1
           ) t
           GROUP BY ticker ORDER BY mention_count DESC LIMIT 10""",
        cutoff,
    )
    top_tickers = [{"ticker": r["ticker"], "mention_count": r["mention_count"]} for r in top_tickers]

    # --- Latest events (most recent 20) ---
    latest_events = []

    recent_messages = await _query_rows(
        pool,
        """SELECT 'pm_request' AS type, m.created_at AS timestamp,
                  COALESCE(c.portfolio_id::text, 'no-portfolio') AS detail
           FROM pm_messages m
           JOIN pm_conversations c ON c.id = m.pm_conversation_id
           WHERE m.role = 'user' AND m.created_at >= $1
           ORDER BY m.created_at DESC LIMIT 10""",
        cutoff,
    )
    recent_handoffs = await _query_rows(
        pool,
        """SELECT 'handoff' AS type, created_at AS timestamp,
                  source_role || ' -> ' || destination_role || ' (' || ticker || ')' AS detail
           FROM handoffs WHERE created_at >= $1
           ORDER BY created_at DESC LIMIT 10""",
        cutoff,
    )
    recent_decisions = await _query_rows(
        pool,
        """SELECT 'decision' AS type, created_at AS timestamp,
                  action_type || COALESCE(' ' || ticker, '') AS detail
           FROM pm_decisions WHERE created_at >= $1
           ORDER BY created_at DESC LIMIT 10""",
        cutoff,
    )

    all_events = recent_messages + recent_handoffs + recent_decisions
    all_events.sort(key=lambda e: e.get("timestamp") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    for ev in all_events[:20]:
        ts = ev.get("timestamp")
        latest_events.append({
            "type": ev["type"],
            "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts) if ts else None,
            "detail": ev.get("detail", ""),
        })

    # --- Health / status ---
    last_activity_at = None
    minutes_since = None
    if all_events:
        last_ts = all_events[0].get("timestamp")
        if last_ts:
            last_activity_at = last_ts.isoformat() if hasattr(last_ts, "isoformat") else str(last_ts)
            try:
                if hasattr(last_ts, "timestamp"):
                    minutes_since = (now - last_ts).total_seconds() / 60
            except (TypeError, ValueError):
                pass

    has_data = pm_requests_total > 0 or handoffs_total > 0 or decisions_total > 0 or insights_total > 0
    traffic_status, zero_state_reason = _classify_traffic(minutes_since if has_data else None)
    if has_data:
        zero_state_reason = None

    return {
        "window_days": days,
        "generated_at": now.isoformat(),
        "summary": {
            "pm_requests": pm_requests_total,
            "handoffs": handoffs_total,
            "decisions": decisions_total,
            "insights": insights_total,
            "active_portfolios": active_portfolios,
            "active_tickers": active_tickers,
        },
        "timeseries": {
            "requests_by_day": _fill_timeseries(requests_ts, cutoff, days),
            "handoffs_by_day": _fill_timeseries(handoffs_ts, cutoff, days),
        },
        "breakdowns": {
            "handoffs_by_route": [{"source": r["source"], "destination": r["destination"], "count": r["count"]} for r in handoffs_by_route],
            "decisions_by_action": [{"action_type": r["action_type"], "count": r["count"]} for r in decisions_by_action],
            "insights_by_type": [{"insight_type": r["insight_type"], "count": r["count"]} for r in insights_by_type],
            "context_modes": [{"mode": r["mode"], "count": r["count"]} for r in context_modes],
            "top_portfolios": top_portfolios,
            "top_tickers": top_tickers,
        },
        "latest_events": latest_events,
        "status": {
            "has_data": has_data,
            "last_activity_at": last_activity_at,
            "minutes_since_last_activity": round(minutes_since, 1) if minutes_since is not None else None,
            "traffic_status": traffic_status,
            "zero_state_reason": zero_state_reason,
        },
    }
