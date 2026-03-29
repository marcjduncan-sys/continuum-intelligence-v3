"""
PM Chat endpoint (Phase D + D0 + E).

POST /api/pm-chat -- receives a portfolio-level question, assembles portfolio
context, PM Constitution, and personalisation mandate, calls the LLM, and
returns a structured response. Phase E adds conversation persistence and
background memory extraction.
"""

import hashlib
import json
import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from pydantic import BaseModel, Field

import config
import db
import llm
import pm_db
import portfolio_db
import portfolio_analytics
from auth import decode_token
from errors import api_error, ErrorCode
from pm_prompt_builder import build_pm_system_prompt, fetch_economist_macro_context
from personalisation_context import parse_personalisation_context
import portfolio_alignment
import pm_memory_extractor
import handoff

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pm-chat", tags=["pm-chat"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class PMChatMessage(BaseModel):
    role: str
    content: str


class PMChatRequest(BaseModel):
    question: str = Field(..., description="The portfolio-level question")
    conversation_history: list[PMChatMessage] = Field(
        default_factory=list,
        description="Prior conversation turns",
    )
    portfolio_id: str | None = Field(
        None, description="Portfolio identifier (Phase B)"
    )
    snapshot_id: str | None = Field(
        None,
        description="Specific snapshot to anchor context to (Phase B). "
        "If omitted, latest snapshot for portfolio_id is used.",
    )
    selected_ticker: str | None = Field(
        None,
        description="Ticker the user is focused on in the UI (Phase C). "
        "Enables PM to pull Analyst summary for that holding.",
    )
    candidate_security: str | None = Field(
        None,
        description="Ticker of a security being evaluated for addition (Phase C). "
        "Triggers source-of-funds and portfolio-effect analysis.",
    )
    context_mode: str | None = Field(
        None,
        description="Hint for prompt builder context strategy (Phase D). "
        "Values: 'full' | 'holding_focus' | 'rebalance' | 'review'.",
    )
    personalisation_context: dict | None = Field(
        None,
        description="Personalisation wizard state (Phase D0). "
        "Contains mandate settings, cognitive profile, firm/fund context.",
    )
    pm_conversation_id: str | None = Field(
        None,
        description="Existing PM conversation ID (Phase E). "
        "If omitted, a new conversation is created.",
    )
    guest_id: str | None = Field(
        None,
        description="Guest device UUID for unauthenticated users (Phase E).",
    )


class MandateBreach(BaseModel):
    code: str
    severity: str
    description: str


class PMChatResponse(BaseModel):
    response: str
    portfolio_id: str | None = None
    snapshot_id: str | None = None
    context_mode: str | None = None
    pm_conversation_id: str | None = Field(
        None,
        description="PM conversation ID for persistence (Phase E)",
    )
    mandate_breaches: list[MandateBreach] = Field(
        default_factory=list,
        description="Active mandate breaches detected in the portfolio",
    )
    alignment_score: float | None = Field(
        None,
        description="Portfolio alignment score (0-1), None if no portfolio",
    )
    not_covered_count: int | None = Field(
        None,
        description="Number of holdings without research coverage",
    )


# ---------------------------------------------------------------------------
# API key dependency (reuse from main app)
# ---------------------------------------------------------------------------

from fastapi.security import APIKeyHeader

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def _verify_api_key(api_key: str | None = Depends(_api_key_header)):
    """Lenient API key check -- matches the main app pattern."""
    expected = config.CI_API_KEY
    if not expected:
        return  # No key configured -- allow all (dev mode)
    if api_key != expected:
        raise api_error(
            401, ErrorCode.AUTH_ERROR, "Invalid or missing API key"
        )


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

