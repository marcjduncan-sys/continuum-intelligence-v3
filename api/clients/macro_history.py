"""
Shared helper for macro_series_history append and retention.

Called by fred_client, eia_client, rba_client after each successful upsert
to macro_series. Also called by av_macro_client after each insert to
macro_prices (FX rates already append, but we unify the history view).

Retention: deletes rows older than 90 days at the end of each refresh cycle.
"""

import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


async def append_history(
    pool: Any,
    source: str,
    series_id: str,
    value: float | None,
    obs_date: str | None,
) -> bool:
    """Append a single observation to macro_series_history.

    Returns True if the insert succeeded.
    """
    if value is None:
        return False

    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO macro_series_history
                    (source, series_id, value, obs_date, recorded_at)
                VALUES ($1, $2, $3, $4, NOW())
                """,
                source,
                series_id,
                value,
                obs_date or "",
            )
        return True
    except Exception as exc:
        logger.warning("macro_history: append failed for %s/%s: %s", source, series_id, exc)
        return False


async def prune_history(pool: Any, retention_days: int = 90) -> int:
    """Delete macro_series_history rows older than retention_days.

    Returns the number of rows deleted.
    """
    try:
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM macro_series_history
                WHERE recorded_at < NOW() - INTERVAL '1 day' * $1
                """,
                retention_days,
            )
            deleted = int(result.split()[-1]) if result else 0
            if deleted > 0:
                logger.info("macro_history: pruned %d rows older than %d days", deleted, retention_days)
            return deleted
    except Exception as exc:
        logger.warning("macro_history: prune failed: %s", exc)
        return 0
