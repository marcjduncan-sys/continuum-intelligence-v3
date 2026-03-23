"""
Portfolio API endpoints (Phase B + C).

REST endpoints for portfolio, snapshot, holdings management, and analytics.
Validation runs before any DB write. Analytics computed and persisted on snapshot creation.
"""

import logging
from datetime import date

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

import config
import db
import portfolio_db
import portfolio_validation
import portfolio_analytics
from errors import api_error, ErrorCode

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/portfolios", tags=["portfolios"])


# ---------------------------------------------------------------------------
# Auth dependency (same pattern as pm_chat.py)
# ---------------------------------------------------------------------------

from fastapi.security import APIKeyHeader

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def _verify_api_key(api_key: str | None = Depends(_api_key_header)):
    expected = config.CI_API_KEY
    if not expected:
        return
    if api_key != expected:
        raise api_error(401, ErrorCode.AUTH_ERROR, "Invalid or missing API key")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class CreatePortfolioRequest(BaseModel):
    name: str = Field(default="Default", max_length=100)
    currency: str = Field(default="AUD", max_length=10)
    guest_id: str | None = None


class PortfolioResponse(BaseModel):
    id: str
    name: str
    currency: str


class HoldingInput(BaseModel):
    ticker: str = Field(..., max_length=20)
    quantity: float = Field(..., gt=0)
    price: float = Field(..., gt=0)
    market_value: float = Field(..., gt=0)
    sector: str | None = None
    asset_class: str = Field(default="equity", max_length=30)
    notes: str | None = None


class CreateSnapshotRequest(BaseModel):
    as_of_date: date
    total_value: float = Field(..., ge=0)
    cash_value: float = Field(default=0, ge=0)
    holdings: list[HoldingInput] = Field(default_factory=list)
    notes: str | None = None
    guest_id: str | None = None


class SnapshotResponse(BaseModel):
    snapshot_id: str
    portfolio_id: str
    as_of_date: str
    total_value: float
    cash_value: float
    holdings_count: int


class PortfolioStateResponse(BaseModel):
    portfolio_id: str
    snapshot_id: str
    as_of_date: str
    total_value: float
    cash_value: float
    cash_weight: float
    holdings: list[dict]
    sector_exposure: dict
    concentration_flags: list[str]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("", response_model=PortfolioResponse)
async def create_portfolio(
    request: Request,
    body: CreatePortfolioRequest,
    _=Depends(_verify_api_key),
):
    """Create a new portfolio."""
    pool = await db.get_pool()
    if pool is None:
        raise api_error(503, ErrorCode.LLM_ERROR, "Database unavailable")

    # Extract user from auth token if present
    user_id = getattr(request.state, "user_id", None)
    guest_id = body.guest_id

    if not user_id and not guest_id:
        raise api_error(
            422,
            ErrorCode.AUTH_ERROR,
            "Portfolio requires an owner: provide guest_id or authenticate first",
        )

    portfolio_id = await portfolio_db.create_portfolio(
        pool,
        name=body.name,
        currency=body.currency,
        user_id=user_id,
        guest_id=guest_id,
    )
    if not portfolio_id:
        raise api_error(500, ErrorCode.LLM_ERROR, "Failed to create portfolio")

    return PortfolioResponse(id=portfolio_id, name=body.name, currency=body.currency)


@router.get("", response_model=list[PortfolioResponse])
async def list_portfolios(
    request: Request,
    guest_id: str | None = None,
    _=Depends(_verify_api_key),
):
    """List portfolios for the authenticated user or guest."""
    pool = await db.get_pool()
    if pool is None:
        return []

    user_id = getattr(request.state, "user_id", None)
    rows = await portfolio_db.get_portfolios(pool, user_id=user_id, guest_id=guest_id)
    return [
        PortfolioResponse(id=str(r["id"]), name=r["name"], currency=r["currency"])
        for r in rows
    ]


