"""
External data provider integrations for the ACH evidence engine.

Provides async functions to fetch:
- EODHD: financial statements, analyst estimates, insider transactions (paid)
- Alpha Vantage: financial statement cross-validation (free, 25/day)
- Finnhub: US peer analyst estimates, insider sentiment (free, US only)
- Twelve Data: pre-calculated technical indicators (free, 800/day)
- ASX Direct JSON: structured announcements with type classification (free)
- RBA: yield curve, cash rate (free, weekly CSV)
- OpenFIGI: entity resolution / identifier mapping (free)

All functions are designed for graceful degradation: if a provider is
unavailable, unconfigured, or returns an error, the function returns an
empty dict/list and logs the issue. The pipeline continues without it.
"""

import asyncio
import csv
import io
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx

import config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Shared HTTP timeout
# ---------------------------------------------------------------------------

_TIMEOUT = httpx.Timeout(15.0, connect=10.0)

# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

_CACHE_DIR = Path(config.PROJECT_ROOT) / "data" / "cache"


def _read_cache(subdir: str, key: str, max_age_hours: int = 168) -> dict | None:
    """Read a cached JSON file if it exists and is fresh enough."""
    path = _CACHE_DIR / subdir / f"{key}.json"
    if not path.exists():
        return None
    try:
        age = datetime.now(timezone.utc) - datetime.fromtimestamp(
            path.stat().st_mtime, tz=timezone.utc
        )
        if age > timedelta(hours=max_age_hours):
            return None
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _write_cache(subdir: str, key: str, data: dict | list) -> None:
    """Write data to a cache file."""
    try:
        cache_path = _CACHE_DIR / subdir
        cache_path.mkdir(parents=True, exist_ok=True)
        path = cache_path / f"{key}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)
    except Exception as e:
        logger.warning(f"Cache write failed for {subdir}/{key}: {e}")


# =========================================================================
# 1. EODHD — Financial Statements, Analyst Estimates, Insider Transactions
# =========================================================================

