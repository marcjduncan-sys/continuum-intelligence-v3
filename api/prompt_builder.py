"""
Server-side prompt assembly (Phase 5).

Ports the browser-side pnBuildSystemPrompt() to Python so the server
controls exactly what context the LLM receives. The personalisation
profile is no longer sent by untrusted client code.
"""

import json
import os
from datetime import date
from pathlib import Path

# ---------------------------------------------------------------------------
# Voice rules -- loaded from data/config/voice-rules.json (single source of truth)
# ---------------------------------------------------------------------------

_VOICE_RULES_PATH = Path(__file__).resolve().parent.parent / "data" / "config" / "voice-rules.json"

with open(_VOICE_RULES_PATH, encoding="utf-8") as _f:
    _voice_data = json.load(_f)

VOICE_RULES = "\n\n" + _voice_data["header"] + "\n" + "\n".join(_voice_data["rules"]) + "\n"


# ---------------------------------------------------------------------------
# Default system prompt (non-personalised fallback)
# ---------------------------------------------------------------------------

DEFAULT_SYSTEM_PROMPT = (
    "You are a senior equity research analyst at Continuum Intelligence. "
    'You speak in the first person plural ("we", "our analysis", "our framework"). '
    "You are direct, precise, and opinionated, like a fund manager talking to another fund manager.\n\n"
    "Ground every claim in the provided research passages. Cite specific evidence. "
    "Present competing hypotheses fairly. Never default to bullish or bearish bias. "
    "Distinguish between facts (statutory filings, audited data), motivated claims "
    "(company communications), consensus views (broker research), and noise (media/social). "
    "Highlight what discriminates between hypotheses. Be direct about what is unknown or uncertain. "
    "Flag research gaps explicitly. If the research is stale or a catalyst has passed, note this.\n\n"
    "You now have access to price driver analysis passages in the research context. "
    "These contain: recent 2D/5D/10D price performance vs the ASX200, "
    "broker upgrade/downgrade activity, social media signal levels (HotCopper, Reddit), "
    "and attribution analysis explaining what drove recent price moves. "
    "When answering questions about recent price action, short-term catalysts, "
    "or broker views, reference these passages. "
    "Broker upgrades and downgrades are high-priority signals -- always mention them when present. "
    "When discussing a stock's recent move, state the relative performance vs ASX200 "
    "to distinguish stock-specific moves from broad market moves."
) + VOICE_RULES


# ---------------------------------------------------------------------------
# Helpers (ported from personalisation.js)
# ---------------------------------------------------------------------------

def percentile_label(score: int | float, max_score: int | float) -> str:
    """Map a score to a human-readable percentile band.

    Direct port of pnPercentileLabel (personalisation.js:500).
    """
    pct = (score / max_score) * 100 if max_score else 0
    if pct >= 80:
        return "High"
    if pct >= 60:
        return "Above Average"
    if pct >= 40:
        return "Average"
    if pct >= 20:
        return "Below Average"
    return "Low"


# ---------------------------------------------------------------------------
# Main prompt builder (ported from pnBuildSystemPrompt, personalisation.js:627)
# ---------------------------------------------------------------------------

