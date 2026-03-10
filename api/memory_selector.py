"""
Memory selection and ranking (Phase 7).

At query time, selects the most relevant memories for the current question
using semantic similarity (cosine distance on embeddings) with BM25 keyword
fallback, weighted by time-decay per memory type.

Decay rates (from Memory Roadmap):
  structural: never decays
  positional:  90-day half-life
  tactical:    14-day half-life
"""

import logging
import math
from datetime import datetime, timezone

import db
import embeddings

logger = logging.getLogger(__name__)

_HALF_LIVES = {
    "structural": None,
    "positional": 90,
    "tactical": 14,
}

_MAX_CANDIDATES = 200
_MAX_SELECTED = 10


def _decay_weight(memory_type: str, age_days: float) -> float:
    hl = _HALF_LIVES.get(memory_type)
    if hl is None:
        return 1.0
    return 2 ** (-age_days / hl)


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def _keyword_score(query_tokens: set[str], memory: dict) -> float:
    """Simple keyword overlap score as fallback when embeddings are missing."""
    memory_tokens = set()
    for tag in memory.get("tags", []):
        memory_tokens.update(tag.lower().split())
    for word in memory.get("content", "").lower().split():
        memory_tokens.add(word)
    if memory.get("ticker"):
        memory_tokens.add(memory["ticker"].lower())
    if not memory_tokens or not query_tokens:
        return 0.0
    overlap = query_tokens & memory_tokens
    return len(overlap) / max(len(query_tokens), 1)


async def select_memories(
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
    ticker: str | None = None,
    question: str = "",
) -> list[dict]:
    """Select the most relevant memories for a query.

    Returns up to _MAX_SELECTED memories, ranked by:
      score = similarity * decay_weight * confidence

    Where similarity is cosine similarity (if embeddings available)
    or keyword overlap (fallback).
    """
    if not user_id and not guest_id:
        return []
    if not question.strip():
        return []

    pool = await db.get_pool()
    if pool is None:
        return []

    candidates = await db.get_memory_candidates(
        pool, user_id=user_id, guest_id=guest_id, limit=_MAX_CANDIDATES
    )
    if not candidates:
        return []

    now = datetime.now(timezone.utc)
    query_embedding = await embeddings.generate_embedding(question)
    query_tokens = set(question.lower().split())
    if ticker:
        query_tokens.add(ticker.lower())

    scored = []
    for mem in candidates:
        created = mem.get("created_at")
        if created:
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            age_days = (now - created).total_seconds() / 86400
        else:
            age_days = 0

        decay = _decay_weight(mem["memory_type"], age_days)

        if query_embedding and mem.get("embedding"):
            similarity = _cosine_similarity(query_embedding, mem["embedding"])
        else:
            similarity = _keyword_score(query_tokens, mem)

        # Boost memories matching the current ticker
        ticker_boost = 1.2 if ticker and mem.get("ticker") == ticker.upper() else 1.0

        score = similarity * decay * mem["confidence"] * ticker_boost
        scored.append({**mem, "_score": score, "_age_days": age_days})

    scored.sort(key=lambda m: m["_score"], reverse=True)
    selected = scored[:_MAX_SELECTED]

    # Filter out very low scores (noise)
    selected = [m for m in selected if m["_score"] > 0.01]

    if selected:
        logger.info(
            "Selected %d memories (top score: %.3f)",
            len(selected),
            selected[0]["_score"] if selected else 0,
            extra={"ticker": ticker, "user_id": user_id, "guest_id": guest_id},
        )

    return selected
