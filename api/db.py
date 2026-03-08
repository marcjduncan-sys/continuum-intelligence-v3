"""
Database connection module -- asyncpg connection pool.

If DATABASE_URL is not set, all functions are no-ops (dev mode tolerance).
"""

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

_pool = None


async def get_pool():
    """Return the shared asyncpg connection pool. No-op if DATABASE_URL unset."""
    global _pool
    if _pool is not None:
        return _pool

    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        logger.warning("DATABASE_URL not set -- database features disabled")
        return None

    try:
        import asyncpg
        _pool = await asyncpg.create_pool(
            database_url,
            min_size=1,
            max_size=10,
            command_timeout=30,
        )
        logger.info("asyncpg connection pool created")
        await run_migrations(_pool)
        return _pool
    except Exception as exc:
        logger.error("Failed to create database pool: %s", exc)
        return None


async def run_migrations(pool):
    """Execute all schema migrations in filename order. Idempotent."""
    if pool is None:
        return
    migrations_dir = Path(__file__).parent / "migrations"
    sql_files = sorted(migrations_dir.glob("*.sql"))
    for migration_path in sql_files:
        sql = migration_path.read_text()
        try:
            async with pool.acquire() as conn:
                await conn.execute(sql)
            logger.info("Applied migration: %s", migration_path.name)
        except Exception as exc:
            logger.error("Migration failed (%s): %s", migration_path.name, exc)
            raise


async def close_pool():
    """Gracefully close the connection pool on shutdown."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("asyncpg connection pool closed")


# ---------------------------------------------------------------------------
# User helpers (Track A)
# ---------------------------------------------------------------------------

async def upsert_user(pool, email: str) -> str | None:
    """Insert or update user by email. Returns user_id as string."""
    if pool is None:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO users (email, last_seen_at)
            VALUES ($1, now())
            ON CONFLICT (email) DO UPDATE
                SET last_seen_at = now()
            RETURNING id
            """,
            email,
        )
        return str(row["id"]) if row else None


async def get_user_by_email(pool, email: str):
    """Return user row {id, email} or None."""
    if pool is None:
        return None
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            "SELECT id, email FROM users WHERE email = $1", email
        )


# ---------------------------------------------------------------------------
# OTP helpers (Track A)
# ---------------------------------------------------------------------------

async def save_otp(pool, email: str, code: str, expires_at) -> None:
    """Insert a new OTP token row."""
    if pool is None:
        return
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO otp_tokens (email, code, expires_at)
            VALUES ($1, $2, $3)
            """,
            email, code, expires_at,
        )


async def verify_otp(pool, email: str, code: str) -> bool:
    """
    Validate OTP code for email. Marks the token used on success.
    Returns True if valid, False otherwise.
    """
    if pool is None:
        return False
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id FROM otp_tokens
            WHERE email = $1
              AND code = $2
              AND expires_at > now()
              AND used = FALSE
            ORDER BY created_at DESC
            LIMIT 1
            """,
            email, code,
        )
        if not row:
            return False
        await conn.execute(
            "UPDATE otp_tokens SET used = TRUE WHERE id = $1", row["id"]
        )
        return True


# ---------------------------------------------------------------------------
# Conversation helpers (Track B)
# ---------------------------------------------------------------------------

async def create_conversation(pool, ticker: str, user_id=None, guest_id=None) -> str | None:
    """Create a conversation record. Returns conversation_id as string."""
    if pool is None:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO conversations (user_id, guest_id, ticker)
            VALUES ($1, $2, $3)
            RETURNING id
            """,
            user_id, guest_id, ticker.upper(),
        )
        return str(row["id"]) if row else None


async def append_message(
    pool,
    conversation_id: str,
    role: str,
    content: str,
    sources_json=None,
) -> str | None:
    """Append a message to a conversation. Returns message_id as string."""
    if pool is None:
        return None
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE conversations SET last_message_at = now() WHERE id = $1",
            conversation_id,
        )
        row = await conn.fetchrow(
            """
            INSERT INTO messages (conversation_id, role, content, sources_json)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            """,
            conversation_id,
            role,
            content,
            json.dumps(sources_json) if sources_json is not None else None,
        )
        return str(row["id"]) if row else None


async def get_conversation_by_ticker(
    pool,
    ticker: str,
    user_id=None,
    guest_id=None,
):
    """
    Return (conversation_id, messages_list) for the most recent conversation
    matching the ticker + identity. Returns (None, []) if not found.

    messages_list items: {role, content, sources}
    """
    if pool is None:
        return None, []
    if not user_id and not guest_id:
        return None, []

    async with pool.acquire() as conn:
        if user_id:
            row = await conn.fetchrow(
                """
                SELECT id FROM conversations
                WHERE user_id = $1 AND ticker = $2
                ORDER BY last_message_at DESC NULLS LAST, started_at DESC
                LIMIT 1
                """,
                user_id, ticker.upper(),
            )
        else:
            row = await conn.fetchrow(
                """
                SELECT id FROM conversations
                WHERE guest_id = $1 AND ticker = $2
                ORDER BY last_message_at DESC NULLS LAST, started_at DESC
                LIMIT 1
                """,
                guest_id, ticker.upper(),
            )

        if not row:
            return None, []

        conversation_id = str(row["id"])
        messages = await conn.fetch(
            """
            SELECT role, content, sources_json
            FROM messages
            WHERE conversation_id = $1
            ORDER BY created_at ASC
            """,
            conversation_id,
        )

        return conversation_id, [
            {
                "role": m["role"],
                "content": m["content"],
                "sources": json.loads(m["sources_json"]) if m["sources_json"] else [],
            }
            for m in messages
        ]