def build_personalised_prompt(data: dict) -> str:
    """Build a personalised system prompt from structured profile data.

    ``data`` is the JSONB object from the profiles table, containing
    firm, fund, portfolio, and profile keys.

    Returns the assembled system prompt string.
    """
    firm = data.get("firm", {})
    fund = data.get("fund", {})
    portfolio = data.get("portfolio", [])
    profile = data.get("profile", {})

    if not profile:
        return DEFAULT_SYSTEM_PROMPT

    p = ""

    p += (
        "You are a senior equity research analyst at Continuum Intelligence, "
        "an independent research platform focused on ASX-listed companies. "
        "You are providing personalised investment research analysis calibrated "
        "to this specific fund manager's cognitive profile, institutional context, "
        "and decision-making style.\n\n"
        "Ground every claim in the provided research passages. Cite specific evidence. "
        "Never fabricate data, price targets, or financial metrics not in the research. "
        "If a question cannot be answered from the research, say so directly. "
        "If the research is stale or a catalyst has passed, note this.\n\n"
    )

    # -- Institutional context
    p += "## INSTITUTIONAL CONTEXT\n"
    p += f"Firm: {firm.get('name', '')} ({firm.get('type', '')})\n"
    p += f"AUM: {firm.get('aum', '')}\n"
    regulations = firm.get("regulations", [])
    if regulations:
        p += f"Regulatory framework: {', '.join(regulations)}\n"
    p += f"Governance: {firm.get('governance', '')}\n\n"

    # -- Strategy mandate
    p += "## STRATEGY MANDATE\n"
    p += f"Fund: {fund.get('name', '')}\n"
    p += f"Strategy: {fund.get('strategy', '')}\n"
    p += f"Geography: {fund.get('geography', '')}\n"
    p += f"Benchmark: {fund.get('benchmark', '')}\n"
    p += f"Risk budget: {fund.get('riskBudget', '')}% tracking error\n"
    p += f"Typical holding period: {fund.get('holdingPeriod', '')}\n\n"

    # -- Current portfolio
    if portfolio:
        valid = [h for h in portfolio if h.get("ticker", "").strip()]
        if valid:
            p += "## CURRENT PORTFOLIO\n"
            p += "The manager currently holds these positions. Reference them when relevant:\n"
            for h in valid:
                p += f"- {h['ticker'].upper()}"
                if h.get("weight"):
                    p += f": {h['weight']}%"
                p += "\n"
            p += "\n"

    # -- Manager cognitive profile
    p += "## MANAGER COGNITIVE PROFILE\n\n"

    big_five = profile.get("bigFive", {})
    factors = [
        ("E", "Extraversion"),
        ("A", "Agreeableness"),
        ("C", "Conscientiousness"),
        ("N", "Neuroticism"),
        ("O", "Openness"),
    ]
    p += "Big Five Personality:\n"
    for key, label in factors:
        score = big_five.get(key, 0)
        p += f"- {label}: {score}/20 ({percentile_label(score, 20)})\n"
    p += "\n"

    n_score = big_five.get("N", 10)
    if n_score >= 14:
        p += "HIGH NEUROTICISM: Present risk factors calmly with context. Avoid alarming language. Frame drawdowns as data points, not emergencies.\n"
    elif n_score <= 8:
        p += "LOW NEUROTICISM: Can handle direct, unfiltered risk warnings. Do not soften negative signals.\n"

    o_score = big_five.get("O", 10)
    if o_score >= 14:
        p += "HIGH OPENNESS: Can use metaphorical and narrative framing. Open to unconventional analysis angles.\n"
    elif o_score <= 8:
        p += "LOW OPENNESS: Stick to concrete, structured analysis. Avoid abstract framing. Use data tables and bullet points.\n"

    c_score = big_five.get("C", 10)
    if c_score >= 14:
        p += "HIGH CONSCIENTIOUSNESS: Provide thorough, well-structured analysis. Include checklists and process steps.\n"

    e_score = big_five.get("E", 10)
    if e_score <= 8:
        p += "LOW EXTRAVERSION: This manager prefers depth over breadth. Focus analysis rather than broad overviews.\n"

    p += "\n"

    # -- CRT
    crt = profile.get("crt", {})
    crt_score = crt.get("score", 3)
    crt_label = crt.get("label", "Moderate System 2")
    p += f"Cognitive Reflection: {crt_score}/6 ({crt_label})\n"
    if crt_score >= 5:
        p += (
            "HIGH CRT: This manager will rationalise away directive warnings. "
            "Use Socratic questioning for bias counter-interventions: ask questions "
            "that expose the bias rather than telling them they are biased.\n"
        )
    elif crt_score <= 2:
        p += (
            "LOW CRT: Use direct, clear bias warnings rather than subtle Socratic framing. "
            "Be explicit about cognitive traps.\n"
        )
    else:
        p += (
            "MODERATE CRT: Balance direct warnings with questioning. "
            "Use a mix of directive and Socratic approaches.\n"
        )
    p += "\n"

    # -- Investment philosophy
    philosophy = profile.get("philosophy", {})
    if philosophy:
        p += "Investment Philosophy:\n"
        for dim, val in philosophy.items():
            val = int(val) if val is not None else 0
            if val >= 4:
                strength = "Strong"
            elif val <= 2:
                strength = "Weak"
            else:
                strength = "Moderate"
            p += f"- {dim}: {val}/5 ({strength})\n"
        p += "\n"

    # -- Bias counter-interventions
    biases = profile.get("biases", [])
    if biases:
        p += "## BIAS COUNTER-INTERVENTIONS\n"
        p += (
            "The manager has identified bias vulnerabilities below. "
            "When delivering analysis that touches these areas, embed subtle counter-framing:\n"
        )
        for b in biases:
            p += f"- {b.get('bias', '')}: {b.get('intervention', '')}\n"
        p += "\n"

    # -- Delivery calibration
    prefs = profile.get("preferences", {})
    p += "## DELIVERY CALIBRATION\n"
    p += f"Timing preference: {prefs.get('timing', '')}\n"
    p += f"Detail preference: {prefs.get('detail', '')}\n"
    p += f"Format preference: {prefs.get('format', '')}\n"
    p += f"Update frequency: {prefs.get('updateFrequency', '')}\n"
    p += f"Under stress: {prefs.get('stressResponse', '')}\n\n"

    # -- Price driver awareness
    p += (
        "\nYou now have access to price driver analysis passages in the research context. "
        "These contain: recent 2D/5D/10D price performance vs the ASX200, "
        "broker upgrade/downgrade activity, social media signal levels (HotCopper, Reddit), "
        "and attribution analysis explaining what drove recent price moves. "
        "When answering questions about recent price action, short-term catalysts, "
        "or broker views, reference these passages. "
        "Broker upgrades and downgrades are high-priority signals -- always mention them when present. "
        "When discussing a stock's recent move, state the relative performance vs ASX200 "
        "to distinguish stock-specific moves from broad market moves.\n"
    )

    # -- Append voice rules
    p += VOICE_RULES

    return p


