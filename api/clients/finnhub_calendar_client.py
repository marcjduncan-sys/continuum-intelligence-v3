"""
Finnhub economic calendar client for the Economist module.

Fetches upcoming economic events and stores in economic_calendar.
Uses the same FINNHUB_API_KEY as the existing equity peer client
in data_providers.py but targets the /calendar/economic endpoint.

Free tier: 60 calls/minute.
"""

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://finnhub.io/api/v1"
TIMEOUT = httpx.Timeout(15.0, connect=10.0)

# Countries we track
_COUNTRIES_OF_INTEREST = {"AU", "NZ", "US", "CN", "GB", "EU"}

# Importance mapping: Finnhub uses 1-3
_IMPORTANCE_MAP = {
    1: "LOW",
    2: "MEDIUM",
    3: "HIGH",
}


async def fetch_economic_calendar(
    pool: Any,
    days_forward: int = 7,
) -> int:
    """Fetch economic calendar events from Finnhub for the next N days.

    Args:
        pool: asyncpg connection pool.
        days_forward: Number of days ahead to fetch.

    Returns:
        Number of events stored.
    """
    api_key = os.getenv("FINNHUB_API_KEY", "").strip()
    if not api_key:
        logger.warning("Finnhub calendar: FINNHUB_API_KEY not set")
        return 0

    now = datetime.now(timezone.utc)
    from_date = now.strftime("%Y-%m-%d")
    to_date = (now + timedelta(days=days_forward)).strftime("%Y-%m-%d")

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(
                f"{BASE_URL}/calendar/economic",
                params={
                    "from": from_date,
                    "to": to_date,
                    "token": api_key,
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error("Finnhub calendar fetch failed: %s", exc)
        return 0

    events = data.get("economicCalendar", [])
    if not events:
        logger.info("Finnhub calendar: no events returned for %s to %s", from_date, to_date)
        return 0

    stored = 0
    for event in events:
        country = (event.get("country") or "").upper()

        # Map common Finnhub country codes
        if country in ("US", "AU", "NZ", "CN", "GB"):
            pass
        elif country in ("DE", "FR", "IT", "ES", "NL", "BE", "AT"):
            country = "EU"
        elif country == "UK":
            country = "GB"
        else:
            # Skip countries we do not track
            if country not in _COUNTRIES_OF_INTEREST:
                continue

        event_name = event.get("event", "")
        if not event_name:
            continue

        # Parse date
        event_date_str = event.get("date", "")
        if not event_date_str:
            continue
        try:
            event_date = datetime.strptime(event_date_str[:10], "%Y-%m-%d").date()
        except ValueError:
            continue

        # Parse time if available
        event_time = None
        if len(event_date_str) > 10 and "T" in event_date_str:
            try:
                event_time = datetime.strptime(
                    event_date_str, "%Y-%m-%dT%H:%M:%S"
                ).time()
            except ValueError:
                pass

        importance_num = event.get("impact", 2)
        importance = _IMPORTANCE_MAP.get(importance_num, "MEDIUM")

        actual = str(event.get("actual", "")) if event.get("actual") is not None else None
        forecast = str(event.get("estimate", "")) if event.get("estimate") is not None else None
        previous = str(event.get("prev", "")) if event.get("prev") is not None else None

        try:
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO economic_calendar
                        (event_date, event_time, country, event_name,
                         importance, actual, forecast, previous,
                         source, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                    """,
                    event_date,
                    event_time,
                    country,
                    event_name[:200],
                    importance,
                    actual,
                    forecast,
                    previous,
                    "FINNHUB",
                )
            stored += 1
        except Exception as exc:
            logger.error("Finnhub calendar: DB insert failed for '%s': %s", event_name, exc)

    logger.info(
        "Finnhub calendar: stored %d/%d events for %s to %s",
        stored, len(events), from_date, to_date,
    )
    return stored


async def refresh_finnhub_calendar(pool: Any) -> int:
    """Refresh the economic calendar from Finnhub.

    Clears stale Finnhub calendar entries before inserting fresh ones.

    Args:
        pool: asyncpg connection pool.

    Returns:
        Number of events stored.
    """
    if pool is None:
        logger.warning("Finnhub calendar refresh skipped: no database pool")
        return 0

    api_key = os.getenv("FINNHUB_API_KEY", "").strip()
    if not api_key:
        logger.warning("Finnhub calendar refresh skipped: FINNHUB_API_KEY not set")
        return 0

    # Clear previous Finnhub calendar entries for upcoming dates
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                DELETE FROM economic_calendar
                WHERE source = 'FINNHUB'
                  AND event_date >= CURRENT_DATE
                """
            )
    except Exception as exc:
        logger.error("Finnhub calendar: failed to clear old entries: %s", exc)

    return await fetch_economic_calendar(pool, days_forward=7)
