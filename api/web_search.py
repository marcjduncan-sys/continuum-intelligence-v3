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
    dict with keys: price_data, announcements, news, earnings_news.
    """
    price_task = fetch_yahoo_price(ticker)
    announcements_task = fetch_asx_announcements(ticker)
    news_task = web_search_news(company_name, ticker)
    earnings_task = fetch_earnings_news(company_name, ticker)

    price_data, announcements, news, earnings_news = await asyncio.gather(
        price_task, announcements_task, news_task, earnings_task,
        return_exceptions=True,
    )

    # Handle exceptions gracefully
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

    return {
        "price_data": price_data,
        "announcements": announcements,
        "news": news,
        "earnings_news": earnings_news,
        "gathered_at": datetime.now(timezone.utc).isoformat(),
    }
