"""
Profile persistence endpoints (Phase 5: Server-Side Prompt Assembly).

PUT  /api/profile  -- save or update personalisation profile
GET  /api/profile  -- retrieve current profile

Auth rules (same as conversations.py):
  - If Authorization: Bearer <jwt> is present and valid, use user_id from token.
  - If no JWT, use guest_id query param / request body field.
  - If neither, return 400 on write; return empty on read.
"""

import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

import db
from auth import decode_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/profile", tags=["profile"])


# ---------------------------------------------------------------------------
# Identity helper (same pattern as conversations.py)
# ---------------------------------------------------------------------------

def _get_identity(request: Request, guest_id_param: str | None = None):
    """Extract user identity from JWT (preferred) or guest_id fallback."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        payload = decode_token(auth_header[7:])
        if payload:
            return payload.get("sub"), None
    return None, guest_id_param


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class ProfilePayload(BaseModel):
    """The full personalisation data blob sent by the wizard."""
    firm: dict = Field(default_factory=dict)
    fund: dict = Field(default_factory=dict)
    portfolio: list[dict] = Field(default_factory=list)
    profile: dict = Field(default_factory=dict)
    guest_id: str | None = Field(None, description="Guest device UUID (no login required)")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.put("")
async def save_profile(body: ProfilePayload, request: Request):
    """Save or update the personalisation profile for the current user or guest."""
    user_id, guest_id = _get_identity(request, body.guest_id)
    if not user_id and not guest_id:
        raise HTTPException(
            status_code=400,
            detail="Provide Authorization: Bearer <token> header or guest_id in body",
        )

    data = {
        "firm": body.firm,
        "fund": body.fund,
        "portfolio": body.portfolio,
        "profile": body.profile,
    }

    pool = await db.get_pool()
    profile_id = await db.upsert_profile(
        pool, data=data, user_id=user_id, guest_id=guest_id
    )
    if not profile_id:
        raise HTTPException(status_code=503, detail="Database unavailable")

    logger.info("Profile saved", extra={"user_id": user_id, "guest_id": guest_id})
    return {"id": profile_id, "status": "saved"}


@router.get("")
async def get_profile(request: Request, guest_id: str | None = None):
    """Retrieve the personalisation profile for the current user or guest.

    Returns 200 with null data if no profile exists (graceful degradation).
    """
    user_id, resolved_guest_id = _get_identity(request, guest_id)
    try:
        pool = await db.get_pool()
        data = await db.get_profile(
            pool, user_id=user_id, guest_id=resolved_guest_id
        )
    except Exception as exc:
        logger.error("get_profile failed: %s", exc)
        data = None
    return {"data": data}
