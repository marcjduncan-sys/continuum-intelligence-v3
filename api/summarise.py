"""
Rolling summarisation for long conversations (Phase 3b).

When a conversation accumulates more than SUMMARY_TRIGGER messages since the
last summary, the older portion is compressed by claude-haiku and the result
stored to the DB. Subsequent requests receive [summary block] + last N messages
as context, keeping prompt size bounded without losing early analytical content.
"""

import logging

from . import db

logger = logging.getLogger(__name__)

SUMMARY_TRIGGER = 20  # messages since last summary before compressing
SUMMARY_RETAIN = 10   # verbatim messages to keep after summarising

_SUMMARISE_PROMPT = (
    "Summarise the following investment research conversation about {ticker} in 150 words or fewer. "
    "Capture: the key questions asked, analytical conclusions reached, and any specific data points "
    "or views expressed. This will be used as context for future turns."
)

_HAIKU_MODEL = "claude-haiku-4-5"


async def summarise_if_needed(
    pool, conversation_id: str, ticker: str, client
) -> tuple:
    """
    Return (summary_text_or_None, messages_to_use_in_context).

    Side effect: writes new summary to DB if SUMMARY_TRIGGER is exceeded.
    Falls back gracefully to returning all recent messages if anything fails.
    """
    ctx = await db.get_conversation_context(pool, conversation_id)
    recent = ctx["recent_messages"]
    existing_summary = ctx["summary"]

    # Not enough messages to warrant summarisation -- pass through as-is
    if len(recent) <= SUMMARY_TRIGGER:
        return existing_summary, recent

    # Split: older portion to summarise, recent tail to keep verbatim
    to_summarise = recent[:-SUMMARY_RETAIN]
    to_keep = recent[-SUMMARY_RETAIN:]

    # Build transcript for Claude
    parts = []
    for m in to_summarise:
        prefix = "User" if m["role"] == "user" else "Analyst"
        parts.append(prefix + ": " + m["content"])
    transcript = chr(10).join(parts)

    if existing_summary:
        full_text = (
            "[Prior summary]" + chr(10) + existing_summary
            + chr(10) + chr(10) + "[New messages]" + chr(10) + transcript
        )
    else:
        full_text = transcript

    try:
        response = client.messages.create(
            model=_HAIKU_MODEL,
            max_tokens=300,
            messages=[
                {
                    "role": "user",
                    "content": (
                        _SUMMARISE_PROMPT.format(ticker=ticker)
                        + chr(10) + chr(10) + full_text
                    ),
                }
            ],
        )
        new_summary = response.content[0].text.strip()
    except Exception as exc:
        logger.warning(
            "Summarisation failed for %s: %s -- returning unsummarised messages",
            conversation_id, exc,
        )
        return existing_summary, recent

    # Advance cursor to the last message in the summarised batch
    cursor_id = to_summarise[-1]["id"]
    try:
        await db.update_conversation_summary(pool, conversation_id, new_summary, cursor_id)
        logger.info("Applied rolling summary for conversation %s", conversation_id)
    except Exception as exc:
        logger.warning("Failed to persist summary for %s: %s", conversation_id, exc)

    return new_summary, to_keep
