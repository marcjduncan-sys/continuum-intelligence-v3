"""
Authentication endpoints.

POST /api/auth/request-otp  -- request a 6-digit OTP code by email
POST /api/auth/verify-otp   -- verify OTP, receive JWT
GET  /api/auth/me           -- validate JWT, return user identity
"""

import logging
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

import config
import db
from email_service import send_otp_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# JWT helpers (used by conversations.py too)
# ---------------------------------------------------------------------------

def create_token(user_id: str, email: str) -> str:
    """Sign and return a JWT containing user_id and email."""
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=config.JWT_EXPIRY_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    """Decode and validate a JWT. Returns payload dict or None on any error."""
    try:
        return jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class OTPRequest(BaseModel):
    email: str = Field(..., description="Email address to send OTP to")


class OTPVerify(BaseModel):
    email: str
    code: str = Field(..., min_length=6, max_length=6)
    guest_id: str | None = Field(None, description="Guest device UUID for conversation migration")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/request-otp")
async def request_otp(body: OTPRequest, request: Request):
    """
    Request a 6-digit access code. Always returns a generic success message
    to prevent email enumeration.

    If SMTP is not configured, the code is logged server-side for dev use.
    """
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email address")

    code = str(secrets.randbelow(1_000_000)).zfill(6)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)

    pool = await db.get_pool()
    await db.save_otp(pool, email, code, expires_at)
    await send_otp_email(email, code)

    return {"message": "If that address is valid, a code has been sent."}


@router.post("/verify-otp")
async def verify_otp(body: OTPVerify, request: Request):
    """Verify OTP code. Returns a signed JWT and user record on success."""
    email = body.email.strip().lower()
    code = body.code.strip()

    pool = await db.get_pool()

    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    valid = await db.verify_otp(pool, email, code)
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid or expired code")

    user_id = await db.upsert_user(pool, email)
    if not user_id:
        raise HTTPException(status_code=503, detail="Could not create user record")

    # Migrate guest data to authenticated user (idempotent, safe to re-run)
    if body.guest_id:
        try:
            await db.migrate_guest_conversations(pool, guest_id=body.guest_id, user_id=user_id)
            await db.migrate_guest_pm_conversations(pool, guest_id=body.guest_id, user_id=user_id)
        except Exception as exc:
            logger.warning("Guest conversation migration failed for %s: %s", email, exc)

    token = create_token(user_id, email)
    return {"token": token, "user": {"id": user_id, "email": email}}


@router.get("/me")
async def get_me(request: Request):
    """Return current user identity from JWT. Returns 401 if missing or invalid."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    payload = decode_token(auth_header[7:])
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return {"id": payload["sub"], "email": payload["email"]}
