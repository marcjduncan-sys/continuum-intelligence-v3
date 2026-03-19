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
_CACHE_TTL = 604800  # 7 days


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
    "Materials": "^AXMJ",
    "Mining": "^AXMJ",
    "Gold": "^AXMJ",
    "Energy": "^AXEJ",
    "Financials": "^AXFJ",
    "Banking": "^AXFJ",
    "Healthcare": "^AXHJ",
    "Technology": "^AXIJ",
    "Software": "^AXIJ",
    "Real Estate": "^AXPJ",
    "Consumer Staples": "^AXSJ",
    "Consumer Discretionary": "^AXDJ",
    "Industrials": "^AXNJ",
    "Defence": "^AXNJ",
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
    "MIN": ["BHP", "FMG", "PLS.AX"],
    "OBM": ["NST", "EVN", "WAF"],
    "REA": ["DHG.AX", "CAR.AX", "SEK.AX"],
    "SNX": ["XRO", "WTC", "OCL"],
    "STO": ["WDS", "BPT.AX", "KAR.AX"],
    "WIA": ["NST", "EVN", "ASB"],
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


def _compute_period_returns(stock_history: list[dict], index_history: list[dict]) -> dict:
    """Compute 2D, 5D, 10D percentage returns for stock vs ASX200 from OHLCV."""
    def _pct(history, days):
        if not history or len(history) < days + 1:
            return None
        latest = history[-1].get("close")
        prior = history[-(days + 1)].get("close")
        if latest is None or prior is None or prior == 0:
            return None
        return round((latest - prior) / prior * 100, 2)

    s2, s5, s10 = _pct(stock_history, 2), _pct(stock_history, 5), _pct(stock_history, 10)
    i2, i5, i10 = _pct(index_history, 2), _pct(index_history, 5), _pct(index_history, 10)

    def _rel(a, b):
        return round(a - b, 2) if a is not None and b is not None else None

    return {
        "price_change_2d_pct": s2, "price_change_5d_pct": s5, "price_change_10d_pct": s10,
        "asx200_change_2d_pct": i2, "asx200_change_5d_pct": i5, "asx200_change_10d_pct": i10,
        "relative_2d_pct": _rel(s2, i2), "relative_5d_pct": _rel(s5, i5), "relative_10d_pct": _rel(s10, i10),
    }


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
    ddg_broker_upgrades = _ddg_search(
        f'"{ticker}" upgrade overweight outperform buy "price target" site:fnarena.com OR site:sharecafe.com.au OR site:marketindex.com.au',
        timeframe="w", max_results=5,
    )
    ddg_broker_downgrades = _ddg_search(
        f'"{ticker}" downgrade underweight underperform sell "price target" site:fnarena.com OR site:sharecafe.com.au OR site:marketindex.com.au',
        timeframe="w", max_results=5,
    )
    ddg_broker_notes = _ddg_search(
        f'"{ticker}" broker note initiation coverage "price target" site:livewiremarkets.com OR site:marketindex.com.au',
        timeframe="w", max_results=5,
    )
    ddg_insider = _ddg_search(
        f'"{ticker}" ASX director interest "Appendix 3Y" OR "short interest" OR "ASIC short"',
        timeframe="m", max_results=5,
    )
    ddg_aus_media = _ddg_search(
        f'"{ticker}" site:afr.com.au OR site:themarketherald.com.au OR site:stockhead.com.au',
        timeframe="m", max_results=8,
    )
    ddg_hotcopper = _ddg_search(
        f'"{ticker}" site:hotcopper.com.au',
        timeframe="w", max_results=5,
    )
    ddg_reddit = _ddg_search(
        f'"{ticker}" site:reddit.com/r/ASX_Bets OR site:reddit.com/r/ausstocks',
        timeframe="w", max_results=5,
    )
    ddg_x_via_media = _ddg_search(
        f'"{ticker}" twitter OR "on X" site:stockhead.com.au OR site:themarketherald.com.au OR site:smallcaps.com.au',
        timeframe="w", max_results=5,
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
        ddg_broker_upgrades,                                # 7: broker upgrades
        ddg_broker_downgrades,                              # 8: broker downgrades
        ddg_broker_notes,                                   # 9: broker notes
        ddg_insider,                                        # 10: insider/short
        ddg_aus_media,                                      # 11: Australian media
        ddg_hotcopper,                                      # 12: HotCopper
        ddg_reddit,                                         # 13: Reddit
        ddg_x_via_media,                                    # 14: X via media
        ddg_placement,                                      # 15: capital raising
        ddg_conference,                                     # 16: conferences
    ]
    # Add commodity tasks
    for c in commodity_specs:
        tasks.append(fetch_commodity_price(c["ticker"], c["name"]))
    commodity_offset = 17
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

    # Compute period returns from OHLCV data
    _stock_hist = _safe(0, {}).get("price_history", []) if isinstance(_safe(0, {}), dict) else []
    _index_hist = _safe(1, {}).get("history", []) if isinstance(_safe(1, {}), dict) else []
    computed_returns = _compute_period_returns(_stock_hist, _index_hist)

    return {
        "price_data": _safe(0, {"error": "failed"}),
        "index_data": _safe(1, {"error": "failed"}),
        "sector_etf": _safe(2, {"error": "failed"}),
        "peer_prices": _safe(3, []),
        "announcements": _safe(4, []),
        "news": _safe(5, []),
        "earnings_news": _safe(6, []),
        "broker_upgrades": _safe(7, []),
        "broker_downgrades": _safe(8, []),
        "broker_notes": _safe(9, []),
        "insider_short": _safe(10, []),
        "australian_media": _safe(11, []),
        "hotcopper": _safe(12, []),
        "reddit": _safe(13, []),
        "x_via_media": _safe(14, []),
        "capital_raising": _safe(15, []),
        "conferences": _safe(16, []),
        "commodity_prices": commodity_prices,
        "macro_news": _safe(macro_task_idx, []) if macro_task_idx else [],
        "sector_specific": sector_results,
        "computed_returns": computed_returns,
        "gathered_at": datetime.now(timezone.utc).isoformat(),
        "resolved_sector": resolved_sector,
        "peers": peers,
    }


