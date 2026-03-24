"""
PM context assembler (Phase D).

Assembles the portfolio context block that gets injected into the PM system prompt.
Takes snapshot state + analytics and produces a structured text block the LLM can reason over.

This module is pure formatting. No LLM calls.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any


# ---------------------------------------------------------------------------
# Staleness check
# ---------------------------------------------------------------------------

def snapshot_staleness_days(as_of_date: str | date) -> int:
    """Return days since snapshot as_of_date. 0 = today."""
    if isinstance(as_of_date, str):
        d = date.fromisoformat(as_of_date)
    else:
        d = as_of_date
    return (date.today() - d).days


def staleness_warning(days: int) -> str | None:
    """Return a staleness warning if snapshot is old. None if fresh."""
    if days <= 1:
        return None
    if days <= 5:
        return f"Snapshot is {days} days old. Prices may have moved."
    return (
        f"WARNING: Snapshot is {days} days old. Portfolio state may be materially stale. "
        f"Flag this in any recommendation and reduce confidence accordingly."
    )


# ---------------------------------------------------------------------------
# Portfolio context block
# ---------------------------------------------------------------------------

def build_portfolio_context(
    portfolio_state: dict,
    analytics: dict | None = None,
) -> str:
    """Build the portfolio context text block for PM prompt injection.

    Args:
        portfolio_state: Output from portfolio_db.get_portfolio_state()
        analytics: Output from portfolio_analytics.compute_analytics() or
                   the 'analytics' key from portfolio_state

    Returns:
        Formatted text block for system prompt injection.
    """
    if analytics is None:
        analytics = portfolio_state.get("analytics")

    lines = [
        "## CURRENT PORTFOLIO STATE",
        "",
    ]

    # Staleness
    as_of = portfolio_state.get("as_of_date", "unknown")
    stale_days = snapshot_staleness_days(as_of) if as_of != "unknown" else 999
    stale_warn = staleness_warning(stale_days)
    lines.append(f"Snapshot date: {as_of}")
    if stale_warn:
        lines.append(f"**{stale_warn}**")
    lines.append("")

    # Summary metrics
    total = portfolio_state.get("total_value", 0)
    cash = portfolio_state.get("cash_value", 0)
    cash_w = portfolio_state.get("cash_weight", 0)
    pos_count = analytics.get("position_count", 0) if analytics else len(portfolio_state.get("holdings", []))

    lines.append(f"Total value: ${total:,.0f}")
    lines.append(f"Cash: ${cash:,.0f} ({cash_w*100:.1f}%)")
    lines.append(f"Positions: {pos_count}")
    lines.append("")

    # Concentration
    if analytics and "concentration" in analytics:
        conc = analytics["concentration"]
        lines.append("### Concentration")
        lines.append(f"- Max single-name: {conc.get('max_single_weight', 0)*100:.1f}%")
        lines.append(f"- Top 5: {conc.get('top5_weight', 0)*100:.1f}%")
        lines.append(f"- Top 10: {conc.get('top10_weight', 0)*100:.1f}%")
        lines.append(f"- Concentration score: {analytics.get('concentration_score', 'N/A')}/100")
        lines.append(f"- HHI: {conc.get('hhi', 0):.4f}")
        lines.append("")

    # Holdings table
    holdings = analytics.get("holdings_with_weights", []) if analytics else portfolio_state.get("holdings", [])
    if holdings:
        lines.append("### Holdings (by weight)")
        lines.append("| Ticker | Weight | Market Value | Sector |")
        lines.append("|--------|--------|-------------|--------|")
        for h in holdings:
            w = h.get("weight", 0)
            mv = float(h.get("market_value", 0))
            sector = h.get("sector", "Unclassified")
            lines.append(f"| {h['ticker']} | {w*100:.1f}% | ${mv:,.0f} | {sector} |")
        lines.append("")

    # Sector exposure
    if analytics and "sector_exposure" in analytics:
        sectors = analytics["sector_exposure"]
        if sectors:
            lines.append("### Sector Exposure")
            for s, w in sectors.items():
                lines.append(f"- {s}: {w*100:.1f}%")
            lines.append("")

    # Theme exposure
    if analytics and analytics.get("theme_exposure"):
        lines.append("### Theme Exposure")
        for t, w in analytics["theme_exposure"].items():
            lines.append(f"- {t}: {w*100:.1f}%")
        lines.append("")

    # Active flags
    if analytics and analytics.get("flags"):
        lines.append("### ACTIVE RISK FLAGS")
        for f in analytics["flags"]:
            severity = f.get("severity", "info").upper()
            lines.append(f"- [{severity}] {f['message']}")
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Analyst summary context (optional, for referenced ticker)
# ---------------------------------------------------------------------------

def build_analyst_context(
    ticker: str,
    analyst_summary: str | dict | None = None,
) -> str:
    """Build optional Analyst context for a referenced ticker.

    analyst_summary can be:
      - None: no coverage available
      - str: plain text summary (legacy)
      - dict: full handoff payload from build_analyst_summary() (Phase F)

    If no Analyst summary is available, produces a clear notice.
    """
    if isinstance(analyst_summary, dict):
        return _build_analyst_context_from_payload(ticker, analyst_summary)

    if analyst_summary:
        return (
            f"## ANALYST SUMMARY: {ticker}\n"
            f"(From the Analyst. Use for stock quality context only. "
            f"PM decisions are about portfolio fit, not stock thesis.)\n\n"
            f"{analyst_summary}\n"
        )
    return (
        f"## ANALYST SUMMARY: {ticker}\n"
        f"No Analyst summary available for {ticker}. "
        f"PM should note this gap and recommend the user consult the Analyst "
        f"before making portfolio decisions about this security.\n"
    )


def _build_analyst_context_from_payload(ticker: str, payload: dict) -> str:
    """Build rich Analyst context from a full handoff payload (Phase F)."""
    coverage = payload.get("coverage_state", "unknown")
    summary_text = payload.get("analyst_summary_text", "")

    if coverage == "not_covered":
        return (
            f"## ANALYST SUMMARY: {ticker}\n"
            f"**COVERAGE: NOT COVERED** -- No Analyst research available for {ticker}.\n"
            f"PM should note this gap and recommend the user consult the Analyst "
            f"before making portfolio decisions about this security.\n"
        )

    lines = [f"## ANALYST SUMMARY: {ticker}"]
    lines.append(
        "(From the Analyst via handoff. Use for stock quality context only. "
        "PM decisions are about portfolio fit, not stock thesis.)"
    )

    if coverage == "stale":
        lines.append(f"**WARNING: Analyst coverage is STALE.** Verify before relying on this summary.")

    lines.append(f"\nCoverage state: {coverage}")
    lines.append(f"Conviction: {payload.get('conviction_level', 'unknown')}")
    lines.append(f"Valuation stance: {payload.get('valuation_stance', 'unknown')}")

    if summary_text:
        lines.append(f"\n### Summary\n{summary_text}")

    risks = payload.get("key_risks", [])
    if risks:
        lines.append("\n### Key Risks")
        for r in risks:
            lines.append(f"- {r}")

    tripwires = payload.get("tripwires", [])
    if tripwires:
        lines.append("\n### Thesis Tripwires")
        for t in tripwires:
            lines.append(f"- {t}")

    version = payload.get("summary_version", "")
    ts = payload.get("timestamp", "")
    if version or ts:
        lines.append(f"\n(Summary version: {version}, assembled: {ts})")

    return "\n".join(lines)

    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Safe-failure context (D4)
# ---------------------------------------------------------------------------

def build_safe_failure_context(
    *,
    has_portfolio: bool,
    has_snapshot: bool,
    stale_days: int = 0,
    unmapped_count: int = 0,
    total_positions: int = 0,
) -> str | None:
    """Generate context warnings for degraded states. Returns None if all clear."""
    warnings = []

    if not has_portfolio:
        return (
            "## NO PORTFOLIO LOADED\n"
            "The user has not loaded a portfolio. You cannot make portfolio-specific recommendations.\n"
            "Suggest the user create or load a portfolio first. You can still answer general "
            "portfolio management questions using your training knowledge, but flag that "
            "any advice is generic and not grounded in their actual holdings.\n"
        )

    if not has_snapshot:
        return (
            "## NO SNAPSHOT AVAILABLE\n"
            "A portfolio exists but has no snapshot data. You cannot reason about current holdings.\n"
            "Suggest the user create a snapshot with their current holdings before asking "
            "portfolio-specific questions.\n"
        )

    if stale_days > 5:
        warnings.append(
            f"Snapshot is {stale_days} days old. Treat all position-level recommendations "
            f"with reduced confidence. Flag staleness in every recommendation."
        )

    if unmapped_count > 0:
        pct = f"({unmapped_count}/{total_positions})" if total_positions > 0 else ""
        warnings.append(
            f"{unmapped_count} holdings {pct} have no sector classification. "
            f"Sector exposure analysis is incomplete. Note this when discussing sector risk."
        )

    if total_positions == 0:
        warnings.append(
            "Portfolio has zero holdings (all cash). "
            "Focus on deployment strategy and initial position sizing rather than trimming."
        )

    if not warnings:
        return None

    return "## DATA QUALITY WARNINGS\n" + "\n".join(f"- {w}" for w in warnings) + "\n"
