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
# Stage detection pre-query
# ---------------------------------------------------------------------------

_STAGE_QUERY = (
    "Is {ticker} a producing gold miner, a development-stage gold company, "
    "an exploration company, or a senior/mid-tier multi-asset gold producer? "
    "State the company stage in one word: producer, developer, explorer, or senior. "
    "Include the primary basis for this classification."
)

# ---------------------------------------------------------------------------
# 20 analytical dimensions
# ---------------------------------------------------------------------------

_QUERIES = [
    (
        "deposit_type_geology",
        "What is the deposit type for {ticker}'s primary gold asset(s)? "
        "Include orogenic, intrusion-related, epithermal, Carlin-style, refractory, "
        "or other classification. Describe deposit geometry: width, continuity, dip, "
        "depth, and any structural controls on mineralisation.",
    ),
    (
        "resource_reserve_quality",
        "What is {ticker}'s JORC resource and reserve estimate? "
        "Include total resource and reserve in Moz, gold grade (g/t Au) by category "
        "(Measured / Indicated / Inferred), stated reserve life in years, "
        "reserve conversion rate from M&I to reserve, and any grade control or "
        "dilution assumptions disclosed.",
    ),
    (
        "metallurgy_recovery",
        "What is {ticker}'s metallurgical profile and plant recovery? "
        "Include ore type (oxide / transitional / fresh / refractory), processing "
        "method (CIL, CIP, heap leach, BIOX, POX), stated plant recovery percentage "
        "by ore domain, any preg-robbing, sulphide, arsenic or carbonaceous issues, "
        "and recovery variance between ore domains.",
    ),
    (
        "mining_method_mineability",
        "What mining method does {ticker} use at its primary operation? "
        "Include open pit vs underground, specific method (long-hole, cut-and-fill, "
        "sublevel cave), strip ratio for open pit operations, geotechnical conditions, "
        "owner-operator vs contractor status, and fleet composition.",
    ),
    (
        "geotech_hydrology_infrastructure",
        "What are {ticker}'s geotechnical, hydrological, and infrastructure constraints? "
        "Include pit wall stability issues, ground conditions underground, water inflow "
        "rates, dewatering requirements, power source and cost, road and port access, "
        "tailings storage facility status, and any permitting or environmental offsets.",
    ),
    (
        "operating_reconciliation",
        "How does {ticker}'s mine production reconcile against the geological model? "
        "Include any disclosed reconciliation data (mined grade vs model grade vs plant "
        "grade), ore loss and dilution history, throughput vs nameplate capacity, "
        "any quarters where production or grade significantly missed guidance, "
        "and management explanation for variances.",
    ),
    (
        "cost_structure_breakdown",
        "What is {ticker}'s detailed cost structure? "
        "Include AISC per ounce (most recent reported and forward guidance), breakdown "
        "of mining cost, processing cost, site admin, sustaining capex per ounce, "
        "royalties, primary cost drivers, exposure to diesel/power/labour inflation, "
        "and any contractor vs owner-operator cost differential.",
    ),
    (
        "sustaining_growth_capex",
        "What is {ticker}'s capital expenditure profile? "
        "Distinguish sustaining capex from growth capex. Include initial capex for "
        "development projects (total and per annual ounce), capex per reserve ounce, "
        "build schedule and commissioning risk, infrastructure dependencies, "
        "study stage (scoping / PFS / DFS / operating), and historical capex accuracy.",
    ),
    (
        "development_schedule_permitting",
        "What is the development and permitting status for {ticker}'s key projects? "
        "Include critical path items, permitting jurisdiction and stage, "
        "environmental offsets required, first production timeline, any regulatory "
        "challenges or community opposition, and funding requirements before production.",
    ),
    (
        "balance_sheet_funding",
        "What is {ticker}'s balance sheet and funding position? "
        "Include net cash or net debt (date and currency), available liquidity, "
        "debt maturity profile, covenant headroom, funding gap analysis at "
        "US$2,200/oz gold, any streaming or royalty obligations, and planned "
        "equity or debt raises.",
    ),
    (
        "royalty_streaming_encumbrances",
        "What royalties, streams, or other production encumbrances apply to {ticker}? "
        "Include royalty rate and basis (NSR, NPI, gross revenue), any streaming "
        "agreements (gold stream volume and delivery price), government royalties, "
        "native title royalties, and the aggregate encumbrance as a percentage of "
        "revenue or production.",
    ),
    (
        "reserve_replacement_exploration",
        "What is {ticker}'s reserve replacement and exploration track record? "
        "Include reserve replacement ratio over the last 3 years, discovery cost per "
        "ounce, drill density and resource confidence progression, near-mine vs "
        "greenfield exploration split, mill fill potential from satellite deposits, "
        "and any recent material exploration results.",
    ),
    (
        "asset_portfolio_quality",
        "Describe {ticker}'s asset portfolio. "
        "Include all material assets by name, jurisdiction, ownership percentage, "
        "stage (operating / development / exploration), annual production contribution "
        "or resource size, and any assets under care and maintenance or held for sale. "
        "Identify the flagship asset and its contribution to group production.",
    ),
    (
        "management_track_record",
        "What is the track record of {ticker}'s management team and board? "
        "Include whether they have previously built or operated mines of this type "
        "and scale, history of guidance beats or misses over the past 8 quarters, "
        "capital allocation decisions (acquisitions, hedging, buybacks, equity raises), "
        "incentive structure, and any related-party or governance concerns.",
    ),
    (
        "jurisdiction_fiscal_regime",
        "What jurisdictions does {ticker} operate in and what are the fiscal terms? "
        "Include royalty rates, corporate tax rates, any windfall tax or royalty "
        "review risk, government ownership requirements, sovereign risk rating, "
        "community relations and social licence status, and any recent regulatory "
        "changes affecting operations.",
    ),
    (
        "peer_relative_valuation",
        "How does {ticker} compare to its ASX gold peers on key valuation metrics? "
        "Include any disclosed or derivable EV/oz reserve, EV/oz production, "
        "P/NAV, and FCF yield comparisons. Name specific peers used for comparison "
        "and identify whether {ticker} trades at a premium or discount and the "
        "primary reason for that differential.",
    ),
    (
        "asset_level_nav",
        "What is the stated or implied asset-level NAV for {ticker}? "
        "Include any broker or company NAV estimates, the gold price and discount rate "
        "assumptions used, P/NAV ratio at current market cap, sum-of-parts breakdown "
        "for multi-asset companies, and any dilution from options, convertible notes, "
        "or streaming agreements.",
    ),
    (
        "downside_failure_modes",
        "What are the primary ways the investment thesis for {ticker} could fail? "
        "Include: (1) the condition under which the reserve becomes uneconomic, "
        "(2) the operational risk most likely to cause a production or cost miss, "
        "(3) the balance sheet scenario that forces dilutive equity, "
        "(4) the geological or metallurgical outcome that would reset the thesis, "
        "and (5) any management or governance failure mode.",
    ),
    (
        "catalysts_value_inflection",
        "What are the key upcoming catalysts for {ticker} in the next 6-12 months? "
        "Include exploration results, reserve updates, feasibility studies, "
        "production reports, permitting decisions, M&A activity, and any specific "
        "value inflection points tied to project milestones or gold price levels.",
    ),
    (
        "accounting_quality",
        "What accounting or financial reporting quality issues exist for {ticker}? "
        "Include treatment of capitalised stripping and development, sustaining vs "
        "growth capex classification, inventory and stockpile accounting, hedge book "
        "treatment and mark-to-market, by-product credit quality, any one-off "
        "normalisation adjustments, and whether technical study assumptions align "
        "with quarterly reporting.",
    ),
]

