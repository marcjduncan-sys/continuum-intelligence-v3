"""
Economist prompt builder (Economist Chat BEAD-002).

Assembles the full prompt for each Economist Chat turn:
1. System prompt from economist_system_prompt.py
2. [USER PROFILE] block if personalisation profile is provided
3. [MACRO DATA] block from macro-snapshot data
4. [PORTFOLIO CONTEXT] block if available (tickers, weights, sectors)
5. Conversation history from economist_conversations table
6. User's current message

This module handles prompt assembly only. No LLM calls.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

import db
from economist_system_prompt import ECONOMIST_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Macro context injection
# ---------------------------------------------------------------------------

async def _fetch_macro_snapshot() -> dict | None:
    """Fetch the macro snapshot data from the database.

    Uses the same query logic as the /api/economist/macro-snapshot endpoint
    but calls the database directly to avoid an HTTP round-trip.
    """
    pool = await db.get_pool()
    if pool is None:
        return None

    try:
        from economist_api import macro_snapshot
        return await macro_snapshot()
    except Exception as exc:
        logger.error("Failed to fetch macro snapshot for prompt: %s", exc)
        return None


def _format_macro_block(snapshot: dict) -> str:
    """Format the macro snapshot dict into a text block for prompt injection.

    Returns a structured, LLM-readable block with labelled sections.
    """
    lines = [
        "[MACRO DATA]",
        f"As at: {snapshot.get('timestamp', 'unknown')}",
        "",
    ]

    # Staleness warnings
    warnings = snapshot.get("data_staleness_warnings", [])
    if warnings:
        lines.append("Data staleness warnings:")
        for w in warnings[:5]:
            lines.append(f"  - {w}")
        lines.append("")

    # Regime signals
    regime = snapshot.get("regime_signals", {})
    if any(v is not None for v in regime.values()):
        lines.append("Regime signals:")
        for key, val in regime.items():
            if val is not None:
                label = key.replace("_", " ").upper()
                lines.append(f"  {label}: {val}")
        lines.append("")

    # Central banks
    cb = snapshot.get("central_banks", {})
    if any(v is not None for v in cb.values()):
        lines.append("Central bank rates:")
        for key, val in cb.items():
            if val is not None:
                label = key.replace("_", " ").upper()
                lines.append(f"  {label}: {val}")
        lines.append("")

    # Yield curves
    yc = snapshot.get("yield_curves", {})
    if any(v is not None for v in yc.values()):
        lines.append("Yield curves:")
        for key, val in yc.items():
            if val is not None:
                label = key.replace("_", " ").upper()
                lines.append(f"  {label}: {val}")
        lines.append("")

    # Australia macro
    au = snapshot.get("australia_macro", {})
    if any(v is not None for v in au.values()):
        lines.append("Australia macro:")
        for key, val in au.items():
            if val is not None:
                label = key.replace("_", " ").upper()
                lines.append(f"  {label}: {val}")
        lines.append("")

    # Credit conditions
    credit = snapshot.get("credit_conditions", {})
    if any(v is not None for v in credit.values()):
        lines.append("Credit conditions:")
        for key, val in credit.items():
            if val is not None:
                label = key.replace("_", " ").upper()
                lines.append(f"  {label}: {val}")
        lines.append("")

    # FX daily changes
    fx = snapshot.get("fx_daily_change", {})
    if any(v is not None for v in fx.values()):
        lines.append("FX daily change (%):")
        for key, val in fx.items():
            if val is not None:
                label = key.replace("_", " ").upper()
                lines.append(f"  {label}: {val}")
        lines.append("")

    # Upcoming events
    events = snapshot.get("upcoming_events", [])
    if events:
        lines.append(f"Upcoming economic events (next 14 days, {len(events)} events):")
        for evt in events[:10]:
            date_str = evt.get("date", "")
            country = evt.get("country", "")
            name = evt.get("event", "")
            importance = evt.get("importance", "")
            forecast = evt.get("forecast", "")
            previous = evt.get("previous", "")
            actual = evt.get("actual", "")
            parts = [f"  {date_str} {country}: {name}"]
            if importance:
                parts.append(f"[{importance}]")
            detail_parts = []
            if actual:
                detail_parts.append(f"actual={actual}")
            if forecast:
                detail_parts.append(f"forecast={forecast}")
            if previous:
                detail_parts.append(f"previous={previous}")
            if detail_parts:
                parts.append(f"({', '.join(detail_parts)})")
            lines.append(" ".join(parts))
        lines.append("")

    lines.append("[/MACRO DATA]")
    return "\n".join(lines)


async def inject_macro_context(system_prompt: str) -> str:
    """Fetch macro snapshot and append as a [MACRO DATA] block.

    Args:
        system_prompt: Base system prompt string.

    Returns:
        System prompt with macro data appended. If the snapshot fetch
        fails, appends a warning block instead.
    """
    snapshot = await _fetch_macro_snapshot()
    if snapshot is None:
        return (
            system_prompt
            + "\n\n[MACRO DATA]\nMacro data unavailable. Database not connected. "
            "State this clearly if the user asks a data-dependent question.\n"
            "[/MACRO DATA]"
        )
    return system_prompt + "\n\n" + _format_macro_block(snapshot)


# ---------------------------------------------------------------------------
# Portfolio context injection
# ---------------------------------------------------------------------------

async def _fetch_portfolio_holdings(user_id: str) -> list[dict] | None:
    """Fetch the user's current portfolio holdings with weights and sectors.

    Returns a list of dicts with keys: ticker, weight, sector, market_value.
    Returns None if no portfolio exists or database is unavailable.
    """
    pool = await db.get_pool()
    if pool is None:
        return None

    try:
        async with pool.acquire() as conn:
            # Find the user's most recent portfolio
            portfolio_row = await conn.fetchrow(
                """
                SELECT id FROM portfolios
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT 1
                """,
                user_id,
            )
            if not portfolio_row:
                return None

            portfolio_id = str(portfolio_row["id"])

            # Get the latest snapshot
            snapshot_row = await conn.fetchrow(
                """
                SELECT id, total_value FROM portfolio_snapshots
                WHERE portfolio_id = $1
                ORDER BY as_of_date DESC
                LIMIT 1
                """,
                portfolio_id,
            )
            if not snapshot_row:
                return None

            snapshot_id = str(snapshot_row["id"])
            total_value = float(snapshot_row["total_value"]) if snapshot_row["total_value"] else 0

            if total_value <= 0:
                return None

            # Get holdings
            holding_rows = await conn.fetch(
                """
                SELECT ticker, quantity, price, market_value, sector
                FROM portfolio_holdings
                WHERE snapshot_id = $1
                ORDER BY market_value DESC
                """,
                snapshot_id,
            )

            holdings = []
            for r in holding_rows:
                mv = float(r["market_value"]) if r["market_value"] else 0
                holdings.append({
                    "ticker": r["ticker"],
                    "weight": mv / total_value if total_value > 0 else 0,
                    "sector": r.get("sector") or "Unclassified",
                    "market_value": mv,
                })
            return holdings

    except Exception as exc:
        logger.error("Failed to fetch portfolio for economist context: %s", exc)
        return None


def _format_portfolio_block(holdings: list[dict]) -> str:
    """Format portfolio holdings into a text block for prompt injection."""
    lines = [
        "[PORTFOLIO CONTEXT]",
        f"Holdings: {len(holdings)} positions",
        "",
    ]

    # Individual holdings
    for h in holdings:
        weight_pct = h["weight"] * 100
        lines.append(
            f"  {h['ticker']}: {weight_pct:.1f}% "
            f"({h['sector']}, ${h['market_value']:,.0f})"
        )

    # Sector aggregation
    sector_weights: dict[str, float] = {}
    for h in holdings:
        sector = h["sector"]
        sector_weights[sector] = sector_weights.get(sector, 0) + h["weight"]

    if sector_weights:
        lines.append("")
        lines.append("Sector exposure:")
        for sector, weight in sorted(
            sector_weights.items(), key=lambda x: -x[1]
        ):
            lines.append(f"  {sector}: {weight * 100:.1f}%")

    lines.append("")
    lines.append("[/PORTFOLIO CONTEXT]")
    return "\n".join(lines)


async def inject_portfolio_context(
    system_prompt: str, user_id: str
) -> str:
    """Fetch portfolio data and append as a [PORTFOLIO CONTEXT] block.

    Args:
        system_prompt: System prompt string (may already include macro data).
        user_id: The authenticated user's ID.

    Returns:
        System prompt with portfolio context appended. If no portfolio
        exists, returns the prompt unchanged (no block added).
    """
    if not user_id:
        return system_prompt

    holdings = await _fetch_portfolio_holdings(user_id)
    if not holdings:
        return system_prompt

    return system_prompt + "\n\n" + _format_portfolio_block(holdings)


# ---------------------------------------------------------------------------
# Conversation history
# ---------------------------------------------------------------------------

async def _fetch_conversation_messages(
    conversation_id: str,
) -> list[dict]:
    """Fetch message history for an economist conversation.

    Args:
        conversation_id: The conversation UUID.

    Returns:
        List of message dicts with 'role' and 'content' keys,
        ordered chronologically. Returns empty list on failure.
    """
    pool = await db.get_pool()
    if pool is None:
        return []

    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT messages FROM economist_conversations
                WHERE conversation_id = $1
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                conversation_id,
            )
            if not row or not row["messages"]:
                return []

            messages = row["messages"]
            if isinstance(messages, str):
                messages = json.loads(messages)
            return messages

    except Exception as exc:
        logger.error(
            "Failed to fetch economist conversation %s: %s",
            conversation_id,
            exc,
        )
        return []


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def build_system_prompt(
    user_id: str | None = None,
    personalisation_profile: str | None = None,
) -> str:
    """Build the complete economist system prompt with live data.

    Assembly order:
    1. Base system prompt (ECONOMIST_SYSTEM_PROMPT)
    2. [USER PROFILE] block (if personalisation_profile provided)
    3. [MACRO DATA] block
    4. [PORTFOLIO CONTEXT] block (if user has a portfolio)

    Args:
        user_id: Optional authenticated user ID. If provided and the user
                 has a portfolio, portfolio context is injected.
        personalisation_profile: Optional assembled personalisation prompt
                                 text from the frontend (pnBuildSystemPrompt).

    Returns:
        Complete system prompt string ready for the Claude API.
    """
    prompt = ECONOMIST_SYSTEM_PROMPT

    # Inject personalisation profile if provided
    if personalisation_profile and personalisation_profile.strip():
        prompt = (
            prompt
            + "\n\n[USER PROFILE]\n"
            + personalisation_profile.strip()
            + "\n[/USER PROFILE]"
        )

    # Inject macro data
    prompt = await inject_macro_context(prompt)

    # Inject portfolio context if user is authenticated
    if user_id:
        prompt = await inject_portfolio_context(prompt, user_id)

    return prompt


async def build_messages(
    conversation_id: str | None,
    user_message: str,
    user_id: str | None = None,
) -> list[dict]:
    """Build the full message array for a Claude API call.

    Args:
        conversation_id: Existing conversation ID, or None for a new
                         conversation. If provided, prior messages are
                         loaded from the database.
        user_message: The user's current message text.
        user_id: Optional user ID for portfolio context injection.

    Returns:
        List of message dicts suitable for the Claude messages API.
        Format: [{"role": "user"|"assistant", "content": "..."}]
    """
    messages: list[dict] = []

    # Load conversation history if continuing
    if conversation_id:
        history = await _fetch_conversation_messages(conversation_id)
        for msg in history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})

    # Append the current user message
    messages.append({"role": "user", "content": user_message})

    return messages
