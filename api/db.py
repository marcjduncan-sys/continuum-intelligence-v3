"""
Database connection module -- asyncpg connection pool.

If DATABASE_URL is not set, all functions are no-ops (dev mode tolerance).
Pool creation is bounded to 15s via asyncio.wait_for (Phase 2).
"""

import asyncio
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
        pool = await asyncio.wait_for(
            asyncpg.create_pool(
                database_url,
                min_size=1,
                max_size=10,
                command_timeout=30,
            ),
            timeout=15.0,
        )
        logger.info("asyncpg connection pool created")
        await run_migrations(pool)
        _pool = pool
        return _pool
    except asyncio.TimeoutError:
        logger.error("Database pool creation timed out after 15s -- continuing without DB")
        return None
    except Exception as exc:
        logger.error("Failed to create database pool: %s", exc)
        return None


async def run_migrations(pool):
    """Execute each migration exactly once, tracked in _schema_migrations."""
    if pool is None:
        return
    migrations_dir = Path(__file__).parent / "migrations"
    sql_files = sorted(migrations_dir.glob("*.sql"))

    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS _schema_migrations (
                filename   TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """)

    for migration_path in sql_files:
        filename = migration_path.name
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT filename FROM _schema_migrations WHERE filename = $1",
                filename,
            )
            if row:
                logger.info("Skipping already-applied migration: %s", filename)
                continue
            sql = migration_path.read_text()
            try:
                await conn.execute(sql)
                await conn.execute(
                    "INSERT INTO _schema_migrations (filename) VALUES ($1)",
                    filename,
                )
                logger.info("Applied migration: %s", filename)
            except Exception as exc:
                logger.error("Migration failed (%s): %s", filename, exc)
                raise


async def health_check() -> str:
    """Test pool liveness with SELECT 1. Returns 'ok', 'reconnecting', or 'no_database'.

    If the check fails, resets _pool to None so the next get_pool() call
    creates a fresh connection pool.
    """
    global _pool
    if _pool is None:
        database_url = os.getenv("DATABASE_URL", "").strip()
        if not database_url:
            return "no_database"
        # Pool was previously lost; trigger recreation
        new_pool = await get_pool()
        return "ok" if new_pool is not None else "reconnecting"
    try:
        async with _pool.acquire() as conn:
            await conn.execute("SELECT 1")
        return "ok"
    except Exception as exc:
        logger.warning("Pool health check failed: %s -- resetting pool", exc)
        try:
            await _pool.close()
        except Exception:
            pass
        _pool = None
        return "reconnecting"


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


# ---------------------------------------------------------------------------
# Summarisation helpers (Phase 3b)
# ---------------------------------------------------------------------------

async def get_conversation_context(pool, conversation_id: str) -> dict:
    """
    Return {summary, cursor_id, recent_messages} for building LLM context.
    recent_messages = all messages after cursor_id (or all if no cursor).
    """
    if pool is None:
        return {"summary": None, "cursor_id": None, "recent_messages": []}
    async with pool.acquire() as conn:
        conv = await conn.fetchrow(
            """
            SELECT summary, summary_cursor_message_id
            FROM conversations
            WHERE id = $1
            """,
            conversation_id,
        )
        if not conv:
            return {"summary": None, "cursor_id": None, "recent_messages": []}

        cursor_id = str(conv["summary_cursor_message_id"]) if conv["summary_cursor_message_id"] else None

        if cursor_id:
            # Messages strictly after the cursor (i.e. not yet summarised)
            messages = await conn.fetch(
                """
                SELECT id, role, content, created_at
                FROM messages
                WHERE conversation_id = $1
                  AND created_at > (
                      SELECT created_at FROM messages WHERE id = $2
                  )
                ORDER BY created_at ASC
                """,
                conversation_id,
                cursor_id,
            )
        else:
            messages = await conn.fetch(
                """
                SELECT id, role, content, created_at
                FROM messages
                WHERE conversation_id = $1
                ORDER BY created_at ASC
                """,
                conversation_id,
            )

        return {
            "summary": conv["summary"],
            "cursor_id": cursor_id,
            "recent_messages": [
                {"id": str(m["id"]), "role": m["role"], "content": m["content"]}
                for m in messages
            ],
        }


async def update_conversation_summary(
    pool, conversation_id: str, summary: str, cursor_message_id: str
) -> None:
    """Store the new summary and advance the cursor."""
    if pool is None:
        return
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE conversations
            SET summary = $1, summary_cursor_message_id = $2
            WHERE id = $3
            """,
            summary,
            cursor_message_id,
            conversation_id,
        )


# ---------------------------------------------------------------------------
# LLM call logging (Phase 4)
# ---------------------------------------------------------------------------

