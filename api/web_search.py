"""
Web search and data gathering module for stock refresh.

Provides:
- Yahoo Finance price data (free, delayed 15-20 min)
- ASX announcements via RSS
- News headlines via DuckDuckGo search
"""

import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from xml.etree import ElementTree

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Sector → commodity / macro mapping for all 21 ASX tickers
# ---------------------------------------------------------------------------

SECTOR_COMMODITY_MAP: dict[str, dict] = {
    # === Materials / Mining ===
    "BHP": {
        "label": "Iron Ore & Copper Miner",
        "commodities": [
            {"ticker": "HG=F", "name": "Copper"},
            {"ticker": "GC=F", "name": "Gold"},
        ],
        "macro_queries": [
            "iron ore price China steel demand",
            "copper price outlook global mining",
        ],
    },
    "FMG": {
        "label": "Iron Ore Miner & Green Energy",
        "commodities": [
            {"ticker": "HG=F", "name": "Copper"},
        ],
        "macro_queries": [
            "iron ore price China stimulus steel",
            "green hydrogen energy transition",
        ],
    },
    "RIO": {
        "label": "Diversified Miner (Iron Ore, Aluminium, Copper)",
        "commodities": [
            {"ticker": "HG=F", "name": "Copper"},
            {"ticker": "GC=F", "name": "Gold"},
        ],
        "macro_queries": [
            "iron ore price China demand",
            "aluminium copper commodity outlook",
        ],
    },
    "HRZ": {
        "label": "Gold Miner",
        "commodities": [
            {"ticker": "GC=F", "name": "Gold"},
            {"ticker": "SI=F", "name": "Silver"},
        ],
        "macro_queries": [
            "gold price outlook safe haven",
            "gold mining costs production",
        ],
    },
    # === Energy ===
    "WDS": {
        "label": "Oil & Gas / LNG Producer",
        "commodities": [
            {"ticker": "BZ=F", "name": "Brent Crude"},
            {"ticker": "NG=F", "name": "Natural Gas"},
        ],
        "macro_queries": [
            "oil price OPEC geopolitical supply",
            "LNG demand Asia energy",
        ],
    },
    "WOR": {
        "label": "Energy Engineering Services",
        "commodities": [
            {"ticker": "BZ=F", "name": "Brent Crude"},
            {"ticker": "NG=F", "name": "Natural Gas"},
        ],
        "macro_queries": [
            "oil gas capex energy services outlook",
            "energy transition engineering investment",
        ],
    },
    # === Financials / Banking ===
    "CBA": {
        "label": "Retail & Business Bank",
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "RBA interest rate decision Australia",
            "Australia housing market mortgage lending",
        ],
    },
    "NAB": {
        "label": "Business Bank",
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "RBA interest rate decision Australia",
            "Australia business lending credit growth",
        ],
    },
    "MQG": {
        "label": "Investment Bank & Asset Manager",
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
            {"ticker": "GC=F", "name": "Gold"},
        ],
        "macro_queries": [
            "global capital markets M&A outlook",
            "infrastructure investment private credit",
        ],
    },
    # === Healthcare ===
    "CSL": {
        "label": "Plasma & Biotherapeutics",
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "plasma collection immunoglobulin demand",
            "biopharma R&D pipeline FDA approvals",
        ],
    },
    "SIG": {
        "label": "Pharmaceutical Distribution & Retail Pharmacy",
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "pharmacy distribution PBS Australia",
            "healthcare spending pharmaceutical supply chain",
        ],
    },
    "PME": {
        "label": "Medical Imaging IT",
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "medical imaging AI healthcare technology",
            "hospital IT spending radiology",
        ],
    },
    # === Technology / Software ===
    "XRO": {
        "label": "Cloud Accounting SaaS",
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "cloud SaaS spending small business outlook",
            "fintech accounting software market",
        ],
    },
    "WTC": {
        "label": "Logistics Software",
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
            {"ticker": "BZ=F", "name": "Brent Crude"},
        ],
        "macro_queries": [
            "global logistics supply chain technology",
            "freight shipping volumes trade outlook",
        ],
    },
    "OCL": {
        "label": "Enterprise Software",
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "enterprise software government IT spending",
            "digital transformation public sector",
        ],
    },
    # === Real Estate ===
    "DXS": {
        "label": "Office & Industrial REIT",
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "Australia office vacancy commercial property",
            "RBA interest rate REIT outlook",
        ],
    },
    "GMG": {
        "label": "Industrial & Data Centre REIT",
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "data centre demand AI infrastructure investment",
            "industrial logistics property global",
        ],
    },
    # === Consumer ===
    "WOW": {
        "label": "Grocery Retailer",
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "Australia consumer spending grocery inflation",
            "food price CPI Australia retail",
        ],
    },
    "GYG": {
        "label": "QSR / Fast Food",
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "quick service restaurant consumer spending Australia",
            "fast food industry growth QSR",
        ],
    },
    "RFG": {
        "label": "QSR Franchisor",
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "franchise food retail Australia consumer",
            "quick service restaurant market outlook",
        ],
    },
    # === Defence ===
    "DRO": {
        "label": "Counter-UAS Defence Technology",
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "defence spending NATO AUKUS military budget",
            "counter drone UAS military technology conflict",
        ],
    },
}