# ---------------------------------------------------------------------------
# Structured research context injection
# ---------------------------------------------------------------------------

_RESEARCH_DIR = Path(__file__).resolve().parent.parent / "data" / "research"

_RESEARCH_CONTEXT_CHAR_BUDGET = 5500  # ~1,375 tokens


def _safe_text(val) -> str:
    """Extract text from a value that may be a string, dict, or None."""
    if val is None:
        return ""
    if isinstance(val, str):
        return val
    if isinstance(val, dict):
        return val.get("text") or val.get("content") or val.get("summary") or str(val)
    return str(val)


def _truncate(text: str, max_len: int) -> str:
    if len(text) <= max_len:
        return text
    return text[:max_len - 3].rsplit(" ", 1)[0] + "..."


def build_structured_research_context(ticker: str) -> str:
    """Serialise a stock's structured research data for LLM context injection.

    Reads data/research/{TICKER}.json and returns a compact text block
    wrapped in <structured_research> tags. Returns empty string if the
    JSON is missing or malformed (graceful degradation).

    Target: ~800-1,500 tokens (3,200-6,000 chars).
    """
    if not ticker:
        return ""
    path = _RESEARCH_DIR / f"{ticker.upper()}.json"
    if not path.exists():
        return ""

    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return ""

    today = date.today().isoformat()
    ticker_full = data.get("tickerFull", ticker.upper())
    company = data.get("company", ticker.upper())
    lines = [f'<structured_research ticker="{ticker_full}" company="{company}" as_of="{today}">']

    # -- Hypotheses
    hypotheses = data.get("hypotheses", [])
    if hypotheses:
        # Sort by score descending (parse "75%" -> 75)
        def _parse_score(h):
            s = h.get("score", "0%")
            try:
                return float(str(s).replace("%", ""))
            except (ValueError, TypeError):
                return 0.0

        ranked = sorted(hypotheses, key=_parse_score, reverse=True)
        lines.append("")
        lines.append("HYPOTHESES (ranked by weight):")
        dominant = ranked[0] if ranked else None
        for h in ranked:
            tier = h.get("tier", "")
            title = h.get("title", "")
            score = h.get("score", "?")
            direction = h.get("direction", "")
            status = h.get("statusText", "")
            desc = _truncate(h.get("description", ""), 200)
            dom_tag = " [DOMINANT]" if h is dominant else ""
            lines.append(
                f"- {tier} {title} ({score}, {direction}){dom_tag} "
                f"-- Status: {status}. {desc}"
            )

    # -- Skew
    skew = data.get("skew", {})
    hero = data.get("hero", {})
    skew_dir = hero.get("skew") or skew.get("direction", "")
    skew_rationale = hero.get("skew_description") or skew.get("rationale", "")
    if skew_dir:
        lines.append("")
        lines.append(f"SKEW: {skew_dir.upper()}")
        if skew_rationale:
            lines.append(f"Rationale: {_truncate(skew_rationale, 300)}")

    # -- Position in range
    pir = hero.get("position_in_range", {})
    worlds = pir.get("worlds", [])
    current_price = data.get("price") or pir.get("current_price")
    if worlds and current_price:
        lines.append("")
        currency = data.get("currency", "A$")
        lines.append(f"POSITION IN RANGE: Current price {currency}{current_price}")
        world_strs = [f"{w['label']} ({currency}{w['price']})" for w in worlds if w.get("price")]
        lines.append(f"Scenarios: {' -- '.join(world_strs)}")

    # -- Next decision point
    ndp = hero.get("next_decision_point", {})
    if ndp.get("event"):
        lines.append(f"Next decision point: {ndp['event']} -- {ndp.get('date', 'TBD')}")

    # -- Tripwires (all cards, compact)
    tripwires = data.get("tripwires", {})
    tw_cards = tripwires.get("cards", [])
    if tw_cards:
        lines.append("")
        lines.append("TRIPWIRES:")
        for tw in tw_cards[:6]:
            name = tw.get("name", "")
            tw_date = tw.get("date", "")
            conditions = tw.get("conditions", [])
            consequence = _truncate(conditions[0].get("then", ""), 150) if conditions else ""
            lines.append(f"- {name} [{tw_date}]: {consequence}")

    # -- Discriminators (top 5 by diagnosticity)
    disc = data.get("discriminators", {})
    disc_rows = disc.get("rows", [])
    if disc_rows:
        diag_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        sorted_rows = sorted(disc_rows, key=lambda r: diag_order.get(r.get("diagnosticity", "LOW"), 2))
        lines.append("")
        lines.append("KEY DISCRIMINATORS:")
        for row in sorted_rows[:5]:
            factor = row.get("discriminatesBetween", "")
            reading = row.get("currentReading", "")
            diag = row.get("diagnosticity", "")
            lines.append(f"- [{diag}] {factor}: {reading}")

    # -- Evidence (top 8 items, prefer those with diagnostic tags)
    evidence = data.get("evidence", {})
    ev_cards = evidence.get("cards", [])
    if ev_cards:
        lines.append("")
        lines.append("KEY EVIDENCE:")
        for card in ev_cards[:8]:
            num = card.get("number", "")
            title = card.get("title", "")
            epistemic = card.get("epistemicLabel", "")
            finding = _truncate(card.get("finding", ""), 120)
            tags = card.get("tags", [])
            tag_strs = [t.get("text", "") for t in tags[:3] if t.get("text")]
            tag_line = "; ".join(tag_strs) if tag_strs else ""
            lines.append(f"- E{num} {title} [{epistemic}]: {finding}")
            if tag_line:
                lines.append(f"  Alignment: {_truncate(tag_line, 150)}")

    # -- Verdict
    verdict = data.get("verdict", {})
    verdict_text = verdict.get("text", "")
    verdict_scores = verdict.get("scores", [])
    if verdict_scores:
        lines.append("")
        score_parts = []
        for vs in verdict_scores:
            label = vs.get("label", "")
            score = vs.get("score", "")
            dir_text = vs.get("dirText", "")
            score_parts.append(f"{label}: {score} ({dir_text})")
        lines.append("CONVICTION SCORES: " + " | ".join(score_parts))
    if verdict_text:
        lines.append(f"VERDICT: {_truncate(verdict_text, 300)}")

    # -- Narrative summary (compact)
    narrative = data.get("narrative", {})
    narr_text = _safe_text(narrative.get("theNarrative"))
    if narr_text:
        lines.append("")
        lines.append(f"NARRATIVE: {_truncate(narr_text, 350)}")
    price_impl = _safe_text(narrative.get("priceImplication"))
    if price_impl:
        lines.append(f"PRICE IMPLICATION: {_truncate(price_impl, 200)}")

    lines.append("")
    lines.append("</structured_research>")

    result = "\n".join(lines)

    # Sanitise em-dashes from source data (style rule: en-dashes only)
    result = result.replace("\u2014", "\u2013")

    # Enforce budget -- truncate from the end if over
    if len(result) > _RESEARCH_CONTEXT_CHAR_BUDGET:
        cut = result[:_RESEARCH_CONTEXT_CHAR_BUDGET - 30]
        cut = cut.rsplit("\n", 1)[0]
        result = cut + "\n[truncated]\n</structured_research>"

    return result


