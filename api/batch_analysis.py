"""
Batch analysis: nightly memory consolidation (Phase 8).

Run via POST /api/batch/run (protected by X-Batch-Secret header).
Triggered nightly at 16:00 UTC (02:00 AEDT) by batch-analysis.yml.

Algorithm per user/guest:
  1. Fetch all active positional + tactical memories with embeddings.
  2. Union-find clustering on pairs with cosine similarity >= 0.85.
  3. Merge each cluster: keep highest-confidence item, deactivate the rest.
  4. Retire superseded tacticals: Haiku call detects contradiction on same ticker.
  5. Log all actions to memory_consolidation_events.

Structural memories are never consolidated -- they represent fixed user attributes.
"""

import logging
import math
import time

import config
import db

logger = logging.getLogger(__name__)

_HAIKU_MODEL = "claude-haiku-4-5"
_SIMILARITY_THRESHOLD = 0.85
_CONSOLIDATE_TYPES = ["positional", "tactical"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cosine_similarity(a: list, b: list) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def _cluster(ids: list, similar_pairs: list) -> list:
    """Union-find: return list of clusters (each a list of IDs with > 1 member)."""
    parent = list(range(len(ids)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        pi, pj = find(i), find(j)
        if pi != pj:
            parent[pi] = pj

    idx = {id_: i for i, id_ in enumerate(ids)}
    for a, b in similar_pairs:
        union(idx[a], idx[b])

    groups = {}
    for i, id_ in enumerate(ids):
        root = find(i)
        groups.setdefault(root, []).append(id_)
    return [g for g in groups.values() if len(g) > 1]


async def _detect_contradiction(memory_a: dict, memory_b: dict) -> bool:
    """Ask Haiku whether two memories contradict each other on the same subject."""
    client = config.get_anthropic_client()
    prompt = (
        f"Memory A: {memory_a['content']}\n"
        f"Memory B: {memory_b['content']}\n\n"
        "Do these two memories express contradictory views on the same subject? "
        "Answer only YES or NO."
    )
    msg = client.messages.create(
        model=_HAIKU_MODEL,
        max_tokens=4,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip().upper().startswith("YES")


# ---------------------------------------------------------------------------
# DB queries
# ---------------------------------------------------------------------------

async def _get_all_users(pool) -> list:
    """Distinct (user_id, guest_id) pairs that have active consolidatable memories."""
    rows = await pool.fetch(
        """
        SELECT DISTINCT user_id, guest_id
        FROM memories
        WHERE active = TRUE AND memory_type = ANY($1)
        """,
        _CONSOLIDATE_TYPES,
    )
    return rows


async def _get_memories(pool, user_id, guest_id) -> list:
    """Fetch all active positional + tactical memories for a single user/guest."""
    if user_id:
        rows = await pool.fetch(
            """
            SELECT id, memory_type, content, ticker, confidence, embedding, created_at
            FROM memories
            WHERE user_id = $1 AND active = TRUE AND memory_type = ANY($2)
            ORDER BY confidence DESC, created_at DESC
            """,
            user_id,
            _CONSOLIDATE_TYPES,
        )
    else:
        rows = await pool.fetch(
            """
            SELECT id, memory_type, content, ticker, confidence, embedding, created_at
            FROM memories
            WHERE guest_id = $1 AND active = TRUE AND memory_type = ANY($2)
            ORDER BY confidence DESC, created_at DESC
            """,
            guest_id,
            _CONSOLIDATE_TYPES,
        )
    return [dict(r) for r in rows]


async def _deactivate(pool, memory_id) -> None:
    await pool.execute(
        "UPDATE memories SET active = FALSE, updated_at = now() WHERE id = $1",
        memory_id,
    )


async def _log_event(
    pool, batch_run_id, user_id, guest_id, action, source_ids, target_id, reason
) -> None:
    await pool.execute(
        """
        INSERT INTO memory_consolidation_events
          (batch_run_id, user_id, guest_id, action, source_ids, target_id, reason)
        VALUES ($1, $2, $3, $4, $5::uuid[], $6, $7)
        """,
        batch_run_id,
        user_id,
        guest_id,
        action,
        [str(sid) for sid in source_ids],
        str(target_id) if target_id else None,
        reason,
    )


# ---------------------------------------------------------------------------
# Per-user consolidation
# ---------------------------------------------------------------------------

async def _consolidate_user(pool, batch_run_id, user_id, guest_id) -> dict:
    """Run all consolidation steps for a single user. Returns {merged, retired}."""
    memories = await _get_memories(pool, user_id, guest_id)
    if len(memories) < 2:
        return {"merged": 0, "retired": 0}

    merged = 0
    retired = 0

    # Step 1: cluster memories by embedding similarity, merge duplicates
    with_emb = [m for m in memories if m.get("embedding")]
    if len(with_emb) >= 2:
        ids = [m["id"] for m in with_emb]
        similar_pairs = []
        for i in range(len(with_emb)):
            for j in range(i + 1, len(with_emb)):
                sim = _cosine_similarity(
                    with_emb[i]["embedding"], with_emb[j]["embedding"]
                )
                if sim >= _SIMILARITY_THRESHOLD:
                    similar_pairs.append((ids[i], ids[j]))

        if similar_pairs:
            id_to_mem = {m["id"]: m for m in with_emb}
            for cluster_ids in _cluster(ids, similar_pairs):
                cluster = [id_to_mem[cid] for cid in cluster_ids]
                cluster.sort(
                    key=lambda m: (m["confidence"], m["created_at"]), reverse=True
                )
                keep = cluster[0]
                for m in cluster[1:]:
                    await _deactivate(pool, m["id"])
                    await _log_event(
                        pool, batch_run_id, user_id, guest_id,
                        "merged", [m["id"]], keep["id"],
                        f"cosine similarity >= {_SIMILARITY_THRESHOLD} "
                        f"with higher-confidence memory",
                    )
                    merged += 1

    # Step 2: retire superseded tacticals on the same ticker
    tacticals = [
        m for m in memories
        if m["memory_type"] == "tactical" and m.get("ticker")
    ]
    by_ticker = {}
    for m in tacticals:
        by_ticker.setdefault(m["ticker"], []).append(m)

    for ticker, ticker_mems in by_ticker.items():
        if len(ticker_mems) < 2:
            continue
        ticker_mems.sort(key=lambda m: m["created_at"], reverse=True)
        newest = ticker_mems[0]
        for older in ticker_mems[1:]:
            try:
                if await _detect_contradiction(newest, older):
                    await _deactivate(pool, older["id"])
                    await _log_event(
                        pool, batch_run_id, user_id, guest_id,
                        "retired", [older["id"]], newest["id"],
                        f"contradicts newer {ticker} tactical memory",
                    )
                    retired += 1
            except Exception as exc:
                logger.warning("Contradiction check failed for %s: %s", ticker, exc)

    return {"merged": merged, "retired": retired}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def run_batch_analysis(pool) -> dict:
    """
    Run nightly memory consolidation across all users.
    Returns a summary dict with counts and duration.
    """
    if pool is None:
        return {
            "error": "database unavailable",
            "users_processed": 0,
            "memories_merged": 0,
            "memories_retired": 0,
            "guest_memories_deactivated": 0,
            "guest_memories_deleted": 0,
            "duration_seconds": 0,
        }

    t_start = time.monotonic()

    batch_run_id = await pool.fetchval(
        "INSERT INTO memory_batch_runs (started_at) VALUES (now()) RETURNING id"
    )

    users = await _get_all_users(pool)
    total_merged = 0
    total_retired = 0
    error_msg = None

    for row in users:
        user_id = row["user_id"]
        guest_id = row["guest_id"]
        try:
            result = await _consolidate_user(pool, batch_run_id, user_id, guest_id)
            total_merged += result["merged"]
            total_retired += result["retired"]
        except Exception as exc:
            logger.error(
                "Consolidation error for user=%s guest=%s: %s", user_id, guest_id, exc
            )

    guest_deactivated = 0
    guest_deleted = 0
    try:
        guest_cleanup = await db.cleanup_guest_memories(pool)
        guest_deactivated = guest_cleanup["deactivated"]
        guest_deleted = guest_cleanup["deleted"]
        logger.info(
            "Guest memory cleanup: deactivated=%d deleted=%d",
            guest_deactivated,
            guest_deleted,
        )
    except Exception as exc:
        logger.warning("Guest memory cleanup failed: %s", exc)

    duration = round(time.monotonic() - t_start, 2)

    await pool.execute(
        """
        UPDATE memory_batch_runs
        SET completed_at     = now(),
            users_processed  = $1,
            memories_merged  = $2,
            memories_retired = $3,
            error            = $4
        WHERE id = $5
        """,
        len(users),
        total_merged,
        total_retired,
        error_msg,
        batch_run_id,
    )

    logger.info(
        "Batch complete: %d users, %d merged, %d retired in %.2fs",
        len(users), total_merged, total_retired, duration,
    )

    return {
        "users_processed": len(users),
        "memories_merged": total_merged,
        "memories_retired": total_retired,
        "guest_memories_deactivated": guest_deactivated,
        "guest_memories_deleted": guest_deleted,
        "duration_seconds": duration,
        "error": error_msg,
    }
