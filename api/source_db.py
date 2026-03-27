"""Research source CRUD operations.

Persistence layer for user-uploaded research documents, their structured
decomposition views, and chunked passages used by multi-source retrieval.
Follows the dual-identity (user_id / guest_id) ownership pattern established
in conversations.py and portfolio_api.py.
"""

from __future__ import annotations

import json
import logging
from datetime import date as _date

logger = logging.getLogger(__name__)

# Maximum passages stored per (ticker, identity) to bound retrieval cost.
_PASSAGE_CAP = 200


def _identity_params(user_id: str | None, guest_id: str | None) -> list[Any]:
    """Return [user_id, guest_id] for parameterised ownership queries.

    All queries use the fixed clause:
        (rs.user_id = $1 OR ($1 IS NULL AND rs.guest_id = $2))
    This avoids dynamic SQL fragments and ensures both params are always bound.
    """
    return [user_id, guest_id]


# Fixed ownership clause used by all multi-source queries. Both $1 (user_id)
# and $2 (guest_id) are always bound; the OR logic selects the correct branch.
_OWNER_CLAUSE = "(rs.user_id = $1 OR ($1 IS NULL AND rs.guest_id = $2))"


async def create_source(
    pool,
    *,
    user_id: str | None,
    guest_id: str | None,
    ticker: str,
    source_name: str,
    source_type: str = "broker",
    document_date: str | None = None,
    file_name: str | None = None,
    page_count: int | None = None,
    char_count: int | None = None,
) -> dict | None:
    """Insert a research_sources row. Return the full row as dict including id."""
    if pool is None:
        return None
    if not user_id and not guest_id:
        return None
    # asyncpg requires datetime.date for DATE columns, not a string
    parsed_date = None
    if document_date:
        try:
            parsed_date = _date.fromisoformat(document_date)
        except (ValueError, TypeError):
            parsed_date = None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO research_sources
                (user_id, guest_id, ticker, source_name, source_type,
                 document_date, file_name, page_count, char_count)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
            """,
            user_id,
            guest_id,
            ticker.upper(),
            source_name,
            source_type,
            parsed_date,
            file_name,
            page_count,
            char_count,
        )
        return dict(row) if row else None


async def create_view(
    pool,
    *,
    source_id: str,
    aligned_hypothesis: str | None = None,
    alignment_confidence: float | None = None,
    direction: str | None = None,
    price_target: float | None = None,
    conviction_signals: dict | None = None,
    key_evidence: list | None = None,
    key_risks: list | None = None,
    summary: str | None = None,
    raw_decomposition: dict | None = None,
) -> dict | None:
    """Insert a source_views row. Return full row as dict."""
    if pool is None:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO source_views
                (source_id, aligned_hypothesis, alignment_confidence, direction,
                 price_target, conviction_signals, key_evidence, key_risks,
                 summary, raw_decomposition)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
            """,
            source_id,
            aligned_hypothesis,
            alignment_confidence,
            direction,
            price_target,
            json.dumps(conviction_signals) if conviction_signals else None,
            json.dumps(key_evidence) if key_evidence else None,
            json.dumps(key_risks) if key_risks else None,
            summary,
            json.dumps(raw_decomposition) if raw_decomposition else None,
        )
        return dict(row) if row else None


