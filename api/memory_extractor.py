"""
Memory extraction from conversation turns (Phase 6).

After each research-chat response, a background task sends the user's question
and the assistant's response to claude-haiku, which extracts durable observations
about the user's investment views, preferences, and decisions.

Extracted memories are stored in the `memories` table with type classification
(structural / positional / tactical) and decay rates applied at query time
(Phase 7).
"""

import json
import logging

import db
import embeddings
import llm

logger = logging.getLogger(__name__)

_HAIKU_MODEL = "claude-haiku-4-5"

EXTRACTION_SYSTEM = (
    "You are a memory extraction system for an investment research platform. "
    "Given a conversation turn between a fund manager (user) and a research "
    "analyst (assistant), extract any durable observations ABOUT THE USER's "
    "views, preferences, or decisions.\n\n"
    "Extract ONLY what the user expressed or implied. Do NOT extract the "
    "analyst's views or research findings.\n\n"
    "For each observation, classify it:\n"
    '- "structural": personality traits, firm context, investment philosophy, '
    "process preferences, communication style\n"
    '- "positional": portfolio positions, sector views, conviction levels, '
    "thematic bets, risk appetite on specific names\n"
    '- "tactical": specific price targets, catalyst watches, trade ideas, '
    "event expectations, time-bound views\n\n"
    "Return a JSON array. If no user observations are extractable, return [].\n\n"
    "Schema per item:\n"
    "{\n"
    '  "type": "structural" | "positional" | "tactical",\n'
    '  "content": "concise natural language observation (one sentence)",\n'
    '  "ticker": "ABC" or null,\n'
    '  "tags": ["tag1", "tag2"],\n'
    '  "confidence": 0.0 to 1.0\n'
    "}\n\n"
    "Rules:\n"
    "- Content should be a standalone statement, not a quote.\n"
    "- Tags should be lowercase keywords useful for search.\n"
    "- Confidence reflects how explicitly the user stated the view "
    "(1.0 = stated directly, 0.5 = implied, 0.3 = weakly inferred).\n"
    "- Do not extract greetings, thanks, or meta-conversation.\n"
    "- Do not extract questions the user asked (those are queries, not views).\n"
    "- Maximum 5 observations per turn."
)

_EXTRACTION_PROMPT = (
    "Extract user observations from this conversation turn about {ticker}.\n\n"
    "USER QUESTION:\n{question}\n\n"
    "ANALYST RESPONSE:\n{response}\n\n"
    "Return a JSON array of observations (or [] if none)."
)


async def extract_memories(
    *,
    user_id=None,
    guest_id=None,
    ticker=None,
    question="",
    response_text="",
    conversation_id=None,
):
    """
    Background task: extract memories from a conversation turn.

    Calls claude-haiku to identify user-expressed observations, then stores
    each as a row in the memories table. Failures are logged and swallowed
    (fire-and-forget).
    """
    if not user_id and not guest_id:
        return
    if not question.strip():
        return

    pool = await db.get_pool()
    if pool is None:
        return

    prompt = _EXTRACTION_PROMPT.format(
        ticker=ticker or "general",
        question=question,
        response=response_text[:2000],
    )

    try:
        result = await llm.complete(
            model=_HAIKU_MODEL,
            system=EXTRACTION_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
            json_mode=True,
            feature="memory-extraction",
            ticker=ticker,
        )
    except Exception as exc:
        logger.warning("Memory extraction LLM call failed: %s", exc)
        return

    memories = result.json if result.json else []
    if not isinstance(memories, list):
        logger.warning("Memory extraction returned non-list: %s", type(memories))
        return

    inserted = 0
    for item in memories[:5]:
        if not isinstance(item, dict):
            continue
        mem_type = item.get("type", "")
        content = item.get("content", "").strip()
        if mem_type not in ("structural", "positional", "tactical"):
            continue
        if not content:
            continue

        try:
            embedding = await embeddings.generate_embedding(content)
            await db.insert_memory(
                pool,
                user_id=user_id,
                guest_id=guest_id,
                memory_type=mem_type,
                content=content,
                ticker=item.get("ticker"),
                tags=item.get("tags", []),
                confidence=min(max(float(item.get("confidence", 0.8)), 0.0), 1.0),
                source_conversation_id=conversation_id,
                embedding=embedding,
            )
            inserted += 1
        except Exception as exc:
            logger.warning("Failed to insert memory: %s", exc)

    if inserted:
        logger.info(
            "Extracted %d memories from conversation turn",
            inserted,
            extra={"ticker": ticker, "user_id": user_id, "guest_id": guest_id},
        )
