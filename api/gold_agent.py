"""
Gold companies agent -- headless NotebookLM corpus queries + Claude synthesis.

Requires env vars:
  NOTEBOOKLM_GOLD_NOTEBOOK_ID  -- NotebookLM notebook UUID
  NOTEBOOKLM_AUTH_JSON         -- Google cookie JSON (rotate every 1-2 weeks)
  ANTHROPIC_API_KEY            -- shared with the rest of the backend
"""

import asyncio
import json
import logging
from datetime import date

from notebooklm import NotebookLMClient

import config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Analytical dimensions (key, question template with {ticker} placeholder)
# ---------------------------------------------------------------------------

_QUERIES = [
    (
        "reserve_quality",
        "What is {ticker}'s JORC resource and reserve estimate? "
        "Include total resource and reserve tonnes, gold grade (g/t Au), "
        "category breakdown (Measured / Indicated / Inferred), and any "
        "stated reserve life or mine life in years.",
    ),
    (
        "cost_structure",
        "What is {ticker}'s all-in sustaining cost (AISC) per ounce? "
        "Include the most recently reported figure, any forward guidance, "
        "and the primary cost drivers cited by management.",
    ),
    (
        "production_profile",
        "What is {ticker}'s annual gold production in ounces? "
        "Include the most recent reported output, production guidance for the "
        "current financial year, and any stated growth trajectory or major "
        "project ramp-up.",
    ),
    (
        "balance_sheet",
        "What is {ticker}'s net cash or net debt position? "
        "Include the most recent figure (date and currency), gearing ratio "
        "if stated, major upcoming capex commitments, and any debt maturity "
        "profile or refinancing risk.",
    ),
    (
        "gold_price_sensitivity",
        "What is {ticker}'s sensitivity to gold price movements? "
        "Include any stated revenue, earnings, or AISC impact at different "
        "gold price scenarios. Report in the currency used by the company "
        "(AUD or USD per oz).",
    ),
    (
        "jurisdiction_risk",
        "Does {ticker} operate any non-Australian assets? "
        "Describe the jurisdiction(s), any royalty structures, government "
        "ownership requirements, sovereign demands, or regulatory changes "
        "affecting those operations.",
    ),
    (
        "catalysts",
        "What are the key upcoming catalysts for {ticker} in the next "
        "6 to 12 months? Include exploration results, feasibility studies, "
        "reserve updates, production reports, regulatory decisions, "
        "and any flagged M&A activity.",
    ),
]

# ---------------------------------------------------------------------------
# System prompt for Claude synthesis
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are a senior gold equities analyst producing research for the \
Continuum Intelligence platform.

## Content Standards (non-negotiable)

- Open every prose field with the single most material fact -- never \
with scene-setting or context.
- Distinguish fact from inference. Label transitions explicitly \
(e.g. "Inferred:" or "Based on management guidance:").
- No em dashes. Use en dashes for ranges or restructure sentences.
- Prohibited phrases: "it is important to note", "notably", "navigate", \
"headwinds", "tailwinds", "unlock value", "landscape" used as metaphor.
- Quantify every material claim. "Significant" without a number is noise.
- End monitoring_trigger with a specific, time-bound condition.
- Populate information_gaps with what is unknown and why it matters.

## skew_score Guidance

| Range | Interpretation |
|-------|---------------|
| 65-80 | Strong upside -- multiple quantified catalysts, low cost, strong \
balance sheet |
| 50-64 | Moderate upside -- thesis intact but execution risk or cost \
pressure present |
| 35-49 | Balanced -- material risks offset the opportunity; monitor closely |
| 20-34 | Moderate downside -- key thesis assumptions weakening |
| 5-19  | Strong downside -- cost blow-out, balance sheet stress, or reserve \
deterioration |

## CI v3 Data Contract

Return ONLY valid JSON matching this schema exactly. No prose before or \
after the JSON block.

{
  "ticker": "ASX code",
  "company_name": "string",
  "analysis_date": "ISO date",
  "sector": "gold",
  "skew_score": integer 5-80,
  "verdict": "single declarative sentence, most material fact first",
  "hypothesis": {
    "bull": "specific, quantified bull case",
    "bear": "specific, quantified bear case"
  },
  "key_metrics": {
    "aisc_per_oz": number or null,
    "production_koz_annual": number or null,
    "mine_life_years": number or null,
    "net_cash_debt_aud_m": number or null,
    "reserve_grade_gt": number or null
  },
  "evidence": [
    {
      "label": "string",
      "finding": "fact or inference -- labelled",
      "source": "document or data source"
    }
  ],
  "monitoring_trigger": "specific, time-bound condition to re-assess",
  "information_gaps": ["what is unknown and why it matters"],
  "corpus_sources_queried": ["questions asked of the corpus"]
}
"""

# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def run_gold_analysis(ticker: str) -> dict:
    """Run 7 NotebookLM corpus queries for ticker, then synthesise to CI v3 JSON."""
    notebook_id = config.NOTEBOOKLM_GOLD_NOTEBOOK_ID
    if not notebook_id:
        raise RuntimeError("NOTEBOOKLM_GOLD_NOTEBOOK_ID not configured")

    corpus = await _query_corpus(ticker, notebook_id)
    return await _synthesise(ticker, corpus)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _query_corpus(ticker: str, notebook_id: str) -> dict:
    """Open a NotebookLM client and run all 7 queries concurrently."""
    async with await NotebookLMClient.from_storage() as client:
        tasks = [
            client.chat.ask(notebook_id, query.format(ticker=ticker))
            for _, query in _QUERIES
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    corpus = {}
    for (key, _), result in zip(_QUERIES, results):
        if isinstance(result, Exception):
            logger.warning("NLM query '%s' failed for %s: %s", key, ticker, result)
            corpus[key] = f"(query failed: {result})"
        else:
            corpus[key] = result.answer

    return corpus


async def _synthesise(ticker: str, corpus: dict) -> dict:
    """Call Claude API to convert raw corpus answers into CI v3 JSON."""
    client = config.get_anthropic_client()

    corpus_block = "\n\n".join(
        f"### {key.upper().replace('_', ' ')}\n{answer}"
        for key, answer in corpus.items()
    )

    user_message = (
        f"Ticker: {ticker}\n"
        f"Analysis date: {date.today().isoformat()}\n\n"
        "The following is raw information extracted from the company's "
        "NotebookLM corpus. Synthesise it into CI v3 JSON.\n\n"
        f"{corpus_block}\n\n"
        "Return ONLY valid JSON. No markdown fences."
    )

    response = client.messages.create(
        model=config.ANTHROPIC_MODEL,
        max_tokens=4096,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    raw = response.content[0].text.strip()

    # Strip markdown code fences if Claude includes them
    if raw.startswith("```"):
        parts = raw.split("```")
        # parts[1] is the fenced content; strip leading "json\n" if present
        raw = parts[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    return json.loads(raw)