# Shared async HTTP client
_http_client: httpx.AsyncClient | None = None

YAHOO_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=15.0)
    return _http_client


# ---------------------------------------------------------------------------
# Yahoo Finance — price + chart data
# ---------------------------------------------------------------------------

async def fetch_yahoo_price(ticker: str) -> dict[str, Any]:
    """
    Fetch current price, change, volume, and 52-week range from Yahoo Finance.

    Parameters
    ----------
    ticker : str
        ASX ticker code (e.g. 'WOW', 'BHP').

    Returns
    -------
    dict with keys: price, change, change_pct, volume, high_52w, low_52w,
                    market_cap, currency, price_history (last 90 days).
    """
    yahoo_ticker = f"{ticker}.AX"
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_ticker}"
    params = {"interval": "1d", "range": "1y"}

    client = _get_http_client()
    try:
        resp = await client.get(url, params=params, headers=YAHOO_HEADERS)
        resp.raise_for_status()
        data = resp.json()

        result = data.get("chart", {}).get("result", [])
        if not result:
            logger.warning(f"No Yahoo data for {ticker}")
            return {"error": f"No data for {ticker}"}

        chart = result[0]
        meta = chart.get("meta", {})
        timestamps = chart.get("timestamp", [])
        closes = chart.get("indicators", {}).get("quote", [{}])[0].get("close", [])

        # Current price
        price = meta.get("regularMarketPrice", 0)
        prev_close = meta.get("previousClose") or meta.get("chartPreviousClose", 0)
        change = round(price - prev_close, 4) if prev_close else 0
        change_pct = round((change / prev_close) * 100, 2) if prev_close else 0

        # 52-week range from price history
        valid_closes = [c for c in closes if c is not None]
        high_52w = max(valid_closes) if valid_closes else price
        low_52w = min(valid_closes) if valid_closes else price

        # Last 90 days of price history for sparkline
        price_history = []
        cutoff_90d = len(timestamps) - 90
        for i in range(max(0, cutoff_90d), len(timestamps)):
            if i < len(closes) and closes[i] is not None:
                price_history.append({
                    "date": datetime.fromtimestamp(timestamps[i], tz=timezone.utc).strftime("%Y-%m-%d"),
                    "close": round(closes[i], 2),
                })

        return {
            "price": round(price, 2),
            "change": round(change, 2),
            "change_pct": change_pct,
            "volume": meta.get("regularMarketVolume", 0),
            "high_52w": round(high_52w, 2),
            "low_52w": round(low_52w, 2),
            "market_cap": meta.get("marketCap"),
            "currency": {"AUD": "A$", "USD": "US$", "GBP": "£", "EUR": "€"}.get(meta.get("currency", "AUD"), meta.get("currency", "A$")),
            "price_history": price_history,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as e:
        logger.error(f"Yahoo Finance error for {ticker}: {e}")
        return {"error": str(e)}


# ---------------------------------------------------------------------------
# Commodity / FX price — lightweight Yahoo Finance fetch
# ---------------------------------------------------------------------------

async def fetch_commodity_price(commodity_ticker: str, name: str) -> dict[str, Any]:
    """
    Fetch current price and daily change for a commodity or FX future.

    Uses the same Yahoo Finance endpoint as stock prices but without the
    .AX suffix and with a shorter range (1 month).

    Parameters
    ----------
    commodity_ticker : str
        Yahoo Finance ticker (e.g. 'BZ=F', 'GC=F', 'AUDUSD=X').
    name : str
        Human-readable name (e.g. 'Brent Crude', 'Gold').

    Returns
    -------
    dict with keys: name, ticker, price, change_pct, currency.
    """
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{commodity_ticker}"
    params = {"interval": "1d", "range": "1mo"}

    client = _get_http_client()
    try:
        resp = await client.get(url, params=params, headers=YAHOO_HEADERS)
        resp.raise_for_status()
        data = resp.json()

        result = data.get("chart", {}).get("result", [])
        if not result:
            return {"name": name, "ticker": commodity_ticker, "error": "No data"}

        meta = result[0].get("meta", {})
        price = meta.get("regularMarketPrice", 0)
        prev_close = meta.get("previousClose") or meta.get("chartPreviousClose", 0)
        change = round(price - prev_close, 4) if prev_close else 0
        change_pct = round((change / prev_close) * 100, 2) if prev_close else 0

        currency_code = meta.get("currency", "USD")
        currency_sym = {"USD": "US$", "AUD": "A$", "GBP": "£", "EUR": "€"}.get(
            currency_code, currency_code
        )

        return {
            "name": name,
            "ticker": commodity_ticker,
            "price": round(price, 2),
            "change_pct": change_pct,
            "currency": currency_sym,
        }

    except Exception as e:
        logger.error(f"Commodity price error for {commodity_ticker}: {e}")
        return {"name": name, "ticker": commodity_ticker, "error": str(e)}


# ---------------------------------------------------------------------------
# ASX Announcements — RSS feed
# ---------------------------------------------------------------------------

async def fetch_asx_announcements(ticker: str, days: int = 30) -> list[dict[str, Any]]:
    """
    Fetch recent ASX announcements for a ticker.

    Uses the ASX company announcements page. Falls back to empty list
    if the feed is unavailable.
    """
    # ASX announcements page (HTML scrape of recent announcements)
    url = f"https://www.asx.com.au/asx/1/company/{ticker}/announcements"
    params = {"count": 20, "market_sensitive": "false"}

    client = _get_http_client()
    try:
        resp = await client.get(url, params=params, headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
        })

        if resp.status_code != 200:
            logger.warning(f"ASX announcements returned {resp.status_code} for {ticker}")
            return []

        data = resp.json()
        announcements = []
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        for item in data.get("data", []):
            try:
                ann_date = datetime.fromisoformat(
                    item.get("document_date", "").replace("Z", "+00:00")
                )
            except (ValueError, TypeError):
                continue

            if ann_date < cutoff:
                continue

            announcements.append({
                "date": ann_date.strftime("%Y-%m-%d"),
                "title": item.get("header", ""),
                "url": item.get("url", ""),
                "market_sensitive": item.get("market_sensitive", False),
                "pages": item.get("number_of_pages", 0),
            })

        return announcements

    except Exception as e:
        logger.error(f"ASX announcements error for {ticker}: {e}")
        return []


