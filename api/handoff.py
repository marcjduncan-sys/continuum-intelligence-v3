"""
Analyst-to-PM Handoff (Phase F).

Assembles Analyst summaries from existing memories, logs cross-role handoffs,
and provides the payload structure that PM uses to make portfolio-fit decisions.

The handoff payload contains:
  - ticker
  - analyst_summary_text: concise Analyst view
  - conviction_level: high/medium/low/none
  - valuation_stance: undervalued/fair/overvalued/unknown
  - key_risks: list of risk strings
  - tripwires: list of invalidation triggers
  - coverage_state: covered/not_covered/stale
  - timestamp: when the summary was assembled
  - summary_version: hash of constituent memory IDs for staleness detection
"""

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any

import db
from portfolio_alignment import load_research

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Handoff payload assembly
# ---------------------------------------------------------------------------

def _compute_summary_version(memories: list[dict]) -> str:
    """Hash memory IDs + updated_at to produce a short version string."""
    if not memories:
        return "empty"
    parts = sorted(
        f"{m.get('id', '')}:{m.get('updated_at', '')}" for m in memories
    )
    raw = "|".join(parts)
    return hashlib.md5(raw.encode()).hexdigest()[:10]


def _extract_conviction(memories: list[dict]) -> str:
    """Infer conviction level from Analyst memories."""
    for m in memories:
        content_lower = (m.get("content") or "").lower()
        tags = [t.lower() for t in (m.get("tags") or [])]
        if "high-conviction" in tags or "conviction: high" in content_lower:
            return "high"
        if "low-conviction" in tags or "conviction: low" in content_lower:
            return "low"
    # Default based on memory count / confidence
    if not memories:
        return "none"
    avg_conf = sum(m.get("confidence", 0.5) for m in memories) / len(memories)
    if avg_conf >= 0.8:
        return "high"
    if avg_conf >= 0.5:
        return "medium"
    return "low"


def _extract_valuation_stance(memories: list[dict]) -> str:
    """Infer valuation stance from Analyst memories."""
    for m in memories:
        content_lower = (m.get("content") or "").lower()
        if "undervalued" in content_lower:
            return "undervalued"
        if "overvalued" in content_lower:
            return "overvalued"
        if "fair value" in content_lower or "fairly valued" in content_lower:
            return "fair"
    return "unknown"


def _extract_risks(memories: list[dict]) -> list[str]:
    """Extract key risks from Analyst memories tagged as risk/bearish."""
    risks = []
    risk_tags = {"risk", "bear-case", "bearish", "downside", "headwind"}
    for m in memories:
        tags_lower = {t.lower() for t in (m.get("tags") or [])}
        insight = (m.get("insight_type") or "").lower()
        if tags_lower & risk_tags or insight in ("risk", "bear_case", "downside_risk"):
            text = (m.get("content") or "").strip()
            if text and text not in risks:
                risks.append(text)
    return risks[:5]


def _extract_tripwires(memories: list[dict]) -> list[str]:
    """Extract thesis invalidation tripwires from Analyst memories."""
    tripwires = []
    trip_tags = {"tripwire", "invalidation", "thesis-break"}
    for m in memories:
        tags_lower = {t.lower() for t in (m.get("tags") or [])}
        if tags_lower & trip_tags:
            text = (m.get("content") or "").strip()
            if text and text not in tripwires:
                tripwires.append(text)
    return tripwires[:5]


def _build_summary_text(memories: list[dict], ticker: str) -> str:
    """Assemble concise Analyst summary text from memories."""
    if not memories:
        return f"No Analyst coverage available for {ticker}."

    structural = [m for m in memories if m.get("memory_type") == "structural"]
    positional = [m for m in memories if m.get("memory_type") == "positional"]
    tactical = [m for m in memories if m.get("memory_type") == "tactical"]

    parts = []
    # Structural views first (thesis, business model)
    for m in structural[:3]:
        parts.append(m["content"])
    # Positional views (current stance)
    for m in positional[:3]:
        parts.append(m["content"])
    # Recent tactical (catalysts, events)
    for m in tactical[:2]:
        parts.append(m["content"])

    return " | ".join(parts) if parts else f"Limited Analyst notes for {ticker}."


