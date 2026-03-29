"""
EIA (US Energy Information Administration) API v2 client.

Fetches petroleum prices, inventories, supply/demand, and STEO forecasts.
Stores results in macro_series (source='EIA').

API docs: https://www.eia.gov/opendata/documentation.php
"""

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://api.eia.gov/v2"
TIMEOUT = httpx.Timeout(20.0, connect=10.0)

# Data paths and their key series
_DATA_PATHS: list[dict[str, Any]] = [
    {
        "path": "petroleum/pri/spt/data",
        "params": {
            "frequency": "daily",
            "data[]": "value",
            "sort[0][column]": "period",
            "sort[0][direction]": "desc",
            "length": 5,
        },
        "series_map": {
            "RWTC": {"id": "WTI_SPOT", "desc": "WTI Crude Oil Spot Price", "unit": "USD/bbl"},
            "RBRTE": {"id": "BRENT_SPOT", "desc": "Brent Crude Oil Spot Price", "unit": "USD/bbl"},
        },
        "product_field": "product",
    },
    {
        "path": "petroleum/stoc/wstk/data",
        "params": {
            "frequency": "weekly",
            "data[]": "value",
            "facets[product][]": "EPC0",
            "sort[0][column]": "period",
            "sort[0][direction]": "desc",
            "length": 3,
        },
        "series_map": {
            "EPC0": {
                "id": "US_CRUDE_STOCKS",
                "desc": "US Crude Oil Stocks (excl. SPR)",
                "unit": "thousand_bbl",
            },
        },
        "product_field": "product",
    },
    {
        "path": "petroleum/sum/snd/data",
        "params": {
            "frequency": "monthly",
            "data[]": "value",
            "sort[0][column]": "period",
            "sort[0][direction]": "desc",
            "length": 5,
        },
        "series_map": {
            "default": {
                "id": "US_PETRO_SUPPLY",
                "desc": "US Petroleum Supply/Demand Balance",
                "unit": "thousand_bbl_d",
            },
        },
        "product_field": None,
    },
]


async def _fetch_eia_path(
    path: str,
    params: dict,
    pool: Any,
    client: httpx.AsyncClient,
    series_map: dict,
    product_field: str | None,
    max_retries: int = 2,
) -> int:
    """Fetch a single EIA data path and upsert matching series.

    Returns the number of series successfully upserted.
    """
    api_key = os.getenv("EIA_API_KEY", "").strip()
    if not api_key:
        return 0

    request_params = {"api_key": api_key, **params}
    upserted = 0

    for attempt in range(max_retries + 1):
        try:
            resp = await client.get(
                f"{BASE_URL}/{path}",
                params=request_params,
            )
            if resp.status_code == 429:
                wait = 2 ** (attempt + 1)
                logger.warning("EIA rate limited on %s, backing off %ds", path, wait)
                await asyncio.sleep(wait)
                continue
            resp.raise_for_status()
            data = resp.json()
            break
        except httpx.HTTPStatusError as exc:
            if attempt < max_retries:
                await asyncio.sleep(2 ** (attempt + 1))
                continue
            logger.error("EIA fetch failed for %s: %s", path, exc)
            return 0
        except Exception as exc:
            logger.error("EIA fetch error for %s: %s", path, exc)
            return 0
    else:
        return 0

    response_data = data.get("response", {}).get("data", [])
    if not response_data:
        logger.warning("EIA returned no data for %s", path)
        return 0

    # Group observations by product code (or use 'default')
    grouped: dict[str, list[dict]] = {}
    for row in response_data:
        if product_field and product_field in row:
            key = row[product_field]
        else:
            key = "default"
        grouped.setdefault(key, []).append(row)

    for product_code, observations in grouped.items():
        meta = series_map.get(product_code)
        if meta is None:
            continue

        # Find latest and previous valid values
        last_value = None
        last_date = None
        previous_value = None
        previous_date = None

        for obs in observations:
            val = obs.get("value")
            if val is None:
                continue
            try:
                parsed = float(val)
            except (ValueError, TypeError):
                continue

            period = obs.get("period", "")
            if last_value is None:
                last_value = parsed
                last_date = period
            elif previous_value is None:
                previous_value = parsed
                previous_date = period
                break

        if last_value is None:
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
                    "EIA",
                    meta["id"],
                    meta["desc"],
                    params.get("frequency", "D")[0].upper(),
                    last_value,
                    last_date,
                    previous_value,
                    previous_date,
                    meta["unit"],
                )
            logger.info("EIA: upserted %s = %s", meta["id"], last_value)
            upserted += 1
        except Exception as exc:
            logger.error("EIA: DB upsert failed for %s: %s", meta["id"], exc)

    return upserted


