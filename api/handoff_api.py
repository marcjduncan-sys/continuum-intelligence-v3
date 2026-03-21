"""
Handoff API endpoints (Phase F).

Cross-role handoff between Analyst and PM:
POST   /api/handoffs/analyst-to-pm      -- Analyst sends ticker to PM with summary
POST   /api/handoffs/pm-requests-analyst -- PM requests current Analyst summary
GET    /api/handoffs                     -- list handoff log
GET    /api/handoffs/summary/{ticker}    -- get current Analyst summary for ticker
"""

import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

import db
import handoff
from auth import decode_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/handoffs", tags=["handoffs"])


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
# Request models
# ---------------------------------------------------------------------------

class AnalystToPMRequest(BaseModel):
    ticker: str = Field(..., description="Ticker to hand off to PM")
    source_conversation_id: str | None = Field(None, description="Analyst conversation ID")
    handoff_reason: str | None = Field(
        None,
        description="Why the handoff is happening, e.g. 'assess portfolio fit', 'new coverage'"
    )
    guest_id: str | None = Field(None, description="Guest device UUID")


class PMRequestsAnalystRequest(BaseModel):
    ticker: str = Field(..., description="Ticker to get Analyst summary for")
    source_conversation_id: str | None = Field(None, description="PM conversation ID")
    guest_id: str | None = Field(None, description="Guest device UUID")


# ---------------------------------------------------------------------------
# Analyst-to-PM handoff
# ---------------------------------------------------------------------------

@router.post("/analyst-to-pm")
async def analyst_to_pm(body: AnalystToPMRequest, request: Request):
    """
    Analyst hands off a ticker to PM for portfolio-fit assessment.

    Assembles the current Analyst summary, logs the handoff, and returns
    the summary payload so the frontend can inject it into PM Chat context.
    """
    user_id, guest_id = _get_identity(request, body.guest_id)
    if not user_id and not guest_id:
        raise HTTPException(
            status_code=400,
            detail="Provide Authorization header or guest_id",
        )

    pool = await db.get_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Database unavailable")

    # Assemble Analyst summary
    summary_payload = await handoff.build_analyst_summary(
        pool,
        ticker=body.ticker,
        user_id=user_id,
        guest_id=guest_id,
    )

    # Log the handoff
    handoff_id = await handoff.log_handoff(
        pool,
        user_id=user_id,
        guest_id=guest_id,
        source_role="analyst",
        destination_role="pm",
        ticker=body.ticker,
        summary_payload=summary_payload,
        source_conversation_id=body.source_conversation_id,
        handoff_reason=body.handoff_reason or "assess_portfolio_fit",
        coverage_state=summary_payload.get("coverage_state"),
        analyst_summary_version=summary_payload.get("summary_version"),
    )

    return {
        "handoff_id": handoff_id,
        "summary_payload": summary_payload,
        "source_role": "analyst",
        "destination_role": "pm",
    }


# ---------------------------------------------------------------------------
# PM requests Analyst summary
# ---------------------------------------------------------------------------

@router.post("/pm-requests-analyst")
async def pm_requests_analyst(body: PMRequestsAnalystRequest, request: Request):
    """
    PM requests the current Analyst summary for a ticker.

    Assembles the summary, logs the handoff (PM -> Analyst direction in the
    request sense), and returns the Analyst summary payload.
    """
    user_id, guest_id = _get_identity(request, body.guest_id)
    if not user_id and not guest_id:
        raise HTTPException(
            status_code=400,
            detail="Provide Authorization header or guest_id",
        )

    pool = await db.get_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Database unavailable")

    # Assemble Analyst summary
    summary_payload = await handoff.build_analyst_summary(
        pool,
        ticker=body.ticker,
        user_id=user_id,
        guest_id=guest_id,
    )

    # Log the handoff (PM is requesting Analyst's view)
    handoff_id = await handoff.log_handoff(
        pool,
        user_id=user_id,
        guest_id=guest_id,
        source_role="pm",
        destination_role="analyst",
        ticker=body.ticker,
        summary_payload=summary_payload,
        source_conversation_id=body.source_conversation_id,
        handoff_reason="view_analyst_summary",
        coverage_state=summary_payload.get("coverage_state"),
        analyst_summary_version=summary_payload.get("summary_version"),
    )

    return {
        "handoff_id": handoff_id,
        "summary_payload": summary_payload,
        "source_role": "pm",
        "destination_role": "analyst",
    }


# ---------------------------------------------------------------------------
# Get current Analyst summary (no log, read-only)
# ---------------------------------------------------------------------------

@router.get("/summary/{ticker}")
async def get_analyst_summary(
    ticker: str,
    request: Request,
    guest_id: str | None = None,
):
    """
    Return the current Analyst summary for a ticker without logging a handoff.
    Useful for UI previews and status indicators.
    """
    user_id, resolved_guest_id = _get_identity(request, guest_id)

    pool = await db.get_pool()
    if not pool:
        return {"summary_payload": None, "coverage_state": "not_covered"}

    summary_payload = await handoff.build_analyst_summary(
        pool,
        ticker=ticker,
        user_id=user_id,
        guest_id=resolved_guest_id,
    )

    return {"summary_payload": summary_payload}


# ---------------------------------------------------------------------------
# Handoff log
# ---------------------------------------------------------------------------

@router.get("")
async def list_handoffs(
    request: Request,
    guest_id: str | None = None,
    ticker: str | None = None,
    source_role: str | None = None,
    limit: int = 50,
):
    """List handoff log entries for the current user."""
    user_id, resolved_guest_id = _get_identity(request, guest_id)
    if not user_id and not resolved_guest_id:
        return {"handoffs": []}

    pool = await db.get_pool()
    if not pool:
        return {"handoffs": []}

    try:
        handoffs = await handoff.get_handoffs(
            pool,
            user_id=user_id,
            guest_id=resolved_guest_id,
            ticker=ticker,
            source_role=source_role,
            limit=limit,
        )
        return {"handoffs": handoffs}
    except Exception as exc:
        logger.error("Failed to list handoffs: %s", exc)
        return {"handoffs": []}
