"""
Profile persistence endpoints (Phase 5: Server-Side Prompt Assembly).

PUT  /api/profile  -- save or update personalisation profile
GET  /api/profile  -- retrieve current profile

Auth rules (same as conversations.py):
  - If Authorization: Bearer <jwt> is present and valid, use user_id from token.
  - If no JWT, use guest_id query param / request body field.
  - If neither, return 400 on write; return empty on read.
"""

import asyncio
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

    # Generate seed memories from the profile (warm start for memory system)
    asyncio.ensure_future(_generate_seed_memories(user_id, guest_id, data))

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


# ---------------------------------------------------------------------------
# Seed memory generation (warm start for memory system)
# ---------------------------------------------------------------------------

async def _generate_seed_memories(
    user_id: str | None, guest_id: str | None, data: dict
):
    """Generate seed memories from a personalisation profile.

    Called once (fire-and-forget) when the profile is saved. Creates 5-8
    structural memories that give the memory system a warm start so the
    analyst references the user's philosophy and context from conversation one.
    """
    pool = await db.get_pool()
    if not pool:
        return

    firm = data.get("firm", {})
    fund = data.get("fund", {})
    portfolio = data.get("portfolio", [])
    profile = data.get("profile", {})
    if not profile:
        return

    memories: list[dict] = []

    # 1. Regulatory framework
    regs = firm.get("regulations", [])
    if regs:
        memories.append({
            "memory_type": "structural",
            "content": f"Operates under {', '.join(regs)} regulatory framework at {firm.get('name', 'their firm')}",
            "ticker": None,
            "tags": ["regulatory", "institutional", "seed"],
            "confidence": 1.0,
        })

    # 2. Fund strategy and mandate
    strategy = fund.get("strategy", "")
    benchmark = fund.get("benchmark", "")
    if strategy:
        content = f"Runs a {strategy} strategy"
        if benchmark:
            content += f" benchmarked against {benchmark}"
        memories.append({
            "memory_type": "structural",
            "content": content,
            "ticker": None,
            "tags": ["mandate", "strategy", "seed"],
            "confidence": 1.0,
        })

    # 3. Holding period and risk budget
    holding = fund.get("holdingPeriod", "")
    risk = fund.get("riskBudget", "")
    if holding or risk:
        parts = []
        if holding:
            parts.append(f"typical holding period: {holding}")
        if risk:
            parts.append(f"risk budget: {risk}% tracking error")
        memories.append({
            "memory_type": "structural",
            "content": "Investment constraints: " + ", ".join(parts),
            "ticker": None,
            "tags": ["mandate", "risk", "seed"],
            "confidence": 1.0,
        })

    # 4. Key personality traits (only notable ones)
    big_five = profile.get("bigFive", {})
    traits = []
    n = big_five.get("N", 10)
    o = big_five.get("O", 10)
    c = big_five.get("C", 10)
    if n >= 14:
        traits.append("high neuroticism (present risk calmly)")
    elif n <= 6:
        traits.append("low neuroticism (can handle direct risk warnings)")
    if o >= 14:
        traits.append("high openness (receptive to unconventional angles)")
    elif o <= 6:
        traits.append("low openness (prefers structured, concrete analysis)")
    if c >= 14:
        traits.append("high conscientiousness (thorough, process-oriented)")
    if traits:
        memories.append({
            "memory_type": "structural",
            "content": "Personality profile: " + "; ".join(traits),
            "ticker": None,
            "tags": ["personality", "cognitive", "seed"],
            "confidence": 1.0,
        })

    # 5. Cognitive reflection
    crt = profile.get("crt", {})
    crt_score = crt.get("score")
    if crt_score is not None:
        if crt_score >= 5:
            memories.append({
                "memory_type": "structural",
                "content": "High CRT scorer -- use Socratic questioning for bias interventions, not direct warnings",
                "ticker": None,
                "tags": ["cognitive", "bias", "seed"],
                "confidence": 1.0,
            })
        elif crt_score <= 2:
            memories.append({
                "memory_type": "structural",
                "content": "Low CRT scorer -- use direct, explicit bias warnings rather than subtle framing",
                "ticker": None,
                "tags": ["cognitive", "bias", "seed"],
                "confidence": 1.0,
            })

    # 6. Detected biases
    biases = profile.get("biases", [])
    if biases:
        bias_names = [b.get("bias", "") for b in biases if b.get("bias")]
        if bias_names:
            memories.append({
                "memory_type": "structural",
                "content": f"Identified bias vulnerabilities: {', '.join(bias_names[:4])}",
                "ticker": None,
                "tags": ["bias", "cognitive", "seed"],
                "confidence": 1.0,
            })

    # 7. Delivery preferences
    prefs = profile.get("preferences", {})
    detail = prefs.get("detail", "")
    fmt = prefs.get("format", "")
    if detail or fmt:
        parts = []
        if detail:
            parts.append(f"detail preference: {detail}")
        if fmt:
            parts.append(f"format preference: {fmt}")
        memories.append({
            "memory_type": "structural",
            "content": "Communication: " + ", ".join(parts),
            "ticker": None,
            "tags": ["preference", "delivery", "seed"],
            "confidence": 1.0,
        })

    # 8. Portfolio positions (positional, not structural)
    valid_holdings = [h for h in portfolio if h.get("ticker", "").strip()]
    if valid_holdings:
        tickers_str = ", ".join(h["ticker"].upper() for h in valid_holdings[:10])
        memories.append({
            "memory_type": "positional",
            "content": f"Current portfolio includes: {tickers_str}",
            "ticker": None,
            "tags": ["portfolio", "positions", "seed"],
            "confidence": 1.0,
        })

    # Clear existing seed memories (handles re-running the wizard)
    try:
        if user_id:
            await pool.execute(
                "DELETE FROM memories WHERE user_id = $1 AND tags @> ARRAY['seed']::text[]",
                user_id,
            )
        elif guest_id:
            await pool.execute(
                "DELETE FROM memories WHERE guest_id = $1 AND tags @> ARRAY['seed']::text[]",
                guest_id,
            )
    except Exception as exc:
        logger.warning("Failed to clear old seed memories: %s", exc)

    # Insert new seed memories
    count = 0
    for mem in memories:
        try:
            await db.insert_memory(
                pool,
                user_id=user_id,
                guest_id=guest_id,
                memory_type=mem["memory_type"],
                content=mem["content"],
                ticker=mem["ticker"],
                tags=mem["tags"],
                confidence=mem["confidence"],
            )
            count += 1
        except Exception as exc:
            logger.warning("Failed to insert seed memory: %s", exc)

    logger.info(
        "Generated %d seed memories for user=%s guest=%s", count, user_id, guest_id
    )