# ---------------------------------------------------------------------------
# Layer 1: Research Pass
# ---------------------------------------------------------------------------

_RESEARCH_SYSTEM_PROMPT = """You are conducting the evidence-gathering pass for a short-term stock price driver analysis.

Your goal is to build the strongest possible evidence pack explaining what most likely drove a stock's move over the last 5 to 10 trading days.

Do not write the final client note. Your job here is to gather, sort, challenge and rank candidate explanations.

Focus on six buckets:
1. company-specific catalysts (broker upgrades/downgrades are the HIGHEST PRIORITY signal -- a single broker action can move a mid-cap stock 5-10% in a session)
2. sector and peer sympathy
3. macro drivers
4. flow and microstructure
5. technical triggers
6. sentiment and narrative activity

For each candidate driver, assess:
- whether it clearly preceded the move
- whether it is large enough to explain the move
- whether it is stock-specific or broad-based
- whether price and volume behaviour support it
- whether source quality is strong enough
- whether a better competing explanation exists

Source hierarchy matters:
- official disclosures and exchange filings rank highest
- reputable financial news and market data rank next
- forums and social media rank lowest unless clearly leading a microcap move

Broker rating changes are the single most actionable near-term catalyst for ASX stocks. If the data contains any broker upgrade, downgrade, target price change, or initiation of coverage within the last 10 trading days, this MUST be assessed as a candidate primary driver regardless of other factors. Do not relegate it to secondary unless evidence clearly shows the price moved before the broker note was published.

Flow discipline matters:
- distinguish confirmed, probable, possible and speculative flow explanations

Sentiment discipline matters:
- decide whether social/media chatter led, followed, amplified, or was irrelevant

For each social channel (HotCopper, Reddit, X), determine:
- Did social activity spike BEFORE or AFTER the price move?
- Is discussion volume materially above normal for this stock?
- Is sentiment directionally aligned with the move?
Label each channel as: leading, lagging, amplifying, or irrelevant.

Return valid JSON only with:
- price action summary
- timeline
- ranked candidate drivers
- supporting evidence
- missing evidence
- conflicting evidence

Do not write like a client note yet. Build the evidence pack only."""


# ---------------------------------------------------------------------------
# Layer 2: Red-Team Pass
# ---------------------------------------------------------------------------