def _build_summary_from_research(research: dict, ticker: str) -> dict:
    """Build a handoff payload from research JSON when no memories exist."""
    hypotheses = research.get("hypotheses", [])
    verdict = research.get("verdict", {})

    # Conviction from verdict
    conviction = "none"
    verdict_text = (verdict.get("verdict") or "").lower()
    if "high" in verdict_text:
        conviction = "high"
    elif "medium" in verdict_text or "moderate" in verdict_text:
        conviction = "medium"
    elif "low" in verdict_text:
        conviction = "low"

    # Valuation stance from verdict or hypotheses
    valuation = "unknown"
    all_text = verdict_text + " " + " ".join(
        (h.get("description") or "").lower() for h in hypotheses
    )
    if "undervalued" in all_text:
        valuation = "undervalued"
    elif "overvalued" in all_text:
        valuation = "overvalued"
    elif "fair value" in all_text or "fairly valued" in all_text:
        valuation = "fair"

    # Risks from hypotheses with downside skew
    risks = []
    for h in hypotheses:
        score = h.get("score", "50%")
        try:
            score_val = int(str(score).replace("%", ""))
        except (ValueError, TypeError):
            score_val = 50
        if score_val >= 50:
            desc = (h.get("description") or "").strip()
            if desc and desc not in risks:
                risks.append(desc)
    risks = risks[:5]

    # Tripwires
    tripwires = []
    for h in hypotheses:
        for tw in (h.get("tripwires") or []):
            text = tw.strip() if isinstance(tw, str) else (tw.get("description") or "").strip()
            if text and text not in tripwires:
                tripwires.append(text)
    tripwires = tripwires[:5]

    # Summary text from narrative + verdict
    parts = []
    narrative = research.get("theNarrative")
    if isinstance(narrative, dict):
        core = narrative.get("coreThesis") or narrative.get("narrative") or ""
        if core:
            parts.append(core.strip())
    elif isinstance(narrative, str) and narrative.strip():
        parts.append(narrative.strip())

    verdict_summary = verdict.get("verdict") or ""
    if verdict_summary:
        parts.append(verdict_summary.strip())

    summary_text = " | ".join(parts) if parts else f"Research data available for {ticker}."

    # Version string from research metadata
    version_parts = []
    if research.get("lastUpdated"):
        version_parts.append(str(research["lastUpdated"]))
    if research.get("skew", {}).get("score") is not None:
        version_parts.append(f"skew:{research['skew']['score']}")
    version = hashlib.md5("|".join(version_parts).encode()).hexdigest()[:10] if version_parts else "research"

    return {
        "ticker": ticker.upper(),
        "analyst_summary_text": summary_text,
        "conviction_level": conviction,
        "valuation_stance": valuation,
        "key_risks": risks,
        "tripwires": tripwires,
        "coverage_state": "covered",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "summary_version": version,
    }


def _assess_coverage_state(
    memories: list[dict],
    staleness_days: int = 30,
) -> str:
    """Determine coverage state: covered, stale, or not_covered."""
    if not memories:
        return "not_covered"

    # Check freshness of most recent memory
    most_recent = None
    for m in memories:
        ts = m.get("updated_at") or m.get("created_at")
        if ts and (most_recent is None or ts > most_recent):
            most_recent = ts

    if most_recent:
        try:
            if isinstance(most_recent, str):
                dt = datetime.fromisoformat(most_recent.replace("Z", "+00:00"))
            else:
                dt = most_recent
            age = (datetime.now(timezone.utc) - dt).days
            if age > staleness_days:
                return "stale"
        except (ValueError, TypeError):
            pass

    return "covered"


