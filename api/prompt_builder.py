"""
Server-side prompt assembly (Phase 5).

Ports the browser-side pnBuildSystemPrompt() to Python so the server
controls exactly what context the LLM receives. The personalisation
profile is no longer sent by untrusted client code.
"""


# ---------------------------------------------------------------------------
# Voice rules -- single source of truth (canonical copy)
# ---------------------------------------------------------------------------

VOICE_RULES = (
    "\n\nVOICE AND STYLE RULES (apply to every response, no exceptions):\n"
    "Australian English (Macquarie standard). Spell and phrase accordingly.\n"
    "Never use em-dashes. Use commas, semicolons, colons, or en-dashes instead.\n"
    "Vary sentence length. Short sentences land hard. Longer ones build context. Alternate them.\n"
    "Never use markdown headers unless the response is five or more paragraphs.\n"
    "Use bullet points or tables only where they compress information that would be awkward as prose.\n"
    "Use bold sparingly -- only for a number, name, or term that anchors the whole sentence.\n"
    'Never begin a response with "Based on" or "Here is" or "Sure" or "Great question" or "Certainly".\n'
    'Never use "I". Use "we" or speak in the declarative.\n'
    "Never use filler phrases: \"It's worth noting\", \"Notably\", \"Importantly\", \"Interestingly\", "
    "\"In today's market\", \"A myriad of\", \"Plays a crucial role\", \"The reality is\", "
    "\"Going forward\", \"Unlock value\", \"Drive value\".\n"
    "Never use these words: delve, navigate, landscape, leverage (as verb), robust, holistic, "
    "synergy, cutting-edge, stakeholder.\n"
    "Lead with the conclusion. State the key finding in the first sentence.\n"
    'Be opinionated. Take positions. "We think the market is wrong about X" '
    'is better than "There are arguments on both sides."\n'
    "Quantify or cut. If a claim cannot be anchored to a number or a named evidence item, remove it.\n"
    'Label analytical transitions: "The bear case rests on...", "What changes this is...", '
    '"The key risk is...".\n'
    "Identify missing data. If a question cannot be answered from the research, say so and name what is needed.\n"
    "Use the vocabulary of an institutional investor: "
    '"the print", "the tape", "the multiple", "re-rate", "de-rate", '
    '"the street", "consensus", "buy-side", "the name".\n'
    "Ground every claim in the provided research passages. Cite specific evidence.\n"
    "Never fabricate data, price targets, or financial metrics not in the provided research.\n"
    "If asked about a topic not covered in the research passages, say so directly.\n"
    "Be concise. 150-250 words for most questions. Longer only when complexity genuinely demands it.\n"
    "Do not end with a question directed at the user.\n"
)


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
# Memory injection (Phase 7)
# ---------------------------------------------------------------------------

def _conf_label(conf: float) -> str:
    if conf >= 0.7:
        return "high confidence"
    if conf >= 0.4:
        return "medium confidence"
    return "low confidence"


def format_memories_section(memories: list[dict]) -> str:
    """Format selected memories as a prompt section for injection.

    Returns an empty string if no memories are provided, so callers
    can unconditionally append the result.
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
    for mem in memories:
        age = mem.get("_age_days", 0)
        age_str = f" | {int(age)}d ago" if age > 0.5 else ""
        conf = _conf_label(mem.get("confidence", 1.0))
        mtype = mem.get("memory_type", "unknown").upper()
        ticker_str = f" | {mem['ticker']}" if mem.get("ticker") else ""
        lines.append(
            f"[{mtype}{ticker_str}{age_str} | {conf}] {mem['content']}"
        )

    return "\n".join(lines) + "\n"
