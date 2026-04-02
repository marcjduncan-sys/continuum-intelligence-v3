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

import data_providers

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
    # === Gold Miners ===
    "NST": {
        "label": "Gold Miner",
        "commodities": [
            {"ticker": "GC=F", "name": "Gold"},
            {"ticker": "SI=F", "name": "Silver"},
        ],
        "macro_queries": [
            "gold price outlook safe haven",
            "gold mining costs production Australia",
        ],
    },
    "EVN": {
        "label": "Gold Miner",
        "commodities": [
            {"ticker": "GC=F", "name": "Gold"},
        ],
        "macro_queries": [
            "gold price outlook safe haven",
            "gold mining production costs Australia",
        ],
    },
    "WAF": {
        "label": "Gold Miner (West Africa)",
        "commodities": [
            {"ticker": "GC=F", "name": "Gold"},
        ],
        "macro_queries": [
            "gold price outlook safe haven",
            "West Africa gold mining geopolitical risk",
        ],
    },
    "ASB": {
        "label": "Gold Miner",
        "commodities": [
            {"ticker": "GC=F", "name": "Gold"},
        ],
        "macro_queries": [
            "gold price outlook safe haven",
            "Australian gold mining production",
        ],
    },
    "OBM": {
        "label": "Gold Miner",
        "commodities": [
            {"ticker": "GC=F", "name": "Gold"},
        ],
        "macro_queries": [
            "gold price outlook safe haven",
            "gold exploration development Australia",
        ],
    },
    "WIA": {
        "label": "Gold Miner",
        "commodities": [
            {"ticker": "GC=F", "name": "Gold"},
        ],
        "macro_queries": [
            "gold price outlook safe haven",
            "Australian gold mining exploration",
        ],
    },
    # === Materials / Mining (cont.) ===
    "MIN": {
        "label": "Iron Ore & Lithium Miner",
        "commodities": [
            {"ticker": "HG=F", "name": "Copper"},
            {"ticker": "GC=F", "name": "Gold"},
        ],
        "macro_queries": [
            "iron ore price China steel demand",
            "lithium price EV battery demand outlook",
        ],
    },
    "RMC": {
        "label": "Oil & Gas Explorer",
        "commodities": [
            {"ticker": "BZ=F", "name": "Brent Crude"},
            {"ticker": "NG=F", "name": "Natural Gas"},
        ],
        "macro_queries": [
            "oil price OPEC supply outlook",
            "Australia oil gas exploration permits",
        ],
    },
    # === Energy (cont.) ===
    "STO": {
        "label": "Oil & Gas / LNG Producer",
        "commodities": [
            {"ticker": "BZ=F", "name": "Brent Crude"},
            {"ticker": "NG=F", "name": "Natural Gas"},
        ],
        "macro_queries": [
            "oil price OPEC geopolitical supply",
            "LNG demand Asia energy markets",
        ],
    },
    # === Real Estate / Property (cont.) ===
    "REA": {
        "label": "Online Property Portal",
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "Australia property market housing listings",
            "RBA interest rate housing affordability",
        ],
    },
}


# Shared async HTTP client — track the event loop to detect stale bindings
_http_client: httpx.AsyncClient | None = None
_http_client_loop: asyncio.AbstractEventLoop | None = None

YAHOO_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

# Yahoo crumb cache (required for quoteSummary v10 endpoint)
_yahoo_crumb: str | None = None
_yahoo_crumb_client: httpx.AsyncClient | None = None
_yahoo_crumb_loop: asyncio.AbstractEventLoop | None = None


def _get_http_client() -> httpx.AsyncClient:
    global _http_client, _http_client_loop
    current_loop = asyncio.get_running_loop()
    if _http_client is None or _http_client.is_closed or _http_client_loop is not current_loop:
        if _http_client is not None and not _http_client.is_closed:
            try:
                _http_client_loop.create_task(_http_client.aclose())
            except Exception:
                pass
        _http_client = httpx.AsyncClient(timeout=15.0, http2=False)
        _http_client_loop = current_loop
    return _http_client


