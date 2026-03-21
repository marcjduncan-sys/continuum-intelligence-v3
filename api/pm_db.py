"""
PM database helpers (Phase E).

CRUD operations for PM conversations, messages, decisions, and insights.
Mirrors the pattern of db.py helpers but keeps PM state cleanly separated
from Analyst state.
"""

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# PM Conversation helpers
# ---------------------------------------------------------------------------

async def create_pm_conversation(
    pool,
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
    portfolio_id: str | None = None,
    snapshot_id: str | None = None,
) -> str | None:
    """Create a PM conversation record. Returns conversation_id as string."""
    if pool is None:
        return None
    if not user_id and not guest_id:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO pm_conversations (user_id, guest_id, portfolio_id, snapshot_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            """,
            user_id, guest_id, portfolio_id, snapshot_id,
        )
        return str(row["id"]) if row else None


async def get_pm_conversation(
    pool,
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
    portfolio_id: str | None = None,
) -> tuple[str | None, list[dict]]:
    """
    Return (conversation_id, messages_list) for the most recent PM conversation
    matching identity + portfolio. Returns (None, []) if not found.
    """
    if pool is None:
        return None, []
    if not user_id and not guest_id:
        return None, []

    async with pool.acquire() as conn:
        if user_id:
            if portfolio_id:
                row = await conn.fetchrow(
                    """
                    SELECT id FROM pm_conversations
                    WHERE user_id = $1 AND portfolio_id = $2
                    ORDER BY last_message_at DESC NULLS LAST, started_at DESC
                    LIMIT 1
                    """,
                    user_id, portfolio_id,
                )
            else:
                row = await conn.fetchrow(
                    """
                    SELECT id FROM pm_conversations
                    WHERE user_id = $1
                    ORDER BY last_message_at DESC NULLS LAST, started_at DESC
                    LIMIT 1
                    """,
                    user_id,
                )
        else:
            if portfolio_id:
                row = await conn.fetchrow(
                    """
                    SELECT id FROM pm_conversations
                    WHERE guest_id = $1 AND portfolio_id = $2
                    ORDER BY last_message_at DESC NULLS LAST, started_at DESC
                    LIMIT 1
                    """,
                    guest_id, portfolio_id,
                )
            else:
                row = await conn.fetchrow(
                    """
                    SELECT id FROM pm_conversations
                    WHERE guest_id = $1
                    ORDER BY last_message_at DESC NULLS LAST, started_at DESC
                    LIMIT 1
                    """,
                    guest_id,
                )

        if not row:
            return None, []

        conversation_id = str(row["id"])
        messages = await conn.fetch(
            """
            SELECT role, content, metadata_json, created_at
            FROM pm_messages
            WHERE pm_conversation_id = $1
            ORDER BY created_at ASC
            """,
            conversation_id,
        )

        return conversation_id, [
            {
                "role": m["role"],
                "content": m["content"],
                "metadata": json.loads(m["metadata_json"]) if m["metadata_json"] else None,
                "created_at": m["created_at"].isoformat() if m["created_at"] else None,
            }
            for m in messages
        ]


async def append_pm_message(
    pool,
    *,
    pm_conversation_id: str,
    role: str,
    content: str,
    metadata: dict | None = None,
) -> str | None:
    """Append a message to a PM conversation. Returns message_id as string."""
    if pool is None:
        return None
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE pm_conversations SET last_message_at = now() WHERE id = $1",
            pm_conversation_id,
        )
        row = await conn.fetchrow(
            """
            INSERT INTO pm_messages (pm_conversation_id, role, content, metadata_json)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            """,
            pm_conversation_id,
            role,
            content,
            json.dumps(metadata) if metadata is not None else None,
        )
        return str(row["id"]) if row else None


async def list_pm_conversations(
    pool,
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """List PM conversations for a user/guest, newest first."""
    if pool is None:
        return []
    if not user_id and not guest_id:
        return []

    async with pool.acquire() as conn:
        identity_col = "user_id" if user_id else "guest_id"
        identity_val = user_id if user_id else guest_id
        rows = await conn.fetch(
            f"""
            SELECT c.id, c.portfolio_id, c.snapshot_id, c.started_at, c.last_message_at,
                   (SELECT COUNT(*) FROM pm_messages m WHERE m.pm_conversation_id = c.id) as message_count
            FROM pm_conversations c
            WHERE c.{identity_col} = $1
            ORDER BY c.last_message_at DESC NULLS LAST
            LIMIT $2
            """,
            identity_val, limit,
        )
        return [
            {
                "id": str(r["id"]),
                "portfolio_id": str(r["portfolio_id"]) if r["portfolio_id"] else None,
                "snapshot_id": str(r["snapshot_id"]) if r["snapshot_id"] else None,
                "message_count": r["message_count"],
                "started_at": r["started_at"].isoformat() if r["started_at"] else None,
                "last_message_at": r["last_message_at"].isoformat() if r["last_message_at"] else None,
            }
            for r in rows
        ]


# ---------------------------------------------------------------------------
# PM Decision helpers
# ---------------------------------------------------------------------------

async def insert_pm_decision(
    pool,
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
    pm_conversation_id: str | None = None,
    pm_message_id: str | None = None,
    action_type: str,
    ticker: str | None = None,
    rationale: str,
    sizing_band: str | None = None,
    source_of_funds: str | None = None,
    mandate_basis: str | None = None,
    breach_codes: list[str] | None = None,
    coverage_state: str | None = None,
    decision_basis: dict,
) -> str | None:
    """Insert a PM decision record. Returns decision_id as string."""
    if pool is None:
        return None
    if not user_id and not guest_id:
        return None

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO pm_decisions
                (user_id, guest_id, pm_conversation_id, pm_message_id,
                 action_type, ticker, rationale, sizing_band, source_of_funds,
                 mandate_basis, breach_codes, coverage_state, decision_basis)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id
            """,
            user_id, guest_id, pm_conversation_id, pm_message_id,
            action_type,
            ticker.upper() if ticker else None,
            rationale,
            sizing_band,
            source_of_funds,
            mandate_basis,
            breach_codes or [],
            coverage_state,
            json.dumps(decision_basis),
        )
        return str(row["id"]) if row else None