# ---------------------------------------------------------------------------
# System prompt -- mining IC analyst persona
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are a mining investment committee analyst with the combined expertise of a \
chief geologist, mining engineer, metallurgist, mine builder, CFO, and \
top-ranked gold equities analyst.

## Analytical Mandate

Evaluate the asset before the company, and the company before the stock. \
Prioritise orebody quality, recovery, mineability, reconciliation, capital \
intensity, financing risk, and valuation. For every bullish point, explicitly \
test the operational, geological, or financial condition required for it to be \
true. Distinguish clearly between producer, developer, and explorer frameworks. \
Where the corpus is silent on a critical dimension, state this explicitly and \
reduce the relevant sub-score.

## Contradiction Engine

For every material claim in the corpus, test:
- Does recovery match the disclosed metallurgy?
- Is the strip ratio consistent with the stated reserve economics?
- Has grade reconciled to model -- or has dilution been understated?
- Is the capex estimate credible versus comparable builds?
- Does management guidance history support the current production and cost outlook?
- Is the reserve economic at a 15% lower gold price?

Populate technical_red_flags with any contradictions or inconsistencies found. \
If none are found, state "No contradictions identified in corpus."

## Sub-Score Calibration (0-25 each)

- geology: orebody quality, grade, continuity, reserve confidence, metallurgy
- engineering: mining method fitness, reconciliation, throughput, cost durability
- financial: balance sheet, funding adequacy, valuation, FCF, capex discipline
- management: track record, guidance accuracy, capital allocation, jurisdiction quality

