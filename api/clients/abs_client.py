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
# Each entry maps to an ABS dataflow with a key filter and output mapping
_DATAFLOWS: list[dict[str, Any]] = [
    {
        "dataflow": "ABS,CPI,1.1.0",
        "key": "..10001.10.Q",
        "series_id": "CPI_YOY",
        "description": "Australia CPI - All Groups YoY",
        "frequency": "Q",
        "unit": "%",
        "format": "csv",
    },
    {
        "dataflow": "ABS,CPI,1.1.0",
        "key": "..10001.20.Q",
        "series_id": "CPI_QOQ",
        "description": "Australia CPI - All Groups QoQ",
        "frequency": "Q",
        "unit": "%",
        "format": "csv",
    },
    {
        "dataflow": "ABS,LF,1.0.0",
        "key": "..M13.20.Q",
        "series_id": "UNEMPLOYMENT",
        "description": "Australia Unemployment Rate",
        "frequency": "M",
        "unit": "%",
        "format": "csv",
    },
    {
        "dataflow": "ABS,LF,1.0.0",
        "key": "..M13.10.Q",
        "series_id": "PARTICIPATION_RATE",
        "description": "Australia Labour Force Participation Rate",
        "frequency": "M",
        "unit": "%",
        "format": "csv",
    },
    {
        "dataflow": "ABS,RT,1.0.0",
        "key": "..20.Q",
        "series_id": "RETAIL_MOM",
        "description": "Australia Retail Turnover MoM",
        "frequency": "M",
        "unit": "%",
        "format": "csv",
    },
    {
        "dataflow": "ABS,BA,1.0.0",
        "key": "..1.TOT.Q",
        "series_id": "BUILDING_APPROVALS",
        "description": "Australia Building Approvals",
        "frequency": "M",
        "unit": "number",
        "format": "csv",
    },
    {
        "dataflow": "ABS,MERCH_EXP,1.0.0",
        "key": "..TOT..Q",
        "series_id": "MERCH_EXPORTS",
        "description": "Australia Merchandise Exports",
        "frequency": "M",
        "unit": "AUD_mn",
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

    try:
        if fmt == "csv":
            resp = await client.get(
                url,
                params={"format": "csv", "detail": "dataonly"},
                headers={"Accept": "text/csv"},
            )
        else:
            resp = await client.get(
                url,
                params={"format": "jsondata"},
                headers={"Accept": "application/vnd.sdmx.data+json;version=1.0.0"},
            )

        if resp.status_code == 404:
            logger.warning("ABS dataflow %s returned 404", dataflow)
            return False
        if resp.status_code == 204:
            logger.warning("ABS dataflow %s returned no content", dataflow)
            return False
        resp.raise_for_status()
    except Exception as exc:
        logger.error("ABS fetch failed for %s: %s", dataflow, exc)
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
