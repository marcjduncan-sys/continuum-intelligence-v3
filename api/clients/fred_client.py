"""
FRED (Federal Reserve Economic Data) API client.

Fetches macro-economic time series from the St. Louis Fed and upserts
into the macro_series table. Respects the 120 req/min rate limit with
a 0.5s inter-request delay.

API docs: https://fred.stlouisfed.org/docs/api/fred/
"""

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://api.stlouisfed.org/fred"
TIMEOUT = httpx.Timeout(15.0, connect=10.0)

# All FRED series to track
SERIES_IDS: list[str] = [
    # GDP and output
    "GDP", "GDPC1", "INDPRO",
    # Inflation
    "CPIAUCSL", "PCEPI",
    # Labour market
    "UNRATE", "PAYEMS",
    # Interest rates
    "FEDFUNDS", "DFF",
    # Treasury yields
    "DGS2", "DGS5", "DGS10", "DGS30",
    # Yield curve and breakevens
    "T10Y2Y", "T10YIE",
    # Credit spreads
    "BAMLH0A0HYM2", "BAMLC0A0CM",
    # Sentiment and volatility
    "UMCSENT", "VIXCLS",
    # Dollar index
    "DTWEXBGS",
    # Housing and consumer
    "MORTGAGE30US", "HOUST", "RSXFS",
]

# Frequency hints for metadata
_FREQUENCY_MAP: dict[str, str] = {
    "GDP": "Q", "GDPC1": "Q",
    "CPIAUCSL": "M", "PCEPI": "M",
    "UNRATE": "M", "PAYEMS": "M",
    "FEDFUNDS": "M", "DFF": "D",
    "DGS2": "D", "DGS5": "D", "DGS10": "D", "DGS30": "D",
    "T10Y2Y": "D", "T10YIE": "D",
    "BAMLH0A0HYM2": "D", "BAMLC0A0CM": "D",
    "UMCSENT": "M", "VIXCLS": "D",
    "DTWEXBGS": "D",
    "MORTGAGE30US": "W", "HOUST": "M", "RSXFS": "M",
    "INDPRO": "M",
}

_UNIT_MAP: dict[str, str] = {
    "GDP": "USD_bn", "GDPC1": "USD_bn",
    "CPIAUCSL": "index", "PCEPI": "index",
    "UNRATE": "%", "PAYEMS": "thousands",
    "FEDFUNDS": "%", "DFF": "%",
    "DGS2": "%", "DGS5": "%", "DGS10": "%", "DGS30": "%",
    "T10Y2Y": "%", "T10YIE": "%",
    "BAMLH0A0HYM2": "%", "BAMLC0A0CM": "%",
    "UMCSENT": "index", "VIXCLS": "index",
    "DTWEXBGS": "index",
    "MORTGAGE30US": "%", "HOUST": "thousands", "RSXFS": "USD_mn",
    "INDPRO": "index",
}

_DESCRIPTION_MAP: dict[str, str] = {
    "GDP": "US Nominal GDP",
    "GDPC1": "US Real GDP",
    "CPIAUCSL": "US CPI All Items",
    "PCEPI": "US PCE Price Index",
    "UNRATE": "US Unemployment Rate",
    "PAYEMS": "US Total Nonfarm Payrolls",
    "FEDFUNDS": "Federal Funds Rate",
    "DFF": "Federal Funds Effective Rate",
    "DGS2": "US 2-Year Treasury Yield",
    "DGS5": "US 5-Year Treasury Yield",
    "DGS10": "US 10-Year Treasury Yield",
    "DGS30": "US 30-Year Treasury Yield",
    "T10Y2Y": "US 10Y-2Y Spread",
    "T10YIE": "US 10Y Breakeven Inflation",
    "BAMLH0A0HYM2": "US High Yield OAS",
    "BAMLC0A0CM": "US Investment Grade OAS",
    "UMCSENT": "UMich Consumer Sentiment",
    "VIXCLS": "CBOE VIX",
    "DTWEXBGS": "US Dollar Index (Broad)",
    "MORTGAGE30US": "US 30Y Mortgage Rate",
    "HOUST": "US Housing Starts",
    "RSXFS": "US Retail Sales ex Food Services",
    "INDPRO": "US Industrial Production",
}


