"""
PM Memory Extraction (Phase E).

After each PM Chat response, a background task extracts structured decisions
and portfolio-level insights. Uses Haiku for extraction, same fire-and-forget
pattern as memory_extractor.py but with PM-specific taxonomy.

Taxonomy (7 types, conservative):
  - pm_decision: explicit action recommendation (trim, add, exit, hold, etc.)
  - portfolio_risk: identified portfolio-level risk or concentration concern
  - mandate_breach: mandate limit violation flagged during the conversation
  - sizing_principle: sizing or position-management principle stated or applied
  - rebalance_suggestion: suggested rebalance action with trade-offs
  - uncovered_exposure: flagged exposure to names without research coverage
  - change_alert: recent portfolio change that affects alignment or risk
"""

import json
import logging
from typing import Any

import db
import llm
import pm_db

logger = logging.getLogger(__name__)

_HAIKU_MODEL = "claude-haiku-4-5-20251001"

# ---------------------------------------------------------------------------
# Decision extraction prompt
# ---------------------------------------------------------------------------

PM_DECISION_EXTRACTION_SYSTEM = (
    "You are a structured decision extractor for a portfolio management system. "
    "You read PM conversation turns and extract explicit decisions and portfolio "
    "insights. You do NOT invent decisions. You only extract what the PM assistant "
    "explicitly recommended or flagged.\n\n"
    "Return a JSON object with two arrays:\n\n"
    "1. \"decisions\": array of explicit action recommendations.\n"
    "Schema per decision:\n"
    "{\n"
    '  "action_type": "trim" | "add" | "exit" | "hold" | "rebalance" | "watch" | "no_action",\n'
    '  "ticker": "ASX ticker" or null (for portfolio-level actions),\n'
    '  "rationale": "one-sentence reason for the action",\n'
    '  "sizing_band": "e.g. 2-3%" or null,\n'
    '  "source_of_funds": "e.g. trim CBA proceeds" or null,\n'
    '  "mandate_basis": "e.g. max_position_size: 10%" or null\n'
    "}\n\n"
    "2. \"insights\": array of portfolio-level observations.\n"
    "Schema per insight:\n"
    "{\n"
    '  "insight_type": "pm_decision" | "portfolio_risk" | "mandate_breach" | '
    '"sizing_principle" | "rebalance_suggestion" | "uncovered_exposure" | "change_alert",\n'
    '  "content": "specific, self-contained observation in one sentence",\n'
    '  "tickers": ["related tickers"] or [],\n'
    '  "tags": ["analytical-categories"],\n'
    '  "confidence": 0.0 to 1.0\n'
    "}\n\n"
    "RULES:\n"
    "- Only extract decisions the PM assistant EXPLICITLY recommended. Not questions, "
    "not possibilities, not things the user said.\n"
    "- \"no_action\" is a valid and important decision. If PM recommended doing nothing, extract it.\n"
    "- For insights, only extract portfolio-level observations, NOT stock-level thesis. "
    "The PM domain is portfolio construction, not equity research.\n"
    "- insight_type MUST be one of the 7 enumerated types.\n"
    "- Maximum 3 decisions and 5 insights per turn.\n"
    "- Confidence calibration: 0.9+ for explicit recommendations, 0.6-0.8 for implied, "
    "0.3-0.5 for weakly inferred.\n"
    "- Tags: lowercase with hyphens. Include 'concentration', 'sector-exposure', 'mandate', "
    "'source-of-funds', 'alignment', 'coverage-gap', 'turnover' where relevant.\n\n"
    "Return {\"decisions\": [], \"insights\": []} if nothing worth extracting."
)

_PM_EXTRACTION_PROMPT = (
    "Extract PM decisions and portfolio insights from this conversation turn.\n\n"
    "USER QUESTION:\n{question}\n\n"
    "PM RESPONSE:\n{response}\n\n"
    "CONTEXT:\n"
    "- Portfolio ID: {portfolio_id}\n"
    "- Alignment score: {alignment_score}\n"
    "- Active breaches: {breach_codes}\n"
    "- Uncovered count: {uncovered_count}\n\n"
    "Return a JSON object with \"decisions\" and \"insights\" arrays."
)


# ---------------------------------------------------------------------------
# Decision basis builder
# ---------------------------------------------------------------------------

def build_decision_basis(
    *,
    snapshot_id: str | None = None,
    alignment_score: float | None = None,
    breach_codes: list[str] | None = None,
    uncovered_count: int | None = None,
    related_tickers: list[str] | None = None,
    mandate_hash: str | None = None,
    analyst_summary_version: str | None = None,
    analyst_coverage_state: str | None = None,
) -> dict:
    """Build a compact decision_basis object for persistence.

    Phase F additions: analyst_summary_version and analyst_coverage_state
    track whether PM had Analyst input and its freshness.
    """
    return {
        "snapshot_id": snapshot_id,
        "alignment_score": alignment_score,
        "breach_codes": breach_codes or [],
        "uncovered_count": uncovered_count,
        "related_tickers": related_tickers or [],
        "mandate_hash": mandate_hash,
        "analyst_summary_version": analyst_summary_version,
        "analyst_coverage_state": analyst_coverage_state,
        "version": "F.1",
    }


