"""
Economist state publisher (Economist Chat BEAD-004).

After substantive conversations (>3 user turns), generates a structured
economist_state object via a secondary Claude API call and stores it in
the economist_state table. The state is consumed by PM Chat (via the
integration bridge) and the GET /api/economist/state endpoint.

This module is designed to be called as a fire-and-forget background task
so it does not delay the chat response.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import config
import db
import llm

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# State extraction prompt
# ---------------------------------------------------------------------------

_STATE_EXTRACTION_PROMPT: str = """\
You are a structured data extraction system. You will be given a transcript \
of an economist conversation about macro markets, with a focus on Australia \
and New Zealand.

Extract the economist's current views into the following JSON schema. Use \
ONLY information explicitly stated or clearly implied in the transcript. \
If a field cannot be determined from the transcript, use the default values \
shown.

Respond with valid JSON only. No markdown fences, no commentary.

{
  "macro_regime": "RISK_ON" | "RISK_OFF" | "TRANSITION",
  "policy_path_au": "TIGHTENING" | "EASING" | "HOLD" | "UNCERTAIN",
  "policy_path_nz": "TIGHTENING" | "EASING" | "HOLD" | "UNCERTAIN",
  "policy_path_us": "TIGHTENING" | "EASING" | "HOLD" | "UNCERTAIN",
  "fx_state": {
    "aud_usd": <float or null>,
    "nzd_usd": <float or null>,
    "direction": "WEAKENING" | "STRENGTHENING" | "RANGE_BOUND"
  },
  "rates_curve_state": {
    "au_10y": <float or null>,
    "curve_shape": "NORMAL" | "FLAT" | "INVERTED"
  },
  "commodity_state": {
    "oil_direction": "RISING" | "FALLING" | "STABLE" | "UNCERTAIN",
    "iron_ore_direction": "RISING" | "FALLING" | "STABLE" | "UNCERTAIN",
    "gold_direction": "RISING" | "FALLING" | "STABLE" | "UNCERTAIN"
  },
  "event_risk_state": [
    {
      "event": "<event description>",
      "severity": "LOW" | "MEDIUM" | "HIGH",
      "sectors_affected": ["<sector name>"]
    }
  ],
  "sector_impact_map": {
    "banks": "POSITIVE" | "NEGATIVE" | "NEUTRAL",
    "reits": "POSITIVE" | "NEGATIVE" | "NEUTRAL",
    "resources": "POSITIVE" | "NEGATIVE" | "NEUTRAL",
    "energy": "POSITIVE" | "NEGATIVE" | "NEUTRAL",
    "industrials": "POSITIVE" | "NEGATIVE" | "NEUTRAL",
    "consumer_discretionary": "POSITIVE" | "NEGATIVE" | "NEUTRAL",
    "consumer_staples": "POSITIVE" | "NEGATIVE" | "NEUTRAL",
    "healthcare": "POSITIVE" | "NEGATIVE" | "NEUTRAL",
    "utilities": "POSITIVE" | "NEGATIVE" | "NEUTRAL",
    "telecom": "POSITIVE" | "NEGATIVE" | "NEUTRAL"
  },
  "portfolio_flags": [],
  "summary": "<500-word rolling macro view synthesising the conversation>"
}