# ---------------------------------------------------------------------------
# News search — DuckDuckGo HTML scrape (no API key needed)
# ---------------------------------------------------------------------------

async def web_search_news(
    company_name: str,
    ticker: str,
    num_results: int = 10,
) -> list[dict[str, str]]:
    """
    Search for recent news about a company using DuckDuckGo.

    Parameters
    ----------
    company_name : str
        Full company name (e.g. 'Woolworths Group').
    ticker : str
        ASX ticker code.
    num_results : int
        Target number of results.

    Returns
    -------
    list of dicts with keys: title, url, snippet, source.
    """
    query = f"{company_name} {ticker} ASX news"
    url = "https://html.duckduckgo.com/html/"

    client = _get_http_client()
    try:
        resp = await client.post(
            url,
            data={"q": query, "df": "m"},  # df=m: past month
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )

        if resp.status_code != 200:
            logger.warning(f"DuckDuckGo search returned {resp.status_code}")
            return []

        html = resp.text
        results = _parse_ddg_html(html, num_results)
        return results

    except Exception as e:
        logger.error(f"News search error for {ticker}: {e}")
        return []


def _parse_ddg_html(html: str, max_results: int) -> list[dict[str, str]]:
    """Parse DuckDuckGo HTML results page into structured results."""
    results = []

    # Extract result blocks using regex (avoids BeautifulSoup dependency)
    # DuckDuckGo HTML results have class="result__a" for links
    link_pattern = re.compile(
        r'class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)</a>', re.DOTALL
    )
    snippet_pattern = re.compile(
        r'class="result__snippet"[^>]*>(.*?)</(?:a|span|div)', re.DOTALL
    )

    links = link_pattern.findall(html)
    snippets = snippet_pattern.findall(html)

    for i, (url, title) in enumerate(links[:max_results]):
        # Clean HTML tags from title and snippet
        clean_title = re.sub(r'<[^>]+>', '', title).strip()
        clean_snippet = re.sub(r'<[^>]+>', '', snippets[i]).strip() if i < len(snippets) else ""

        # Extract domain as source
        source_match = re.search(r'https?://(?:www\.)?([^/]+)', url)
        source = source_match.group(1) if source_match else ""

        if clean_title:
            results.append({
                "title": clean_title,
                "url": url,
                "snippet": clean_snippet,
                "source": source,
            })

    return results