async def log_llm_call(
    pool,
    *,
    feature: str,
    model: str,
    provider: str,
    input_tokens: int,
    output_tokens: int,
    cost_usd: float,
    latency_ms: int,
    ticker: str | None = None,
    success: bool = True,
    error_message: str | None = None,
) -> None:
    """Insert a row into llm_calls for cost tracking."""
    if pool is None:
        return
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO llm_calls
                    (feature, model, provider, input_tokens, output_tokens,
                     cost_usd, latency_ms, ticker, success, error_message)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                """,
                feature, model, provider, input_tokens, output_tokens,
                cost_usd, latency_ms, ticker, success, error_message,
            )
    except Exception as exc:
        logger.debug("log_llm_call failed: %s", exc)


async def get_llm_usage(pool, *, days: int = 7) -> list[dict]:
    """Aggregate LLM usage by feature, model, and provider over the last N days."""
    if pool is None:
        return []
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                feature,
                model,
                provider,
                COUNT(*) AS call_count,
                SUM(input_tokens) AS total_input_tokens,
                SUM(output_tokens) AS total_output_tokens,
                SUM(cost_usd)::FLOAT AS total_cost_usd,
                AVG(latency_ms)::INT AS avg_latency_ms,
                COUNT(*) FILTER (WHERE NOT success) AS error_count
            FROM llm_calls
            WHERE created_at >= now() - make_interval(days => $1)
            GROUP BY feature, model, provider
            ORDER BY total_cost_usd DESC
            """,
            days,
        )
        return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Profile helpers (Phase 5)
# ---------------------------------------------------------------------------

async def upsert_profile(
    pool, *, data: dict, user_id: str | None = None, guest_id: str | None = None
) -> str | None:
    """Insert or update a personalisation profile. Returns profile id."""
    if pool is None:
        return None
    if not user_id and not guest_id:
        return None
    async with pool.acquire() as conn:
        if user_id:
            row = await conn.fetchrow(
                """
                INSERT INTO profiles (user_id, data, updated_at)
                VALUES ($1, $2::jsonb, now())
                ON CONFLICT (user_id) WHERE user_id IS NOT NULL
                DO UPDATE SET data = $2::jsonb, updated_at = now()
                RETURNING id
                """,
                user_id,
                json.dumps(data),
            )
        else:
            # Guest: upsert by guest_id (delete old + insert)
            await conn.execute(
                "DELETE FROM profiles WHERE guest_id = $1 AND user_id IS NULL",
                guest_id,
            )
            row = await conn.fetchrow(
                """
                INSERT INTO profiles (guest_id, data, updated_at)
                VALUES ($1, $2::jsonb, now())
                RETURNING id
                """,
                guest_id,
                json.dumps(data),
            )
        return str(row["id"]) if row else None


async def get_profile(
    pool, *, user_id: str | None = None, guest_id: str | None = None
) -> dict | None:
    """Retrieve the personalisation profile data (JSONB) for a user or guest."""
    if pool is None:
        return None
    if not user_id and not guest_id:
        return None
    async with pool.acquire() as conn:
        if user_id:
            row = await conn.fetchrow(
                "SELECT data FROM profiles WHERE user_id = $1",
                user_id,
            )
        else:
            row = await conn.fetchrow(
                "SELECT data FROM profiles WHERE guest_id = $1 AND user_id IS NULL ORDER BY updated_at DESC LIMIT 1",
                guest_id,
            )
        if not row:
            return None
        raw = row["data"]
        return json.loads(raw) if isinstance(raw, str) else raw


# ---------------------------------------------------------------------------
# Memory helpers (Phase 6)
# ---------------------------------------------------------------------------

