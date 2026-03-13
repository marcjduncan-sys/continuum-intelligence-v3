"""
Price Driver Agent -- short-term price attribution for ASX stocks.

Three-pass LLM pipeline:
  Layer 0: Programmatic data gathering (Yahoo Finance, ASX, DuckDuckGo)
  Layer 1: Research pass (score and classify candidate drivers)
  Layer 2: Red-team pass (challenge conclusions)
  Layer 3: Final synthesis (merge into output JSON with prose)

Designed to run daily pre-market via cron, or on-demand per ticker.
"""

import asyncio
import json
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

import config
import db
from web_search import (
    fetch_yahoo_price,
    fetch_asx_announcements,
    web_search_news,
    fetch_earnings_news,
    web_search_macro,
    fetch_commodity_price,
    SECTOR_COMMODITY_MAP,
    _get_http_client,
    _parse_ddg_html,
    YAHOO_HEADERS,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Cache (in-memory, 24h TTL -- supplements PostgreSQL persistence)
# ---------------------------------------------------------------------------

_result_cache: dict[str, dict] = {}
_cache_timestamps: dict[str, float] = {}
_CACHE_TTL = 86400  # 24 hours


def get_cached_result(ticker: str) -> dict | None:
    ts = _cache_timestamps.get(ticker)
    if ts and (time.time() - ts) < _CACHE_TTL:
        return _result_cache.get(ticker)
    return None


def cache_result(ticker: str, result: dict) -> None:
    _result_cache[ticker] = result
    _cache_timestamps[ticker] = time.time()


# ---------------------------------------------------------------------------
# Sector ETF mapping (ASX sector ETFs for relative performance)
# ---------------------------------------------------------------------------

SECTOR_ETF_MAP: dict[str, str] = {
    "Materials": "XMJ.AX",
    "Mining": "XMJ.AX",
    "Gold": "XMJ.AX",
    "Energy": "XEJ.AX",
    "Financials": "XFJ.AX",
    "Banking": "XFJ.AX",
    "Healthcare": "XHJ.AX",
    "Technology": "XIJ.AX",
    "Software": "XIJ.AX",
    "Real Estate": "XPJ.AX",
    "Consumer Staples": "XSJ.AX",
    "Consumer Discretionary": "XDJ.AX",
    "Industrials": "XNJ.AX",
    "Defence": "XNJ.AX",
}

# Peer tickers per stock (top 3 closest comparables)
PEER_MAP: dict[str, list[str]] = {
    "BHP": ["RIO", "FMG", "S32.AX"],
    "RIO": ["BHP", "FMG", "S32.AX"],
    "FMG": ["BHP", "RIO", "MIN.AX"],
    "HRZ": ["NST", "EVN", "WAF"],
    "NST": ["EVN", "WAF", "HRZ"],
    "EVN": ["NST", "WAF", "GOR.AX"],
    "WAF": ["NST", "EVN", "RMS.AX"],
    "WDS": ["STO.AX", "BPT.AX", "KAR.AX"],
    "WOR": ["DOW.AX", "MND.AX", "SVC.AX"],
    "CBA": ["NAB", "WBC.AX", "ANZ.AX"],
    "NAB": ["CBA", "WBC.AX", "ANZ.AX"],
    "MQG": ["CBA", "NAB", "JHG.AX"],
    "CSL": ["PME", "SIG", "RMD.AX"],
    "SIG": ["API.AX", "CSL", "EBR.AX"],
    "PME": ["CSL", "RMD.AX", "PRO.AX"],
    "XRO": ["WTC", "OCL", "ALU.AX"],
    "WTC": ["XRO", "OCL", "TNE.AX"],
    "OCL": ["XRO", "WTC", "TNE.AX"],
    "DXS": ["GMG", "GPT.AX", "MGR.AX"],
    "GMG": ["DXS", "GPT.AX", "SCG.AX"],
    "WOW": ["COL.AX", "MTS.AX", "WES.AX"],
    "GYG": ["RFG", "DMP.AX", "CKF.AX"],
    "RFG": ["GYG", "DMP.AX", "CKF.AX"],
    "DRO": ["EOS.AX", "CEA.AX", "BRN.AX"],
    "ASB": ["RMS.AX", "CMM.AX", "AIS.AX"],
    "RMC": ["MYS.AX", "PTR.AX", "KAR.AX"],
}

# Sector-specific DDG site queries
SECTOR_SOURCES: dict[str, list[str]] = {
    "Mining": [
        "site:mining.com.au OR site:kitco.com",
        "site:smallcaps.com.au OR site:proactiveinvestors.com.au",
    ],
    "Gold": [
        "site:kitco.com OR site:mining.com.au",
        "site:smallcaps.com.au OR site:proactiveinvestors.com.au",
    ],
    "Energy": [
        "site:argusmedia.com OR site:energyquarterly.com",
        "site:proactiveinvestors.com.au",
    ],
    "Banking": [
        "site:tradingeconomics.com australia",
        "site:macrobusiness.com.au OR site:corelogic.com.au",
    ],
    "Financials": [
        "site:tradingeconomics.com australia",
        "site:macrobusiness.com.au",
    ],
    "Healthcare": [
        "site:pharmadispatch.com OR site:biopharmadispatch.com",
        "site:proactiveinvestors.com.au",
    ],
    "Technology": [
        "site:itnews.com.au OR site:crn.com.au",
        "site:proactiveinvestors.com.au",
    ],
    "Software": [
        "site:itnews.com.au OR site:crn.com.au",
        "site:proactiveinvestors.com.au",
    ],
    "Real Estate": [
        "site:corelogic.com.au OR site:tradingeconomics.com australia property",
        "site:proactiveinvestors.com.au",
    ],
    "Consumer Staples": [
        "site:tradingeconomics.com australia retail",
        "site:abs.gov.au retail trade",
    ],
    "Consumer Discretionary": [
        "site:tradingeconomics.com australia consumer",
        "site:abs.gov.au retail trade",
    ],
    "Defence": [
        "site:australiandefence.com.au OR site:janes.com",
        "site:proactiveinvestors.com.au",
    ],
    "Industrials": [
        "site:proactiveinvestors.com.au",
    ],
}


def _resolve_sector(ticker: str) -> str:
    """Resolve a ticker to its broad sector category."""
    sector_map = SECTOR_COMMODITY_MAP.get(ticker.upper(), {})
    label = sector_map.get("label", "")
    if "Gold" in label or "Silver" in label:
        return "Gold"
    if "Iron" in label or "Copper" in label or "Miner" in label:
        return "Mining"
    if "Oil" in label or "Gas" in label or "LNG" in label or "Energy" in label:
        return "Energy"
    if "Bank" in label:
        return "Banking"
    if "Investment" in label or "Asset" in label:
        return "Financials"
    if "Plasma" in label or "Pharma" in label or "Medical" in label:
        return "Healthcare"
    if "SaaS" in label or "Software" in label or "Logistics Software" in label:
        return "Software"
    if "REIT" in label or "Data Centre" in label:
        return "Real Estate"
    if "Grocery" in label or "Retailer" in label:
        return "Consumer Staples"
    if "QSR" in label or "Fast Food" in label or "Franchisor" in label:
        return "Consumer Discretionary"
    if "Defence" in label or "Counter-UAS" in label:
        return "Defence"
    return "Industrials"


# ---------------------------------------------------------------------------
# Layer 0: Data Gathering
# ---------------------------------------------------------------------------


async def _fetch_index_ohlcv() -> dict[str, Any]:
    """Fetch ASX200 index OHLCV for relative performance."""
    url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EAXJO"
    params = {"interval": "1d", "range": "1mo"}
    client = _get_http_client()
    try:
        resp = await client.get(url, params=params, headers=YAHOO_HEADERS)
        resp.raise_for_status()
        data = resp.json()
        result = data.get("chart", {}).get("result", [])
        if not result:
            return {"error": "No ASX200 data"}
        chart = result[0]
        timestamps = chart.get("timestamp", [])
        quotes = chart.get("indicators", {}).get("quote", [{}])[0]
        closes = quotes.get("close", [])
        volumes = quotes.get("volume", [])
        history = []
        for i in range(len(timestamps)):
            if i < len(closes) and closes[i] is not None:
                history.append({
                    "date": datetime.fromtimestamp(timestamps[i], tz=timezone.utc).strftime("%Y-%m-%d"),
                    "close": round(closes[i], 2),
                    "volume": volumes[i] if i < len(volumes) else 0,
                })
        return {"history": history}
    except Exception as e:
        logger.error("ASX200 index fetch error: %s", e)
        return {"error": str(e)}


async def _fetch_peer_prices(peers: list[str]) -> list[dict[str, Any]]:
    """Fetch 1-month OHLCV for peer tickers."""
    client = _get_http_client()
    results = []
    for peer in peers[:3]:
        yahoo_ticker = peer if ".AX" in peer else f"{peer}.AX"
        try:
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_ticker}"
            params = {"interval": "1d", "range": "1mo"}
            resp = await client.get(url, params=params, headers=YAHOO_HEADERS)
            resp.raise_for_status()
            data = resp.json()
            chart_result = data.get("chart", {}).get("result", [])
            if chart_result:
                meta = chart_result[0].get("meta", {})
                timestamps = chart_result[0].get("timestamp", [])
                closes = chart_result[0].get("indicators", {}).get("quote", [{}])[0].get("close", [])
                history = []
                for i in range(len(timestamps)):
                    if i < len(closes) and closes[i] is not None:
                        history.append({
                            "date": datetime.fromtimestamp(timestamps[i], tz=timezone.utc).strftime("%Y-%m-%d"),
                            "close": round(closes[i], 2),
                        })
                results.append({
                    "ticker": peer.replace(".AX", ""),
                    "price": round(meta.get("regularMarketPrice", 0), 2),
                    "history": history[-10:],
                })
        except Exception as e:
            logger.warning("Peer price fetch failed for %s: %s", peer, e)
    return results