Defaults when the transcript does not contain enough information:
- macro_regime: "TRANSITION"
- All policy paths: "UNCERTAIN"
- fx_state direction: "RANGE_BOUND"
- All numeric fields: null
- rates_curve_state curve_shape: "NORMAL"
- All commodity directions: "UNCERTAIN"
- event_risk_state: empty array
- All sector impacts: "NEUTRAL"
- portfolio_flags: empty array
- summary: brief statement that insufficient data was discussed
"""


# ---------------------------------------------------------------------------
# Default state (used as fallback)
# ---------------------------------------------------------------------------

_DEFAULT_STATE: dict[str, Any] = {
    "macro_regime": "TRANSITION",
    "policy_path_au": "UNCERTAIN",
    "policy_path_nz": "UNCERTAIN",
    "policy_path_us": "UNCERTAIN",
    "fx_state": {"aud_usd": None, "nzd_usd": None, "direction": "RANGE_BOUND"},
    "rates_curve_state": {"au_10y": None, "curve_shape": "NORMAL"},
    "commodity_state": {
        "oil_direction": "UNCERTAIN",
        "iron_ore_direction": "UNCERTAIN",
        "gold_direction": "UNCERTAIN",
    },
    "event_risk_state": [],
    "sector_impact_map": {
        "banks": "NEUTRAL",
        "reits": "NEUTRAL",
        "resources": "NEUTRAL",
        "energy": "NEUTRAL",
        "industrials": "NEUTRAL",
        "consumer_discretionary": "NEUTRAL",
        "consumer_staples": "NEUTRAL",
        "healthcare": "NEUTRAL",
        "utilities": "NEUTRAL",
        "telecom": "NEUTRAL",
    },
    "portfolio_flags": [],
    "summary": "",
}


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

_VALID_REGIMES = {"RISK_ON", "RISK_OFF", "TRANSITION"}
_VALID_POLICY = {"TIGHTENING", "EASING", "HOLD", "UNCERTAIN"}
_VALID_DIRECTION = {"WEAKENING", "STRENGTHENING", "RANGE_BOUND"}
_VALID_CURVE = {"NORMAL", "FLAT", "INVERTED"}
_VALID_COMMODITY_DIR = {"RISING", "FALLING", "STABLE", "UNCERTAIN"}
_VALID_IMPACT = {"POSITIVE", "NEGATIVE", "NEUTRAL"}
_VALID_SEVERITY = {"LOW", "MEDIUM", "HIGH"}

_SECTOR_KEYS = {
    "banks", "reits", "resources", "energy", "industrials",
    "consumer_discretionary", "consumer_staples", "healthcare",
    "utilities", "telecom",
}


def _validate_state(state: dict) -> dict:
    """Validate and normalise the extracted state, falling back to defaults."""
    result = dict(_DEFAULT_STATE)

    # Scalar enums
    regime = str(state.get("macro_regime") or "").upper()
    if regime in _VALID_REGIMES:
        result["macro_regime"] = regime
    for key in ("policy_path_au", "policy_path_nz", "policy_path_us"):
        val = str(state.get(key) or "").upper()
        if val in _VALID_POLICY:
            result[key] = val

    # FX state
    fx = state.get("fx_state") or {}
    if isinstance(fx, dict):
        result["fx_state"] = {
            "aud_usd": fx.get("aud_usd") if isinstance(fx.get("aud_usd"), (int, float)) else None,
            "nzd_usd": fx.get("nzd_usd") if isinstance(fx.get("nzd_usd"), (int, float)) else None,
            "direction": fx.get("direction", "RANGE_BOUND").upper()
            if fx.get("direction", "").upper() in _VALID_DIRECTION
            else "RANGE_BOUND",
        }

    # Rates curve
    rc = state.get("rates_curve_state") or {}
    if isinstance(rc, dict):
        result["rates_curve_state"] = {
            "au_10y": rc.get("au_10y") if isinstance(rc.get("au_10y"), (int, float)) else None,
            "curve_shape": rc.get("curve_shape", "NORMAL").upper()
            if rc.get("curve_shape", "").upper() in _VALID_CURVE
            else "NORMAL",
        }

    # Commodities
    cs = state.get("commodity_state") or {}
    if isinstance(cs, dict):
        validated_cs = {}
        for ckey in ("oil_direction", "iron_ore_direction", "gold_direction"):
            val = cs.get(ckey, "UNCERTAIN").upper()
            validated_cs[ckey] = val if val in _VALID_COMMODITY_DIR else "UNCERTAIN"
        result["commodity_state"] = validated_cs

    # Event risks
    events = state.get("event_risk_state") or []
    if isinstance(events, list):
        validated_events = []
        for evt in events[:10]:
            if isinstance(evt, dict) and evt.get("event"):
                severity = (evt.get("severity") or "LOW").upper()
                validated_events.append({
                    "event": str(evt["event"])[:200],
                    "severity": severity if severity in _VALID_SEVERITY else "LOW",
                    "sectors_affected": [
                        str(s) for s in (evt.get("sectors_affected") or [])
                    ][:5],
                })
        result["event_risk_state"] = validated_events

    # Sector impact map
    sim = state.get("sector_impact_map") or {}
    if isinstance(sim, dict):
        validated_sim = {}
        for skey in _SECTOR_KEYS:
            val = (sim.get(skey) or "NEUTRAL").upper()
            validated_sim[skey] = val if val in _VALID_IMPACT else "NEUTRAL"
        result["sector_impact_map"] = validated_sim

    # Portfolio flags
    flags = state.get("portfolio_flags") or []
    if isinstance(flags, list):
        result["portfolio_flags"] = [str(f)[:200] for f in flags[:10]]

    # Summary
    summary = state.get("summary") or ""
    if isinstance(summary, str):
        result["summary"] = summary[:3000]

    return result


# ---------------------------------------------------------------------------
# State generation (called as background task)
# ---------------------------------------------------------------------------

async def generate_economist_state(
    conversation_id: str,
    messages: list[dict],
) -> None:
    """Generate and store economist state from a conversation transcript.

    Args:
        conversation_id: The conversation that triggered generation.
        messages: Full conversation message history.
    """
    # Build transcript for the extraction prompt
    transcript_parts = []
    for msg in messages:
        role = msg.get("role", "unknown").upper()
        content = msg.get("content", "")
        transcript_parts.append(f"[{role}]: {content}")

    transcript = "\n\n".join(transcript_parts)

    # Truncate transcript if very long (keep under ~6000 tokens estimate)
    if len(transcript) > 20000:
        transcript = transcript[-20000:]

    logger.info(
        "Generating economist state from conversation %s (%d messages, %d chars)",
        conversation_id,
        len(messages),
        len(transcript),
    )

    try:
        result = await llm.complete(
            model=config.ANTHROPIC_MODEL,
            system=_STATE_EXTRACTION_PROMPT,
            messages=[{"role": "user", "content": transcript}],
            max_tokens=1500,
            temperature=0.0,
            json_mode=True,
            feature="economist-state-extraction",
        )

        if result.json:
            state_data = _validate_state(result.json)
        else:
            logger.warning("Economist state extraction returned no JSON")
            state_data = dict(_DEFAULT_STATE)
            state_data["summary"] = result.text[:3000] if result.text else ""

    except Exception as exc:
        logger.error("Economist state LLM extraction failed: %s", exc)
        state_data = dict(_DEFAULT_STATE)
        state_data["summary"] = f"State extraction failed: {exc}"

    # Store in database
    await _store_state(state_data)


async def _store_state(state_data: dict) -> None:
    """Insert a new economist_state row."""
    pool = await db.get_pool()
    if pool is None:
        logger.warning("Cannot store economist state: database unavailable")
        return

    summary = state_data.get("summary", "")

    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO economist_state (state_data, summary)
                VALUES ($1::jsonb, $2)
                """,
                json.dumps(state_data),
                summary,
            )
        logger.info("Economist state stored successfully")
    except Exception as exc:
        logger.error("Failed to store economist state: %s", exc)


# ---------------------------------------------------------------------------
# State retrieval (used by PM Chat bridge)
# ---------------------------------------------------------------------------

async def get_latest_state() -> tuple[dict | None, str | None]:
    """Fetch the latest economist state from the database.

    Returns:
        Tuple of (state_data dict, updated_at ISO string).
        (None, None) if no state exists or database is unavailable.
    """
    pool = await db.get_pool()
    if pool is None:
        return None, None

    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT state_data, summary, updated_at
                FROM economist_state
                ORDER BY updated_at DESC
                LIMIT 1
                """
            )
            if not row:
                return None, None

            state_data = row["state_data"]
            if isinstance(state_data, str):
                state_data = json.loads(state_data)

            updated_at = row["updated_at"].isoformat() if row["updated_at"] else None
            return state_data, updated_at

    except Exception as exc:
        logger.error("Failed to fetch latest economist state: %s", exc)
        return None, None
