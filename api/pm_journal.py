"""
PM Journal API endpoints (Phase E).

Provides a unified Journal view of PM decisions and insights, with filtering
by type, ticker, and active/archived state. Archive-not-delete semantics.

GET    /api/pm-journal              -- combined decisions + insights feed
GET    /api/pm-journal/decisions    -- PM decisions only
GET    /api/pm-journal/insights     -- PM insights only
POST   /api/pm-journal/insights/{id}/archive  -- archive an insight
POST   /api/pm-journal/insights/{id}/restore  -- restore an archived insight
"""

import logging

from fastapi import APIRouter, HTTPException, Request

import db
import pm_db
from auth import decode_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pm-journal", tags=["pm-journal"])


# ---------------------------------------------------------------------------
# Identity helper
# ---------------------------------------------------------------------------

def _get_identity(request: Request, guest_id_param: str | None = None):
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        payload = decode_token(auth_header[7:])
        if payload:
            return payload.get("sub"), None
    return None, guest_id_param


# ---------------------------------------------------------------------------
# Combined Journal feed
# ---------------------------------------------------------------------------

@router.get("")
async def get_pm_journal(
    request: Request,
    guest_id: str | None = None,
    ticker: str | None = None,
    insight_type: str | None = None,
    include_archived: bool = False,
    limit: int = 50,
):
    """
    Combined PM Journal: merges decisions and insights into a single
    chronologically sorted feed. Each item has a 'journal_type' field
    ('decision' or 'insight') for frontend filtering.
    """
    user_id, resolved_guest_id = _get_identity(request, guest_id)
    if not user_id and not resolved_guest_id:
        return {"entries": []}

    pool = await db.get_pool()
    if not pool:
        return {"entries": []}

    try:
        decisions = await pm_db.get_pm_decisions(
            pool,
            user_id=user_id,
            guest_id=resolved_guest_id,
            ticker=ticker,
            limit=limit,
        )
        insights = await pm_db.get_pm_insights(
            pool,
            user_id=user_id,
            guest_id=resolved_guest_id,
            insight_type=insight_type,
            ticker=ticker,
            active_only=not include_archived,
            include_archived=include_archived,
            limit=limit,
        )
    except Exception as exc:
        logger.error("PM Journal query failed: %s", exc)
        return {"entries": []}

    # Merge into unified feed
    entries = []

    for d in decisions:
        entries.append({
            "journal_type": "decision",
            "id": d["id"],
            "created_at": d["created_at"],
            "action_type": d["action_type"],
            "ticker": d["ticker"],
            "rationale": d["rationale"],
            "sizing_band": d["sizing_band"],
            "source_of_funds": d["source_of_funds"],
            "mandate_basis": d["mandate_basis"],
            "breach_codes": d["breach_codes"],
            "coverage_state": d["coverage_state"],
            "decision_basis": d["decision_basis"],
            "pm_conversation_id": d["pm_conversation_id"],
        })

    for i in insights:
        entries.append({
            "journal_type": "insight",
            "id": i["id"],
            "created_at": i["created_at"],
            "insight_type": i["insight_type"],
            "content": i["content"],
            "tickers": i["tickers"],
            "tags": i["tags"],
            "confidence": i["confidence"],
            "active": i["active"],
            "archived_at": i["archived_at"],
            "pm_conversation_id": i["pm_conversation_id"],
        })

    # Sort by created_at descending
    entries.sort(key=lambda e: e.get("created_at") or "", reverse=True)
    entries = entries[:limit]

    return {"entries": entries}


# ---------------------------------------------------------------------------
# Decisions-only
# ---------------------------------------------------------------------------

@router.get("/decisions")
async def get_pm_decisions(
    request: Request,
    guest_id: str | None = None,
    ticker: str | None = None,
    limit: int = 50,
):
    """Return PM decisions, optionally filtered by ticker."""
    user_id, resolved_guest_id = _get_identity(request, guest_id)
    if not user_id and not resolved_guest_id:
        return {"decisions": []}

    pool = await db.get_pool()
    if not pool:
        return {"decisions": []}

    try:
        decisions = await pm_db.get_pm_decisions(
            pool,
            user_id=user_id,
            guest_id=resolved_guest_id,
            ticker=ticker,
            limit=limit,
        )
        return {"decisions": decisions}
    except Exception as exc:
        logger.error("PM decisions query failed: %s", exc)
        return {"decisions": []}


# ---------------------------------------------------------------------------
# Insights-only
# ---------------------------------------------------------------------------

@router.get("/insights")
async def get_pm_insights(
    request: Request,
    guest_id: str | None = None,
    insight_type: str | None = None,
    ticker: str | None = None,
    include_archived: bool = False,
    limit: int = 50,
):
    """Return PM insights, optionally filtered by type and ticker."""
    user_id, resolved_guest_id = _get_identity(request, guest_id)
    if not user_id and not resolved_guest_id:
        return {"insights": []}

    pool = await db.get_pool()
    if not pool:
        return {"insights": []}

    try:
        insights = await pm_db.get_pm_insights(
            pool,
            user_id=user_id,
            guest_id=resolved_guest_id,
            insight_type=insight_type,
            ticker=ticker,
            active_only=not include_archived,
            include_archived=include_archived,
            limit=limit,
        )
        return {"insights": insights}
    except Exception as exc:
        logger.error("PM insights query failed: %s", exc)
        return {"insights": []}


# ---------------------------------------------------------------------------
# Archive / Restore
# ---------------------------------------------------------------------------

@router.post("/insights/{insight_id}/archive")
async def archive_insight(insight_id: str, request: Request):
    """Archive a PM insight (soft-delete). Does not permanently remove."""
    pool = await db.get_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Database unavailable")

    success = await pm_db.archive_pm_insight(pool, insight_id)
    if not success:
        raise HTTPException(status_code=404, detail="Insight not found or already archived")
    return {"status": "archived", "id": insight_id}


@router.post("/insights/{insight_id}/restore")
async def restore_insight(insight_id: str, request: Request):
    """Restore an archived PM insight."""
    pool = await db.get_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Database unavailable")

    success = await pm_db.restore_pm_insight(pool, insight_id)
    if not success:
        raise HTTPException(status_code=404, detail="Insight not found or not archived")
    return {"status": "restored", "id": insight_id}