async def get_pm_decisions(
    pool,
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
    ticker: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """Retrieve PM decisions, optionally filtered by ticker."""
    if pool is None:
        return []
    if not user_id and not guest_id:
        return []

    conditions = []
    params = []
    idx = 1

    if user_id:
        conditions.append(f"user_id = ${idx}")
        params.append(user_id)
        idx += 1
    else:
        conditions.append(f"guest_id = ${idx}")
        params.append(guest_id)
        idx += 1

    if ticker:
        conditions.append(f"ticker = ${idx}")
        params.append(ticker.upper())
        idx += 1

    where = " AND ".join(conditions)
    query = f"""
        SELECT id, pm_conversation_id, pm_message_id,
               action_type, ticker, rationale, sizing_band, source_of_funds,
               mandate_basis, breach_codes, coverage_state, decision_basis,
               created_at
        FROM pm_decisions
        WHERE {where}
        ORDER BY created_at DESC
        LIMIT ${idx}
    """
    params.append(limit)

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        return [
            {
                "id": str(r["id"]),
                "pm_conversation_id": str(r["pm_conversation_id"]) if r["pm_conversation_id"] else None,
                "pm_message_id": str(r["pm_message_id"]) if r["pm_message_id"] else None,
                "action_type": r["action_type"],
                "ticker": r["ticker"],
                "rationale": r["rationale"],
                "sizing_band": r["sizing_band"],
                "source_of_funds": r["source_of_funds"],
                "mandate_basis": r["mandate_basis"],
                "breach_codes": list(r["breach_codes"]) if r["breach_codes"] else [],
                "coverage_state": r["coverage_state"],
                "decision_basis": json.loads(r["decision_basis"]) if isinstance(r["decision_basis"], str) else r["decision_basis"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ]


# ---------------------------------------------------------------------------
# PM Insight helpers
# ---------------------------------------------------------------------------

async def insert_pm_insight(
    pool,
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
    pm_conversation_id: str | None = None,
    pm_message_id: str | None = None,
    insight_type: str,
    content: str,
    tickers: list[str] | None = None,
    tags: list[str] | None = None,
    confidence: float = 0.5,
) -> str | None:
    """Insert a PM insight. Returns insight_id as string."""
    if pool is None:
        return None
    if not user_id and not guest_id:
        return None

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO pm_insights
                (user_id, guest_id, pm_conversation_id, pm_message_id,
                 insight_type, content, tickers, tags, confidence)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
            """,
            user_id, guest_id, pm_conversation_id, pm_message_id,
            insight_type,
            content,
            [t.upper() for t in tickers] if tickers else [],
            tags or [],
            min(max(confidence, 0.0), 1.0),
        )
        return str(row["id"]) if row else None


async def get_pm_insights(
    pool,
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
    insight_type: str | None = None,
    ticker: str | None = None,
    active_only: bool = True,
    include_archived: bool = False,
    limit: int = 100,
) -> list[dict]:
    """Retrieve PM insights with optional filters."""
    if pool is None:
        return []
    if not user_id and not guest_id:
        return []

    conditions = []
    params = []
    idx = 1

    if user_id:
        conditions.append(f"user_id = ${idx}")
        params.append(user_id)
        idx += 1
    else:
        conditions.append(f"guest_id = ${idx}")
        params.append(guest_id)
        idx += 1

    if insight_type:
        conditions.append(f"insight_type = ${idx}")
        params.append(insight_type)
        idx += 1

    if ticker:
        conditions.append(f"${idx} = ANY(tickers)")
        params.append(ticker.upper())
        idx += 1

    if active_only and not include_archived:
        conditions.append("active = TRUE")

    where = " AND ".join(conditions)
    query = f"""
        SELECT id, pm_conversation_id, pm_message_id,
               insight_type, content, tickers, tags, confidence,
               active, archived_at, created_at, updated_at
        FROM pm_insights
        WHERE {where}
        ORDER BY created_at DESC
        LIMIT ${idx}
    """
    params.append(limit)

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        return [
            {
                "id": str(r["id"]),
                "pm_conversation_id": str(r["pm_conversation_id"]) if r["pm_conversation_id"] else None,
                "pm_message_id": str(r["pm_message_id"]) if r["pm_message_id"] else None,
                "insight_type": r["insight_type"],
                "content": r["content"],
                "tickers": list(r["tickers"]) if r["tickers"] else [],
                "tags": list(r["tags"]) if r["tags"] else [],
                "confidence": r["confidence"],
                "active": r["active"],
                "archived_at": r["archived_at"].isoformat() if r["archived_at"] else None,
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
            }
            for r in rows
        ]


async def archive_pm_insight(pool, insight_id: str) -> bool:
    """Archive a PM insight (soft-delete). Returns True on success."""
    if pool is None:
        return False
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE pm_insights
            SET active = FALSE, archived_at = now(), updated_at = now()
            WHERE id = $1 AND active = TRUE
            """,
            insight_id,
        )
        return result == "UPDATE 1"


async def restore_pm_insight(pool, insight_id: str) -> bool:
    """Restore an archived PM insight. Returns True on success."""
    if pool is None:
        return False
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE pm_insights
            SET active = TRUE, archived_at = NULL, updated_at = now()
            WHERE id = $1 AND active = FALSE
            """,
            insight_id,
        )
        return result == "UPDATE 1"