async def fetch_eodhd_fundamentals(ticker: str, exchange: str = "AU") -> dict[str, Any]:
    """
    Fetch fundamental data from EODHD for an ASX/NZX stock.

    Returns dict with keys:
    - financial_statements: {income_statement, balance_sheet, cash_flow}
    - analyst_estimates: {consensus, price_targets}
    - insider_transactions: [{date, owner, type, shares, price, ...}]
    - company_profile: {description, sector, industry, employees, ...}

    Returns empty dict if EODHD_API_KEY is not configured.
    """
    if not config.EODHD_API_KEY:
        return {}

    # Check cache first (fresh within 7 days)
    cached = _read_cache("eodhd", ticker, max_age_hours=168)
    if cached:
        logger.info(f"[{ticker}] EODHD: serving from cache")
        return cached

    symbol = f"{ticker}.{exchange}"
    base = config.EODHD_BASE_URL
    api_token = config.EODHD_API_KEY

    result: dict[str, Any] = {}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        # Fundamentals endpoint (includes financials, profile, officers)
        try:
            resp = await client.get(
                f"{base}/fundamentals/{symbol}",
                params={"api_token": api_token, "fmt": "json"},
            )
            if resp.status_code == 200:
                data = resp.json()

                # Extract financial statements
                financials = data.get("Financials", {})
                income = financials.get("Income_Statement", {})
                balance = financials.get("Balance_Sheet", {})
                cashflow = financials.get("Cash_Flow", {})

                # Get quarterly data (most recent 4 quarters)
                result["financial_statements"] = {
                    "income_statement_quarterly": _extract_periods(
                        income.get("quarterly", {}), 4
                    ),
                    "income_statement_annual": _extract_periods(
                        income.get("yearly", {}), 2
                    ),
                    "balance_sheet_quarterly": _extract_periods(
                        balance.get("quarterly", {}), 4
                    ),
                    "balance_sheet_annual": _extract_periods(
                        balance.get("yearly", {}), 2
                    ),
                    "cash_flow_quarterly": _extract_periods(
                        cashflow.get("quarterly", {}), 4
                    ),
                    "cash_flow_annual": _extract_periods(
                        cashflow.get("yearly", {}), 2
                    ),
                }

                # Company profile
                general = data.get("General", {})
                result["company_profile"] = {
                    "name": general.get("Name"),
                    "description": (general.get("Description") or "")[:500],
                    "sector": general.get("Sector"),
                    "industry": general.get("Industry"),
                    "employees": general.get("FullTimeEmployees"),
                    "ipo_date": general.get("IPODate"),
                    "exchange": general.get("Exchange"),
                    "currency": general.get("CurrencyCode"),
                    "fiscal_year_end": general.get("FiscalYearEnd"),
                }

                # Officers / directors
                officers = general.get("Officers", {})
                if isinstance(officers, dict):
                    result["officers"] = [
                        {
                            "name": v.get("Name"),
                            "title": v.get("Title"),
                            "year_born": v.get("YearBorn"),
                        }
                        for v in list(officers.values())[:10]
                    ]

                # Insider transactions
                insider_data = data.get("InsiderTransactions", {})
                if isinstance(insider_data, dict):
                    transactions = list(insider_data.values())
                    if transactions and isinstance(transactions[0], dict):
                        result["insider_transactions"] = [
                            {
                                "date": t.get("date"),
                                "owner": t.get("ownerName"),
                                "type": t.get("transactionType"),
                                "shares": t.get("transactionShares"),
                                "price": t.get("transactionPrice"),
                                "ownership_type": t.get("ownerRelationship"),
                            }
                            for t in transactions[:20]
                        ]
                    else:
                        result["insider_transactions"] = []
                else:
                    result["insider_transactions"] = []

                # Analyst ratings / estimates from highlights
                highlights = data.get("Highlights", {})
                result["analyst_estimates"] = {
                    "eps_estimate_current_year": highlights.get(
                        "EPSEstimateCurrentYear"
                    ),
                    "eps_estimate_next_year": highlights.get("EPSEstimateNextYear"),
                    "eps_estimate_current_quarter": highlights.get(
                        "EPSEstimateCurrentQuarter"
                    ),
                    "revenue_estimate_current_year": highlights.get(
                        "RevenueEstimateCurrentYear"
                    ),
                    "profit_margin": highlights.get("ProfitMargin"),
                    "operating_margin": highlights.get("OperatingMarginTTM"),
                    "return_on_equity": highlights.get("ReturnOnEquityTTM"),
                    "pe_ratio": highlights.get("PERatio"),
                    "peg_ratio": highlights.get("PEGRatio"),
                    "book_value": highlights.get("BookValue"),
                    "dividend_yield": highlights.get("DividendYield"),
                    "earnings_share": highlights.get("EarningsShare"),
                    "wall_street_target": highlights.get(
                        "WallStreetTargetPrice"
                    ),
                }

                # Analyst recommendations
                analyst_ratings = data.get("AnalystRatings", {})
                if analyst_ratings:
                    result["analyst_ratings"] = {
                        "rating": analyst_ratings.get("Rating"),
                        "target_price": analyst_ratings.get("TargetPrice"),
                        "strong_buy": analyst_ratings.get("StrongBuy"),
                        "buy": analyst_ratings.get("Buy"),
                        "hold": analyst_ratings.get("Hold"),
                        "sell": analyst_ratings.get("Sell"),
                        "strong_sell": analyst_ratings.get("StrongSell"),
                    }

                logger.info(
                    f"[{ticker}] EODHD fundamentals fetched: "
                    f"financials={'yes' if result.get('financial_statements') else 'no'}, "
                    f"analysts={'yes' if result.get('analyst_estimates') else 'no'}, "
                    f"insiders={len(result.get('insider_transactions', []))}"
                )
            elif resp.status_code == 404:
                logger.warning(f"[{ticker}] EODHD: ticker {symbol} not found")
            else:
                logger.warning(
                    f"[{ticker}] EODHD fundamentals returned {resp.status_code}"
                )
        except Exception as e:
            logger.error(f"[{ticker}] EODHD fundamentals error: {e}")

    # Cache the result
    if result:
        _write_cache("eodhd", ticker, result)

    return result