async def insert_memory(
    pool,
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
    memory_type: str,
    content: str,
    ticker: str | None = None,
    tags: list[str] | None = None,
    confidence: float = 1.0,
    source_conversation_id: str | None = None,
    embedding: list[float] | None = None,
) -> str | None:
    """Insert a single memory observation. Returns memory id."""
    if pool is None:
        return None
    if not user_id and not guest_id:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO memories
                (user_id, guest_id, memory_type, content, ticker, tags,
                 confidence, source_conversation_id, embedding)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
            """,
            user_id,
            guest_id,
            memory_type,
            content,
            ticker.upper() if ticker else None,
            tags or [],
            confidence,
            source_conversation_id,
            embedding,
        )
        return str(row["id"]) if row else None


async def enforce_memory_ceiling(
    pool,
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
    ceiling: int = 500,
) -> int:
    """Deactivate lowest-confidence memories if active count exceeds ceiling.

    Deactivation priority: tactical first, then positional, then structural.
    Returns the number of memories deactivated.
    """
    if pool is None:
        return 0
    if not user_id and not guest_id:
        return 0

    identity_col = "user_id" if user_id else "guest_id"
    identity_val = user_id if user_id else guest_id

    async with pool.acquire() as conn:
        count_row = await conn.fetchrow(
            f"SELECT COUNT(*) AS n FROM memories WHERE {identity_col} = $1 AND active = TRUE",
            identity_val,
        )
        active_count = count_row["n"]
        excess = active_count - ceiling
        if excess <= 0:
            return 0

        # Fetch IDs to deactivate: ordered by type priority then confidence asc
        rows = await conn.fetch(
            f"""
            SELECT id FROM memories
            WHERE {identity_col} = $1 AND active = TRUE
            ORDER BY
                CASE memory_type
                    WHEN 'tactical'   THEN 1
                    WHEN 'positional' THEN 2
                    WHEN 'structural' THEN 3
                END,
                confidence ASC
            LIMIT $2
            """,
            identity_val,
            excess,
        )
        ids_to_deactivate = [r["id"] for r in rows]
        if ids_to_deactivate:
            await conn.execute(
                "UPDATE memories SET active = FALSE, updated_at = now() WHERE id = ANY($1)",
                ids_to_deactivate,
            )
        return len(ids_to_deactivate)


async def get_memories(
    pool,
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
    ticker: str | None = None,
    memory_type: str | None = None,
    active_only: bool = True,
    limit: int = 100,
) -> list[dict]:
    """Retrieve memories for a user/guest, optionally filtered by ticker and type."""
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

    if memory_type:
        conditions.append(f"memory_type = ${idx}")
        params.append(memory_type)
        idx += 1

    if active_only:
        conditions.append("active = TRUE")

    where = " AND ".join(conditions)
    query = f"""
        SELECT id, memory_type, content, ticker, tags, confidence,
               source_conversation_id, created_at, updated_at, active
        FROM memories
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
                "memory_type": r["memory_type"],
                "content": r["content"],
                "ticker": r["ticker"],
                "tags": list(r["tags"]) if r["tags"] else [],
                "confidence": r["confidence"],
                "source_conversation_id": str(r["source_conversation_id"]) if r["source_conversation_id"] else None,
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
                "active": r["active"],
            }
            for r in rows
        ]


# ---------------------------------------------------------------------------
# Memory candidate retrieval with embeddings (Phase 7)
# ---------------------------------------------------------------------------

async def get_memory_candidates(
    pool,
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
    limit: int = 200,
) -> list[dict]:
    """Retrieve active memories with embeddings and timestamps for ranking.

    Returns all active memories for the identity (not filtered by ticker),
    so the selector can rank cross-portfolio observations alongside
    ticker-specific ones.
    """
    if pool is None:
        return []
    if not user_id and not guest_id:
        return []

    if user_id:
        where = "user_id = $1"
        params = [user_id]
    else:
        where = "guest_id = $1"
        params = [guest_id]

    query = f"""
        SELECT id, memory_type, content, ticker, tags, confidence,
               embedding, created_at
        FROM memories
        WHERE {where} AND active = TRUE
        ORDER BY created_at DESC
        LIMIT $2
    """
    params.append(limit)

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        return [
            {
                "id": str(r["id"]),
                "memory_type": r["memory_type"],
                "content": r["content"],
                "ticker": r["ticker"],
                "tags": list(r["tags"]) if r["tags"] else [],
                "confidence": float(r["confidence"]),
                "embedding": list(r["embedding"]) if r["embedding"] else None,
                "created_at": r["created_at"],
            }
            for r in rows
        ]


async def cleanup_guest_memories(
    pool,
    *,
    deactivate_after_days: int = 90,
    delete_after_days: int = 180,
) -> dict:
    """Lifecycle management for guest (unauthenticated) memories.

    Two-phase:
      1. Deactivate active guest memories older than deactivate_after_days.
      2. Hard-delete inactive guest memories older than delete_after_days.

    Returns {"deactivated": int, "deleted": int}.
    """
    if pool is None:
        return {"deactivated": 0, "deleted": 0}

    async with pool.acquire() as conn:
        deactivated = await conn.fetchval(
            """
            WITH updated AS (
                UPDATE memories
                SET active = FALSE, updated_at = now()
                WHERE user_id IS NULL
                  AND guest_id IS NOT NULL
                  AND active = TRUE
                  AND created_at < now() - make_interval(days => $1)
                RETURNING id
            )
            SELECT COUNT(*) FROM updated
            """,
            deactivate_after_days,
        )

        deleted = await conn.fetchval(
            """
            WITH removed AS (
                DELETE FROM memories
                WHERE user_id IS NULL
                  AND guest_id IS NOT NULL
                  AND active = FALSE
                  AND updated_at < now() - make_interval(days => $1)
                RETURNING id
            )
            SELECT COUNT(*) FROM removed
            """,
            delete_after_days,
        )

        return {"deactivated": int(deactivated or 0), "deleted": int(deleted or 0)}