_RED_TEAM_SYSTEM_PROMPT = """You are the red-team reviewer for a stock price driver analysis.

Your job is to challenge the current conclusion and identify whether the proposed primary driver is actually the best explanation.

You are not here to be balanced. You are here to break weak causal claims.

Test the current view for:
- timing mismatch
- insufficient magnitude
- poor source quality
- sector or macro sympathy being mistaken for stock-specific news
- flow or technical explanations being underweighted
- message-board activity being overweighted
- ignored rival explanations

For each case, determine:
1. what is the strongest challenge to the current primary driver
2. what is the strongest alternative explanation
3. whether the ranking should change
4. whether confidence should be reduced or increased
5. what one-paragraph revised conclusion would be better, if any

Return valid JSON only:
{
  "strongest_challenge": "",
  "strongest_alternative": "",
  "ranking_should_change": true,
  "confidence_should_change": true,
  "revised_confidence": "",
  "revised_driver_order": [],
  "revised_conclusion_paragraph": "",
  "key_missing_evidence": []
}

Be direct, sceptical and evidence-led."""


# ---------------------------------------------------------------------------
# Layer 3: Final Synthesis
# ---------------------------------------------------------------------------

_CLIENT_WRITING_STANDARD = """
All client-facing output must read like a short market note prepared for a professional investor.

Required style:
- Lead with the conclusion
- Tight prose, not bullet lists
- 5 to 7 short paragraphs
- Commercial and sceptical tone
- Australian English
- No developer language
- No mention of prompts, layers, schemas, workflows or scoring models
- No generic company background
- No filler or repeated caveats
- Distinguish Data, Calculation, Inference and Speculation where material
- Sound like a strategist or PM writing to a client

The writing must not read like:
- another LLM's prompt output
- a dashboard export
- a coding note
- a UI field definition
"""

_SYNTHESIS_SYSTEM_PROMPT = """You are a senior event-driven equities analyst writing for a client.

Your task is to explain what most likely drove a stock's share-price movement over the last 5 to 10 trading days.

This is not a coding task, not a workflow summary, and not a UI field-generation exercise. Your output must read like a professional market note prepared for a client, portfolio manager, or investment committee.

Your core question is:
"What most likely caused this stock's move over the last 5 to 10 trading days?"

You will receive:
1. Raw gathered market and web data
2. A structured research pass identifying candidate drivers
3. A red-team pass challenging the initial conclusion

Your job is to produce a clear, concise, client-ready explanation of the move.

ANALYTICAL STANDARD

Approach this like a forensic event-driven analyst:
- identify the most likely primary cause
- distinguish it from secondary causes
- separate true drivers from amplifiers
- distinguish background conditions from causal triggers
- explicitly reject weak or inferior explanations

You must test each candidate explanation for:
- timing fit
- magnitude fit
- source quality
- stock-specificity versus sector/macro sympathy
- consistency with volume and trading behaviour
- whether a stronger competing explanation exists

SOURCE DISCIPLINE

Treat evidence in this order:
1. exchange filings, company announcements, official disclosures
2. reputable financial newswires and publications
3. price, volume, relative performance and trading data
4. broker and research references where available
5. sector press and conference commentary
6. forums, social media, blogs and podcasts

Do not give low-quality sources the same weight as primary evidence.

FLOW DISCIPLINE

Where flow or microstructure appears relevant, distinguish clearly between:
- confirmed
- probable
- possible
- speculative

Do not invent the identity of a seller, buyer, broker, fund, or short counterparty unless directly supported by evidence.

SOCIAL / SENTIMENT DISCIPLINE

Treat HotCopper, Reddit, X, StockTwits and similar channels as:
- potential leading indicators in small caps
- frequent amplifiers of an existing move
- often lagging reactions rather than causes

State clearly whether social chatter appears to have led, followed, or amplified the move.

WRITING STANDARD

Write in Australian English.
Write in concise, professional prose.
Write for a client, not for another model and not for a developer.

The note must:
- lead with the answer
- state the most likely cause first
- use tight, well-structured paragraphs
- avoid filler, scene-setting and generic company background
- sound commercial, precise and sceptical
- distinguish evidence from inference
- avoid jargon where plain English is better

Do not:
- mention the workflow, prompts, layers, JSON, schema, scoring engine, or internal process
- write like a dashboard export
- produce bullet spam in the body
- sound like a coder explaining a pipeline

CLAIM LABELLING

For material points, clearly indicate whether the point is:
- Data
- Calculation
- Inference
- Speculation

PRICE ACTION DATA: The price_action_summary percentage values (2D, 5D, 10D for both stock and ASX200) have been pre-computed from Yahoo Finance data and are provided in gathered_data.computed_returns. Copy these values EXACTLY into your price_action_summary output. Do not estimate or recalculate them.

FINAL OUTPUT FORMAT

Return valid JSON only, with this structure:

{
  "ticker": "string",
  "company_name": "string",
  "analysis_date": "YYYY-MM-DD",
  "primary_driver": "one sentence stating the most likely main cause",
  "confidence": "very_high | high | moderate | low",
  "driver_stack": {
    "primary": ["ordered list of 1-2 primary drivers"],
    "secondary": ["ordered list of secondary drivers"],
    "amplifiers": ["ordered list of amplifiers"],
    "background": ["ordered list of background conditions"],
    "rejected": ["ordered list of weaker explanations rejected"]
  },
  "report": {
    "title": "one-line market-note style title",
    "executive_summary": "120-180 word summary written for a client",
    "full_note": "client-ready prose note of roughly 350-700 words"
  },
  "price_action_summary": {
    "price_change_2d_pct": 0.0,
    "price_change_5d_pct": 0.0,
    "price_change_10d_pct": 0.0,
    "asx200_change_2d_pct": 0.0,
    "asx200_change_5d_pct": 0.0,
    "asx200_change_10d_pct": 0.0,
    "relative_2d_pct": 0.0,
    "relative_5d_pct": 0.0,
    "relative_10d_pct": 0.0
  },
  "evidence_quality": {
    "primary_evidence": "string",
    "secondary_evidence": "string",
    "key_gap": "string"
  },
  "change_my_mind": {
    "what_would_change_the_view": ["list of 2-4 concrete items"]
  },
  "broker_activity": {
    "recent_upgrades": ["Broker: OldRating -> NewRating, target $X -> $Y, date"],
    "recent_downgrades": ["same format as above"],
    "consensus_change": "string or null"
  },
  "social_signal": {
    "hotcopper_activity": "elevated | normal | quiet",
    "reddit_activity": "elevated | normal | quiet",
    "social_led_or_lagged": "led | lagged | amplified | irrelevant"
  }
}

STYLE RULES FOR report.full_note

The note must be written as 5 to 7 short paragraphs in continuous prose:

Paragraph 1:
State the move and the most likely cause immediately.

Paragraph 2:
Explain the strongest supporting evidence and why the timing fits.

Paragraph 3:
Explain secondary drivers and whether the move was stock-specific or part of a broader sector or macro move.

Paragraph 4:
Explain volume, flow, technicals or positioning only if relevant, and state whether these were causal or amplifying.

Paragraph 5:
Explain sentiment, message-board activity or media amplification only if relevant, and state whether it led or followed the move.

Paragraph 6:
State what was examined and rejected, and why it ranked lower.

Paragraph 7:
Conclude with the final judgement, confidence level, and what evidence would change the view.

The writing must feel like a short client note from a strong sell-side strategist or event-driven PM.

Return valid JSON only. No markdown fences. No prefatory text."""


