"""
PM Conversation persistence endpoints (Phase E).

POST   /api/pm-conversations                  -- create a new PM conversation
POST   /api/pm-conversations/{id}/messages    -- append a message
GET    /api/pm-conversations                  -- list PM conversations
GET    /api/pm-conversations/{id}             -- restore a specific PM conversation
GET    /api/pm-conversations/latest           -- get latest PM conversation for portfolio

Auth: same dual-identity pattern as conversations.py (JWT preferred, guest_id fallback).
"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

import db
import pm_db
from auth import decode_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pm-conversations", tags=["pm-conversations"])


# ---------------------------------------------------------------------------
# Identity helper (same pattern as conversations.py)
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

class CreatePMConversationRequest(BaseModel):
    portfolio_id: str | None = Field(None, description="Portfolio UUID")
    snapshot_id: str | None = Field(None, description="Snapshot UUID")
    guest_id: str | None = Field(None, description="Guest device UUID")


class AppendPMMessageRequest(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'")
    content: str = Field(..., description="Message text")
    metadata: dict | None = Field(None, description="Response metadata (breaches, scores, etc.)")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/latest")
async def get_latest_pm_conversation(
    request: Request,
    portfolio_id: str | None = None,
    guest_id: str | None = None,
):
    """Return the most recent PM conversation for identity + optional portfolio."""
    user_id, resolved_guest_id = _get_identity(request, guest_id)
    try:
        pool = await db.get_pool()
        conversation_id, messages = await pm_db.get_pm_conversation(
            pool,
            user_id=user_id,
            guest_id=resolved_guest_id,
            portfolio_id=portfolio_id,
        )
    except Exception as exc:
        logger.error("get_latest_pm_conversation failed: %s", exc)
        conversation_id, messages = None, []

    return {
        "conversation_id": conversation_id,
        "portfolio_id": portfolio_id,
        "messages": messages,
    }


@router.get("")
async def list_pm_conversations(request: Request, guest_id: str | None = None):
    """List all PM conversations for the current user or guest."""
    user_id, resolved_guest_id = _get_identity(request, guest_id)
    if not user_id and not resolved_guest_id:
        return {"conversations": []}

    pool = await db.get_pool()
    if not pool:
        return {"conversations": []}

    try:
        conversations = await pm_db.list_pm_conversations(
            pool, user_id=user_id, guest_id=resolved_guest_id
        )
        return {"conversations": conversations}
    except Exception as exc:
        logger.error("Failed to list PM conversations: %s", exc)
        return {"conversations": []}


@router.post("")
async def create_pm_conversation(body: CreatePMConversationRequest, request: Request):
    """Create a new PM conversation. Requires user JWT or guest_id."""
    user_id, guest_id = _get_identity(request, body.guest_id)
    if not user_id and not guest_id:
        raise HTTPException(
            status_code=400,
            detail="Provide Authorization: Bearer <token> header or guest_id in body",
        )

    pool = await db.get_pool()
    conversation_id = await pm_db.create_pm_conversation(
        pool,
        user_id=user_id,
        guest_id=guest_id,
        portfolio_id=body.portfolio_id,
        snapshot_id=body.snapshot_id,
    )
    if not conversation_id:
        raise HTTPException(status_code=503, detail="Database unavailable")

    return {
        "id": conversation_id,
        "portfolio_id": body.portfolio_id,
        "snapshot_id": body.snapshot_id,
    }


@router.get("/{conversation_id}")
async def get_pm_conversation_by_id(
    conversation_id: str,
    request: Request,
    guest_id: str | None = None,
):
    """Return a specific PM conversation by ID with all messages."""
    pool = await db.get_pool()
    if not pool:
        return {"conversation_id": conversation_id, "messages": []}

    try:
        async with pool.acquire() as conn:
            messages = await conn.fetch(
                """
                SELECT role, content, metadata_json, created_at
                FROM pm_messages
                WHERE pm_conversation_id = $1
                ORDER BY created_at ASC
                """,
                conversation_id,
            )
            import json
            return {
                "conversation_id": conversation_id,
                "messages": [
                    {
                        "role": m["role"],
                        "content": m["content"],
                        "metadata": json.loads(m["metadata_json"]) if m["metadata_json"] else None,
                        "created_at": m["created_at"].isoformat() if m["created_at"] else None,
                    }
                    for m in messages
                ],
            }
    except Exception as exc:
        logger.error("get_pm_conversation_by_id failed: %s", exc)
        return {"conversation_id": conversation_id, "messages": []}


@router.post("/{conversation_id}/messages")
async def append_pm_message(
    conversation_id: str, body: AppendPMMessageRequest, request: Request
):
    """Append a message to an existing PM conversation."""
    if body.role not in ("user", "assistant"):
        raise HTTPException(status_code=400, detail="role must be 'user' or 'assistant'")

    pool = await db.get_pool()
    message_id = await pm_db.append_pm_message(
        pool,
        pm_conversation_id=conversation_id,
        role=body.role,
        content=body.content,
        metadata=body.metadata,
    )
    if not message_id:
        raise HTTPException(status_code=503, detail="Database unavailable")

    return {"id": message_id}