# ---------------------------------------------------------------------------
# Main extraction function
# ---------------------------------------------------------------------------

async def extract_pm_memory(
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
    pm_conversation_id: str | None = None,
    pm_message_id: str | None = None,
    question: str = "",
    response_text: str = "",
    portfolio_id: str | None = None,
    snapshot_id: str | None = None,
    alignment_score: float | None = None,
    breach_codes: list[str] | None = None,
    uncovered_count: int | None = None,
    mandate_hash: str | None = None,
    analyst_summary_version: str | None = None,
    analyst_coverage_state: str | None = None,
):
    """
    Background task: extract PM decisions and insights from a conversation turn.

    Calls Haiku to identify structured decisions and portfolio-level insights,
    then persists them. Failures are logged and swallowed (fire-and-forget).
    """
    if not user_id and not guest_id:
        return
    if not response_text.strip():
        return

    pool = await db.get_pool()
    if pool is None:
        return

    prompt = _PM_EXTRACTION_PROMPT.format(
        question=question,
        response=response_text[:3000],
        portfolio_id=portfolio_id or "none",
        alignment_score=f"{alignment_score*100:.0f}%" if alignment_score is not None else "N/A",
        breach_codes=", ".join(breach_codes) if breach_codes else "none",
        uncovered_count=uncovered_count if uncovered_count is not None else "N/A",
    )

    try:
        result = await llm.complete(
            model=_HAIKU_MODEL,
            system=PM_DECISION_EXTRACTION_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=800,
            json_mode=True,
            feature="pm-memory-extraction",
            ticker=None,
        )
    except Exception as exc:
        logger.warning("PM memory extraction LLM call failed: %s", exc)
        return

    parsed = result.json if result.json else {}
    if not isinstance(parsed, dict):
        logger.warning("PM memory extraction returned non-dict: %s", type(parsed))
        return

    # Build shared decision basis
    basis = build_decision_basis(
        snapshot_id=snapshot_id,
        alignment_score=alignment_score,
        breach_codes=breach_codes,
        uncovered_count=uncovered_count,
        mandate_hash=mandate_hash,
        analyst_summary_version=analyst_summary_version,
        analyst_coverage_state=analyst_coverage_state,
    )

    # Process decisions
    decisions = parsed.get("decisions", [])
    if not isinstance(decisions, list):
        decisions = []

    valid_actions = {"trim", "add", "exit", "hold", "rebalance", "watch", "no_action"}
    decisions_inserted = 0

    for item in decisions[:3]:
        if not isinstance(item, dict):
            continue
        action_type = item.get("action_type", "")
        rationale = item.get("rationale", "").strip()
        if action_type not in valid_actions or not rationale:
            continue

        ticker = (item.get("ticker") or "").upper() or None

        # Determine coverage state from breach/uncovered info
        coverage_state = None
        if ticker and uncovered_count is not None:
            coverage_state = "not_covered" if uncovered_count > 0 else "covered"

        # Add related tickers to basis
        decision_tickers = [ticker] if ticker else []
        decision_basis = {**basis, "related_tickers": decision_tickers}

        try:
            await pm_db.insert_pm_decision(
                pool,
                user_id=user_id,
                guest_id=guest_id,
                pm_conversation_id=pm_conversation_id,
                pm_message_id=pm_message_id,
                action_type=action_type,
                ticker=ticker,
                rationale=rationale,
                sizing_band=item.get("sizing_band"),
                source_of_funds=item.get("source_of_funds"),
                mandate_basis=item.get("mandate_basis"),
                breach_codes=breach_codes,
                coverage_state=coverage_state,
                decision_basis=decision_basis,
            )
            decisions_inserted += 1
        except Exception as exc:
            logger.warning("Failed to insert PM decision: %s", exc)

    # Process insights
    insights = parsed.get("insights", [])
    if not isinstance(insights, list):
        insights = []

    valid_insight_types = {
        "pm_decision", "portfolio_risk", "mandate_breach",
        "sizing_principle", "rebalance_suggestion",
        "uncovered_exposure", "change_alert",
    }
    insights_inserted = 0

    for item in insights[:5]:
        if not isinstance(item, dict):
            continue
        insight_type = item.get("insight_type", "")
        content = item.get("content", "").strip()
        if insight_type not in valid_insight_types or not content:
            continue

        tickers = item.get("tickers", [])
        if not isinstance(tickers, list):
            tickers = []
        tickers = [t.upper() for t in tickers if isinstance(t, str)]

        try:
            await pm_db.insert_pm_insight(
                pool,
                user_id=user_id,
                guest_id=guest_id,
                pm_conversation_id=pm_conversation_id,
                pm_message_id=pm_message_id,
                insight_type=insight_type,
                content=content,
                tickers=tickers,
                tags=item.get("tags", []),
                confidence=min(max(float(item.get("confidence", 0.5)), 0.0), 1.0),
            )
            insights_inserted += 1
        except Exception as exc:
            logger.warning("Failed to insert PM insight: %s", exc)

    if decisions_inserted or insights_inserted:
        logger.info(
            "PM extraction: %d decisions, %d insights from conversation turn",
            decisions_inserted, insights_inserted,
            extra={
                "pm_conversation_id": pm_conversation_id,
                "user_id": user_id,
                "guest_id": guest_id,
            },
        )
