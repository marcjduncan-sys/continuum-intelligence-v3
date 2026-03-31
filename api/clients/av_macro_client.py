"""
Alpha Vantage FX rate client for the Economist module.

Fetches real-time FX rates and stores in macro_prices.
Uses the same ALPHA_VANTAGE_API_KEY as the existing equity client
in data_providers.py but targets the CURRENCY_EXCHANGE_RATE endpoint.

Free tier: 25 requests/day. This module uses its own counter
separate from the equity client.
"""

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx

import config

logger = logging.getLogger(__name__)

BASE_URL = "https://www.alphavantage.co/query"
TIMEOUT = httpx.Timeout(15.0, connect=10.0)

# FX pairs to track
FX_PAIRS: list[tuple[str, str]] = [
    ("AUD", "USD"),
    ("NZD", "USD"),
    ("AUD", "NZD"),
    ("EUR", "USD"),
    ("USD", "JPY"),
    ("GBP", "USD"),
    ("USD", "CNY"),
    ("XAU", "USD"),
]

_av_macro_call_count = 0
_av_macro_call_date = ""


async def fetch_fx_rate(
    from_ccy: str,
    to_ccy: str,
    pool: Any,
    client: httpx.AsyncClient,
) -> bool:
    """Fetch a single FX rate and upsert into macro_prices.

    Args:
        from_ccy: Source currency (e.g. 'AUD').
        to_ccy: Target currency (e.g. 'USD').
        pool: asyncpg connection pool.
        client: Shared httpx client.

    Returns:
        True if upsert succeeded.
    """
    global _av_macro_call_count, _av_macro_call_date

    api_key = config.ALPHA_VANTAGE_API_KEY
    if not api_key:
        return False

    # Daily call budget (separate from equity client)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if _av_macro_call_date != today:
        _av_macro_call_count = 0
        _av_macro_call_date = today
    if _av_macro_call_count >= 20:
        logger.warning("AV macro: daily call limit reached")
        return False

    symbol = f"{from_ccy}/{to_ccy}"

    try:
        _av_macro_call_count += 1
        resp = await client.get(
            BASE_URL,
            params={
                "function": "CURRENCY_EXCHANGE_RATE",
                "from_currency": from_ccy,
                "to_currency": to_ccy,
                "apikey": api_key,
            },
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.error("AV macro: FX fetch failed for %s: %s", symbol, exc)
        return False

    rate_data = data.get("Realtime Currency Exchange Rate", {})
    if not rate_data:
        # Check for rate limit message
        if "Note" in data or "Information" in data:
            logger.warning("AV macro: rate limited or quota exceeded for %s", symbol)
        else:
            logger.warning("AV macro: no rate data for %s", symbol)
        return False

    try:
        price = float(rate_data.get("5. Exchange Rate", 0))
    except (ValueError, TypeError):
        logger.warning("AV macro: invalid rate value for %s", symbol)
        return False

    if price <= 0:
        return False

    # Calculate approximate change (not available from this endpoint)
    change_pct = None

    try:
        async with pool.acquire() as conn:
            # Get previous price for change calculation
            prev_row = await conn.fetchrow(
                """
                SELECT price FROM macro_prices
                WHERE symbol = $1
                ORDER BY fetched_at DESC
                LIMIT 1
                """,
                symbol,
            )
            if prev_row and prev_row["price"]:
                prev_price = float(prev_row["price"])
                if prev_price > 0:
                    change_pct = ((price - prev_price) / prev_price) * 100

            await conn.execute(
                """
                INSERT INTO macro_prices (symbol, price, change_pct, source, fetched_at)
                VALUES ($1, $2, $3, $4, NOW())
                """,
                symbol,
                price,
                change_pct,
                "AV",
            )
        logger.info("AV macro: upserted %s = %s", symbol, price)

        # Append to unified history for rolling stats (regime detection)
        from clients.macro_history import append_history
        await append_history(pool, "AV", symbol, float(price), today)

        return True
    except Exception as exc:
        logger.error("AV macro: DB insert failed for %s: %s", symbol, exc)
        return False


async def refresh_all_fx(pool: Any) -> dict[str, bool]:
    """Fetch all tracked FX pairs from Alpha Vantage.

    Args:
        pool: asyncpg connection pool.

    Returns:
        Dict mapping pair symbol to success boolean.
    """
    if pool is None:
        logger.warning("AV FX refresh skipped: no database pool")
        return {}

    api_key = config.ALPHA_VANTAGE_API_KEY
    if not api_key:
        logger.warning("AV FX refresh skipped: ALPHA_VANTAGE_API_KEY not set")
        return {}

    logger.info("AV FX refresh starting for %d pairs", len(FX_PAIRS))
    start = datetime.now(timezone.utc)
    results: dict[str, bool] = {}

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for from_ccy, to_ccy in FX_PAIRS:
            symbol = f"{from_ccy}/{to_ccy}"
            try:
                ok = await fetch_fx_rate(from_ccy, to_ccy, pool, client)
                results[symbol] = ok
            except Exception as exc:
                logger.error("AV FX: unexpected error for %s: %s", symbol, exc)
                results[symbol] = False
            # AV free tier is strict; pace requests
            await asyncio.sleep(1.5)

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    success_count = sum(1 for v in results.values() if v)
    logger.info(
        "AV FX refresh complete: %d/%d pairs in %.1fs",
        success_count, len(FX_PAIRS), elapsed,
    )

    # Prune old history rows (90-day retention)
    from clients.macro_history import prune_history
    await prune_history(pool)

    return results