async def insert_passages(
    pool,
    *,
    source_id: str,
    ticker: str,
    passages: list[dict],
) -> int:
    """Batch insert source_passages rows. Return count inserted.

    Enforce cap: max 200 passages per (ticker, user_id/guest_id).
    If inserting would exceed cap, raise ValueError with clear message.
    """
    if pool is None:
        return 0
    if not passages:
        return 0

    ticker = ticker.upper()

    async with pool.acquire() as conn:
        # Look up owner identity from the source row
        owner = await conn.fetchrow(
            "SELECT user_id, guest_id FROM research_sources WHERE id = $1",
            source_id,
        )
        if not owner:
            raise ValueError(f"Source {source_id} not found")

        # Count existing passages for this (ticker, identity), active sources only
        existing = await conn.fetchval(
            """
            SELECT COUNT(*) FROM source_passages sp
            JOIN research_sources rs ON sp.source_id = rs.id
            WHERE sp.ticker = $1
              AND (rs.user_id = $2 OR ($2 IS NULL AND rs.guest_id = $3))
              AND rs.active = TRUE
            """,
            ticker,
            owner["user_id"],
            owner["guest_id"],
        )

        if existing + len(passages) > _PASSAGE_CAP:
            raise ValueError(
                f"Passage cap exceeded: {existing} existing + {len(passages)} new "
                f"> {_PASSAGE_CAP} limit for {ticker}"
            )

        # Batch insert
        count = 0
        for p in passages:
            await conn.execute(
                """
                INSERT INTO source_passages
                    (source_id, ticker, section, subsection, content,
                     tags, weight, embedding)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                source_id,
                ticker,
                p.get("section", "external"),
                p.get("subsection", "uploaded"),
                p["content"],
                p.get("tags", []),
                p.get("weight", 1.0),
                p.get("embedding"),
            )
            count += 1

        return count


async def list_sources(
    pool,
    *,
    ticker: str,
    user_id: str | None,
    guest_id: str | None,
) -> list[dict]:
    """Return all active sources for a ticker + identity, ordered by created_at DESC.

    Each dict includes the source row plus a nested 'view' dict from source_views.
    """
    if pool is None:
        return []
    if not user_id and not guest_id:
        return []

    ticker = ticker.upper()

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT
                rs.id, rs.user_id, rs.guest_id, rs.ticker, rs.source_name,
                rs.source_type, rs.document_date, rs.file_name, rs.page_count,
                rs.char_count, rs.created_at, rs.active,
                sv.id AS view_id, sv.aligned_hypothesis, sv.alignment_confidence,
                sv.direction, sv.price_target, sv.conviction_signals,
                sv.key_evidence, sv.key_risks, sv.summary
            FROM research_sources rs
            LEFT JOIN source_views sv ON sv.source_id = rs.id
            WHERE {_OWNER_CLAUSE} AND rs.ticker = $3 AND rs.active = TRUE
            ORDER BY rs.created_at DESC
            """,
            user_id,
            guest_id,
            ticker,
        )

    results = []
    for row in rows:
        source = {
            "id": str(row["id"]),
            "user_id": str(row["user_id"]) if row["user_id"] else None,
            "guest_id": row["guest_id"],
            "ticker": row["ticker"],
            "source_name": row["source_name"],
            "source_type": row["source_type"],
            "document_date": str(row["document_date"]) if row["document_date"] else None,
            "file_name": row["file_name"],
            "page_count": row["page_count"],
            "char_count": row["char_count"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "view": None,
        }
        if row["view_id"]:
            source["view"] = {
                "id": str(row["view_id"]),
                "aligned_hypothesis": row["aligned_hypothesis"],
                "alignment_confidence": float(row["alignment_confidence"]) if row["alignment_confidence"] else None,
                "direction": row["direction"],
                "price_target": float(row["price_target"]) if row["price_target"] else None,
                "conviction_signals": json.loads(row["conviction_signals"]) if row["conviction_signals"] else None,
                "key_evidence": json.loads(row["key_evidence"]) if row["key_evidence"] else None,
                "key_risks": json.loads(row["key_risks"]) if row["key_risks"] else None,
                "summary": row["summary"],
            }
        results.append(source)

    return results


async def get_source(pool, *, source_id: str) -> dict | None:
    """Return a single source with its view. None if not found."""
    if pool is None:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                rs.id, rs.user_id, rs.guest_id, rs.ticker, rs.source_name,
                rs.source_type, rs.document_date, rs.file_name, rs.page_count,
                rs.char_count, rs.created_at, rs.active,
                sv.id AS view_id, sv.aligned_hypothesis, sv.alignment_confidence,
                sv.direction, sv.price_target, sv.conviction_signals,
                sv.key_evidence, sv.key_risks, sv.summary, sv.raw_decomposition
            FROM research_sources rs
            LEFT JOIN source_views sv ON sv.source_id = rs.id
            WHERE rs.id = $1
            """,
            source_id,
        )
    if not row:
        return None

    source = {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]) if row["user_id"] else None,
        "guest_id": row["guest_id"],
        "ticker": row["ticker"],
        "source_name": row["source_name"],
        "source_type": row["source_type"],
        "document_date": str(row["document_date"]) if row["document_date"] else None,
        "file_name": row["file_name"],
        "page_count": row["page_count"],
        "char_count": row["char_count"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "view": None,
    }
    if row["view_id"]:
        source["view"] = {
            "id": str(row["view_id"]),
            "aligned_hypothesis": row["aligned_hypothesis"],
            "alignment_confidence": float(row["alignment_confidence"]) if row["alignment_confidence"] else None,
            "direction": row["direction"],
            "price_target": float(row["price_target"]) if row["price_target"] else None,
            "conviction_signals": json.loads(row["conviction_signals"]) if row["conviction_signals"] else None,
            "key_evidence": json.loads(row["key_evidence"]) if row["key_evidence"] else None,
            "key_risks": json.loads(row["key_risks"]) if row["key_risks"] else None,
            "summary": row["summary"],
            "raw_decomposition": json.loads(row["raw_decomposition"]) if row["raw_decomposition"] else None,
        }
    return source


async def delete_source(
    pool,
    *,
    source_id: str,
    user_id: str | None,
    guest_id: str | None,
) -> bool:
    """Delete a source (cascade deletes view + passages).

    Verifies ownership: only the owner can delete.
    Return True if deleted, False if not found or not owned.
    """
    if pool is None:
        return False
    if not user_id and not guest_id:
        return False

    async with pool.acquire() as conn:
        if user_id:
            result = await conn.execute(
                "DELETE FROM research_sources WHERE id = $1 AND user_id = $2",
                source_id,
                user_id,
            )
        else:
            result = await conn.execute(
                "DELETE FROM research_sources WHERE id = $1 AND guest_id = $2",
                source_id,
                guest_id,
            )
        # asyncpg returns "DELETE N" where N is row count
        return result == "DELETE 1"


async def get_source_passages(
    pool,
    *,
    ticker: str,
    user_id: str | None,
    guest_id: str | None,
) -> list[dict]:
    """Return all source_passages for a ticker + identity.

    Each dict has: content, section, subsection, tags, weight, embedding,
    source_name (from JOIN with research_sources for attribution).
    """
    if pool is None:
        return []
    if not user_id and not guest_id:
        return []

    ticker = ticker.upper()

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT
                sp.content, sp.section, sp.subsection, sp.tags,
                sp.weight, sp.embedding, rs.source_name
            FROM source_passages sp
            JOIN research_sources rs ON sp.source_id = rs.id
            WHERE {_OWNER_CLAUSE} AND sp.ticker = $3 AND rs.active = TRUE
            """,
            user_id,
            guest_id,
            ticker,
        )

    return [
        {
            "content": row["content"],
            "section": row["section"],
            "subsection": row["subsection"],
            "tags": list(row["tags"]) if row["tags"] else [],
            "weight": float(row["weight"]),
            "embedding": list(row["embedding"]) if row["embedding"] else None,
            "source_name": row["source_name"],
        }
        for row in rows
    ]


async def migrate_guest_sources(pool, *, guest_id: str, user_id: str) -> int:
    """Transfer all sources from guest_id to user_id on auth conversion.

    Returns count of migrated sources.
    """
    if pool is None:
        return 0
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE research_sources
            SET user_id = $1, guest_id = NULL
            WHERE guest_id = $2
            """,
            user_id,
            guest_id,
        )
        # asyncpg returns "UPDATE N"
        try:
            return int(result.split()[-1])
        except (ValueError, IndexError):
            return 0
