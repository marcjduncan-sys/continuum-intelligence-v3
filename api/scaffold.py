"""
Stock scaffold generator — auto-detects company metadata from Yahoo Finance
and builds all required JSON files for a new stock.

Used by the POST /api/stocks/add endpoint.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any

from web_search import _get_http_client, YAHOO_HEADERS, SECTOR_COMMODITY_MAP

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Sector → Commodity/Macro templates
# ---------------------------------------------------------------------------
# Maps Yahoo Finance sector names (from assetProfile) to commodity tickers
# and macro search queries.  When a new stock is added, its auto-detected
# sector is looked up here so the refresh pipeline knows which commodity
# prices and macro news to fetch.
#
# Per-ticker overrides in SECTOR_COMMODITY_MAP (web_search.py) take priority;
# these templates are the fallback for any ticker NOT in that dict.
# ---------------------------------------------------------------------------

SECTOR_COMMODITY_TEMPLATES: dict[str, dict] = {
    # ── Mining / Materials ──────────────────────────────────────────────
    "Basic Materials": {
        "commodities": [
            {"ticker": "HG=F", "name": "Copper"},
            {"ticker": "GC=F", "name": "Gold"},
        ],
        "macro_queries": [
            "commodity prices mining outlook China demand",
            "iron ore copper gold price forecast",
        ],
        "sub_sectors": {
            "Gold": {
                "commodities": [
                    {"ticker": "GC=F", "name": "Gold"},
                    {"ticker": "SI=F", "name": "Silver"},
                ],
                "macro_queries": [
                    "gold price safe haven central bank buying",
                    "gold mining costs production outlook",
                ],
            },
            "Silver": {
                "commodities": [
                    {"ticker": "SI=F", "name": "Silver"},
                    {"ticker": "GC=F", "name": "Gold"},
                ],
                "macro_queries": [
                    "silver price industrial demand solar",
                    "precious metals outlook investment",
                ],
            },
            "Copper": {
                "commodities": [
                    {"ticker": "HG=F", "name": "Copper"},
                ],
                "macro_queries": [
                    "copper price demand electrification EV",
                    "copper supply deficit mining",
                ],
            },
            "Steel": {
                "commodities": [
                    {"ticker": "HG=F", "name": "Copper"},
                ],
                "macro_queries": [
                    "iron ore price China steel demand",
                    "steel production outlook infrastructure",
                ],
            },
            "Lithium": {
                "commodities": [
                    {"ticker": "HG=F", "name": "Copper"},
                ],
                "macro_queries": [
                    "lithium price EV battery demand",
                    "lithium supply oversupply spodumene",
                ],
            },
            "Uranium": {
                "commodities": [
                    {"ticker": "GC=F", "name": "Gold"},
                ],
                "macro_queries": [
                    "uranium price nuclear energy demand",
                    "uranium supply deficit enrichment",
                ],
            },
            "Chemicals": {
                "commodities": [
                    {"ticker": "BZ=F", "name": "Brent Crude"},
                ],
                "macro_queries": [
                    "chemical industry feedstock prices",
                    "specialty chemicals demand outlook",
                ],
            },
        },
    },

    # ── Energy ──────────────────────────────────────────────────────────
    "Energy": {
        "commodities": [
            {"ticker": "BZ=F", "name": "Brent Crude"},
            {"ticker": "NG=F", "name": "Natural Gas"},
        ],
        "macro_queries": [
            "oil price OPEC geopolitical supply",
            "LNG demand Asia energy transition",
        ],
        "sub_sectors": {
            "Uranium": {
                "commodities": [
                    {"ticker": "BZ=F", "name": "Brent Crude"},
                ],
                "macro_queries": [
                    "uranium price nuclear energy demand",
                    "energy security nuclear power",
                ],
            },
            "Solar": {
                "commodities": [
                    {"ticker": "SI=F", "name": "Silver"},
                ],
                "macro_queries": [
                    "solar energy installation growth",
                    "renewable energy policy subsidies",
                ],
            },
        },
    },

    # ── Financial Services ──────────────────────────────────────────────
    "Financial Services": {
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "RBA interest rate decision monetary policy",
            "Australian banking sector credit growth outlook",
        ],
        "sub_sectors": {
            "Insurance": {
                "commodities": [
                    {"ticker": "AUDUSD=X", "name": "AUD/USD"},
                ],
                "macro_queries": [
                    "insurance industry catastrophe claims",
                    "Australian insurance premium growth",
                ],
            },
            "Asset Management": {
                "commodities": [
                    {"ticker": "AUDUSD=X", "name": "AUD/USD"},
                    {"ticker": "GC=F", "name": "Gold"},
                ],
                "macro_queries": [
                    "capital markets M&A deal flow",
                    "infrastructure investment fund flows",
                ],
            },
        },
    },

    # ── Healthcare ──────────────────────────────────────────────────────
    "Healthcare": {
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "healthcare sector pharmaceutical spending",
            "biotech drug approvals FDA pipeline",
        ],
    },

    # ── Technology ──────────────────────────────────────────────────────
    "Technology": {
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "cloud SaaS enterprise technology spending",
            "AI artificial intelligence enterprise adoption",
        ],
    },

    # ── Communication Services ──────────────────────────────────────────
    "Communication Services": {
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "telecommunications media advertising spend",
            "digital media streaming subscriber growth",
        ],
    },

    # ── Real Estate ─────────────────────────────────────────────────────
    "Real Estate": {
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "Australian REIT outlook interest rates property",
            "commercial property vacancy office industrial",
        ],
    },

    # ── Consumer Defensive ──────────────────────────────────────────────
    "Consumer Defensive": {
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "consumer spending grocery inflation Australia",
            "cost of living retail sales outlook",
        ],
    },

    # ── Consumer Cyclical ───────────────────────────────────────────────
    "Consumer Cyclical": {
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "consumer discretionary spending retail outlook",
            "Australian consumer confidence housing wealth",
        ],
    },

    # ── Industrials ─────────────────────────────────────────────────────
    "Industrials": {
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
            {"ticker": "BZ=F", "name": "Brent Crude"},
        ],
        "macro_queries": [
            "infrastructure construction spending outlook",
            "industrial production manufacturing PMI",
        ],
        "sub_sectors": {
            "Defense": {
                "commodities": [
                    {"ticker": "AUDUSD=X", "name": "AUD/USD"},
                ],
                "macro_queries": [
                    "defence spending NATO AUKUS military budget",
                    "counter drone UAS military technology conflict",
                ],
            },
            "Aerospace": {
                "commodities": [
                    {"ticker": "AUDUSD=X", "name": "AUD/USD"},
                    {"ticker": "BZ=F", "name": "Brent Crude"},
                ],
                "macro_queries": [
                    "aerospace defence order backlog",
                    "defence spending military procurement",
                ],
            },
        },
    },

    # ── Utilities ───────────────────────────────────────────────────────
    "Utilities": {
        "commodities": [
            {"ticker": "NG=F", "name": "Natural Gas"},
        ],
        "macro_queries": [
            "energy prices electricity wholesale market",
            "renewable energy transition utility regulation",
        ],
    },

    # ── Default fallback ────────────────────────────────────────────────
    "_default": {
        "commodities": [
            {"ticker": "AUDUSD=X", "name": "AUD/USD"},
        ],
        "macro_queries": [
            "ASX Australian stock market outlook",
            "Australian economy GDP growth",
        ],
    },
}


def resolve_sector_commodities(
    sector: str | None, industry: str | None
) -> dict[str, Any]:
    """
    Look up the commodity tickers and macro queries for a given sector/industry.

    Checks for sub-sector keyword matches in the industry string, falling back
    to the top-level sector template, then the _default template.

    Returns
    -------
    dict with keys: commodities (list[dict]), macro_queries (list[str])
    """
    template = SECTOR_COMMODITY_TEMPLATES.get(
        sector or "", SECTOR_COMMODITY_TEMPLATES["_default"]
    )

    # Check sub-sector overrides by matching keywords in the industry string
    if industry and "sub_sectors" in template:
        industry_lower = industry.lower()
        for keyword, sub_template in template["sub_sectors"].items():
            if keyword.lower() in industry_lower:
                return {
                    "commodities": sub_template["commodities"],
                    "macro_queries": sub_template["macro_queries"],
                }

    return {
        "commodities": template["commodities"],
        "macro_queries": template["macro_queries"],
    }


# ---------------------------------------------------------------------------
# Yahoo Finance company metadata
# ---------------------------------------------------------------------------

async def fetch_company_metadata(ticker: str) -> dict[str, Any]:
    """
    Fetch company name, sector, industry, and description from Yahoo Finance
    quoteSummary endpoint.

    Parameters
    ----------
    ticker : str
        ASX ticker code (e.g. 'MIN', 'BHP').

    Returns
    -------
    dict with keys: company, sector, industry, description, website, employees.
    On failure returns dict with 'error' key.
    """
    yahoo_ticker = f"{ticker}.AX"
    url = f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{yahoo_ticker}"
    params = {"modules": "assetProfile"}

    client = _get_http_client()
    try:
        resp = await client.get(url, params=params, headers=YAHOO_HEADERS)
        resp.raise_for_status()
        data = resp.json()

        results = data.get("quoteSummary", {}).get("result", [])
        if not results:
            return {"error": f"No quoteSummary data for {ticker}"}

        profile = results[0].get("assetProfile", {})

        # Company name — quoteSummary doesn't always include it, so we'll
        # also try the chart endpoint's meta.shortName in the caller
        sector = profile.get("sector", "")
        industry = profile.get("industry", "")
        description = profile.get("longBusinessSummary", "")
        website = profile.get("website", "")
        employees = profile.get("fullTimeEmployees")

        return {
            "sector": sector,
            "industry": industry,
            "description": description[:500] if description else "",
            "website": website,
            "employees": employees,
        }

    except Exception as e:
        logger.error(f"Yahoo quoteSummary error for {ticker}: {e}")
        return {"error": str(e)}


async def fetch_company_name(ticker: str) -> str | None:
    """
    Fetch company short name from the Yahoo Finance chart endpoint meta.
    Returns None on failure.
    """
    yahoo_ticker = f"{ticker}.AX"
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_ticker}"
    params = {"interval": "1d", "range": "5d"}

    client = _get_http_client()
    try:
        resp = await client.get(url, params=params, headers=YAHOO_HEADERS)
        resp.raise_for_status()
        data = resp.json()
        result = data.get("chart", {}).get("result", [])
        if result:
            meta = result[0].get("meta", {})
            return meta.get("longName") or meta.get("shortName")
        return None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Research scaffold builder
# ---------------------------------------------------------------------------

def build_research_scaffold(
    ticker: str,
    company: str,
    sector: str,
    sector_sub: str,
    market_data: dict,
) -> dict:
    """
    Build a complete research JSON scaffold for a new stock.

    This is the Python equivalent of createResearchJSON() in scripts/add-stock.js.
    Creates valid placeholder content that the refresh pipeline can update.

    Parameters
    ----------
    ticker : str
        Uppercase ASX ticker code.
    company : str
        Company name.
    sector : str
        Primary sector (e.g. "Basic Materials").
    sector_sub : str
        Sub-sector / industry (e.g. "Other Industrial Metals & Mining").
    market_data : dict
        Output from fetch_yahoo_price() — must have price, high_52w, low_52w,
        price_history, currency, market_cap, volume.

    Returns
    -------
    dict — complete research JSON ready to save.
    """
    price = market_data.get("price", 0)
    currency = market_data.get("currency", "A$")
    high_52w = market_data.get("high_52w", price)
    low_52w = market_data.get("low_52w", price)
    market_cap = market_data.get("market_cap")
    today = datetime.now(timezone.utc).strftime("%d %B %Y").lstrip("0")

    # Format market cap
    if market_cap and market_cap > 0:
        market_cap_str = f"{currency}{market_cap / 1e9:.1f}B"
    else:
        market_cap_str = "N/A"

    drawdown = f"-{(1 - price / high_52w) * 100:.1f}%" if high_52w > 0 else "0.0%"

    # Extract last 60 daily closes for sparkline
    price_history_raw = market_data.get("price_history", [])
    if price_history_raw and isinstance(price_history_raw[0], dict):
        # from fetch_yahoo_price — list of {date, close}
        price_history = [p["close"] for p in price_history_raw[-60:]]
    elif price_history_raw:
        price_history = price_history_raw[-60:]
    else:
        price_history = [price]

    return {
        "ticker": ticker,
        "tickerFull": f"{ticker}.AX",
        "exchange": "ASX",
        "company": company,
        "sector": sector,
        "sectorSub": sector_sub or sector,
        "price": price,
        "currency": currency,
        "date": today,
        "reportId": f"{ticker}-{datetime.now(timezone.utc).year}-001",
        "priceHistory": price_history,

        # Hero
        "heroDescription": f"{sector_sub or sector} &bull; ASX-Listed",
        "heroCompanyDescription": (
            f"{company} (ASX: {ticker}) &mdash; coverage initiated. "
            f"Full analysis pending."
        ),
        "heroMetrics": [
            {"label": "Mkt Cap", "value": market_cap_str, "colorClass": ""},
            {"label": "52w High", "value": f"{currency}{high_52w}", "colorClass": ""},
            {"label": "52w Low", "value": f"{currency}{low_52w}", "colorClass": ""},
        ],

        # Skew
        "skew": {
            "direction": "neutral",
            "rationale": (
                "Auto-added stock. Narrative analysis pending. "
                "Skew assessment requires analyst research."
            ),
        },

        # Verdict
        "verdict": {
            "text": (
                f"{company} has been added to coverage. Trading at "
                f"<span class=\"key-stat\">{currency}{price}</span>. "
                f"Full narrative analysis with competing hypotheses is pending."
            ),
            "borderColor": None,
            "scores": [
                {
                    "label": "N1 Growth/Recovery", "score": "?",
                    "scoreColor": "var(--text-muted)",
                    "dirArrow": "&rarr;", "dirText": "Pending", "dirColor": None,
                },
                {
                    "label": "N2 Base Case", "score": "?",
                    "scoreColor": "var(--text-muted)",
                    "dirArrow": "&rarr;", "dirText": "Pending", "dirColor": None,
                },
                {
                    "label": "N3 Risk/Downside", "score": "?",
                    "scoreColor": "var(--text-muted)",
                    "dirArrow": "&rarr;", "dirText": "Pending", "dirColor": None,
                },
                {
                    "label": "N4 Disruption/Catalyst", "score": "?",
                    "scoreColor": "var(--text-muted)",
                    "dirArrow": "&rarr;", "dirText": "Pending", "dirColor": None,
                },
            ],
        },

        # Featured card
        "featuredMetrics": [
            {"label": "Mkt Cap", "value": market_cap_str, "color": ""},
            {
                "label": "52w Range",
                "value": f"{currency}{low_52w}&ndash;{currency}{high_52w}",
                "color": "",
            },
            {"label": "Drawdown", "value": drawdown, "color": ""},
        ],
        "featuredPriceColor": "",
        "featuredRationale": "Auto-added to coverage. Full narrative analysis pending.",

        # Identity
        "identity": {
            "rows": [
                [
                    [f"Ticker", f"{ticker}.AX", "td-mono"],
                    ["Exchange", "ASX", "td-mono"],
                ],
                [
                    ["Market Cap", market_cap_str, "td-mono"],
                    [
                        "Sector",
                        (
                            f"{sector} / {sector_sub}"
                            if sector_sub and sector_sub != sector
                            else sector
                        ),
                        "td-mono",
                    ],
                ],
                [
                    ["Share Price", f"{currency}{price}", "td-mono"],
                    [
                        "52-Week Range",
                        f"{currency}{low_52w} &ndash; {currency}{high_52w}",
                        "td-mono",
                    ],
                ],
            ],
            "overview": (
                f"{company} (ASX: {ticker}) &mdash; auto-added to coverage. "
                f"Full company overview pending analyst research."
            ),
        },

        # Hypotheses (placeholder)
        "hypotheses": [
            {
                "tier": "n1", "direction": "upside",
                "title": "N1: Growth/Recovery",
                "statusClass": "watching",
                "statusText": "Watching &mdash; Pending Analysis",
                "score": "?", "scoreWidth": "0%", "scoreMeta": "Pending",
                "description": (
                    "Placeholder hypothesis. Requires analyst research to populate."
                ),
                "requires": None,
                "supportingLabel": "Supporting Evidence",
                "supporting": ["Pending analysis"],
                "contradictingLabel": "Contradicting Evidence",
                "contradicting": ["Pending analysis"],
            },
            {
                "tier": "n2", "direction": "neutral",
                "title": "N2: Base Case",
                "statusClass": "watching",
                "statusText": "Watching &mdash; Pending Analysis",
                "score": "?", "scoreWidth": "0%", "scoreMeta": "Pending",
                "description": (
                    "Placeholder hypothesis. Requires analyst research to populate."
                ),
                "requires": None,
                "supportingLabel": "Supporting Evidence",
                "supporting": ["Pending analysis"],
                "contradictingLabel": "Contradicting Evidence",
                "contradicting": ["Pending analysis"],
            },
            {
                "tier": "n3", "direction": "downside",
                "title": "N3: Risk/Downside",
                "statusClass": "watching",
                "statusText": "Watching &mdash; Pending Analysis",
                "score": "?", "scoreWidth": "0%", "scoreMeta": "Pending",
                "description": (
                    "Placeholder hypothesis. Requires analyst research to populate."
                ),
                "requires": None,
                "supportingLabel": "Supporting Evidence",
                "supporting": ["Pending analysis"],
                "contradictingLabel": "Contradicting Evidence",
                "contradicting": ["Pending analysis"],
            },
            {
                "tier": "n4", "direction": "downside",
                "title": "N4: Disruption/Catalyst",
                "statusClass": "watching",
                "statusText": "Watching &mdash; Pending Analysis",
                "score": "?", "scoreWidth": "0%", "scoreMeta": "Pending",
                "description": (
                    "Placeholder hypothesis. Requires analyst research to populate."
                ),
                "requires": None,
                "supportingLabel": "Supporting Evidence",
                "supporting": ["Pending analysis"],
                "contradictingLabel": "Contradicting Evidence",
                "contradicting": ["Pending analysis"],
            },
        ],

        # Narrative
        "narrative": {
            "theNarrative": (
                f"{company} has been auto-added to the Continuum Intelligence "
                f"coverage universe. Full narrative analysis with competing "
                f"hypotheses, evidence assessment, and discriminating data "
                f"points is pending."
            ),
            "priceImplication": {
                "label": f"Coverage Initiated &mdash; {ticker}",
                "content": (
                    "Full price implication analysis pending. Hypothesis "
                    "framework requires analyst research before embedded "
                    "assumptions can be identified."
                ),
            },
            "evidenceCheck": "Pending analyst research.",
            "narrativeStability": "Not yet assessed.",
        },

        # Evidence
        "evidence": {
            "intro": (
                f"Evidence assessment pending. Stock was auto-added "
                f"to coverage on {today}."
            ),
            "cards": [],
            "alignmentSummary": None,
        },

        # Discriminators
        "discriminators": {
            "intro": "Discriminating evidence pending analyst research.",
            "rows": [],
            "nonDiscriminating": None,
        },

        # Tripwires
        "tripwires": {
            "intro": "Tripwires pending analyst research.",
            "cards": [],
        },

        # Gaps
        "gaps": {
            "coverageRows": [],
            "couldntAssess": [
                "Full evidence assessment pending &mdash; stock was "
                "auto-added to coverage."
            ],
            "analyticalLimitations": (
                "This stock was auto-added. All hypothesis scores, evidence "
                "assessments, and narrative analysis require manual research "
                "and population."
            ),
        },

        # Footer
        "footer": {
            "disclaimer": (
                "This report does not constitute personal financial advice. "
                "Continuum Intelligence synthesises cross-domain evidence using "
                "the Analysis of Competing Hypotheses (ACH) methodology. All "
                "factual claims are sourced from ASX filings, company disclosures, "
                "broker consensus data, and publicly available information."
            ),
            "domainCount": "0 of 10",
            "hypothesesCount": "4 Pending",
        },
    }


# ---------------------------------------------------------------------------
# Config file entry builders
# ---------------------------------------------------------------------------

def build_tickers_entry(
    ticker: str,
    company: str,
    sector: str,
    sector_sub: str,
    market_data: dict,
) -> dict:
    """Build an entry for data/config/tickers.json."""
    return {
        "company": company,
        "sector": sector,
        "sectorSub": sector_sub or sector,
        "exchange": "ASX",
        "currency": market_data.get("currency", "A$"),
        "added": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "status": "active",
        "featured": True,
        "analysisConfig": {
            "peakPrice": market_data.get("high_52w", market_data.get("price", 0)),
            "low52Week": market_data.get("low_52w", market_data.get("price", 0)),
            "high52Week": market_data.get("high_52w", market_data.get("price", 0)),
            "baseWeights": {"N1": 50, "N2": 35, "N3": 30, "N4": 35},
            "characteristics": {
                "highMultiple": False,
                "growthStock": False,
                "hasAIExposure": False,
            },
            "hypothesisNames": {
                "N1": "Growth/Recovery",
                "N2": "Base Case/Compression",
                "N3": "Risk/Downside",
                "N4": "Disruption/Catalyst",
            },
        },
    }


def build_index_entry(
    ticker: str,
    company: str,
    sector: str,
    sector_sub: str,
    market_data: dict,
) -> dict:
    """Build an entry for data/research/_index.json."""
    price = market_data.get("price", 0)
    price_history_raw = market_data.get("price_history", [])
    if price_history_raw and isinstance(price_history_raw[0], dict):
        price_history = [p["close"] for p in price_history_raw[-60:]]
    elif price_history_raw:
        price_history = price_history_raw[-60:]
    else:
        price_history = [price]

    return {
        "ticker": ticker,
        "tickerFull": f"{ticker}.AX",
        "exchange": "ASX",
        "company": company,
        "sector": sector,
        "sectorSub": sector_sub or sector,
        "price": price,
        "currency": market_data.get("currency", "A$"),
        "date": datetime.now(timezone.utc).strftime("%d %B %Y").lstrip("0"),
        "reportId": f"{ticker}-{datetime.now(timezone.utc).year}-001",
        "priceHistory": price_history,
    }


def build_reference_entry(ticker: str, market_data: dict) -> dict:
    """Build an entry for data/reference.json."""
    price = market_data.get("price", 0)
    market_cap = market_data.get("market_cap")
    currency = market_data.get("currency", "A$")

    market_cap_str = None
    if market_cap and market_cap > 0:
        market_cap_str = f"{currency}{market_cap / 1e9:.1f}B"

    return {
        "sharesOutstanding": None,
        "analystTarget": None,
        "analystBuys": None,
        "analystHolds": None,
        "analystSells": None,
        "analystCount": None,
        "epsTrailing": None,
        "epsForward": None,
        "divPerShare": None,
        "reportingCurrency": currency,
        "revenue": None,
        "_anchors": {
            "price": price,
            "marketCapStr": market_cap_str,
            "pe": None,
            "divYield": None,
        },
    }


def build_freshness_entry(ticker: str, price: float) -> dict:
    """Build an entry for data/freshness.json."""
    return {
        "reviewDate": datetime.now(timezone.utc).isoformat(),
        "daysSinceReview": 0,
        "priceAtReview": price,
        "pricePctChange": 0,
        "nearestCatalyst": None,
        "nearestCatalystDate": None,
        "nearestCatalystDays": None,
        "urgency": 0,
        "status": "OK",
        "badge": "ok",
    }
