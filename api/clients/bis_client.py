"""
BIS (Bank for International Settlements) SDMX API client.

Fetches central bank policy rates, credit aggregates, property prices,
debt service ratios, and effective exchange rates. No API key required.

API docs: https://stats.bis.org/api/v2/
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from clients.sdmx_parser import parse_sdmx_csv, extract_latest_from_csv

logger = logging.getLogger(__name__)

BASE_URL = "https://stats.bis.org/api/v2"
TIMEOUT = httpx.Timeout(30.0, connect=15.0)

# ISO country codes used in BIS key dimensions
_COUNTRY_FILTER = {"AU", "NZ", "US", "GB", "XM", "JP", "CN"}  # XM = Euro area

# BIS country code to our internal code mapping
_BIS_COUNTRY_MAP = {
    "AU": "AU", "NZ": "NZ", "US": "US",
    "GB": "GB", "XM": "EU", "JP": "JP", "CN": "CN",
}

# Dataset configurations
_DATASETS: list[dict[str, Any]] = [
    {
        "dataset": "WS_CBPOL",
        "key": "D..",
        "description_prefix": "Central Bank Policy Rate",
        "series_prefix": "CBPOL",
        "unit": "%",
        "frequency": "D",
        "country_dim": "REF_AREA",
        "countries": {"AU", "NZ", "US", "GB", "XM", "JP", "CN"},
    },
    {
        "dataset": "WS_TC",
        "key": "Q..P.A.M.770.A",
        "description_prefix": "Credit to Non-Financial Sector",
        "series_prefix": "CREDIT_NFS",
        "unit": "%_GDP",
        "frequency": "Q",
        "country_dim": "BORROWERS_CTY",
        "countries": {"AU", "NZ", "US"},
    },
    {
        "dataset": "WS_CREDIT_GAP",
        "key": "Q..B.CG",
        "description_prefix": "Credit-to-GDP Gap",
        "series_prefix": "CREDIT_GAP",
        "unit": "pp",
        "frequency": "Q",
        "country_dim": "BORROWERS_CTY",
        "countries": {"AU", "NZ"},
    },
    {
        "dataset": "WS_DSR",
        "key": "Q..P",
        "description_prefix": "Debt Service Ratio",
        "series_prefix": "DSR",
        "unit": "%",
        "frequency": "Q",
        "country_dim": "BORROWERS_CTY",
        "countries": {"AU", "NZ", "US"},
    },
    {
        "dataset": "WS_SPP",
        "key": "Q..R.628",
        "description_prefix": "Property Prices (Real)",
        "series_prefix": "PROP_PRICE",
        "unit": "index",
        "frequency": "Q",
        "country_dim": "REF_AREA",
        "countries": {"AU", "NZ"},
    },
    {
        "dataset": "WS_EER",
        "key": "M..R.B",
        "description_prefix": "Real Effective Exchange Rate",
        "series_prefix": "REER",
        "unit": "index",
        "frequency": "M",
        "country_dim": "REF_AREA",
        "countries": {"AU", "NZ"},
    },
]


async def _fetch_bis_dataset(
    ds: dict[str, Any],
    pool: Any,
    client: httpx.AsyncClient,
) -> int:
    """Fetch a single BIS dataset and upsert matching series.

    Returns the number of series successfully upserted.
    """
    dataset = ds["dataset"]
    key = ds["key"]
    url = f"{BASE_URL}/data/{dataset}/{key}"
    upserted = 0

    _ua = {"User-Agent": "ContinuumIntelligence/1.0 (macro-data-service)"}
    try:
        resp = await client.get(
            url,
            params={"format": "csv", "detail": "dataonly"},
            headers={"Accept": "text/csv", **_ua},
        )
        if resp.status_code == 404:
            logger.warning("BIS dataset %s returned 404 from %s", dataset, url)
            return 0
        if resp.status_code != 200:
            logger.error(
                "BIS fetch failed for %s: HTTP %d from %s -- %s",
                dataset, resp.status_code, url, resp.text[:500],
            )
            return 0
        resp.raise_for_status()
    except Exception as exc:
        logger.error("BIS fetch failed for %s (%s): %s", dataset, url, exc)
        return 0

    rows = parse_sdmx_csv(resp.text)
    if not rows:
        logger.warning("BIS returned no rows for %s", dataset)
        return 0

    # Group rows by country
    country_dim = ds["country_dim"]
    by_country: dict[str, list[dict]] = {}
    for row in rows:
        country = row.get(country_dim, "")
        if country in ds["countries"]:
            by_country.setdefault(country, []).append(row)

    for country_code, country_rows in by_country.items():
        internal_country = _BIS_COUNTRY_MAP.get(country_code, country_code)
        series_id = f"{ds['series_prefix']}_{internal_country}"
        description = f"{ds['description_prefix']} - {internal_country}"

        last_val, last_dt, prev_val, prev_dt = extract_latest_from_csv(country_rows)

        if last_val is None:
            continue

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
                        last_value = EXCLUDED.last_value,
                        last_date = EXCLUDED.last_date,
                        previous_value = EXCLUDED.previous_value,
                        previous_date = EXCLUDED.previous_date,
                        unit = EXCLUDED.unit,
                        updated_at = NOW()
                    """,
                    "BIS",
                    series_id,
                    description,
                    ds["frequency"],
                    last_val,
                    last_dt,
                    prev_val,
                    prev_dt,
                    ds["unit"],
                )
            logger.info("BIS: upserted %s = %s (%s)", series_id, last_val, last_dt)
            upserted += 1
        except Exception as exc:
            logger.error("BIS: DB upsert failed for %s: %s", series_id, exc)

    return upserted


async def refresh_all_bis(pool: Any) -> dict[str, int]:
    """Fetch all BIS datasets and upsert into macro_series.

    Args:
        pool: asyncpg connection pool.

    Returns:
        Dict mapping dataset name to number of series upserted.
    """
    if pool is None:
        logger.warning("BIS refresh skipped: no database pool")
        return {}

    logger.info("BIS refresh starting for %d datasets", len(_DATASETS))
    start = datetime.now(timezone.utc)
    results: dict[str, int] = {}

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for ds in _DATASETS:
            try:
                count = await _fetch_bis_dataset(ds, pool, client)
                results[ds["dataset"]] = count
            except Exception as exc:
                logger.error("BIS: unexpected error for %s: %s", ds["dataset"], exc)
                results[ds["dataset"]] = 0
            # BIS is generous but no need to hammer
            await asyncio.sleep(1.0)

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    total = sum(results.values())
    logger.info("BIS refresh complete: %d series in %.1fs", total, elapsed)
    return results
