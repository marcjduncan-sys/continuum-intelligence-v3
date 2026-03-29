"""
ABS (Australian Bureau of Statistics) Data API client.

Fetches CPI, labour force, retail trade, building approvals, and
merchandise exports via the ABS SDMX Beta API. No API key required.

API docs: https://www.abs.gov.au/about/data-services/application-programming-interfaces-apis/data-api-user-guide
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from clients.sdmx_parser import (
    parse_sdmx_csv,
    extract_latest_from_csv,
    parse_sdmx_json,
    extract_latest_from_json_obs,
)

logger = logging.getLogger(__name__)

BASE_URL = "https://data.api.abs.gov.au/rest/data"
TIMEOUT = httpx.Timeout(30.0, connect=15.0)

# Dataflow configurations
# Each entry maps to an ABS dataflow with a key filter and output mapping.
#
# Dimension structures per dataflow (from ABS SDMX structure queries):
#   CPI v2.0.0:    MEASURE.INDEX.TSEST.REGION.FREQ (5 dims)
#   LF v1.0.0:     MEASURE.SEX.AGE.TSEST.REGION.FREQ (6 dims)
#   RT v1.0.0:     MEASURE.INDUSTRY.TSEST.REGION.FREQ (5 dims, dataset CEASED but still serving)
#   MERCH_EXP:     COMMODITY_SITC.COUNTRY_DEST.STATE_ORIGIN.FREQ (4 dims)
#   ANA_AGG:       MEASURE.DATA_ITEM.TSEST.REGION.FREQ (5 dims)
_DATAFLOWS: list[dict[str, Any]] = [
    {
        # CPI YoY: Measure=1 (% change from corresponding quarter of previous year),
        # Index=10001 (All groups), TSEST=10 (Original), Region=50 (Weighted avg 8 capitals), Freq=Q
        "dataflow": "ABS,CPI,2.0.0",
        "key": "1.10001.10.50.Q",
        "series_id": "CPI_YOY",
        "description": "Australia CPI - All Groups YoY",
        "frequency": "Q",
        "unit": "%",
        "format": "csv",
    },
    {
        # CPI QoQ: Measure=2 (% change from previous quarter)
        "dataflow": "ABS,CPI,2.0.0",
        "key": "2.10001.10.50.Q",
        "series_id": "CPI_QOQ",
        "description": "Australia CPI - All Groups QoQ",
        "frequency": "Q",
        "unit": "%",
        "format": "csv",
    },
    {
        # Unemployment rate: Measure=M13, Sex=3 (Persons), Age=1599 (15+),
        # TSEST=20 (Seasonally adjusted), Region=AUS, Freq=M
        "dataflow": "ABS,LF,1.0.0",
        "key": "M13.3.1599.20.AUS.M",
        "series_id": "UNEMPLOYMENT",
        "description": "Australia Unemployment Rate",
        "frequency": "M",
        "unit": "%",
        "format": "csv",
    },
    {
        # Participation rate: Measure=M14, Sex=3, Age=1599, TSEST=20, Region=AUS, Freq=M
        "dataflow": "ABS,LF,1.0.0",
        "key": "M14.3.1599.20.AUS.M",
        "series_id": "PARTICIPATION_RATE",
        "description": "Australia Labour Force Participation Rate",
        "frequency": "M",
        "unit": "%",
        "format": "csv",
    },
    {
        # Retail MoM: Measure=M2 (% change from prev period), Industry=20 (Total),
        # TSEST=20 (SA), Region=AUS, Freq=M
        # Note: RT dataset is marked CEASED but still serving historical data
        "dataflow": "ABS,RT,1.0.0",
        "key": "M2.20.20.AUS.M",
        "series_id": "RETAIL_MOM",
        "description": "Australia Retail Turnover MoM",
        "frequency": "M",
        "unit": "%",
        "format": "csv",
    },
    {
        # GDP growth QoQ: Measure=M2 (% change from prev quarter),
        # Data item=GPM (GDP at market prices), TSEST=20 (SA), Region=AUS, Freq=Q
        "dataflow": "ABS,ANA_AGG,1.0.0",
        "key": "M2.GPM.20.AUS.Q",
        "series_id": "GDP_GROWTH",
        "description": "Australia GDP Growth QoQ",
        "frequency": "Q",
        "unit": "%",
        "format": "csv",
    },
    {
        # Total merchandise exports: COMMODITY_SITC=TOT, COUNTRY_DEST=TOT,
        # STATE_ORIGIN=TOT (national), Freq=M
        "dataflow": "ABS,MERCH_EXP,1.0.0",
        "key": "TOT.TOT.TOT.M",
        "series_id": "MERCH_EXPORTS",
        "description": "Australia Merchandise Exports",
        "frequency": "M",
        "unit": "AUD",
        "format": "csv",
    },
]


async def _fetch_abs_dataflow(
    df: dict[str, Any],
    pool: Any,
    client: httpx.AsyncClient,
) -> bool:
    """Fetch a single ABS dataflow and upsert into macro_series.

    Args:
        df: Dataflow configuration dict.
        pool: asyncpg connection pool.
        client: Shared httpx client.

    Returns:
        True on successful upsert.
    """
    dataflow = df["dataflow"]
    key = df["key"]
    fmt = df.get("format", "csv")
    url = f"{BASE_URL}/{dataflow}/{key}"

    _ua = {"User-Agent": "ContinuumIntelligence/1.0 (macro-data-service)"}
    try:
        if fmt == "csv":
            resp = await client.get(
                url,
                params={"format": "csv", "detail": "dataonly"},
                headers={"Accept": "text/csv", **_ua},
            )
        else:
            resp = await client.get(
                url,
                params={"format": "jsondata"},
                headers={"Accept": "application/vnd.sdmx.data+json;version=1.0.0", **_ua},
            )

        if resp.status_code == 404:
            logger.warning("ABS dataflow %s returned 404 from %s", dataflow, url)
            return False
        if resp.status_code == 204:
            logger.warning("ABS dataflow %s returned no content from %s", dataflow, url)
            return False
        if resp.status_code != 200:
            logger.error(
                "ABS fetch failed for %s: HTTP %d from %s -- %s",
                dataflow, resp.status_code, url, resp.text[:500],
            )
            return False
        resp.raise_for_status()
    except Exception as exc:
        logger.error("ABS fetch failed for %s (%s): %s", dataflow, url, exc)
        return False

    # Parse response
    if fmt == "csv":
        rows = parse_sdmx_csv(resp.text)
        last_val, last_dt, prev_val, prev_dt = extract_latest_from_csv(rows)
    else:
        data = resp.json()
        obs = parse_sdmx_json(data)
        last_val, last_dt, prev_val, prev_dt = extract_latest_from_json_obs(obs)

    if last_val is None:
        logger.warning("ABS: no valid observations for %s (%s)", df["series_id"], dataflow)
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
                    last_value = EXCLUDED.last_value,
                    last_date = EXCLUDED.last_date,
                    previous_value = EXCLUDED.previous_value,
                    previous_date = EXCLUDED.previous_date,
                    unit = EXCLUDED.unit,
                    updated_at = NOW()
                """,
                "ABS",
                df["series_id"],
                df["description"],
                df["frequency"],
                last_val,
                last_dt,
                prev_val,
                prev_dt,
                df["unit"],
            )
        logger.info("ABS: upserted %s = %s (%s)", df["series_id"], last_val, last_dt)
        return True
    except Exception as exc:
        logger.error("ABS: DB upsert failed for %s: %s", df["series_id"], exc)
        return False


async def refresh_all_abs(pool: Any) -> dict[str, bool]:
    """Fetch all ABS dataflows and upsert into macro_series.

    Args:
        pool: asyncpg connection pool.

    Returns:
        Dict mapping series_id to success boolean.
    """
    if pool is None:
        logger.warning("ABS refresh skipped: no database pool")
        return {}

    logger.info("ABS refresh starting for %d dataflows", len(_DATAFLOWS))
    start = datetime.now(timezone.utc)
    results: dict[str, bool] = {}

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for df in _DATAFLOWS:
            try:
                ok = await _fetch_abs_dataflow(df, pool, client)
                results[df["series_id"]] = ok
            except Exception as exc:
                logger.error("ABS: unexpected error for %s: %s", df["series_id"], exc)
                results[df["series_id"]] = False
            # Respect ABS rate limits
            await asyncio.sleep(1.0)

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    success_count = sum(1 for v in results.values() if v)
    logger.info(
        "ABS refresh complete: %d/%d dataflows in %.1fs",
        success_count, len(_DATAFLOWS), elapsed,
    )
    return results