# ---------------------------------------------------------------------------
# Macro / geopolitical news search
# ---------------------------------------------------------------------------

async def web_search_macro(
    queries: list[str],
    num_results_per_query: int = 5,
) -> list[dict[str, str]]:
    """
    Search for macro/geopolitical news relevant to a stock's sector.

    Runs each query against DuckDuckGo (past week) and deduplicates
    results by URL.

    Parameters
    ----------
    queries : list[str]
        Sector-specific search queries from SECTOR_COMMODITY_MAP.
    num_results_per_query : int
        Target results per query.

    Returns
    -------
    list of dicts with keys: title, url, snippet, source, query.
    """
    client = _get_http_client()
    all_results: list[dict[str, str]] = []
    seen_urls: set[str] = set()

    for query in queries:
        try:
            resp = await client.post(
                "https://html.duckduckgo.com/html/",
                data={"q": query, "df": "w"},  # df=w: past week
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )

            if resp.status_code != 200:
                logger.warning(f"Macro search returned {resp.status_code} for '{query}'")
                continue

            results = _parse_ddg_html(resp.text, num_results_per_query)
            for r in results:
                if r["url"] not in seen_urls:
                    seen_urls.add(r["url"])
                    r["query"] = query
                    all_results.append(r)

        except Exception as e:
            logger.error(f"Macro search error for '{query}': {e}")
            continue

    return all_results


# ---------------------------------------------------------------------------
# Targeted earnings/results search
# ---------------------------------------------------------------------------