def _extract_periods(data: dict, count: int) -> list[dict]:
    """Extract the most recent N periods from EODHD financial data."""
    if not isinstance(data, dict):
        return []
    # EODHD returns periods as date-keyed dicts
    sorted_keys = sorted(data.keys(), reverse=True)[:count]
    periods = []
    for k in sorted_keys:
        period = data[k]
        if isinstance(period, dict):
            period["period_date"] = k
            periods.append(period)
    return periods


# =========================================================================
# 2. Alpha Vantage — Financial Statement Cross-Validation
# =========================================================================

# Simple in-memory rate limiter (25 calls/day)
_av_call_count = 0
_av_call_date: str = ""


async def fetch_alpha_vantage(ticker: str) -> dict[str, Any]:
    """
    Fetch financial statements from Alpha Vantage as a cross-validation
    source. Only called when EODHD data is missing or stale.

    Free tier: 25 requests/day. Returns empty dict if limit reached.
    """
    global _av_call_count, _av_call_date

    if not config.ALPHA_VANTAGE_API_KEY:
        return {}

    # Rate limit check
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if _av_call_date != today:
        _av_call_count = 0
        _av_call_date = today
    if _av_call_count >= 24:  # Leave 1 call buffer
        logger.warning(f"[{ticker}] Alpha Vantage daily limit reached")
        return {}

    # Check cache (fresh within 14 days since AV is a backup)
    cached = _read_cache("alpha_vantage", ticker, max_age_hours=336)
    if cached:
        return cached

    av_ticker = f"{ticker}.AX"
    base = "https://www.alphavantage.co/query"
    api_key = config.ALPHA_VANTAGE_API_KEY
    result: dict[str, Any] = {}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        # Income statement
        try:
            _av_call_count += 1
            resp = await client.get(
                base,
                params={
                    "function": "INCOME_STATEMENT",
                    "symbol": av_ticker,
                    "apikey": api_key,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                result["income_statement"] = {
                    "quarterly": (data.get("quarterlyReports") or [])[:4],
                    "annual": (data.get("annualReports") or [])[:2],
                }
        except Exception as e:
            logger.error(f"[{ticker}] Alpha Vantage income statement error: {e}")

        # Balance sheet
        try:
            _av_call_count += 1
            resp = await client.get(
                base,
                params={
                    "function": "BALANCE_SHEET",
                    "symbol": av_ticker,
                    "apikey": api_key,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                result["balance_sheet"] = {
                    "quarterly": (data.get("quarterlyReports") or [])[:4],
                    "annual": (data.get("annualReports") or [])[:2],
                }
        except Exception as e:
            logger.error(f"[{ticker}] Alpha Vantage balance sheet error: {e}")

        # Company overview (earnings, PE, analyst target)
        try:
            _av_call_count += 1
            resp = await client.get(
                base,
                params={
                    "function": "OVERVIEW",
                    "symbol": av_ticker,
                    "apikey": api_key,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                result["overview"] = {
                    "pe_ratio": data.get("PERatio"),
                    "peg_ratio": data.get("PEGRatio"),
                    "book_value": data.get("BookValue"),
                    "eps": data.get("EPS"),
                    "dividend_yield": data.get("DividendYield"),
                    "profit_margin": data.get("ProfitMargin"),
                    "analyst_target": data.get("AnalystTargetPrice"),
                    "52_week_high": data.get("52WeekHigh"),
                    "52_week_low": data.get("52WeekLow"),
                }
        except Exception as e:
            logger.error(f"[{ticker}] Alpha Vantage overview error: {e}")

    if result:
        _write_cache("alpha_vantage", ticker, result)
        logger.info(f"[{ticker}] Alpha Vantage fetched ({_av_call_count}/{25} daily calls used)")

    return result


# =========================================================================
# 3. ASX Direct JSON — Structured Announcements
# =========================================================================

async def fetch_asx_announcements_json(ticker: str) -> list[dict[str, Any]]:
    """
    Fetch structured announcements from ASX's direct JSON endpoint.
    Returns list of announcements with type classification and price-sensitive flag.
    Falls back gracefully if ASX blocks the request (403).
    """
    url = f"https://www.asx.com.au/asx/1/company/{ticker}/announcements"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                url, params={"count": 20, "market_sensitive": "false"}, headers=headers
            )
            if resp.status_code == 200:
                data = resp.json()
                items = data.get("data", [])
                announcements = []
                for item in items:
                    announcements.append({
                        "headline": item.get("header"),
                        "date": item.get("document_date"),
                        "url": item.get("url"),
                        "price_sensitive": item.get("price_sensitive", False),
                        "announcement_type": _classify_announcement(
                            item.get("header", "")
                        ),
                        "pages": item.get("number_of_pages"),
                        "source": "ASX Direct",
                    })
                logger.info(
                    f"[{ticker}] ASX Direct JSON: {len(announcements)} announcements"
                )
                return announcements
            elif resp.status_code == 403:
                logger.warning(
                    f"[{ticker}] ASX Direct JSON blocked (403). "
                    "Falling back to RSS."
                )
                return []
            else:
                logger.warning(
                    f"[{ticker}] ASX Direct JSON returned {resp.status_code}"
                )
                return []
    except Exception as e:
        logger.error(f"[{ticker}] ASX Direct JSON error: {e}")
        return []


def _classify_announcement(headline: str) -> str:
    """Classify an ASX announcement by headline text."""
    h = headline.lower()
    if any(w in h for w in ["substantial holder", "substantial holding", "ceasing"]):
        return "substantial_holder"
    if any(w in h for w in ["director", "appendix 3y", "change of director"]):
        return "director_interest"
    if any(w in h for w in ["annual report", "half year", "quarterly", "4c", "4d", "4e",
                            "appendix 4", "preliminary final", "financial results"]):
        return "financial_report"
    if any(w in h for w in ["dividend", "distribution"]):
        return "dividend"
    if any(w in h for w in ["takeover", "scheme", "merger", "acquisition"]):
        return "corporate_action"
    if any(w in h for w in ["placement", "capital raise", "entitlement", "spp"]):
        return "capital_raise"
    if any(w in h for w in ["agm", "general meeting", "notice of meeting"]):
        return "meeting"
    if any(w in h for w in ["trading halt", "suspension"]):
        return "trading_halt"
    return "other"


# =========================================================================
# 4. RBA Statistical Tables — Yield Curve & Cash Rate
# =========================================================================

# Module-level cache for RBA data (refreshed at most weekly)
_rba_cache: dict[str, Any] = {}
_rba_fetched_at: datetime | None = None


async def fetch_rba_yields() -> dict[str, Any]:
    """
    Fetch latest yield curve data from RBA statistical tables.
    Returns dict with 10Y yield, 2Y yield, cash rate, and curve slope.
    Cached for 7 days.
    """
    global _rba_cache, _rba_fetched_at

    if _rba_fetched_at and (
        datetime.now(timezone.utc) - _rba_fetched_at < timedelta(days=7)
    ):
        return _rba_cache

    # Also check file cache
    cached = _read_cache("rba", "yields", max_age_hours=168)
    if cached:
        _rba_cache = cached
        _rba_fetched_at = datetime.now(timezone.utc)
        return cached

    url = "https://www.rba.gov.au/statistics/tables/csv/f2.1-data.csv"
    result: dict[str, Any] = {}

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0)) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                text = resp.text
                reader = csv.reader(io.StringIO(text))
                headers: list[str] = []
                last_row: list[str] = []

                for row in reader:
                    if not row:
                        continue
                    # The header row contains series descriptions
                    if row[0] == "Series ID":
                        headers = row
                        continue
                    # Skip metadata rows
                    if row[0].startswith("Title") or row[0].startswith("Description"):
                        continue
                    # Data rows start with a date
                    if len(row) > 1 and row[0] and row[0][0].isdigit():
                        last_row = row

                if headers and last_row:
                    # Find key series by their IDs
                    series_map = {h: i for i, h in enumerate(headers)}

                    # 10-year government bond yield
                    for sid in ["FCMYGBAG10", "FCMYGBAG10D"]:
                        if sid in series_map:
                            idx = series_map[sid]
                            if idx < len(last_row) and last_row[idx]:
                                try:
                                    result["yield_10y"] = float(last_row[idx])
                                except ValueError:
                                    pass
                            break

                    # 2-year government bond yield
                    for sid in ["FCMYGBAG2", "FCMYGBAG2D"]:
                        if sid in series_map:
                            idx = series_map[sid]
                            if idx < len(last_row) and last_row[idx]:
                                try:
                                    result["yield_2y"] = float(last_row[idx])
                                except ValueError:
                                    pass
                            break

                    result["date"] = last_row[0] if last_row else None

                    # Curve slope
                    if "yield_10y" in result and "yield_2y" in result:
                        result["curve_slope"] = round(
                            result["yield_10y"] - result["yield_2y"], 3
                        )
                        result["curve_inverted"] = result["curve_slope"] < 0

                logger.info(
                    f"RBA yields fetched: 10Y={result.get('yield_10y')}, "
                    f"2Y={result.get('yield_2y')}, "
                    f"slope={result.get('curve_slope')}"
                )
            else:
                logger.warning(f"RBA CSV returned {resp.status_code}")
    except Exception as e:
        logger.error(f"RBA yields error: {e}")

    if result:
        _rba_cache = result
        _rba_fetched_at = datetime.now(timezone.utc)
        _write_cache("rba", "yields", result)

    return result


# =========================================================================
# 5. OpenFIGI — Entity Resolution
# =========================================================================

async def resolve_figi(ticker: str, exchange: str = "AU") -> dict[str, Any]:
    """
    Resolve an ASX/NZX ticker to global identifiers via OpenFIGI.
    Returns dict with FIGI, composite FIGI, ISIN, SEDOL if available.
    Cached permanently (identifiers don't change).
    """
    # Check persistent cache
    figi_map_path = Path(config.PROJECT_ROOT) / "data" / "config" / "figi-map.json"
    try:
        if figi_map_path.exists():
            with open(figi_map_path, "r", encoding="utf-8") as f:
                figi_map = json.load(f)
            if ticker in figi_map:
                return figi_map[ticker]
    except Exception:
        figi_map = {}

    exchCode = "AT" if exchange == "AU" else "NZ"  # OpenFIGI exchange codes

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                "https://api.openfigi.com/v3/mapping",
                json=[{"idType": "TICKER", "idValue": ticker, "exchCode": exchCode}],
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                if data and isinstance(data, list) and "data" in data[0]:
                    matches = data[0]["data"]
                    if matches:
                        best = matches[0]
                        result = {
                            "figi": best.get("figi"),
                            "composite_figi": best.get("compositeFIGI"),
                            "name": best.get("name"),
                            "ticker": best.get("ticker"),
                            "exchange": best.get("exchCode"),
                            "security_type": best.get("securityType"),
                        }
                        # Save to persistent cache
                        figi_map[ticker] = result
                        try:
                            figi_map_path.parent.mkdir(parents=True, exist_ok=True)
                            with open(figi_map_path, "w", encoding="utf-8") as f:
                                json.dump(figi_map, f, indent=2)
                        except Exception as e:
                            logger.warning(f"FIGI cache write failed: {e}")
                        logger.info(f"[{ticker}] OpenFIGI resolved: {result.get('figi')}")
                        return result
                logger.info(f"[{ticker}] OpenFIGI: no match found")
            elif resp.status_code == 429:
                logger.warning(f"[{ticker}] OpenFIGI rate limited")
            else:
                logger.warning(f"[{ticker}] OpenFIGI returned {resp.status_code}")
    except Exception as e:
        logger.error(f"[{ticker}] OpenFIGI error: {e}")

    return {}


# =========================================================================
# 6. Finnhub — US Peer Analyst Estimates & Insider Sentiment
# =========================================================================

# Peer mapping: ASX ticker -> US peer tickers for cross-reference
PEER_MAP: dict[str, list[str]] = {
    "ASB": ["HII", "GD", "LHX"],       # Austal -> US defence/shipbuilding
    "GMG": ["PLD", "EQIX", "DLR"],     # Goodman -> US REITs / data centres
    "WDS": ["XOM", "CVX", "COP"],       # Woodside -> US oil majors
    "BHP": ["RIO", "VALE", "FCX"],      # BHP -> global miners (US-listed)
    "FMG": ["VALE", "CLF"],             # Fortescue -> iron ore peers
    "RIO": ["BHP", "VALE", "FCX"],      # Rio -> global miners
    "CBA": ["JPM", "BAC"],              # CBA -> US banks (macro reference)
    "CSL": ["REGN", "VRTX", "GILD"],   # CSL -> US biotech
    "WOR": ["BKR", "SLB", "HAL"],      # Worley -> US energy services
    "ALL": ["IGT", "SGMS", "DKNG"],    # Aristocrat -> US gaming
    "PME": ["ISRG", "HOLX", "EW"],     # Pro Medicus -> US medtech
    "XRO": ["INTU", "PAYC"],            # Xero -> US accounting/fintech
    "DRO": ["AVAV", "KTOS"],            # DroneShield -> US drone/defence
}


async def fetch_finnhub_peers(ticker: str) -> dict[str, Any]:
    """
    Fetch analyst recommendations and insider sentiment for US peer companies.
    Only called for tickers with a mapping in PEER_MAP.
    Free tier: 60 calls/minute, US stocks only.
    """
    if not config.FINNHUB_API_KEY:
        return {}

    peers = PEER_MAP.get(ticker.upper())
    if not peers:
        return {}

    # Check cache (fresh within 7 days)
    cached = _read_cache("finnhub_peers", ticker, max_age_hours=168)
    if cached:
        return cached

    base = "https://finnhub.io/api/v1"
    api_key = config.FINNHUB_API_KEY
    result: dict[str, Any] = {"peers": []}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for peer in peers[:3]:  # Limit to top 3 peers
            peer_data: dict[str, Any] = {"ticker": peer}
            try:
                # Analyst recommendation
                resp = await client.get(
                    f"{base}/stock/recommendation",
                    params={"symbol": peer, "token": api_key},
                )
                if resp.status_code == 200:
                    recs = resp.json()
                    if recs and isinstance(recs, list):
                        latest = recs[0]
                        peer_data["recommendation"] = {
                            "period": latest.get("period"),
                            "strong_buy": latest.get("strongBuy"),
                            "buy": latest.get("buy"),
                            "hold": latest.get("hold"),
                            "sell": latest.get("sell"),
                            "strong_sell": latest.get("strongSell"),
                        }

                # Brief pause to respect rate limit
                await asyncio.sleep(0.2)

                # Insider sentiment
                resp = await client.get(
                    f"{base}/stock/insider-sentiment",
                    params={
                        "symbol": peer,
                        "token": api_key,
                        "from": (
                            datetime.now(timezone.utc) - timedelta(days=90)
                        ).strftime("%Y-%m-%d"),
                    },
                )
                if resp.status_code == 200:
                    sentiment = resp.json()
                    if sentiment and isinstance(sentiment, dict):
                        data_list = sentiment.get("data", [])
                        if data_list:
                            peer_data["insider_sentiment"] = {
                                "mspr": data_list[-1].get("mspr"),
                                "change": data_list[-1].get("change"),
                            }

                await asyncio.sleep(0.2)

            except Exception as e:
                logger.error(f"[{ticker}] Finnhub peer {peer} error: {e}")

            result["peers"].append(peer_data)

    if result.get("peers"):
        _write_cache("finnhub_peers", ticker, result)
        logger.info(
            f"[{ticker}] Finnhub: fetched data for {len(result['peers'])} US peers"
        )

    return result


# =========================================================================
# 7. Twelve Data — Pre-Calculated Technical Indicators
# =========================================================================

async def fetch_twelve_data_ta(ticker: str) -> dict[str, Any]:
    """
    Fetch pre-calculated technical indicators from Twelve Data.
    Free tier: 800 calls/day, 8/minute.
    """
    if not config.TWELVE_DATA_API_KEY:
        return {}

    # Check cache (fresh within 24 hours)
    cached = _read_cache("twelve_data", ticker, max_age_hours=24)
    if cached:
        return cached

    symbol = f"{ticker}:ASX"
    base = "https://api.twelvedata.com"
    api_key = config.TWELVE_DATA_API_KEY
    result: dict[str, Any] = {}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        # RSI
        try:
            resp = await client.get(
                f"{base}/rsi",
                params={
                    "symbol": symbol,
                    "interval": "1day",
                    "time_period": 14,
                    "apikey": api_key,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                values = data.get("values", [])
                if values:
                    result["rsi_14"] = float(values[0].get("rsi", 0))
        except Exception as e:
            logger.error(f"[{ticker}] Twelve Data RSI error: {e}")

        await asyncio.sleep(0.3)

        # MACD
        try:
            resp = await client.get(
                f"{base}/macd",
                params={
                    "symbol": symbol,
                    "interval": "1day",
                    "apikey": api_key,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                values = data.get("values", [])
                if values:
                    result["macd"] = {
                        "macd": float(values[0].get("macd", 0)),
                        "signal": float(values[0].get("macd_signal", 0)),
                        "histogram": float(values[0].get("macd_hist", 0)),
                    }
        except Exception as e:
            logger.error(f"[{ticker}] Twelve Data MACD error: {e}")

        await asyncio.sleep(0.3)

        # Bollinger Bands
        try:
            resp = await client.get(
                f"{base}/bbands",
                params={
                    "symbol": symbol,
                    "interval": "1day",
                    "apikey": api_key,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                values = data.get("values", [])
                if values:
                    result["bollinger"] = {
                        "upper": float(values[0].get("upper_band", 0)),
                        "middle": float(values[0].get("middle_band", 0)),
                        "lower": float(values[0].get("lower_band", 0)),
                    }
        except Exception as e:
            logger.error(f"[{ticker}] Twelve Data Bollinger error: {e}")

        await asyncio.sleep(0.3)

        # ADX (trend strength)
        try:
            resp = await client.get(
                f"{base}/adx",
                params={
                    "symbol": symbol,
                    "interval": "1day",
                    "time_period": 14,
                    "apikey": api_key,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                values = data.get("values", [])
                if values:
                    result["adx_14"] = float(values[0].get("adx", 0))
        except Exception as e:
            logger.error(f"[{ticker}] Twelve Data ADX error: {e}")

    if result:
        _write_cache("twelve_data", ticker, result)
        logger.info(f"[{ticker}] Twelve Data TA: {list(result.keys())}")

    return result