async def _get_yahoo_crumb_client() -> tuple[httpx.AsyncClient, str | None]:
    """Return a (client, crumb) pair for Yahoo quoteSummary requests.

    Yahoo's v10 quoteSummary endpoint requires a crumb + session cookie.
    We fetch both once and cache them for the process lifetime.
    """
    global _yahoo_crumb, _yahoo_crumb_client, _yahoo_crumb_loop
    current_loop = asyncio.get_running_loop()
    if (
        _yahoo_crumb
        and _yahoo_crumb_client
        and not _yahoo_crumb_client.is_closed
        and _yahoo_crumb_loop is current_loop
    ):
        return _yahoo_crumb_client, _yahoo_crumb
    try:
        _yahoo_crumb_client = httpx.AsyncClient(timeout=15.0, follow_redirects=True)
        _yahoo_crumb_loop = current_loop
        # Step 1: hit fc.yahoo.com to establish session cookies
        await _yahoo_crumb_client.get("https://fc.yahoo.com", headers=YAHOO_HEADERS)
        # Step 2: fetch crumb
        r = await _yahoo_crumb_client.get(
            "https://query2.finance.yahoo.com/v1/test/getcrumb",
            headers=YAHOO_HEADERS,
        )
        if r.status_code == 200 and r.text:
            _yahoo_crumb = r.text
            logger.info("Yahoo crumb obtained")
        else:
            logger.warning(f"Yahoo crumb fetch failed: {r.status_code}")
            _yahoo_crumb = None
    except Exception as e:
        logger.warning(f"Yahoo crumb init error: {e}")
        _yahoo_crumb = None
    return _yahoo_crumb_client, _yahoo_crumb


def _reset_http_client() -> None:
    """Close and discard the shared client (stale transport recovery)."""
    global _http_client, _http_client_loop
    if _http_client is not None:
        try:
            asyncio.get_running_loop().create_task(_http_client.aclose())
        except Exception:
            pass
        _http_client = None
        _http_client_loop = None


# ---------------------------------------------------------------------------
# Yahoo Finance — price + chart data
# ---------------------------------------------------------------------------