# ---------------------------------------------------------------------------
# Memory injection (Phase 7)
# ---------------------------------------------------------------------------

def _conf_label(conf: float) -> str:
    if conf >= 0.7:
        return "high confidence"
    if conf >= 0.4:
        return "medium confidence"
    return "low confidence"


_MEMORY_BLOCK_CHAR_BUDGET = 1200


def format_memories_section(memories: list[dict]) -> str:
    """Format selected memories as a prompt section for injection.

    Returns an empty string if no memories are provided, so callers
    can unconditionally append the result.

    The total injected block is capped at _MEMORY_BLOCK_CHAR_BUDGET characters
    (~300 tokens) to protect the system prompt budget. Memories are already
    sorted by relevance score descending by memory_selector.py, so lower-scored
    entries are dropped first when the cap is reached.
    """
    if not memories:
        return ""

    lines = [
        "\n\nPRIOR KNOWLEDGE ABOUT THIS MANAGER\n"
        "Extracted from prior conversations. Use as calibration context alongside the research.\n"
        "- STRUCTURAL entries are durable personality and philosophy traits; apply throughout.\n"
        "- POSITIONAL entries reflect current conviction levels on specific names; weight accordingly.\n"
        "- TACTICAL entries are time-sensitive; flag if the stated catalyst window may have passed.\n"
    ]
    char_count = sum(len(l) for l in lines)
    included = 0

    for mem in memories:
        age = mem.get("_age_days", 0)
        age_str = f" | {int(age)}d ago" if age > 0.5 else ""
        conf = _conf_label(mem.get("confidence", 1.0))
        mtype = mem.get("memory_type", "unknown").upper()
        ticker_str = f" | {mem['ticker']}" if mem.get("ticker") else ""
        line = f"[{mtype}{ticker_str}{age_str} | {conf}] {mem['content']}"
        if char_count + len(line) + 1 > _MEMORY_BLOCK_CHAR_BUDGET:
            break
        char_count += len(line) + 1  # +1 for the newline
        included += 1
        lines.append(line)

    if included < len(memories):
        lines.append(f"[{len(memories) - included} lower-relevance memories omitted]")

    return "\n".join(lines) + "\n"
