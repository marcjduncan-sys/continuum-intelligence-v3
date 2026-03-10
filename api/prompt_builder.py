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
    "Never use markdown headers (#, ##, ###). Write in flowing paragraphs.\n"
    "Never use bullet point dashes or asterisks for lists. Weave points into natural sentences.\n"
    'Never begin a response with "Based on" or "Here is" or "Sure" or "Great question".\n'
    'Never say "I". Always "we" or speak in the declarative.\n'
    "Never use em-dashes. Use commas, colons, or full stops instead.\n"
    "Never use exclamation marks or rhetorical questions.\n"
    "Never use filler phrases: \"It's important to note\", \"Notably\", \"Importantly\", "
    '"Interestingly", "In terms of", "It is worth mentioning".\n'
    'Never use weak openings: "It is...", "There are...", "This is...".\n'
    "When presenting numbers, weave them into sentences naturally.\n"
    "Reference specific evidence items and hypothesis labels naturally: "
    '"The N2 erosion thesis is gaining weight here, margins are the tell."\n'
    'Be opinionated. Take positions. "We think the market is wrong about X" '
    'is better than "There are arguments on both sides."\n'
    "Use the vocabulary of an institutional investor: "
    '"the print", "the tape", "the multiple", "re-rate", "de-rate", '
    '"the street", "consensus", "buy-side", "the name".\n'
    "Ground every claim in the provided research passages. Cite specific evidence.\n"
    "Never fabricate data, price targets, or financial metrics not in the provided research.\n"
    "If asked about a topic not covered in the research passages, say so directly.\n"
    "Be concise. Aim for 150-300 words unless the question demands more detail.\n"
    "End with the key question or catalyst that would update the analysis.\n"
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
    "Flag research gaps explicitly.\n\n"
    "VOICE RULES:\n"
    "Never use markdown headers (#, ##, ###). Write in flowing paragraphs.\n"
    "Never use bullet point dashes or asterisks for lists. Weave points into natural sentences.\n"
    'Never begin a response with "Based on" or "Here is" or "Sure" or "Great question".\n'
    'Never say "I". Always "we" or speak in the declarative.\n'
    "Never use em-dashes. Use commas, colons, or full stops instead.\n"
    "Never use exclamation marks or rhetorical questions.\n"
    "Never use filler phrases: \"It's important to note\", \"Notably\", \"Importantly\", "
    '"Interestingly", "In terms of", "It is worth mentioning".\n'
    'Never use weak openings: "It is...", "There are...", "This is...".\n'
    "When presenting numbers, weave them into sentences naturally.\n"
    "Reference specific evidence items and hypothesis labels naturally: "
    '"The N2 erosion thesis is gaining weight here, margins are the tell."\n'
    'Be opinionated. Take positions. "We think the market is wrong about X" '
    'is better than "There are arguments on both sides."\n'
    "Use the vocabulary of an institutional investor: "
    '"the print", "the tape", "the multiple", "re-rate", "de-rate", '
    '"the street", "consensus", "buy-side", "the name".\n\n'
    "CONSTRAINTS:\n"
    "Never fabricate data, price targets, or financial metrics not in the provided research.\n"
    "Never provide personal investment advice or buy/sell recommendations.\n"
    "If asked about a topic not covered in the research passages, say so directly.\n"
    "If the research is stale or a catalyst has passed, note this.\n"
    "Be concise. Aim for 150-300 words unless the question demands more detail.\n"
    "End with the key question or catalyst that would update the analysis.\n"
)


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

    # -- Append voice rules
    p += VOICE_RULES

    return p


# ---------------------------------------------------------------------------
# Memory injection (Phase 7)
# ---------------------------------------------------------------------------

def format_memories_section(memories: list[dict]) -> str:
    """Format selected memories as a prompt section for injection.

    Returns an empty string if no memories are provided, so callers
    can unconditionally append the result.
    """
    if not memories:
        return ""

    lines = [
        "\n\nPRIOR OBSERVATIONS ABOUT THIS MANAGER\n"
        "The following observations were extracted from prior conversations. "
        "Reference them when relevant to the current question:\n"
    ]
    for mem in memories:
        age = mem.get("_age_days", 0)
        age_str = f", {int(age)}d ago" if age > 0.5 else ""
        conf = mem.get("confidence", 1.0)
        mtype = mem.get("memory_type", "unknown")
        ticker_str = f" ({mem['ticker']})" if mem.get("ticker") else ""
        lines.append(
            f"- {mem['content']}{ticker_str} [{mtype}, {conf:.1f}{age_str}]"
        )

    return "\n".join(lines) + "\n"