async def fetch_yahoo_price(ticker: str) -> dict[str, Any]:
    """
    Fetch current price, change, volume, 52-week range, and financial
    metrics from Yahoo Finance.

    Parameters
    ----------
    ticker : str
        ASX ticker code (e.g. 'WOW', 'BHP').

    Returns
    -------
    dict with keys: price, change, change_pct, volume, high_52w, low_52w,
                    market_cap, currency, price_history (up to 250 days),
                    forward_pe, trailing_pe, ev_to_ebitda, dividend_yield,
                    dividend_per_share, revenue, ebitda, total_debt,
                    enterprise_value, employees, sector, industry.
    """
    yahoo_ticker = f"{ticker}.AX"
    client = _get_http_client()

    # --- 1. Chart data (price + history) ---
    chart_url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_ticker}"
    chart_params = {"interval": "1d", "range": "1y"}

    try:
        resp = await client.get(chart_url, params=chart_params, headers=YAHOO_HEADERS)
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

        # Up to 250 days of price history (for 200-day MA + buffer)
        price_history = []
        cutoff = max(0, len(timestamps) - 250)
        for i in range(cutoff, len(timestamps)):
            if i < len(closes) and closes[i] is not None:
                price_history.append({
                    "date": datetime.fromtimestamp(timestamps[i], tz=timezone.utc).strftime("%Y-%m-%d"),
                    "close": round(closes[i], 2),
                })

        currency = {"AUD": "A$", "USD": "US$", "GBP": "£", "EUR": "€"}.get(
            meta.get("currency", "AUD"), meta.get("currency", "A$")
        )

        base_result = {
            "price": round(price, 2),
            "change": round(change, 2),
            "change_pct": change_pct,
            "volume": meta.get("regularMarketVolume", 0),
            "high_52w": round(high_52w, 2),
            "low_52w": round(low_52w, 2),
            "market_cap": meta.get("marketCap"),
            "currency": currency,
            "price_history": price_history,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as e:
        logger.warning(f"Yahoo Finance chart error for {ticker}: {e} -- trying yfinance fallback")
        return await _fetch_yahoo_via_yfinance(ticker)

    # --- 2. Financial metrics from quoteSummary ---
    financials = await _fetch_yahoo_financials(yahoo_ticker, client)
    base_result.update(financials)

    # --- 3. Ensure market_cap is populated from the best available source ---
    if not base_result.get("market_cap") and base_result.get("market_cap_summary"):
        base_result["market_cap"] = base_result["market_cap_summary"]
    if not base_result.get("market_cap") and base_result.get("shares_outstanding") and base_result.get("price"):
        base_result["market_cap"] = base_result["shares_outstanding"] * base_result["price"]

    # --- 4. If primary path got price but missed financials, try yfinance enrichment ---
    _critical_missing = (
        not base_result.get("market_cap")
        and not base_result.get("shares_outstanding")
        and not base_result.get("forward_pe")
    )
    if _critical_missing and base_result.get("price"):
        logger.info(f"Primary path for {ticker} got price but no financials; trying yfinance enrichment")
        yf_data = await _fetch_yahoo_via_yfinance(ticker)
        if "error" not in yf_data:
            for key in ["market_cap", "market_cap_summary", "shares_outstanding",
                        "forward_pe", "trailing_pe", "dividend_yield", "dividend_per_share",
                        "revenue", "ebitda", "enterprise_value", "ev_to_ebitda",
                        "total_debt", "employees", "sector", "industry", "description"]:
                if not base_result.get(key) and yf_data.get(key):
                    base_result[key] = yf_data[key]
            # Re-run market_cap fallback with enriched data
            if not base_result.get("market_cap") and base_result.get("market_cap_summary"):
                base_result["market_cap"] = base_result["market_cap_summary"]
            if not base_result.get("market_cap") and base_result.get("shares_outstanding") and base_result.get("price"):
                base_result["market_cap"] = base_result["shares_outstanding"] * base_result["price"]

    return base_result


async def _fetch_yahoo_via_yfinance(ticker: str) -> dict[str, Any]:
    """Fallback: fetch price and financial data via the yfinance library.

    yfinance handles crumb rotation, cookie management, and TLS fingerprint
    impersonation. It is more resilient to Yahoo's IP blocks than raw httpx.
    Runs in a thread pool to avoid blocking the event loop.
    """
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    def _sync_fetch():
        try:
            import yfinance as yf
        except ImportError:
            logger.warning("yfinance not installed; fallback unavailable")
            return {"error": "yfinance not installed"}

        yahoo_ticker = f"{ticker}.AX"
        try:
            t = yf.Ticker(yahoo_ticker)
            info = t.info or {}
            hist = t.history(period="1y")

            price = info.get("currentPrice") or info.get("regularMarketPrice") or 0
            prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose") or 0
            change = round(price - prev_close, 4) if prev_close else 0
            change_pct = round((change / prev_close) * 100, 2) if prev_close else 0

            price_history = []
            if hist is not None and not hist.empty:
                for date, row in hist.iterrows():
                    close = row.get("Close")
                    if close is not None:
                        price_history.append({
                            "date": date.strftime("%Y-%m-%d"),
                            "close": round(float(close), 2),
                        })

            closes = [p["close"] for p in price_history] if price_history else [price]
            high_52w = max(closes) if closes else price
            low_52w = min(closes) if closes else price

            currency = {"AUD": "A$", "USD": "US$", "NZD": "NZ$", "GBP": "£"}.get(
                info.get("currency", "AUD"), info.get("currency", "A$")
            )

            return {
                "price": round(price, 2) if price else 0,
                "change": round(change, 2),
                "change_pct": change_pct,
                "volume": info.get("volume") or info.get("regularMarketVolume", 0),
                "high_52w": round(high_52w, 2),
                "low_52w": round(low_52w, 2),
                "market_cap": info.get("marketCap"),
                "currency": currency,
                "price_history": price_history,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "forward_pe": info.get("forwardPE"),
                "trailing_pe": info.get("trailingPE"),
                "ev_to_ebitda": info.get("enterpriseToEbitda"),
                "dividend_yield": info.get("dividendYield"),
                "dividend_per_share": info.get("dividendRate"),
                "revenue": info.get("totalRevenue"),
                "ebitda": info.get("ebitda"),
                "total_debt": info.get("totalDebt"),
                "enterprise_value": info.get("enterpriseValue"),
                "employees": info.get("fullTimeEmployees"),
                "sector": info.get("sector"),
                "industry": info.get("industry"),
                "description": info.get("longBusinessSummary", ""),
                "shares_outstanding": info.get("sharesOutstanding"),
                "market_cap_summary": info.get("marketCap"),
                "_source": "yfinance",
            }
        except Exception as e:
            logger.warning(f"yfinance fallback failed for {ticker}: {e}")
            return {"error": str(e)}

    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=1) as pool:
        return await loop.run_in_executor(pool, _sync_fetch)