@router.post("/{portfolio_id}/snapshots", response_model=SnapshotResponse)
async def create_snapshot(
    portfolio_id: str,
    body: CreateSnapshotRequest,
    _=Depends(_verify_api_key),
):
    """Create a point-in-time snapshot with holdings."""
    pool = await db.get_pool()
    if pool is None:
        raise api_error(503, ErrorCode.LLM_ERROR, "Database unavailable")

    # Verify portfolio exists
    portfolio = await portfolio_db.get_portfolio(pool, portfolio_id)
    if not portfolio:
        raise api_error(404, ErrorCode.AUTH_ERROR, "Portfolio not found")

    # Validate
    holdings_dicts = [h.model_dump() for h in body.holdings]
    errors = portfolio_validation.validate_snapshot(
        total_value=body.total_value,
        cash_value=body.cash_value,
        holdings=holdings_dicts,
    )
    if errors:
        raise api_error(422, ErrorCode.AUTH_ERROR, "Validation failed", detail="; ".join(errors))

    # Create snapshot
    snapshot_id = await portfolio_db.create_snapshot(
        pool,
        portfolio_id=portfolio_id,
        as_of_date=body.as_of_date,
        total_value=body.total_value,
        cash_value=body.cash_value,
        notes=body.notes,
    )
    if not snapshot_id:
        raise api_error(500, ErrorCode.LLM_ERROR, "Failed to create snapshot")

    # Insert holdings
    if holdings_dicts:
        await portfolio_db.add_holdings_batch(
            pool,
            snapshot_id=snapshot_id,
            holdings=holdings_dicts,
        )

    # Compute and persist analytics (Phase C)
    try:
        analytics = portfolio_analytics.compute_analytics(
            holdings=holdings_dicts,
            total_value=body.total_value,
            cash_value=body.cash_value,
        )
        await portfolio_db.save_analytics(
            pool,
            snapshot_id=snapshot_id,
            analytics_json=portfolio_analytics.analytics_to_json(analytics),
            thresholds_json=portfolio_analytics.analytics_to_json(
                portfolio_analytics.DEFAULT_THRESHOLDS.to_dict()
            ),
        )
    except Exception as exc:
        logger.warning("Analytics computation/persistence failed: %s", exc)
        # Non-blocking: snapshot is still valid without analytics

    return SnapshotResponse(
        snapshot_id=snapshot_id,
        portfolio_id=portfolio_id,
        as_of_date=body.as_of_date.isoformat(),
        total_value=body.total_value,
        cash_value=body.cash_value,
        holdings_count=len(holdings_dicts),
    )


@router.get("/{portfolio_id}/state", response_model=PortfolioStateResponse)
async def get_portfolio_state(
    portfolio_id: str,
    _=Depends(_verify_api_key),
):
    """Get latest portfolio state with derived weights and flags."""
    pool = await db.get_pool()
    if pool is None:
        raise api_error(503, ErrorCode.LLM_ERROR, "Database unavailable")

    state = await portfolio_db.get_portfolio_state(pool, portfolio_id)
    if not state:
        raise api_error(404, ErrorCode.AUTH_ERROR, "No snapshots found for portfolio")

    return PortfolioStateResponse(**state)


@router.get("/{portfolio_id}/snapshots")
async def list_snapshots(
    portfolio_id: str,
    limit: int = 20,
    _=Depends(_verify_api_key),
):
    """List snapshots for a portfolio."""
    pool = await db.get_pool()
    if pool is None:
        return []

    snapshots = await portfolio_db.get_snapshots(pool, portfolio_id, limit=limit)
    return [
        {
            "snapshot_id": str(s["id"]),
            "as_of_date": s["as_of_date"].isoformat() if hasattr(s["as_of_date"], "isoformat") else str(s["as_of_date"]),
            "total_value": float(s["total_value"]),
            "cash_value": float(s["cash_value"]),
        }
        for s in snapshots
    ]


@router.get("/{portfolio_id}/analytics")
async def get_portfolio_analytics(
    portfolio_id: str,
    _=Depends(_verify_api_key),
):
    """Get computed analytics for the latest snapshot.

    Returns persisted analytics if available; otherwise computes on the fly.
    """
    pool = await db.get_pool()
    if pool is None:
        raise api_error(503, ErrorCode.LLM_ERROR, "Database unavailable")

    # Get latest snapshot
    snapshot = await portfolio_db.get_latest_snapshot(pool, portfolio_id)
    if not snapshot:
        raise api_error(404, ErrorCode.AUTH_ERROR, "No snapshots found for portfolio")

    snapshot_id = str(snapshot["id"])

    # Try persisted analytics first
    persisted = await portfolio_db.get_analytics(pool, snapshot_id)
    if persisted:
        return persisted["analytics"]

    # Compute on the fly (e.g. for snapshots created before Phase C)
    holdings = await portfolio_db.get_holdings(pool, snapshot_id)
    analytics = portfolio_analytics.compute_analytics(
        holdings=[dict(h) for h in holdings],
        total_value=float(snapshot["total_value"]),
        cash_value=float(snapshot["cash_value"]),
    )

    # Persist for next time
    try:
        await portfolio_db.save_analytics(
            pool,
            snapshot_id=snapshot_id,
            analytics_json=portfolio_analytics.analytics_to_json(analytics),
        )
    except Exception as exc:
        logger.warning("Failed to persist on-the-fly analytics: %s", exc)

    return analytics
