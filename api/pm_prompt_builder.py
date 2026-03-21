"""
PM prompt builder (Phase D + D0).

Assembles the full PM system prompt from:
1. PM identity and voice
2. PM Constitution (hard constraints)
3. Personalisation mandate (user-set overrides)
4. Portfolio state context (snapshot + analytics + flags)
5. Alignment diagnostics (evidence vs portfolio)
6. Safe-failure warnings (stale data, missing portfolio, etc.)
7. Optional Analyst summary for a referenced ticker

The prompt builder is the single place where PM context is assembled.
No other module should construct PM system prompts.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from pm_constitution import build_constitution_text, RECOMMENDATION_SCHEMA
from pm_context import (
    build_portfolio_context,
    build_analyst_context,
    build_safe_failure_context,
    snapshot_staleness_days,
)
from personalisation_context import PersonalisationContext

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# PM identity (Phase A, refined Phase D)
# ---------------------------------------------------------------------------

PM_IDENTITY = (
    "You are a senior portfolio manager at Continuum Intelligence. "
    "You speak in the first person plural ('we', 'our portfolio', 'our exposure'). "
    "You are direct, numerically precise, and trade-off aware.\n\n"
    "You think in terms of position sizing, concentration, sector exposure, "
    "source of funds, and portfolio effect. "
    "You are more willing to recommend no action than to recommend a marginal trade.\n\n"
    "You do not perform equity research. For stock-level thesis and evidence, "
    "defer to the Analyst. Your domain is portfolio construction and risk management: "
    "whether a position fits the portfolio, not whether the stock is good."
)


# ---------------------------------------------------------------------------
# PM voice rules
# ---------------------------------------------------------------------------

PM_VOICE_RULES = """
## PM COMMUNICATION RULES

- Lead with the decision or bottom line, not the analysis.
- Use sizing ranges (e.g. "2-3%"), never false-precision percentages.
- State trade-offs explicitly: what is gained AND what is lost.
- Cite actual portfolio numbers from the snapshot. Do not invent data.
- When recommending an action, use the structured recommendation format.
- When no action is warranted, say so explicitly with reasoning.
- Distinguish between portfolio fit (your domain) and stock quality (Analyst domain).
- When data is missing, stale, or incomplete, say so BEFORE making a recommendation.
- Never hedge with "it depends on your risk tolerance" -- use the Constitution limits.
- Do not reproduce long-form stock research. Summarise the portfolio-level implication only.

## PM ANSWER TYPES

You must handle these five question categories with discipline:

### 1. Mandate-aware recommendations
When the user asks about a position or trade, check:
- Does the action breach or approach any mandate limit?
- Does the action move the portfolio toward or away from mandate alignment?
- State the mandate constraint explicitly. Do not rely on the user knowing it.
If a mandate breach already exists, address it before the user's question.

### 2. Evidence contradictions
When alignment diagnostics show a holding contradicts its own evidence:
- Name the contradiction: the position direction vs the evidence skew.
- State the weight at risk.
- Recommend action proportional to the contradiction severity: trim vs exit vs watchlist.
- Do NOT auto-recommend selling. Explain the trade-off and let source-of-funds logic apply.

### 3. Hypothesis concentration risks
When multiple holdings share the same thesis exposure:
- Name the shared hypothesis and the combined weight.
- Assess whether this is intentional (thematic bet) or accidental (correlated risk).
- If accidental, suggest which holding to trim and why.

### 4. Source-of-funds within mandate constraints
When funding a new or increased position:
- Apply the source-of-funds hierarchy strictly.
- Check that the funding source does not itself create a mandate breach.
- If turnover tolerance is low or moderate, flag that the number of trades matters.
- State what worsens when the source is used (e.g. losing a diversifier, reducing a winner).

### 5. Change-driven alerts
When alignment diagnostics contain recent changes:
- State what changed (new position, removed position, weight shift).
- Assess whether the change improves or degrades portfolio alignment.
- If a change triggers a mandate breach, address it immediately.

## NOT-COVERED NAME RULES

When a holding has no research coverage (alignment status: "not-covered"):
- Flag it explicitly: "[TICKER] is not supported by current research."
- Treat it conservatively in alignment logic: it contributes zero to alignment score.
- It should not be recommended for increase without Analyst coverage first.
- If its weight is material (>5%), recommend the user request Analyst coverage.
- Do not assume not-covered means bad. It means unknown. Frame it as an information gap, not a sell signal.

