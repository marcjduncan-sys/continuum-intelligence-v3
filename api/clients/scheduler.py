"""
Economist data refresh scheduler.

Orchestrates periodic refresh of all macro data sources using
asyncio background tasks. Respects the gather semaphore (max 3
concurrent external fetches) and handles failures without crashing
the server.

Schedule:
- FRED:     daily at 06:00 UTC (after US market close)
- EIA:      daily at 06:00 UTC
- BIS:      weekly Monday 06:00 UTC
- ABS:      daily at 02:00 UTC (MVP; ideally on release days)
- RBA:      daily at 07:00 UTC (after 4pm AEST RBA update)
- Finnhub:  daily at 00:00 UTC
- ACLED:    daily at 04:00 UTC
- FX/prices: every 15 minutes during trading hours (Sun 22:00 - Fri 22:00 UTC)
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine

logger = logging.getLogger(__name__)

# Gather semaphore: max 3 concurrent external data operations
_gather_semaphore = asyncio.Semaphore(3)

# Track running state to prevent overlapping refresh cycles
_running_jobs: set[str] = set()

# Scheduler task handles for cleanup on shutdown
_scheduler_tasks: list[asyncio.Task] = []


async def _run_with_semaphore(
    name: str,
    coro_fn: Callable[..., Coroutine],
    *args: Any,
) -> Any:
    """Run a refresh function under the gather semaphore.

    Logs start/end times and handles failures gracefully.
    """
    if name in _running_jobs:
        logger.info("Scheduler: %s already running, skipping", name)
        return None

    _running_jobs.add(name)
    start = datetime.now(timezone.utc)
    logger.info("Scheduler: %s starting at %s", name, start.isoformat())

    try:
        async with _gather_semaphore:
            result = await coro_fn(*args)
        elapsed = (datetime.now(timezone.utc) - start).total_seconds()
        logger.info("Scheduler: %s completed in %.1fs", name, elapsed)
        return result
    except Exception as exc:
        elapsed = (datetime.now(timezone.utc) - start).total_seconds()
        logger.error(
            "Scheduler: %s failed after %.1fs: %s",
            name, elapsed, exc,
        )
        return None
    finally:
        _running_jobs.discard(name)


def _utc_now() -> datetime:
    """Return current UTC datetime."""
    return datetime.now(timezone.utc)


def _is_trading_hours() -> bool:
    """Check if FX markets are open (Sun 22:00 - Fri 22:00 UTC)."""
    now = _utc_now()
    weekday = now.weekday()  # 0=Mon, 6=Sun
    hour = now.hour

    # Markets closed: Fri 22:00 to Sun 22:00 UTC
    if weekday == 5:  # Saturday
        return False
    if weekday == 4 and hour >= 22:  # Friday after 22:00
        return False
    if weekday == 6 and hour < 22:  # Sunday before 22:00
        return False
    return True


async def _scheduled_loop(
    name: str,
    coro_fn: Callable[..., Coroutine],
    pool: Any,
    target_hour: int,
    target_minute: int = 0,
    weekday_only: bool = False,
    weekly_day: int | None = None,
) -> None:
    """Run a refresh job at a specific UTC hour each day (or week).

    Args:
        name: Job name for logging.
        coro_fn: Async function to call with (pool,) as argument.
        pool: asyncpg connection pool.
        target_hour: UTC hour to run (0-23).
        target_minute: UTC minute to run (0-59).
        weekday_only: If True, skip weekends.
        weekly_day: If set, only run on this weekday (0=Mon).
    """
    while True:
        try:
            now = _utc_now()
            # Calculate seconds until next target time
            target = now.replace(
                hour=target_hour, minute=target_minute, second=0, microsecond=0
            )
            if target <= now:
                # Already past today's target; schedule for tomorrow
                from datetime import timedelta as _td
                target = target + _td(days=1)

            # Adjust for weekly schedule
            if weekly_day is not None:
                days_ahead = (weekly_day - target.weekday()) % 7
                if days_ahead == 0 and target <= now:
                    days_ahead = 7
                from datetime import timedelta
                target = target + timedelta(days=days_ahead)

            wait_seconds = (target - now).total_seconds()
            # Sanity cap: never wait more than 7 days
            wait_seconds = min(wait_seconds, 7 * 86400)

            logger.info(
                "Scheduler: %s next run at %s (%.0fs)",
                name, target.isoformat(), wait_seconds,
            )
            await asyncio.sleep(wait_seconds)

            # Check weekday constraint
            now = _utc_now()
            if weekday_only and now.weekday() >= 5:
                continue

            await _run_with_semaphore(name, coro_fn, pool)

        except asyncio.CancelledError:
            logger.info("Scheduler: %s cancelled", name)
            break
        except Exception as exc:
            logger.error("Scheduler: %s loop error: %s", name, exc)
            # Wait 60s before retrying to avoid tight error loops
            await asyncio.sleep(60)


async def _fx_price_loop(pool: Any) -> None:
    """Run FX/commodity price refresh every 15 minutes during trading hours."""
    from clients.av_macro_client import refresh_all_fx

    while True:
        try:
            if _is_trading_hours():
                await _run_with_semaphore("fx_prices", refresh_all_fx, pool)
            else:
                logger.debug("Scheduler: fx_prices skipped (markets closed)")

            # Wait 15 minutes
            await asyncio.sleep(15 * 60)

        except asyncio.CancelledError:
            logger.info("Scheduler: fx_prices loop cancelled")
            break
        except Exception as exc:
            logger.error("Scheduler: fx_prices loop error: %s", exc)
            await asyncio.sleep(60)


async def start_scheduler(pool: Any) -> None:
    """Start all scheduled refresh tasks as background asyncio tasks.

    Should be called once during FastAPI lifespan startup.

    Args:
        pool: asyncpg connection pool.
    """
    if pool is None:
        logger.warning("Scheduler: not starting (no database pool)")
        return

    # Import refresh functions
    from clients.fred_client import refresh_all_fred
    from clients.eia_client import refresh_all_eia
    from clients.bis_client import refresh_all_bis
    from clients.abs_client import refresh_all_abs
    from clients.rba_client import refresh_all_rba
    from clients.finnhub_calendar_client import refresh_finnhub_calendar
    from clients.acled_client import refresh_acled

    jobs: list[tuple[str, Callable, dict]] = [
        ("fred", refresh_all_fred, {"target_hour": 6, "target_minute": 0}),
        ("eia", refresh_all_eia, {"target_hour": 6, "target_minute": 15}),
        ("bis", refresh_all_bis, {"target_hour": 6, "target_minute": 0, "weekly_day": 0}),
        ("abs", refresh_all_abs, {"target_hour": 2, "target_minute": 0}),
        ("rba", refresh_all_rba, {"target_hour": 7, "target_minute": 0}),
        ("finnhub_calendar", refresh_finnhub_calendar, {"target_hour": 0, "target_minute": 0}),
        ("acled", refresh_acled, {"target_hour": 4, "target_minute": 0}),
    ]

    for name, fn, kwargs in jobs:
        task = asyncio.create_task(
            _scheduled_loop(name, fn, pool, **kwargs),
            name=f"economist_scheduler_{name}",
        )
        _scheduler_tasks.append(task)
        logger.info("Scheduler: registered %s", name)

    # FX prices: every 15 min during trading hours
    fx_task = asyncio.create_task(
        _fx_price_loop(pool),
        name="economist_scheduler_fx_prices",
    )
    _scheduler_tasks.append(fx_task)
    logger.info("Scheduler: registered fx_prices (15min interval)")

    logger.info("Scheduler: %d jobs registered", len(_scheduler_tasks))


async def stop_scheduler() -> None:
    """Cancel all scheduled refresh tasks. Call during shutdown."""
    for task in _scheduler_tasks:
        task.cancel()

    if _scheduler_tasks:
        await asyncio.gather(*_scheduler_tasks, return_exceptions=True)
        logger.info("Scheduler: all %d tasks cancelled", len(_scheduler_tasks))
    _scheduler_tasks.clear()


async def run_all_now(pool: Any) -> dict[str, Any]:
    """Trigger an immediate refresh of all data sources.

    Useful for initial data population or manual refresh.
    Respects the gather semaphore.

    Args:
        pool: asyncpg connection pool.

    Returns:
        Dict mapping source name to result.
    """
    if pool is None:
        return {"error": "no database pool"}

    from clients.fred_client import refresh_all_fred
    from clients.eia_client import refresh_all_eia
    from clients.bis_client import refresh_all_bis
    from clients.abs_client import refresh_all_abs
    from clients.rba_client import refresh_all_rba
    from clients.av_macro_client import refresh_all_fx
    from clients.finnhub_calendar_client import refresh_finnhub_calendar
    from clients.acled_client import refresh_acled

    results: dict[str, Any] = {}

    sources = [
        ("fred", refresh_all_fred),
        ("eia", refresh_all_eia),
        ("bis", refresh_all_bis),
        ("abs", refresh_all_abs),
        ("rba", refresh_all_rba),
        ("fx", refresh_all_fx),
        ("finnhub_calendar", refresh_finnhub_calendar),
        ("acled", refresh_acled),
    ]

    for name, fn in sources:
        result = await _run_with_semaphore(name, fn, pool)
        results[name] = result

    return results
