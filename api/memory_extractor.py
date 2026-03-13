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
    "You are a memory extraction system for an institutional equity research platform. "
    "Extracted memories are injected into future analyst responses to calibrate tone, "
    "emphasis, and framing for this specific fund manager. Only extract observations "
    "that would materially change how an analyst responds to a future question.\n\n"
    "Extract ONLY what the user expressed or implied. Do NOT extract the analyst's views, "
    "research findings, or anything the analyst said.\n\n"
    "USEFULNESS TEST -- before extracting an observation, ask: "
    "would knowing this change how the analyst frames a future response? "
    "If not, discard it. Generic observations ('user is interested in BHP') "
    "are not useful. Specific ones ('bearish on BHP iron ore margins due to "
    "rising strip ratios, not volume') are useful.\n\n"
    "Classify each observation:\n"
    '- "structural": durable traits -- investment philosophy, process preferences, '
    "risk appetite, firm mandate, communication style. These never expire.\n"
    '- "positional": current conviction on specific names or sectors -- '
    "portfolio positions, sector overweights/underweights, thematic bets. "
    "Relevant for 60-90 days.\n"
    '- "tactical": time-bound views -- price targets, catalyst watches, '
    "event expectations, specific trade ideas. Relevant for days to weeks.\n\n"
    "Return a JSON array. Return [] if no useful observations exist.\n\n"
    "Schema per item:\n"
    "{\n"
    '  "type": "structural" | "positional" | "tactical",\n'
    '  "content": "specific, self-contained observation in one sentence -- '
    "include the named reason or evidence where the user gave it\",\n"
    '  "ticker": "ASX ticker in uppercase" or null,\n'
    '  "tags": ["ticker-symbols", "themes", "analytical-categories"],\n'
    '  "confidence": 0.0 to 1.0\n'
    "}\n\n"
    "Content format rules:\n"
    "- Write in third person about the manager: 'Bearish on X due to Y', not 'User said'.\n"
    "- Include the named reason where given: 'Bearish on BHP margins due to strip ratio "
    "pressure' beats 'Bearish on BHP'.\n"
    "- One observation per distinct view. Do not bundle multiple views into one.\n"
    "- Do not extract questions, greetings, thanks, or meta-conversation.\n"
    "- Do not extract views the manager explicitly said they were reconsidering.\n\n"
    "Tag rules:\n"
    "- Always include the ASX ticker as a tag if the observation is stock-specific.\n"
    "- Include thematic keywords: sector (e.g. 'iron-ore', 'banks', 'reits'), "
    "analytical category (e.g. 'margins', 'valuation', 'catalyst', 'risk', 'esg').\n"
    "- All tags lowercase with hyphens, no spaces.\n\n"
    "Confidence calibration:\n"
    "- 0.9-1.0: manager stated the view directly and unambiguously.\n"
    "- 0.6-0.8: manager implied the view through questions or framing.\n"
    "- 0.3-0.5: view is weakly inferred; analyst had to read between the lines.\n"
    "- Maximum 5 observations per turn."
)

_EXTRACTION_PROMPT = (
    "Extract observations about the fund manager from this conversation turn about {ticker}.\n\n"
    "These observations will be stored and injected into future analyst responses "
    "to calibrate analysis for this specific manager. Only extract what is genuinely useful.\n\n"
    "USER QUESTION:\n{question}\n\n"
    "ANALYST RESPONSE:\n{response}\n\n"
    "Return a JSON array of observations (or [] if none worth storing)."
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

    # Truncate response to 2,000 chars to control Haiku token cost.
    # Late-response insights beyond this limit are not extracted; accepted tradeoff.
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
                ticker=(item.get("ticker") or "").upper() or None,
                tags=item.get("tags", []),
                confidence=min(max(float(item.get("confidence", 0.5)), 0.0), 1.0),
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
