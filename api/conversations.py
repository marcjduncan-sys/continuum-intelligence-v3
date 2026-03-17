"""
Conversation persistence endpoints.

POST   /api/conversations                  -- create a new conversation
POST   /api/conversations/{id}/messages    -- append a message
GET    /api/conversations/{ticker}         -- restore latest conversation for ticker

Auth rules:
  - If Authorization: Bearer <jwt> is present and valid, use user_id from token.
  - If no JWT, use guest_id query param / request body field.
  - If neither, return 400 on write endpoints; return empty on read endpoint.
"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

import db
from auth import decode_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


# ---------------------------------------------------------------------------
# Identity helper
# ---------------------------------------------------------------------------

def _get_identity(request: Request, guest_id_param: str | None = None):
    """
    Extract user identity from JWT (preferred) or guest_id fallback.
    Returns (user_id, guest_id). Both may be None.
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        payload = decode_token(auth_header[7:])
        if payload:
            return payload.get("sub"), None
    return None, guest_id_param


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class CreateConversationRequest(BaseModel):
    ticker: str = Field(..., description="Stock ticker, e.g. 'BHP'")
    guest_id: str | None = Field(None, description="Guest device UUID (no login required)")


class AppendMessageRequest(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'")
    content: str = Field(..., description="Message text")
    sources_json: list[Any] | None = Field(None, description="Source passages from research")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("")
async def list_conversations(request: Request, guest_id: str | None = None):
    """List all conversations for the current user or guest, newest first."""
    user_id, resolved_guest_id = _get_identity(request, guest_id)
    if not user_id and not resolved_guest_id:
        return {"conversations": []}

    pool = await db.get_pool()
    if not pool:
        return {"conversations": []}

    try:
        async with pool.acquire() as conn:
            if user_id:
                rows = await conn.fetch(
                    "SELECT c.id, c.ticker, c.started_at, c.last_message_at, "
                    "(SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count "
                    "FROM conversations c WHERE c.user_id = $1 "
                    "ORDER BY c.last_message_at DESC NULLS LAST LIMIT 50",
                    user_id,
                )
            else:
                rows = await conn.fetch(
                    "SELECT c.id, c.ticker, c.started_at, c.last_message_at, "
                    "(SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count "
                    "FROM conversations c WHERE c.guest_id = $1 "
                    "ORDER BY c.last_message_at DESC NULLS LAST LIMIT 50",
                    resolved_guest_id,
                )

        return {
            "conversations": [
                {
                    "id": str(row["id"]),
                    "ticker": row["ticker"],
                    "message_count": row["message_count"],
                    "created_at": row["started_at"].isoformat() if row["started_at"] else None,
                    "updated_at": row["last_message_at"].isoformat() if row["last_message_at"] else None,
                }
                for row in rows
            ]
        }
    except Exception as exc:
        logger.error("Failed to list conversations: %s", exc)
        return {"conversations": []}


@router.post("")
async def create_conversation(body: CreateConversationRequest, request: Request):
    """Create a new conversation for a ticker. Requires user JWT or guest_id."""
    user_id, guest_id = _get_identity(request, body.guest_id)
    if not user_id and not guest_id:
        raise HTTPException(
            status_code=400,
            detail="Provide Authorization: Bearer <token> header or guest_id in body",
        )

    pool = await db.get_pool()
    conversation_id = await db.create_conversation(
        pool,
        ticker=body.ticker,
        user_id=user_id,
        guest_id=guest_id,
    )
    if not conversation_id:
        raise HTTPException(status_code=503, detail="Database unavailable")

    return {"id": conversation_id, "ticker": body.ticker.upper()}


@router.post("/{conversation_id}/messages")
async def append_message(
    conversation_id: str, body: AppendMessageRequest, request: Request
):
    """Append a message to an existing conversation."""
    if body.role not in ("user", "assistant"):
        raise HTTPException(status_code=400, detail="role must be 'user' or 'assistant'")

    pool = await db.get_pool()
    message_id = await db.append_message(
        pool,
        conversation_id=conversation_id,
        role=body.role,
        content=body.content,
        sources_json=body.sources_json,
    )
    if not message_id:
        raise HTTPException(status_code=503, detail="Database unavailable")

    return {"id": message_id}


@router.get("/{ticker}")
async def get_conversation(
    ticker: str,
    request: Request,
    guest_id: str | None = None,
):
    """
    Return the most recent conversation for a ticker + identity.
    Always returns 200 (with empty messages list) if no conversation found.
    This allows the frontend to gracefully degrade when DB is unavailable.
    """
    user_id, resolved_guest_id = _get_identity(request, guest_id)
    try:
        pool = await db.get_pool()
        conversation_id, messages = await db.get_conversation_by_ticker(
            pool,
            ticker=ticker,
            user_id=user_id,
            guest_id=resolved_guest_id,
        )
    except Exception as exc:
        logger.error("get_conversation failed for %s: %s", ticker, exc)
        conversation_id, messages = None, []
    return {
        "conversation_id": conversation_id,
        "ticker": ticker.upper(),
        "messages": messages,
    }