async def _fetch_sector_etf(sector: str) -> dict[str, Any]:
    """Fetch sector ETF performance."""
    etf_ticker = SECTOR_ETF_MAP.get(sector, "XJO.AX")
    client = _get_http_client()
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{etf_ticker}"
        params = {"interval": "1d", "range": "1mo"}
        resp = await client.get(url, params=params, headers=YAHOO_HEADERS)
        resp.raise_for_status()
        data = resp.json()
        chart_result = data.get("chart", {}).get("result", [])
        if not chart_result:
            return {"error": "No sector ETF data", "etf": etf_ticker}
        timestamps = chart_result[0].get("timestamp", [])
        closes = chart_result[0].get("indicators", {}).get("quote", [{}])[0].get("close", [])
        history = []
        for i in range(len(timestamps)):
            if i < len(closes) and closes[i] is not None:
                history.append({
                    "date": datetime.fromtimestamp(timestamps[i], tz=timezone.utc).strftime("%Y-%m-%d"),
                    "close": round(closes[i], 2),
                })
        return {"etf": etf_ticker, "history": history}
    except Exception as e:
        logger.error("Sector ETF fetch error for %s: %s", etf_ticker, e)
        return {"error": str(e), "etf": etf_ticker}


async def _ddg_search(query: str, timeframe: str = "m", max_results: int = 5) -> list[dict[str, str]]:
    """Generic DuckDuckGo HTML search with rate-limit awareness."""
    client = _get_http_client()
    try:
        resp = await client.post(
            "https://html.duckduckgo.com/html/",
            data={"q": query, "df": timeframe},
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        if resp.status_code != 200:
            return []
        return _parse_ddg_html(resp.text, max_results)
    except Exception as e:
        logger.warning("DDG search error for '%s': %s", query[:60], e)
        return []


async def gather_driver_data(
    ticker: str,
    company_name: str,
    sector: str | None = None,
) -> dict[str, Any]:
    """
    Gather all data needed for price driver analysis.

    Runs 16 parallel tasks across Yahoo Finance, ASX, DuckDuckGo,
    and sector-specific sources.
    """
    resolved_sector = _resolve_sector(ticker)
    peers = PEER_MAP.get(ticker.upper(), [])

    # Build DDG queries
    year = datetime.now(timezone.utc).year

    # Tier 1: always-run queries
    ddg_broker = _ddg_search(
        f'"{ticker}" broker upgrade downgrade target price site:sharecafe.com.au OR site:fnarena.com OR site:marketindex.com.au',
        timeframe="m", max_results=8,
    )
    ddg_insider = _ddg_search(
        f'"{ticker}" ASX director interest "Appendix 3Y" OR "short interest" OR "ASIC short"',
        timeframe="m", max_results=5,
    )
    ddg_aus_media = _ddg_search(
        f'"{ticker}" site:afr.com.au OR site:themarketherald.com.au OR site:stockhead.com.au',
        timeframe="m", max_results=8,
    )
    ddg_social = _ddg_search(
        f'"{ticker}" site:hotcopper.com.au OR site:reddit.com',
        timeframe="m", max_results=8,
    )
    ddg_placement = _ddg_search(
        f'"{ticker}" ASX placement "capital raising" OR "block trade" OR SPP {year}',
        timeframe="m", max_results=5,
    )
    ddg_conference = _ddg_search(
        f'"{ticker}" conference presentation "investor day" OR "investor briefing" {year}',
        timeframe="m", max_results=5,
    )

    # Tier 2: sector-specific queries
    sector_queries = SECTOR_SOURCES.get(resolved_sector, [])
    sector_tasks = []
    for sq in sector_queries:
        sector_tasks.append(_ddg_search(f'"{ticker}" {sq}', timeframe="m", max_results=5))

    # Tier 3: macro (reuse existing)
    sector_config = SECTOR_COMMODITY_MAP.get(ticker.upper(), {})
    macro_queries = sector_config.get("macro_queries", [])
    commodity_specs = sector_config.get("commodities", [])

    # Build all parallel tasks
    tasks = [
        fetch_yahoo_price(ticker),                          # 0: stock OHLCV
        _fetch_index_ohlcv(),                               # 1: ASX200
        _fetch_sector_etf(resolved_sector),                 # 2: sector ETF
        _fetch_peer_prices(peers),                          # 3: peers
        fetch_asx_announcements(ticker, days=14),           # 4: ASX announcements
        web_search_news(company_name, ticker, num_results=10),  # 5: general news
        fetch_earnings_news(company_name, ticker, num_results=5),  # 6: earnings
        ddg_broker,                                         # 7: broker research
        ddg_insider,                                        # 8: insider/short
        ddg_aus_media,                                      # 9: Australian media
        ddg_social,                                         # 10: HotCopper/Reddit
        ddg_placement,                                      # 11: capital raising
        ddg_conference,                                     # 12: conferences
    ]
    # Add commodity tasks
    for c in commodity_specs:
        tasks.append(fetch_commodity_price(c["ticker"], c["name"]))
    commodity_offset = 13
    # Add macro task
    macro_task_idx = None
    if macro_queries:
        tasks.append(web_search_macro(macro_queries))
        macro_task_idx = len(tasks) - 1
    # Add sector-specific tasks
    sector_offset = len(tasks)
    tasks.extend(sector_tasks)

    results = await asyncio.gather(*tasks, return_exceptions=True)

    def _safe(idx, default=None):
        r = results[idx] if idx < len(results) else default
        return default if isinstance(r, Exception) else r

    # Unpack commodity results
    commodity_prices = []
    for i in range(len(commodity_specs)):
        r = _safe(commodity_offset + i)
        if isinstance(r, dict) and "error" not in r:
            commodity_prices.append(r)

    # Unpack sector-specific results
    sector_results = []
    for i in range(len(sector_tasks)):
        r = _safe(sector_offset + i, [])
        if isinstance(r, list):
            sector_results.extend(r)

    return {
        "price_data": _safe(0, {"error": "failed"}),
        "index_data": _safe(1, {"error": "failed"}),
        "sector_etf": _safe(2, {"error": "failed"}),
        "peer_prices": _safe(3, []),
        "announcements": _safe(4, []),
        "news": _safe(5, []),
        "earnings_news": _safe(6, []),
        "broker_research": _safe(7, []),
        "insider_short": _safe(8, []),
        "australian_media": _safe(9, []),
        "social_sentiment": _safe(10, []),
        "capital_raising": _safe(11, []),
        "conferences": _safe(12, []),
        "commodity_prices": commodity_prices,
        "macro_news": _safe(macro_task_idx, []) if macro_task_idx else [],
        "sector_specific": sector_results,
        "gathered_at": datetime.now(timezone.utc).isoformat(),
        "resolved_sector": resolved_sector,
        "peers": peers,
    }


# ---------------------------------------------------------------------------
# Layer 1: Research Pass
# ---------------------------------------------------------------------------

_RESEARCH_SYSTEM_PROMPT = """You are running the research pass for a stock price driver analysis.

Your task is to collect all evidence required to determine what most likely drove a stock's price move over the last 5-10 trading days.

You are not writing the final report yet. You are gathering, organising, and pressure-testing candidate explanations.

RESEARCH STEPS:
1. DEFINE PRICE ACTION: Analyse the OHLCV data provided. Calculate 1D, 3D, 5D, 10D performance. Identify biggest move days, biggest volume days, gap days. Calculate relative performance vs ASX200 index and sector ETF.
2. BUILD EVENT TIMELINE: From all sources provided, create a timestamped timeline of events from the last 14 calendar days.
3. SCAN COMPANY-SPECIFIC CANDIDATES: results release, guidance changes, contract wins/losses, corporate activity, capital raising, placement/block trade clues, legal/regulatory, insider activity, conference commentary.
4. SCAN SECTOR AND PEER CONTEXT: Did peers move similarly? Sector rerating? ETF/basket flow? Competitor announcements?
5. SCAN MACRO CONTEXT: rates, CPI, payrolls, PMIs, commodity prices, FX, geopolitical events, style rotations.
6. SCAN FLOW AND TECHNICAL CLUES: abnormal volume, large turnover without news, probable seller overhang, short covering, breakouts/breakdowns, MA crosses, support/resistance breaches.
7. SCAN SENTIMENT AND NARRATIVE: HotCopper threads, Reddit posts. For each, assess whether it led, followed, or amplified the move.
8. GENERATE CANDIDATE DRIVERS and assign categories: company_specific, sector_peer, macro, flow_microstructure, technical, sentiment_narrative.
9. SCORE EACH CANDIDATE using this grid:
   - timing_fit: 0-5
   - magnitude_fit: 0-5
   - directness: 0-5
   - corroboration: 0-5
   - alternative_explanation_risk: 0-5 (REVERSE scored: 5 = low risk of alternative)
   Total = sum of all five scores. 21-25 = very high confidence, 17-20 = high, 13-16 = moderate, 9-12 = low, 0-8 = weak/noise.
10. CLASSIFY each driver as: primary_driver, secondary_driver, amplifier, background_condition, or rejected.
11. IDENTIFY GAPS: missing evidence, weak evidence, conflicting evidence, unconfirmed but plausible hypotheses.

RANKING RULES:
- Highest-scoring direct catalyst usually becomes primary driver
- Sector or macro often becomes secondary unless the whole basket moved together
- Technicals and sentiment are usually amplifiers
- Unproven flow hypotheses should stay background unless evidence is unusually strong

CLAIM LABELLING: Every material claim must be labelled as Data, Calculation, Inference, or Speculation.

DO NOT WRITE THE FINAL NARRATIVE REPORT YET. Produce a structured evidence pack as JSON.

OUTPUT FORMAT: Return valid JSON with this structure:
{
  "price_action": { "change_1d_pct": 0, "change_3d_pct": 0, "change_5d_pct": 0, "change_10d_pct": 0, "vs_index_5d_pct": 0, "vs_sector_5d_pct": 0, "avg_volume_30d": 0, "avg_volume_10d": 0, "largest_volume_day": { "date": "", "volume": 0, "change_pct": 0 }, "largest_move_day": { "date": "", "change_pct": 0, "volume": 0 }, "gap_days": [], "volatility_notes": "" },
  "timeline": [ { "date": "", "event_type": "", "title": "", "summary": "", "importance": "high|medium|low" } ],
  "candidate_drivers": [ { "driver_id": "D1", "title": "", "category": "", "classification": "", "description": "", "timing_fit_score": 0, "magnitude_fit_score": 0, "directness_score": 0, "corroboration_score": 0, "alternative_explanation_risk_score": 0, "total_score": 0, "confidence": "", "timing_assessment": "", "magnitude_assessment": "", "peer_context": "", "flow_context": "", "sentiment_context": "", "counterarguments": "", "why_ranked_here": "", "claim_type": "", "supporting_evidence": [ { "source_type": "", "source_name": "", "date": "", "headline_or_label": "", "relevance_note": "", "credibility_rank": 1 } ] } ],
  "missing_evidence": [],
  "conflicting_evidence": []
}"""


# ---------------------------------------------------------------------------
# Layer 2: Red-Team Pass
# ---------------------------------------------------------------------------

_RED_TEAM_SYSTEM_PROMPT = """You are the red-team verifier for a stock price driver analysis.

Your job is to challenge the first-pass conclusion and try to disprove or weaken the proposed causal explanation for the stock's short-term move. You are not trying to be agreeable. You are trying to identify false causality, weak evidence, timing mismatch, narrative overreach, and ignored alternative explanations.

CHECKS TO PERFORM:
1. TIMING CHECK: Did the proposed driver actually occur before or during the move? Could the move have started before the supposed catalyst?
2. MAGNITUDE CHECK: Is the proposed catalyst large enough to explain the size of the move?
3. PEER CHECK: Did peers, sector ETFs, or thematic baskets move similarly? If yes, is the move really stock-specific?
4. FLOW CHECK: Could abnormal volume, block-trade activity, passive flow, short covering, or seller exhaustion explain more than the stated catalyst?
5. TECHNICAL CHECK: Could the move have been primarily technical rather than fundamental?
6. SENTIMENT CHECK: Did HotCopper/Reddit lead the move or simply react to it? Is chatter over-weighted?
7. SOURCE-QUALITY CHECK: Are the most important claims supported by high-quality sources? Has anonymous commentary been given too much weight?
8. MISSING-DRIVER CHECK: What plausible explanation has been ignored? (broker note, rating change, macro shock, peer earnings, commodity move, seller overhang clearing, rebalance, options activity)
9. CONFIDENCE CHECK: Is the stated confidence justified by the evidence quality?

OUTPUT FORMAT: Return valid JSON:
{
  "strongest_challenge": "",
  "strongest_alternative": "",
  "should_ranking_change": true|false,
  "ranking_change_detail": "",
  "should_confidence_change": true|false,
  "revised_confidence": "",
  "revised_classifications": [ { "driver_id": "", "new_classification": "", "reason": "" } ],
  "missing_drivers_identified": [ { "title": "", "category": "", "reason": "" } ],
  "overall_assessment": ""
}"""


# ---------------------------------------------------------------------------
# Layer 3: Final Synthesis
# ---------------------------------------------------------------------------

_SYNTHESIS_SYSTEM_PROMPT = """You are an elite stock price driver analyst producing the final report.

You will receive:
1. Raw gathered data (price, volume, news, announcements, etc.)
2. The research pass evidence pack (scored candidate drivers)
3. The red-team verifier output (challenges and adjustments)

Your task is to produce the FINAL price driver report.

PRIMARY QUESTION: "What most likely caused this stock's share-price move over the last 5-10 trading days?"

THINKING DISCIPLINE: For every candidate driver, assess timing fit, magnitude fit, directness, corroboration, alternative explanations, sector/peer context, flow/technical context, sentiment context, and whether the explanation is causal, correlated, or noise.

DO NOT: default to management narrative, assume correlation equals causation, overstate low-quality social chatter, use technicals as sole explanation where a stronger catalyst exists, invent seller identities or fund flows without evidence, give a valuation opinion unless directly relevant to the short-term move.

SOURCE PRIORITY (rank by credibility):
1. Exchange filings / official announcements / company disclosures
2. Reputable financial newswires and publications
3. Public market data and price/volume evidence
4. Broker/research material where available
5. Sector press and industry publications
6. Social media, forums, blogs
7. Low-quality reposts and anonymous commentary

CLAIM LABELLING: Every material claim must be labelled as Data, Calculation, Inference, or Speculation.

OUTPUT FORMAT: Return valid JSON matching this schema:
{
  "agent_metadata": { "agent_name": "stock_price_driver_agent", "version": "v1", "analysis_date": "", "ticker": "", "company_name": "", "exchange": "ASX" },
  "price_action_summary": { "price_change_1d_pct": 0, "price_change_3d_pct": 0, "price_change_5d_pct": 0, "price_change_10d_pct": 0, "relative_vs_index_5d_pct": 0, "relative_vs_sector_5d_pct": 0, "avg_daily_volume_30d": 0, "avg_daily_volume_10d": 0, "largest_volume_day": {}, "largest_move_day": {}, "gap_days": [], "volatility_notes": "" },
  "candidate_drivers": [],
  "ranked_conclusion": { "most_likely_primary_driver": "", "secondary_drivers": [], "amplifiers": [], "background_conditions": [], "rejected_explanations": [], "overall_confidence": "", "confidence_rationale": "" },
  "flow_and_technical_overlay": { "abnormal_volume": false, "seller_overhang_status": "", "short_covering_status": "", "technical_breaks": [], "flow_notes": "", "technical_notes": "" },
  "sentiment_overlay": { "retail_chatter_present": false, "hotcopper_activity": "", "reddit_activity": "", "sentiment_led_or_followed": "", "sentiment_notes": "" },
  "macro_sector_context": { "macro_events_relevant": [], "sector_events_relevant": [], "peer_moves_summary": "", "commodity_or_rate_context": "" },
  "timeline": [],
  "report_text": { "price_action_summary_paragraph": "", "primary_driver_paragraph": "", "secondary_drivers_paragraph": "", "flow_technical_paragraph": "", "sentiment_paragraph": "", "rejected_explanations_paragraph": "", "final_judgement_paragraph": "" },
  "change_my_mind": { "missing_evidence": [], "what_would_change_the_view": [] }
}

The report_text paragraphs must be:
- Brief but highly detailed prose
- Suitable for an investor or portfolio manager
- Reading like an event-driven hedge fund analyst explaining the move to an investment committee
- Using Australian English
- Never using em-dashes (use commas, semicolons, colons, or en-dashes instead)"""


# ---------------------------------------------------------------------------
# LLM call helper
# ---------------------------------------------------------------------------


def _call_llm(system_prompt: str, user_content: str, max_tokens: int = 8192) -> str:
    """Synchronous Claude call using the shared Anthropic client."""
    client = config.get_anthropic_client()
    response = client.messages.create(
        model=config.ANTHROPIC_MODEL,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    )
    return response.content[0].text


def _extract_json(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown code fences."""
    # Strip markdown code fences
    cleaned = re.sub(r"^```(?:json)?\s*\n?", "", text.strip())
    cleaned = re.sub(r"\n?```\s*$", "", cleaned)
    return json.loads(cleaned)


# ---------------------------------------------------------------------------
# Pipeline orchestrator
# ---------------------------------------------------------------------------


async def run_price_driver_analysis(
    ticker: str,
    company_name: str,
    sector: str | None = None,
    force: bool = False,
) -> dict:
    """
    Run the full price driver analysis pipeline for a ticker.

    Returns the final structured JSON report.
    """
    ticker = ticker.upper()

    # Check in-memory cache
    if not force:
        cached = get_cached_result(ticker)
        if cached:
            logger.info("Price driver cache hit for %s", ticker)
            return cached

        # Check DB cache
        db_result = await _load_from_db(ticker)
        if db_result:
            cache_result(ticker, db_result)
            return db_result

    logger.info("Starting price driver analysis for %s", ticker)

    # Layer 0: Data gathering
    gathered = await gather_driver_data(ticker, company_name, sector)

    # Build the user message with all gathered data
    user_data = json.dumps({
        "ticker": ticker,
        "company_name": company_name,
        "analysis_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "data": gathered,
    }, default=str)

    # Layer 1: Research pass
    logger.info("[%s] Running research pass", ticker)
    research_raw = _call_llm(_RESEARCH_SYSTEM_PROMPT, user_data, max_tokens=8192)
    try:
        research_result = _extract_json(research_raw)
    except json.JSONDecodeError:
        logger.error("[%s] Research pass returned invalid JSON", ticker)
        research_result = {"error": "invalid JSON", "raw": research_raw[:2000]}

    await asyncio.sleep(1)  # Rate-limit courtesy

    # Layer 2: Red-team pass
    logger.info("[%s] Running red-team pass", ticker)
    red_team_input = json.dumps({
        "ticker": ticker,
        "research_result": research_result,
        "raw_data_summary": {
            "price_data": gathered.get("price_data", {}),
            "peer_prices": gathered.get("peer_prices", []),
            "index_data": gathered.get("index_data", {}),
            "sector_etf": gathered.get("sector_etf", {}),
            "announcements": gathered.get("announcements", []),
        },
    }, default=str)
    red_team_raw = _call_llm(_RED_TEAM_SYSTEM_PROMPT, red_team_input, max_tokens=4096)
    try:
        red_team_result = _extract_json(red_team_raw)
    except json.JSONDecodeError:
        logger.error("[%s] Red-team pass returned invalid JSON", ticker)
        red_team_result = {"error": "invalid JSON", "raw": red_team_raw[:2000]}

    await asyncio.sleep(1)

    # Layer 3: Final synthesis
    logger.info("[%s] Running final synthesis", ticker)
    synthesis_input = json.dumps({
        "ticker": ticker,
        "company_name": company_name,
        "analysis_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "gathered_data": gathered,
        "research_pass": research_result,
        "red_team_pass": red_team_result,
    }, default=str)
    synthesis_raw = _call_llm(_SYNTHESIS_SYSTEM_PROMPT, synthesis_input, max_tokens=8192)
    try:
        final_result = _extract_json(synthesis_raw)
    except json.JSONDecodeError:
        logger.error("[%s] Synthesis pass returned invalid JSON", ticker)
        final_result = {
            "error": "synthesis_failed",
            "report_text": {"final_judgement_paragraph": "Analysis could not be completed due to synthesis error."},
        }

    # Store in cache and DB
    cache_result(ticker, final_result)
    await _save_to_db(ticker, final_result)

    logger.info("[%s] Price driver analysis complete", ticker)
    return final_result


# ---------------------------------------------------------------------------
# Batch scan (all tickers)
# ---------------------------------------------------------------------------


async def run_price_driver_scan() -> dict:
    """
    Run price driver analysis for all tickers with active research data.
    Sequential processing to respect rate limits.
    """
    from ingest import get_tickers

    tickers = get_tickers()
    logger.info("Price driver scan starting for %d tickers", len(tickers))

    results = {"scanned": 0, "succeeded": 0, "failed": 0, "errors": []}

    for ticker in tickers:
        results["scanned"] += 1
        try:
            # Load company name from research data
            import os
            research_path = os.path.join(config.PROJECT_ROOT, "data", "research", f"{ticker}.json")
            company_name = ticker
            if os.path.exists(research_path):
                with open(research_path, "r") as f:
                    rdata = json.load(f)
                    company_name = rdata.get("company", ticker)

            await run_price_driver_analysis(ticker, company_name, force=True)
            results["succeeded"] += 1
            logger.info("[%s] Price driver scan succeeded (%d/%d)", ticker, results["succeeded"], len(tickers))
        except Exception as e:
            results["failed"] += 1
            results["errors"].append({"ticker": ticker, "error": str(e)})
            logger.error("[%s] Price driver scan failed: %s", ticker, e)

        # Delay between tickers to avoid rate limits
        await asyncio.sleep(2)

    logger.info("Price driver scan complete: %d/%d succeeded", results["succeeded"], results["scanned"])
    return results


# ---------------------------------------------------------------------------
# Database persistence
# ---------------------------------------------------------------------------


async def _save_to_db(ticker: str, report: dict) -> None:
    """Save a price driver report to PostgreSQL."""
    pool = await db.get_pool()
    if not pool:
        return
    try:
        await pool.execute(
            """
            INSERT INTO price_driver_reports (ticker, report_json, analysis_date)
            VALUES ($1, $2::jsonb, $3)
            ON CONFLICT (ticker, analysis_date)
            DO UPDATE SET report_json = $2::jsonb, created_at = NOW(),
                          expires_at = NOW() + INTERVAL '48 hours'
            """,
            ticker,
            json.dumps(report, default=str),
            datetime.now(timezone.utc).date(),
        )
    except Exception as e:
        logger.error("Failed to save price driver report for %s: %s", ticker, e)


async def _load_from_db(ticker: str) -> dict | None:
    """Load the most recent non-expired price driver report from PostgreSQL."""
    pool = await db.get_pool()
    if not pool:
        return None
    try:
        row = await pool.fetchrow(
            """
            SELECT report_json FROM price_driver_reports
            WHERE ticker = $1 AND expires_at > NOW()
            ORDER BY analysis_date DESC
            LIMIT 1
            """,
            ticker,
        )
        if row:
            return json.loads(row["report_json"])
    except Exception as e:
        logger.error("Failed to load price driver report for %s: %s", ticker, e)
    return None


async def get_latest_report(ticker: str) -> dict | None:
    """Get the most recent price driver report (cache or DB)."""
    cached = get_cached_result(ticker)
    if cached:
        return cached
    db_result = await _load_from_db(ticker)
    if db_result:
        cache_result(ticker, db_result)
    return db_result


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


async def check_drivers_health() -> dict:
    """Check price driver agent availability."""
    health = {
        "status": "healthy",
        "anthropic_configured": bool(config.ANTHROPIC_API_KEY),
        "database_available": False,
    }
    pool = await db.get_pool()
    if pool:
        try:
            count = await pool.fetchval("SELECT COUNT(*) FROM price_driver_reports")
            health["database_available"] = True
            health["reports_stored"] = count
        except Exception:
            health["database_available"] = False
    if not config.ANTHROPIC_API_KEY:
        health["status"] = "error"
        health["error"] = "ANTHROPIC_API_KEY not configured"
    return health