async def _fetch_yahoo_financials(yahoo_ticker: str, client: httpx.AsyncClient) -> dict[str, Any]:
    """
    Fetch detailed financial metrics from Yahoo Finance's quoteSummary endpoint.

    Returns a dict of financial metrics. Missing fields are set to None.
    """
    modules = "defaultKeyStatistics,financialData,summaryDetail,assetProfile"

    # Use crumb-authenticated client (Yahoo v10 requires it)
    crumb_client, crumb = await _get_yahoo_crumb_client()
    if crumb and crumb_client:
        url = f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{yahoo_ticker}"
        params = {"modules": modules, "crumb": crumb}
        client = crumb_client
    else:
        url = f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{yahoo_ticker}"
        params = {"modules": modules}

    financials: dict[str, Any] = {
        "forward_pe": None,
        "trailing_pe": None,
        "ev_to_ebitda": None,
        "dividend_yield": None,
        "dividend_per_share": None,
        "revenue": None,
        "ebitda": None,
        "total_debt": None,
        "enterprise_value": None,
        "employees": None,
        "sector": None,
        "industry": None,
        "description": "",
        "shares_outstanding": None,
        "market_cap_summary": None,
        "target_mean_price": None,
    }

    try:
        resp = await client.get(url, params=params, headers=YAHOO_HEADERS)
        resp.raise_for_status()
        data = resp.json()

        qr = data.get("quoteSummary", {}).get("result", [])
        if not qr:
            logger.warning(f"No quoteSummary data for {yahoo_ticker}")
            return financials

        summary = qr[0]

        # --- defaultKeyStatistics ---
        dks = summary.get("defaultKeyStatistics", {})
        financials["forward_pe"] = _yf_raw(dks.get("forwardPE"))
        financials["enterprise_value"] = _yf_raw(dks.get("enterpriseValue"))
        financials["ev_to_ebitda"] = _yf_raw(dks.get("enterpriseToEbitda"))
        financials["shares_outstanding"] = _yf_raw(dks.get("sharesOutstanding"))

        # --- financialData ---
        fd = summary.get("financialData", {})
        financials["revenue"] = _yf_raw(fd.get("totalRevenue"))
        financials["ebitda"] = _yf_raw(fd.get("ebitda"))
        financials["total_debt"] = _yf_raw(fd.get("totalDebt"))
        financials["target_mean_price"] = _yf_raw(fd.get("targetMeanPrice"))

        # --- summaryDetail ---
        sd = summary.get("summaryDetail", {})
        financials["trailing_pe"] = _yf_raw(sd.get("trailingPE"))
        financials["dividend_yield"] = _yf_raw(sd.get("dividendYield"))
        financials["dividend_per_share"] = _yf_raw(sd.get("dividendRate"))
        financials["market_cap_summary"] = _yf_raw(sd.get("marketCap"))

        # --- assetProfile ---
        ap = summary.get("assetProfile", {})
        financials["employees"] = ap.get("fullTimeEmployees")
        financials["sector"] = ap.get("sector")
        financials["industry"] = ap.get("industry")
        financials["description"] = ap.get("longBusinessSummary", "") or ""

    except Exception as e:
        logger.warning(f"Yahoo quoteSummary error for {yahoo_ticker}: {e}")

    return financials