def _get_identity(request: Request, guest_id_param: str | None = None):
    """Extract user identity from JWT or guest_id fallback."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        payload = decode_token(auth_header[7:])
        if payload:
            return payload.get("sub"), None
    return None, guest_id_param


def _mandate_hash(pctx) -> str | None:
    """Produce a short hash of mandate settings for decision_basis versioning."""
    if not pctx or not pctx.mandate.has_custom_values():
        return None
    m = pctx.mandate
    raw = json.dumps({
        "max_pos": m.max_position_size,
        "sector_cap": m.sector_cap,
        "cash_min": m.cash_range_min,
        "cash_max": m.cash_range_max,
        "risk": m.risk_appetite,
        "turnover": m.turnover_tolerance,
        "restricted": sorted(m.restricted_names) if m.restricted_names else [],
    }, sort_keys=True)
    return hashlib.md5(raw.encode()).hexdigest()[:8]


@router.post("", response_model=PMChatResponse)
async def pm_chat(
    request: Request,
    body: PMChatRequest,
    background_tasks: BackgroundTasks,
    _=Depends(_verify_api_key),
):
    """
    PM Chat endpoint (Phase D + E).

    Assembles portfolio state + analytics + PM Constitution into the system prompt,
    calls the LLM, and returns a response grounded in actual portfolio data.
    Phase E adds conversation persistence and background memory extraction.
    """
    # --- Identity resolution (Phase E) ---
    _user_id, _guest_id = _get_identity(request, body.guest_id)
    logger.info(
        "PM Chat request: identity=%s, portfolio_id=%s, context_mode=%s",
        _user_id or _guest_id,
        body.portfolio_id,
        body.context_mode,
    )

    # --- Parse personalisation context ---
    pctx = parse_personalisation_context(body.personalisation_context)

    # --- Assemble portfolio context ---
    portfolio_state = None
    analytics = None
    snapshot_id = body.snapshot_id

    if body.portfolio_id:
        pool = await db.get_pool()
        if pool:
            portfolio_state = await portfolio_db.get_portfolio_state(pool, body.portfolio_id)
            if portfolio_state:
                analytics = portfolio_state.get("analytics")
                if not snapshot_id:
                    snapshot_id = portfolio_state.get("snapshot_id")

    # Derive thresholds: mandate overrides > house defaults
    thresholds = pctx.mandate.to_thresholds() if pctx.mandate.has_custom_values() else None

    # Compute alignment diagnostics if we have portfolio state
    alignment_diagnostics = None
    if portfolio_state and portfolio_state.get("holdings"):
        try:
            alignment_diagnostics = portfolio_alignment.compute_alignment(
                holdings=portfolio_state["holdings"],
                mandate_max_position=pctx.mandate.max_position_size,
                mandate_sector_cap=pctx.mandate.sector_cap,
                mandate_cash_min=pctx.mandate.cash_range_min,
                mandate_cash_max=pctx.mandate.cash_range_max,
                mandate_risk_appetite=pctx.mandate.risk_appetite,
                mandate_turnover_tolerance=pctx.mandate.turnover_tolerance,
                restricted_names=pctx.mandate.restricted_names,
                analytics=analytics,
            )
        except Exception as exc:
            logger.warning("Alignment computation failed: %s", exc)

    # --- Phase F: Auto-fetch Analyst summary for referenced ticker ---
    analyst_summary_payload = None
    ticker_for_analyst = body.selected_ticker or body.candidate_security
    if ticker_for_analyst and (_user_id or _guest_id):
        pool_for_handoff = await db.get_pool()
        if pool_for_handoff:
            try:
                analyst_summary_payload = await handoff.build_analyst_summary(
                    pool_for_handoff,
                    ticker=ticker_for_analyst,
                    user_id=_user_id,
                    guest_id=_guest_id,
                )
            except Exception as exc:
                logger.warning("Analyst summary fetch failed for %s: %s", ticker_for_analyst, exc)

    # Fetch economist macro context for PM bridge (BEAD-005)
    economist_macro = await fetch_economist_macro_context()

    # Build full system prompt with Constitution + mandate + context
    system_prompt = build_pm_system_prompt(
        portfolio_state=portfolio_state,
        analytics=analytics,
        thresholds=thresholds,
        analyst_summary=analyst_summary_payload,
        selected_ticker=body.selected_ticker,
        candidate_security=body.candidate_security,
        personalisation=pctx,
        alignment_diagnostics=alignment_diagnostics,
        economist_macro_context=economist_macro,
    )

    # Build messages from history + current question
    messages = []

    # Conversation history (bounded)
    max_turns = getattr(config, "MAX_CONVERSATION_TURNS", 10) * 2
    history = body.conversation_history[-max_turns:]
    for msg in history:
        messages.append({"role": msg.role, "content": msg.content})

    # Current question
    user_message = f"**Question:** {body.question}"
    messages.append({"role": "user", "content": user_message})

    try:
        result = await llm.complete(
            model=config.ANTHROPIC_MODEL,
            system=system_prompt,
            messages=messages,
            max_tokens=getattr(config, "PM_CHAT_MAX_TOKENS", getattr(config, "CHAT_MAX_TOKENS", 2048)),
            feature="pm-chat",
            ticker=body.selected_ticker,
        )
    except Exception as e:
        logger.error("PM Chat LLM error: %s", e)
        raise api_error(
            502, ErrorCode.LLM_ERROR, "PM LLM error", detail=str(e)
        )

    # Extract diagnostics for response metadata
    breach_list = []
    alignment_score = None
    not_covered_count = None
    breach_codes = []
    if alignment_diagnostics:
        for b in (alignment_diagnostics.get("mandate_breaches") or []):
            breach_list.append(MandateBreach(
                code=b.get("code", ""),
                severity=b.get("severity", "warning"),
                description=b.get("description", ""),
            ))
            breach_codes.append(b.get("code", ""))
        summary = alignment_diagnostics.get("alignment_summary") or {}
        alignment_score = summary.get("alignment_score")
        total = summary.get("total_count", 0)
        covered = summary.get("covered_count", 0)
        not_covered_count = total - covered if total > 0 else None

    # --- Phase E: Conversation persistence ---
    pm_conversation_id = body.pm_conversation_id
    pm_message_id = None
    pool = await db.get_pool()
    if pool and (_user_id or _guest_id):
        try:
            # Create conversation if needed
            if not pm_conversation_id:
                pm_conversation_id = await pm_db.create_pm_conversation(
                    pool,
                    user_id=_user_id,
                    guest_id=_guest_id,
                    portfolio_id=body.portfolio_id,
                    snapshot_id=snapshot_id,
                )

            if pm_conversation_id:
                # Store user message
                await pm_db.append_pm_message(
                    pool,
                    pm_conversation_id=pm_conversation_id,
                    role="user",
                    content=body.question,
                )
                # Store assistant message with metadata
                response_metadata = {
                    "alignment_score": alignment_score,
                    "not_covered_count": not_covered_count,
                    "breach_codes": breach_codes,
                    "context_mode": body.context_mode,
                }
                pm_message_id = await pm_db.append_pm_message(
                    pool,
                    pm_conversation_id=pm_conversation_id,
                    role="assistant",
                    content=result.text,
                    metadata=response_metadata,
                )
        except Exception as exc:
            logger.warning("PM conversation persistence failed: %s", exc)

    # --- Phase E/F: Background memory extraction ---
    _analyst_version = (analyst_summary_payload or {}).get("summary_version") if analyst_summary_payload else None
    _analyst_coverage = (analyst_summary_payload or {}).get("coverage_state") if analyst_summary_payload else None
    if _user_id or _guest_id:
        background_tasks.add_task(
            pm_memory_extractor.extract_pm_memory,
            user_id=_user_id,
            guest_id=_guest_id,
            pm_conversation_id=pm_conversation_id,
            pm_message_id=pm_message_id,
            question=body.question,
            response_text=result.text,
            portfolio_id=body.portfolio_id,
            snapshot_id=snapshot_id,
            alignment_score=alignment_score,
            breach_codes=breach_codes,
            uncovered_count=not_covered_count,
            mandate_hash=_mandate_hash(pctx),
            analyst_summary_version=_analyst_version,
            analyst_coverage_state=_analyst_coverage,
        )

    return PMChatResponse(
        response=result.text,
        portfolio_id=body.portfolio_id,
        snapshot_id=body.snapshot_id,
        context_mode=body.context_mode,
        pm_conversation_id=pm_conversation_id,
        mandate_breaches=breach_list,
        alignment_score=alignment_score,
        not_covered_count=not_covered_count,
    )