# ---------------------------------------------------------------------------
# LLM call helper
# ---------------------------------------------------------------------------


def _call_llm_sync(system_prompt: str, user_content: str, max_tokens: int = 8192) -> str:
    """Synchronous Claude call using the shared Anthropic client."""
    client = config.get_anthropic_client()
    response = client.messages.create(
        model=config.ANTHROPIC_MODEL,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    )
    return response.content[0].text


async def _call_llm(system_prompt: str, user_content: str, max_tokens: int = 8192) -> str:
    """Async wrapper: runs the sync Anthropic call in a thread pool."""
    return await asyncio.to_thread(_call_llm_sync, system_prompt, user_content, max_tokens)


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
    research_raw = await _call_llm(_RESEARCH_SYSTEM_PROMPT, user_data, max_tokens=8192)
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
    red_team_raw = await _call_llm(_RED_TEAM_SYSTEM_PROMPT, red_team_input, max_tokens=4096)
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
    synthesis_raw = await _call_llm(_SYNTHESIS_SYSTEM_PROMPT, synthesis_input, max_tokens=8192)
    try:
        final_result = _extract_json(synthesis_raw)
    except json.JSONDecodeError:
        logger.error("[%s] Synthesis pass returned invalid JSON", ticker)
        final_result = {
            "error": "synthesis_failed",
            "report": {"executive_summary": "Analysis could not be completed due to a synthesis error.", "full_note": "", "title": ""},
        }

    # Inject programmatic returns -- overrides LLM estimates
    if "computed_returns" in gathered:
        if "price_action_summary" not in final_result:
            final_result["price_action_summary"] = {}
        final_result["price_action_summary"].update(gathered["computed_returns"])

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
                          expires_at = NOW() + INTERVAL '7 days'
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