## REWEIGHTING SIGNAL RULES

Reweighting signals from the alignment diagnostics are EVIDENCE INPUTS, not instructions.
- Do not echo them as automatic trade recommendations.
- For each reweighting signal, explain: what the signal says, what the trade-off is, and what the source-of-funds would be.
- If multiple signals point in the same direction, note the convergence.
- If signals conflict (e.g. "trim for concentration" but "aligned with evidence"), explain the tension and recommend the higher-priority action based on the mandate hierarchy.
"""


# ---------------------------------------------------------------------------
# Main builder
# ---------------------------------------------------------------------------

def build_pm_system_prompt(
    portfolio_state: dict | None = None,
    analytics: dict | None = None,
    thresholds: dict | None = None,
    analyst_summary: str | None = None,
    selected_ticker: str | None = None,
    candidate_security: str | None = None,
    personalisation: PersonalisationContext | None = None,
    alignment_diagnostics: dict | None = None,
) -> str:
    """
    Build the full PM system prompt.

    Args:
        portfolio_state: Output from portfolio_db.get_portfolio_state().
                         None if no portfolio loaded.
        analytics: Output from compute_analytics(). If None, uses
                   portfolio_state['analytics'] if present.
        thresholds: Custom threshold dict. If None, uses defaults.
        analyst_summary: Optional Analyst summary text for a referenced ticker.
        selected_ticker: Ticker the user is focused on in the UI.
        candidate_security: Ticker being evaluated for addition.
        personalisation: PersonalisationContext from the wizard (Phase D0).
        alignment_diagnostics: Output from portfolio_alignment.compute_alignment() (Phase D0.4).

    Returns:
        Complete system prompt string.
    """
    sections = []

    # 1. Identity
    sections.append(PM_IDENTITY)

    # 2. Voice rules
    sections.append(PM_VOICE_RULES)

    # 3. Constitution (hard constraints -- may use mandate thresholds)
    sections.append(build_constitution_text(thresholds))

    # 3b. Personalisation mandate (user-set overrides)
    if personalisation:
        mandate_text = _build_mandate_section(personalisation)
        if mandate_text:
            sections.append(mandate_text)

    # 4. Safe-failure warnings
    has_portfolio = portfolio_state is not None
    has_snapshot = has_portfolio and portfolio_state.get("snapshot_id") is not None

    if analytics is None and portfolio_state:
        analytics = portfolio_state.get("analytics")

    stale_days = 0
    unmapped_count = 0
    total_positions = 0

    if has_snapshot and portfolio_state:
        as_of = portfolio_state.get("as_of_date", "unknown")
        if as_of != "unknown":
            stale_days = snapshot_staleness_days(as_of)

        holdings = (analytics or {}).get("holdings_with_weights", portfolio_state.get("holdings", []))
        total_positions = len(holdings)
        unmapped_count = sum(
            1 for h in holdings
            if not h.get("sector") or h.get("sector") == "Unclassified"
        )

    safe_failure = build_safe_failure_context(
        has_portfolio=has_portfolio,
        has_snapshot=has_snapshot,
        stale_days=stale_days,
        unmapped_count=unmapped_count,
        total_positions=total_positions,
    )
    if safe_failure:
        sections.append(safe_failure)

    # 5. Portfolio context (only if we have state)
    if has_snapshot and portfolio_state:
        sections.append(build_portfolio_context(portfolio_state, analytics))

    # 5b. Alignment diagnostics (if computed)
    if alignment_diagnostics:
        align_text = _build_alignment_section(alignment_diagnostics)
        if align_text:
            sections.append(align_text)

    # 6. Analyst summary for referenced ticker
    ticker_for_context = selected_ticker or candidate_security
    if ticker_for_context:
        sections.append(build_analyst_context(ticker_for_context, analyst_summary))

    # 7. Candidate security framing
    if candidate_security and has_snapshot:
        sections.append(
            f"## CANDIDATE SECURITY: {candidate_security}\n"
            f"The user is evaluating {candidate_security} for potential addition to the portfolio.\n"
            f"Apply the source-of-funds hierarchy. Assess portfolio effect: concentration, "
            f"sector exposure, and diversification impact. Use the conviction-to-size ladder "
            f"to suggest an appropriate sizing range.\n"
        )

    return "\n\n".join(sections)


# ---------------------------------------------------------------------------
# Personalisation mandate section
# ---------------------------------------------------------------------------

def _build_mandate_section(ctx: PersonalisationContext) -> str | None:
    """Build the personalisation mandate prompt section."""
    lines = []

    # Firm/fund context
    if ctx.has_firm_context():
        lines.append("## PORTFOLIO OWNER CONTEXT")
        lines.append(f"Firm: {ctx.firm_name} ({ctx.firm_type})" if ctx.firm_type else f"Firm: {ctx.firm_name}")
        if ctx.firm_aum:
            lines.append(f"AUM: {ctx.firm_aum}")
        if ctx.firm_governance:
            lines.append(f"Governance: {ctx.firm_governance}")
        if ctx.fund_name:
            lines.append(f"Fund: {ctx.fund_name}")
        if ctx.fund_strategy:
            lines.append(f"Strategy: {ctx.fund_strategy}")
        if ctx.fund_geography:
            lines.append(f"Geography: {ctx.fund_geography}")
        if ctx.fund_benchmark:
            lines.append(f"Benchmark: {ctx.fund_benchmark}")
        if ctx.fund_risk_budget:
            lines.append(f"Risk budget: {ctx.fund_risk_budget}% tracking error")
        if ctx.fund_holding_period:
            lines.append(f"Holding period: {ctx.fund_holding_period}")
        lines.append("")

    # Mandate settings (only if customised)
    m = ctx.mandate
    if m.has_custom_values():
        lines.append("## USER MANDATE (overrides house defaults)")
        lines.append("These are the portfolio owner's chosen constraints. They override house defaults but cannot exceed safety caps.")
        lines.append(f"- Max single-name position: {m.max_position_size*100:.0f}%")
        lines.append(f"- Max sector exposure: {m.sector_cap*100:.0f}%")
        lines.append(f"- Cash target range: {m.cash_range_min*100:.0f}%-{m.cash_range_max*100:.0f}%")
        if m.turnover_tolerance:
            lines.append(f"- Turnover tolerance: {m.turnover_tolerance}")
        if m.concentration_tolerance:
            lines.append(f"- Concentration tolerance: {m.concentration_tolerance}")
        if m.style_bias and m.style_bias.lower() not in ("none", ""):
            lines.append(f"- Style bias: {m.style_bias}")
        if m.risk_appetite:
            lines.append(f"- Risk appetite: {m.risk_appetite}")
        if m.position_direction == "long_short":
            lines.append("- Position direction: Long-Short (NOTE: analytics do not yet support short positions)")
        else:
            lines.append("- Position direction: Long Only")
        if m.benchmark_framing:
            lines.append(f"- Benchmark framing: {m.benchmark_framing} (stored as metadata -- do not use for active-risk analysis)")
        if m.restricted_names:
            lines.append(f"- RESTRICTED NAMES (do not recommend): {', '.join(m.restricted_names)}")
        lines.append("")

    # Cognitive profile
    if ctx.cognitive_profile:
        cp = ctx.cognitive_profile
        lines.append("## MANAGER COGNITIVE PROFILE")
        if cp.big_five:
            bf_parts = []
            labels = {"E": "Extraversion", "A": "Agreeableness", "C": "Conscientiousness", "N": "Neuroticism", "O": "Openness"}
            for key in ("E", "A", "C", "N", "O"):
                if key in cp.big_five:
                    bf_parts.append(f"{labels.get(key, key)}: {cp.big_five[key]}/20")
            if bf_parts:
                lines.append(f"Big Five: {', '.join(bf_parts)}")

            # Behavioural cues
            n_score = cp.big_five.get("N", 10)
            if n_score >= 14:
                lines.append("HIGH NEUROTICISM: Present risk calmly with context. Avoid alarming language.")
            elif n_score <= 8:
                lines.append("LOW NEUROTICISM: Direct, unfiltered risk warnings are appropriate.")

            o_score = cp.big_five.get("O", 10)
            if o_score >= 14:
                lines.append("HIGH OPENNESS: Narrative and metaphorical framing acceptable.")
            elif o_score <= 8:
                lines.append("LOW OPENNESS: Stick to concrete, structured analysis.")

        if cp.crt_score:
            lines.append(f"Cognitive Reflection: {cp.crt_score}/6 ({cp.crt_label})")
            if cp.crt_score >= 5:
                lines.append("Use Socratic questioning for bias interventions.")
            elif cp.crt_score <= 2:
                lines.append("Use direct, clear bias warnings.")

        if cp.biases:
            lines.append("Bias vulnerabilities:")
            for b in cp.biases:
                bias_name = b.get("bias", "")
                intervention = b.get("intervention", "")
                if bias_name:
                    lines.append(f"- {bias_name}: {intervention}")

        if cp.preferences:
            pref = cp.preferences
            if any(pref.values()):
                lines.append("Delivery preferences:")
                for key in ("timing", "detail", "format", "updateFrequency", "stressResponse"):
                    val = pref.get(key, "")
                    if val:
                        lines.append(f"- {key}: {val}")

        lines.append("")

    if not lines:
        return None
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Alignment diagnostics section
# ---------------------------------------------------------------------------

def _build_alignment_section(diagnostics: dict) -> str | None:
    """Build the alignment diagnostics prompt section."""
    if not diagnostics:
        return None

    lines = ["## PORTFOLIO ALIGNMENT DIAGNOSTICS"]

    # Summary
    summary = diagnostics.get("alignment_summary") or {}
    if summary:
        score = summary.get("alignment_score", 0)
        lines.append(
            f"Alignment score: {score*100:.0f}% "
            f"(aligned {summary.get('aligned_weight', 0)*100:.1f}% | "
            f"contradicts {summary.get('contradicts_weight', 0)*100:.1f}% | "
            f"neutral {summary.get('neutral_weight', 0)*100:.1f}% | "
            f"not covered {summary.get('not_covered_weight', 0)*100:.1f}%)"
        )
        lines.append(
            f"Research coverage: {summary.get('covered_count', 0)}/{summary.get('total_count', 0)} positions"
        )

    # Hypothesis DNA
    dna = diagnostics.get("hypothesis_dna") or {}
    if dna:
        lines.append(f"\nHypothesis exposure: upside {dna.get('upside_exposure', 0)*100:.0f}% | "
                     f"downside {dna.get('downside_exposure', 0)*100:.0f}%")
        if dna.get("concentration_risk"):
            lines.append("WARNING: Hypothesis concentration risk detected -- multiple holdings share the same thesis exposure")

    # Hedge gaps
    gaps = diagnostics.get("hedge_gaps") or []
    if gaps:
        lines.append(f"\n### Active Hedge Gaps ({len(gaps)})")
        for g in gaps[:5]:  # cap at 5 in prompt
            lines.append(f"- [{g.get('severity', 'medium').upper()}] {g.get('description', '')}")

    # Mandate breaches
    breaches = diagnostics.get("mandate_breaches") or []
    if breaches:
        lines.append(f"\n### ACTIVE MANDATE BREACHES ({len(breaches)})")
        lines.append("Address these before responding to the user's question.")
        for b in breaches:
            sev = b.get("severity", "warning").upper()
            lines.append(f"- [{sev}] {b.get('description', '')}")

    # Restricted violations
    violations = diagnostics.get("restricted_violations") or []
    if violations:
        lines.append("\n### RESTRICTED NAME VIOLATIONS")
        for v in violations:
            lines.append(f"- {v['ticker']} is on the restricted list (current weight: {v['weight']*100:.1f}%)")

    # Reweighting suggestions
    reweighting = diagnostics.get("reweighting_suggestions") or []
    if reweighting:
        lines.append(f"\n### Reweighting Signals ({len(reweighting)})")
        for r in reweighting[:5]:
            lines.append(f"- {r.get('ticker', '')}: {r.get('suggested_direction', '')} -- {r.get('reason', '')}")

    # Changes
    changes = diagnostics.get("changes") or []
    if changes:
        lines.append(f"\n### Recent Changes ({len(changes)})")
        for c in changes[:5]:
            lines.append(f"- {c.get('description', '')}")

    if len(lines) <= 1:
        return None
    return "\n".join(lines)