Sum the four sub-scores to derive composite_score (0-100). \
Derive skew_score from composite_score using this table:

| composite_score | skew_score |
|----------------|-----------|
| 70-100 | 65-80 |
| 50-69  | 50-64 |
| 30-49  | 35-49 |
| 15-29  | 20-34 |
| 0-14   | 5-19  |

## Stage-Specific Weighting

Producer: weight operating_reconciliation, cost_structure, reserve_replacement heavily.
Developer: weight capex_credibility, permitting_risk, funding_gap, study_quality heavily.
Explorer: weight discovery_probability, resource_confidence, funding_runway heavily.
Senior/multi-asset: weight portfolio_quality, per-share metrics, capital_allocation heavily.

## Content Standards

- Open every prose field with the single most material fact -- never scene-setting.
- Distinguish fact from inference. Label transitions ("Inferred:", "Based on guidance:").
- No em dashes. Use en dashes for ranges or restructure sentences.
- Prohibited phrases: "it is important to note", "notably", "navigate", \
"headwinds", "tailwinds", "unlock value", "landscape" as metaphor.
- Quantify every material claim. "Significant" without a number is noise.
- what_must_be_true: state the 3-5 conditions the bull case requires -- \
geological, operational, financial, and macro.
- failure_modes: name 3-5 specific failure paths, not generic risks.
- monitoring_trigger: end with a specific, time-bound condition.
- information_gaps: state what is unknown and why it matters to the thesis.

## Output Schema

Return ONLY valid JSON matching this schema exactly. No prose before or after. \
No markdown fences.