def _yf_raw(field: Any) -> float | None:
    """Extract raw numeric value from Yahoo Finance's {raw, fmt} wrapper."""
    if field is None:
        return None
    if isinstance(field, dict):
        return field.get("raw")
    if isinstance(field, (int, float)):
        return float(field)
    return None


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

    Uses the MarkitDigital ASX Research API (the current live endpoint).
    Falls back to empty list if the feed is unavailable.
    """
    url = f"https://asx.api.markitdigital.com/asx-research/1.0/companies/{ticker}/announcements"
    params = {"count": 20, "market_sensitive": "false"}

    client = _get_http_client()
    try:
        resp = await client.get(url, params=params, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json",
        })

        if resp.status_code != 200:
            logger.warning("ASX announcements returned %d for %s", resp.status_code, ticker)
            return []

        body = resp.json()
        items = body.get("data", {}).get("items", [])
        announcements = []
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        for item in items:
            try:
                ann_date = datetime.fromisoformat(
                    item.get("date", "").replace("Z", "+00:00")
                )
            except (ValueError, TypeError):
                continue

            if ann_date < cutoff:
                continue

            doc_key = item.get("documentKey", "")
            doc_url = item.get("url", "")
            if not doc_url and doc_key:
                doc_url = f"https://www.asx.com.au/asxpdf/{doc_key}.pdf"

            headline = item.get("headline", "")
            announcements.append({
                "date": ann_date.strftime("%Y-%m-%d"),
                "title": headline,
                "headline": headline,
                "url": doc_url,
                "market_sensitive": item.get("isPriceSensitive", False),
                "price_sensitive": item.get("isPriceSensitive", False),
                "type": item.get("announcementType", ""),
                "announcement_type": data_providers._classify_announcement(headline),
                "size": item.get("fileSize", ""),
                "source": "ASX MarkitDigital",
            })

        return announcements

    except Exception as e:
        logger.error("ASX announcements error for %s: %s", ticker, e)
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
    sector: str | None = None,
    sector_sub: str | None = None,
) -> dict[str, Any]:
    """
    Gather all external data for a stock refresh in parallel.

    Parameters
    ----------
    sector, sector_sub : str, optional
        Used to look up commodity/macro templates when the ticker is NOT in
        the curated SECTOR_COMMODITY_MAP.  Pass from the research JSON's
        ``sector`` / ``sectorSub`` fields.

    Returns
    -------
    dict with keys: price_data, announcements, news, earnings_news,
                    macro_context (or None), fundamentals,
                    asx_announcements_structured, rba_yields, us_peers,
                    technical_indicators, alpha_vantage, gathered_at.
    """
    # Core tasks (always run)
    price_task = fetch_yahoo_price(ticker)
    announcements_task = fetch_asx_announcements(ticker)
    news_task = web_search_news(company_name, ticker)
    earnings_task = fetch_earnings_news(company_name, ticker)

    # Macro / commodity tasks — check curated per-ticker map first, then
    # fall back to sector-based templates so new stocks auto-get context.
    sector_config = SECTOR_COMMODITY_MAP.get(ticker.upper())
    sector_label = ""
    if sector_config:
        commodity_specs = sector_config.get("commodities", [])
        macro_queries = sector_config.get("macro_queries", [])
        sector_label = sector_config.get("label", "")
    elif sector or sector_sub:
        from scaffold import resolve_sector_commodities
        resolved = resolve_sector_commodities(sector, sector_sub)
        commodity_specs = resolved.get("commodities", [])
        macro_queries = resolved.get("macro_queries", [])
        sector_label = sector_sub or sector or ""
    else:
        commodity_specs = []
        macro_queries = []

    commodity_tasks = [
        fetch_commodity_price(c["ticker"], c["name"]) for c in commodity_specs
    ]
    macro_task = web_search_macro(macro_queries) if macro_queries else None

    # --- External data-provider tasks (graceful: skip if API key missing) ---
    eodhd_task = data_providers.fetch_eodhd_fundamentals(ticker)
    # ASX Direct JSON (/asx/1/) was retired by ASX ~Q1 2026. Structured
    # announcement data now comes from fetch_asx_announcements() above
    # (MarkitDigital API), which already includes announcement_type and
    # price_sensitive fields. The asx_json_task slot is kept as a no-op
    # to preserve provider_tasks index alignment; the return dict uses
    # the enriched announcements list instead.
    asx_json_task = data_providers.fetch_asx_announcements_json(ticker)  # returns [] (retired stub)
    rba_task = data_providers.fetch_rba_yields()
    finnhub_task = data_providers.fetch_finnhub_peers(ticker)
    twelve_task = data_providers.fetch_twelve_data_ta(ticker)
    # Alpha Vantage has tight rate limits (25/day). The function itself
    # returns {} when the key is empty or the daily budget is exhausted.
    av_task = data_providers.fetch_alpha_vantage(ticker)

    provider_tasks = [eodhd_task, asx_json_task, rba_task, finnhub_task, twelve_task, av_task]

    # Gather everything in parallel
    all_tasks = [price_task, announcements_task, news_task, earnings_task]
    all_tasks.extend(commodity_tasks)
    if macro_task:
        all_tasks.append(macro_task)
    all_tasks.extend(provider_tasks)

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

    # Unpack macro news result (if present)
    macro_news: list = []
    if macro_task:
        r = results[offset]
        if isinstance(r, Exception):
            logger.error(f"Macro news fetch failed: {r}")
        elif isinstance(r, list):
            macro_news = r
        offset += 1

    # Build macro_context block (None if no data available)
    macro_context = None
    if (commodity_prices or macro_news):
        macro_context = {
            "sector_label": sector_label,
            "commodity_prices": commodity_prices,
            "macro_news": macro_news[:8],
        }

    # --- Unpack external data-provider results ---
    # Order matches provider_tasks: eodhd, asx_json, rba, finnhub, twelve, av
    _provider_labels = ["EODHD", "ASX JSON", "RBA yields", "Finnhub peers",
                        "Twelve Data TA", "Alpha Vantage"]
    _provider_defaults: list[dict | list] = [{}, [], {}, {}, {}, {}]
    provider_results: list = []
    for i, label in enumerate(_provider_labels):
        r = results[offset + i]
        if isinstance(r, Exception):
            logger.error(f"{label} fetch failed for {ticker}: {r}")
            provider_results.append(_provider_defaults[i])
        else:
            provider_results.append(r)

    fundamentals = provider_results[0]          # dict from EODHD
    _asx_json_retired = provider_results[1]     # always [] (ASX /asx/1/ retired)
    rba_yields = provider_results[2]            # dict from RBA
    us_peers = provider_results[3]              # dict from Finnhub
    technical_indicators = provider_results[4]  # dict from Twelve Data
    alpha_vantage = provider_results[5]         # dict from Alpha Vantage

    return {
        "price_data": price_data,
        "announcements": announcements,
        "news": news,
        "earnings_news": earnings_news,
        "macro_context": macro_context,
        # --- Phase: Data Source Expansion ---
        "fundamentals": fundamentals,
        # Structured announcements now come from the MarkitDigital feed
        # (fetch_asx_announcements), enriched with announcement_type and
        # price_sensitive fields. The old ASX Direct JSON endpoint is retired.
        "asx_announcements_structured": announcements,
        "rba_yields": rba_yields,
        "us_peers": us_peers,
        "technical_indicators": technical_indicators,
        "alpha_vantage": alpha_vantage,
        "gathered_at": datetime.now(timezone.utc).isoformat(),
    }