async def fetch_series(
    series_id: str,
    pool: Any,
    client: httpx.AsyncClient,
) -> bool:
    """Fetch a single FRED series and upsert into macro_series.

    Args:
        series_id: The FRED series identifier.
        pool: asyncpg connection pool.
        client: Shared httpx async client.

    Returns:
        True if the upsert succeeded, False otherwise.
    """
    api_key = os.getenv("FRED_API_KEY", "").strip()
    if not api_key:
        logger.warning("FRED_API_KEY not set, skipping %s", series_id)
        return False

    try:
        resp = await client.get(
            f"{BASE_URL}/series/observations",
            params={
                "series_id": series_id,
                "api_key": api_key,
                "file_type": "json",
                "sort_order": "desc",
                "limit": 2,
            },
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.error("FRED fetch failed for %s: %s", series_id, exc)
        return False

    observations = data.get("observations", [])
    if not observations:
        logger.warning("FRED returned no observations for %s", series_id)
        return False

    # Extract latest and previous values, skipping '.' (missing) values
    last_value = None
    last_date = None
    previous_value = None
    previous_date = None

    for obs in observations:
        val = obs.get("value", ".")
        if val == "." or val is None:
            continue
        try:
            parsed_val = float(val)
        except (ValueError, TypeError):
            continue

        if last_value is None:
            last_value = parsed_val
            last_date = obs.get("date")
        elif previous_value is None:
            previous_value = parsed_val
            previous_date = obs.get("date")
            break

    if last_value is None:
        logger.warning("FRED: no valid observations for %s", series_id)
        return False

    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO macro_series
                    (source, series_id, description, frequency,
                     last_value, last_date, previous_value, previous_date,
                     unit, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                ON CONFLICT (source, series_id) DO UPDATE SET
                    description = EXCLUDED.description,
                    frequency = EXCLUDED.frequency,
                    last_value = EXCLUDED.last_value,
                    last_date = EXCLUDED.last_date,
                    previous_value = EXCLUDED.previous_value,
                    previous_date = EXCLUDED.previous_date,
                    unit = EXCLUDED.unit,
                    updated_at = NOW()
                """,
                "FRED",
                series_id,
                _DESCRIPTION_MAP.get(series_id, series_id),
                _FREQUENCY_MAP.get(series_id, "D"),
                last_value,
                last_date,
                previous_value,
                previous_date,
                _UNIT_MAP.get(series_id, ""),
            )
        logger.info("FRED: upserted %s = %s (%s)", series_id, last_value, last_date)
        return True
    except Exception as exc:
        logger.error("FRED: DB upsert failed for %s: %s", series_id, exc)
        return False


async def refresh_all_fred(pool: Any) -> dict[str, bool]:
    """Fetch all tracked FRED series with rate-limit-safe pacing.

    Args:
        pool: asyncpg connection pool.

    Returns:
        Dict mapping series_id to success boolean.
    """
    if pool is None:
        logger.warning("FRED refresh skipped: no database pool")
        return {}

    api_key = os.getenv("FRED_API_KEY", "").strip()
    if not api_key:
        logger.warning("FRED refresh skipped: FRED_API_KEY not set")
        return {}

    results: dict[str, bool] = {}
    logger.info("FRED refresh starting for %d series", len(SERIES_IDS))
    start = datetime.now(timezone.utc)

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for sid in SERIES_IDS:
            try:
                ok = await fetch_series(sid, pool, client)
                results[sid] = ok
            except Exception as exc:
                logger.error("FRED: unexpected error for %s: %s", sid, exc)
                results[sid] = False
            # Rate limit: 120 req/min => 0.5s between requests
            await asyncio.sleep(0.5)

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    success_count = sum(1 for v in results.values() if v)
    logger.info(
        "FRED refresh complete: %d/%d series in %.1fs",
        success_count, len(SERIES_IDS), elapsed,
    )
    return results