{
  "ticker": "ASX code",
  "company_name": "string",
  "analysis_date": "ISO date",
  "sector": "gold",
  "company_stage": "producer | developer | explorer | senior",
  "sub_scores": {
    "geology": integer 0-25,
    "engineering": integer 0-25,
    "financial": integer 0-25,
    "management": integer 0-25
  },
  "composite_score": integer 0-100,
  "skew_score": integer 5-80,
  "verdict": "single declarative sentence, most material fact first",
  "hypothesis": {
    "bull": "specific, quantified bull case in 2-3 sentences",
    "bear": "specific, quantified bear case in 2-3 sentences"
  },
  "asset_summary": [
    {
      "name": "string",
      "jurisdiction": "string",
      "stage": "operating | development | exploration",
      "ownership_pct": number or null,
      "deposit_type": "string",
      "mining_method": "string or null"
    }
  ],
  "technical": {
    "deposit_type": "string",
    "mining_method": "string",
    "metallurgy": "string",
    "plant_recovery_pct": number or null,
    "reserve_conversion_risk": "low | medium | high | unknown",
    "reconciliation_quality": "strong | acceptable | poor | unknown",
    "geotechnical_notes": "string or null"
  },
  "key_metrics": {
    "aisc_per_oz": number or null,
    "aisc_currency": "AUD | USD",
    "production_koz_annual": number or null,
    "mine_life_years": number or null,
    "net_cash_debt_aud_m": number or null,
    "reserve_grade_gt": number or null,
    "resource_moz": number or null,
    "reserve_moz": number or null,
    "capex_sustaining_aud_m": number or null,
    "fcf_yield_spot_pct": number or null
  },
  "valuation": {
    "ev_per_reserve_oz_usd": number or null,
    "ev_per_production_oz_usd": number or null,
    "p_nav": number or null,
    "fcf_yield_spot_pct": number or null,
    "peer_premium_discount": "premium | discount | in-line | unknown",
    "notes": "string"
  },
  "sensitivities": [
    {
      "variable": "string",
      "scenario": "string",
      "impact": "string"
    }
  ],
  "failure_modes": ["string -- specific, not generic"],
  "technical_red_flags": ["string -- contradiction or inconsistency, or 'No contradictions identified in corpus'"],
  "what_must_be_true": ["string -- condition required for bull case"],
  "management_assessment": {
    "track_record": "strong | adequate | weak | insufficient data",
    "guidance_accuracy": "accurate | mixed | poor | insufficient data",
    "capital_allocation": "disciplined | mixed | poor | insufficient data",
    "notes": "string"
  },
  "evidence": [
    {
      "label": "string",
      "finding": "fact or inference -- labelled",
      "source": "document or data source"
    }
  ],
  "monitoring_trigger": "specific, time-bound condition to re-assess",
  "information_gaps": ["what is unknown and why it matters to the thesis"],
  "corpus_sources_queried": ["dimension queried"]
}
"""

# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def run_gold_analysis(ticker: str) -> dict:
    """Run 20 NotebookLM corpus queries for ticker, then synthesise to CI v3 JSON."""
    notebook_id = config.NOTEBOOKLM_GOLD_NOTEBOOK_ID
    if not notebook_id:
        raise RuntimeError("NOTEBOOKLM_GOLD_NOTEBOOK_ID not configured")

    corpus = await _query_corpus(ticker, notebook_id)
    return await _synthesise(ticker, corpus)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


_NLM_BATCH_SIZE = 7  # concurrent queries per batch -- matches original implementation limit


async def _query_corpus(ticker: str, notebook_id: str) -> dict:
    """Open a NotebookLM client and run queries in batches to avoid session overload."""
    all_queries = [("stage_detection", _STAGE_QUERY)] + list(_QUERIES)

    corpus = {}
    async with await NotebookLMClient.from_storage() as client:
        for batch_start in range(0, len(all_queries), _NLM_BATCH_SIZE):
            batch = all_queries[batch_start : batch_start + _NLM_BATCH_SIZE]
            tasks = [
                client.chat.ask(notebook_id, query.format(ticker=ticker))
                for _, query in batch
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for (key, _), result in zip(batch, results):
                if isinstance(result, Exception):
                    logger.warning("NLM query '%s' failed for %s: %s", key, ticker, result)
                    corpus[key] = f"(query failed: {result})"
                else:
                    corpus[key] = result.answer
            # Brief pause between batches to avoid NotebookLM rate limiting
            if batch_start + _NLM_BATCH_SIZE < len(all_queries):
                await asyncio.sleep(2)

    return corpus


async def _synthesise(ticker: str, corpus: dict) -> dict:
    """Call Claude to convert raw corpus answers into CI v3 JSON."""
    client = config.get_anthropic_client()

    corpus_block = "\n\n".join(
        f"### {key.upper().replace('_', ' ')}\n{answer}"
        for key, answer in corpus.items()
    )

    user_message = (
        f"Ticker: {ticker}\n"
        f"Analysis date: {date.today().isoformat()}\n\n"
        "The following is raw information extracted from the company's "
        "NotebookLM corpus across 20 analytical dimensions. "
        "Synthesise it into CI v3 JSON using the mining IC analyst framework.\n\n"
        f"{corpus_block}\n\n"
        "Return ONLY valid JSON. No markdown fences."
    )

    response = client.messages.create(
        model=config.ANTHROPIC_MODEL,
        max_tokens=8192,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    raw = response.content[0].text.strip()

    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    return json.loads(raw)