async def build_analyst_summary(
    pool,
    *,
    ticker: str,
    user_id: str | None = None,
    guest_id: str | None = None,
    staleness_days: int = 30,
) -> dict:
    """
    Assemble the Analyst summary payload for a ticker.

    Returns the full handoff payload dict ready for delivery to PM.
    Works even if no coverage exists (returns not_covered state).
    """
    memories = []
    if pool and (user_id or guest_id):
        memories = await db.get_memories(
            pool,
            user_id=user_id,
            guest_id=guest_id,
            ticker=ticker.upper(),
            active_only=True,
            limit=50,
        )

    # If memories exist, use memory-based summary
    if memories:
        coverage_state = _assess_coverage_state(memories, staleness_days)
        summary_version = _compute_summary_version(memories)
        return {
            "ticker": ticker.upper(),
            "analyst_summary_text": _build_summary_text(memories, ticker.upper()),
            "conviction_level": _extract_conviction(memories),
            "valuation_stance": _extract_valuation_stance(memories),
            "key_risks": _extract_risks(memories),
            "tripwires": _extract_tripwires(memories),
            "coverage_state": coverage_state,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "summary_version": summary_version,
        }

    # Fallback: check research JSON file
    research = load_research(ticker)
    if research:
        return _build_summary_from_research(research, ticker)

    # Truly not covered: no memories and no research
    return {
        "ticker": ticker.upper(),
        "analyst_summary_text": f"No Analyst coverage available for {ticker.upper()}.",
        "conviction_level": "none",
        "valuation_stance": "unknown",
        "key_risks": [],
        "tripwires": [],
        "coverage_state": "not_covered",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "summary_version": "empty",
    }


# ---------------------------------------------------------------------------
# Handoff DB helpers
# ---------------------------------------------------------------------------

async def log_handoff(
    pool,
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
    source_role: str,
    destination_role: str,
    ticker: str,
    summary_payload: dict,
    source_conversation_id: str | None = None,
    handoff_reason: str | None = None,
    coverage_state: str | None = None,
    analyst_summary_version: str | None = None,
) -> str | None:
    """Log a cross-role handoff. Returns handoff_id as string."""
    if pool is None:
        return None
    if not user_id and not guest_id:
        return None

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO handoffs
                (user_id, guest_id, source_role, destination_role, ticker,
                 summary_payload, source_conversation_id, handoff_reason,
                 coverage_state, analyst_summary_version)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
            """,
            user_id,
            guest_id,
            source_role,
            destination_role,
            ticker.upper(),
            json.dumps(summary_payload),
            source_conversation_id,
            handoff_reason,
            coverage_state,
            analyst_summary_version,
        )
        handoff_id = str(row["id"]) if row else None
        logger.info(
            "Handoff logged: %s -> %s, ticker=%s, coverage=%s, id=%s",
            source_role,
            destination_role,
            ticker.upper(),
            coverage_state,
            handoff_id,
        )
        return handoff_id


async def get_handoffs(
    pool,
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
    ticker: str | None = None,
    source_role: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """Retrieve handoff log entries with optional filters."""
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

    if source_role:
        conditions.append(f"source_role = ${idx}")
        params.append(source_role)
        idx += 1

    where = " AND ".join(conditions)
    query = f"""
        SELECT id, source_role, destination_role, ticker,
               summary_payload, source_conversation_id,
               handoff_reason, coverage_state, analyst_summary_version,
               created_at
        FROM handoffs
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
                "source_role": r["source_role"],
                "destination_role": r["destination_role"],
                "ticker": r["ticker"],
                "summary_payload": json.loads(r["summary_payload"]) if isinstance(r["summary_payload"], str) else r["summary_payload"],
                "source_conversation_id": r["source_conversation_id"],
                "handoff_reason": r["handoff_reason"],
                "coverage_state": r["coverage_state"],
                "analyst_summary_version": r["analyst_summary_version"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ]


async def get_latest_handoff(
    pool,
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
    ticker: str,
    source_role: str | None = None,
) -> dict | None:
    """Return the most recent handoff for a ticker, or None."""
    results = await get_handoffs(
        pool,
        user_id=user_id,
        guest_id=guest_id,
        ticker=ticker,
        source_role=source_role,
        limit=1,
    )
    return results[0] if results else None