async def fetch_earnings_news(
    company_name: str,
    ticker: str,
    num_results: int = 5,
) -> list[dict[str, str]]:
    """
    Search specifically for recent earnings, results, and guidance data.

    Uses a more targeted query than general news to surface actual result
    details (revenue, EBIT, NPAT, guidance) that help the synthesis stage
    describe what happened rather than speculate.
    """
    year = datetime.now(timezone.utc).year
    query = f"{company_name} {ticker} ASX earnings results revenue EBIT guidance {year}"
    url = "https://html.duckduckgo.com/html/"

    client = _get_http_client()
    try:
        resp = await client.post(
            url,
            data={"q": query, "df": "m"},  # df=m: past month
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )

        if resp.status_code != 200:
            logger.warning(f"DuckDuckGo earnings search returned {resp.status_code}")
            return []

        html = resp.text
        results = _parse_ddg_html(html, num_results)
        return results

    except Exception as e:
        logger.error(f"Earnings search error for {ticker}: {e}")
        return []


# ---------------------------------------------------------------------------
# Parallel data gathering
# ---------------------------------------------------------------------------

async def gather_all_data(
    ticker: str,
    company_name: str,
) -> dict[str, Any]:
    """
    Gather all external data for a stock refresh in parallel.

    Returns
    -------
    dict with keys: price_data, announcements, news, earnings_news,
                    macro_context (or None).
    """
    # Core tasks (always run)
    price_task = fetch_yahoo_price(ticker)
    announcements_task = fetch_asx_announcements(ticker)
    news_task = web_search_news(company_name, ticker)
    earnings_task = fetch_earnings_news(company_name, ticker)

    # Macro / commodity tasks (only if ticker has a mapping)
    sector_config = SECTOR_COMMODITY_MAP.get(ticker.upper())
    commodity_specs = sector_config.get("commodities", []) if sector_config else []
    macro_queries = sector_config.get("macro_queries", []) if sector_config else []

    commodity_tasks = [
        fetch_commodity_price(c["ticker"], c["name"]) for c in commodity_specs
    ]
    macro_task = web_search_macro(macro_queries) if macro_queries else None

    # Gather everything in parallel
    all_tasks = [price_task, announcements_task, news_task, earnings_task]
    all_tasks.extend(commodity_tasks)
    if macro_task:
        all_tasks.append(macro_task)

    results = await asyncio.gather(*all_tasks, return_exceptions=True)

    # Unpack core results (indices 0-3)
    price_data = results[0] if not isinstance(results[0], Exception) else {"error": str(results[0])}
    announcements = results[1] if not isinstance(results[1], Exception) else []
    news = results[2] if not isinstance(results[2], Exception) else []
    earnings_news = results[3] if not isinstance(results[3], Exception) else []

    if isinstance(price_data, Exception):
        logger.error(f"Price fetch failed for {ticker}: {price_data}")
        price_data = {"error": str(price_data)}
    if isinstance(announcements, Exception):
        logger.error(f"Announcements fetch failed for {ticker}: {announcements}")
        announcements = []
    if isinstance(news, Exception):
        logger.error(f"News fetch failed for {ticker}: {news}")
        news = []
    if isinstance(earnings_news, Exception):
        logger.error(f"Earnings news fetch failed for {ticker}: {earnings_news}")
        earnings_news = []

    # Unpack commodity results (indices 4 .. 4+len(commodity_tasks))
    commodity_prices = []
    offset = 4
    for i in range(len(commodity_tasks)):
        r = results[offset + i]
        if isinstance(r, Exception):
            logger.error(f"Commodity fetch failed: {r}")
        elif isinstance(r, dict) and "error" not in r:
            commodity_prices.append(r)
    offset += len(commodity_tasks)

    # Unpack macro news result (last index, if present)
    macro_news: list = []
    if macro_task:
        r = results[offset]
        if isinstance(r, Exception):
            logger.error(f"Macro news fetch failed: {r}")
        elif isinstance(r, list):
            macro_news = r

    # Build macro_context block (None if no data available)
    macro_context = None
    if sector_config and (commodity_prices or macro_news):
        macro_context = {
            "sector_label": sector_config.get("label", ""),
            "commodity_prices": commodity_prices,
            "macro_news": macro_news[:8],
        }

    return {
        "price_data": price_data,
        "announcements": announcements,
        "news": news,
        "earnings_news": earnings_news,
        "macro_context": macro_context,
        "gathered_at": datetime.now(timezone.utc).isoformat(),
    }