async def _fetch_steo(pool: Any, client: httpx.AsyncClient) -> int:
    """Fetch Short-Term Energy Outlook key forecasts.

    Returns the number of series upserted.
    """
    api_key = os.getenv("EIA_API_KEY", "").strip()
    if not api_key:
        return 0

    steo_series = [
        ("STEO.BREPIPUS.M", "STEO_BRENT_FORECAST", "Brent Price Forecast (STEO)", "USD/bbl"),
        ("STEO.PATCPUS.M", "STEO_US_PRODUCTION", "US Crude Production Forecast (STEO)", "million_bbl_d"),
        ("STEO.PAPRPUS.M", "STEO_US_CONSUMPTION", "US Petroleum Consumption Forecast (STEO)", "million_bbl_d"),
    ]

    upserted = 0
    for series_key, sid, desc, unit in steo_series:
        try:
            resp = await client.get(
                f"{BASE_URL}/steo/data",
                params={
                    "api_key": api_key,
                    "frequency": "monthly",
                    "data[]": "value",
                    "sort[0][column]": "period",
                    "sort[0][direction]": "desc",
                    "length": 3,
                },
            )
            if resp.status_code == 429:
                await asyncio.sleep(5)
                continue
            resp.raise_for_status()
            data = resp.json()
            rows = data.get("response", {}).get("data", [])
        except Exception as exc:
            logger.error("EIA STEO fetch failed for %s: %s", sid, exc)
            continue

        if not rows:
            continue

        last_val = None
        last_dt = None
        prev_val = None
        prev_dt = None
        for row in rows:
            v = row.get("value")
            if v is None:
                continue
            try:
                pv = float(v)
            except (ValueError, TypeError):
                continue
            if last_val is None:
                last_val = pv
                last_dt = row.get("period", "")
            elif prev_val is None:
                prev_val = pv
                prev_dt = row.get("period", "")
                break

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
                    "EIA",
                    sid,
                    desc,
                    "M",
                    last_val,
                    last_dt,
                    prev_val,
                    prev_dt,
                    unit,
                )
            logger.info("EIA STEO: upserted %s = %s", sid, last_val)
            upserted += 1
        except Exception as exc:
            logger.error("EIA STEO: DB upsert failed for %s: %s", sid, exc)

        await asyncio.sleep(0.5)

    return upserted


async def refresh_all_eia(pool: Any) -> dict[str, int]:
    """Fetch all EIA data paths and STEO forecasts.

    Args:
        pool: asyncpg connection pool.

    Returns:
        Dict of path/category to number of series upserted.
    """
    if pool is None:
        logger.warning("EIA refresh skipped: no database pool")
        return {}

    api_key = os.getenv("EIA_API_KEY", "").strip()
    if not api_key:
        logger.warning("EIA refresh skipped: EIA_API_KEY not set")
        return {}

    logger.info("EIA refresh starting")
    start = datetime.now(timezone.utc)
    results: dict[str, int] = {}

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for dp in _DATA_PATHS:
            count = await _fetch_eia_path(
                path=dp["path"],
                params=dp["params"],
                pool=pool,
                client=client,
                series_map=dp["series_map"],
                product_field=dp["product_field"],
            )
            results[dp["path"]] = count
            await asyncio.sleep(1.0)

        steo_count = await _fetch_steo(pool, client)
        results["steo"] = steo_count

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    total = sum(results.values())
    logger.info("EIA refresh complete: %d series in %.1fs", total, elapsed)
    return results
