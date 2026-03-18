"""
Background task failure monitoring.

Wraps asyncio.create_task() calls with error tracking. Failures are counted
in a 1-hour sliding window and exposed via /api/health. If failures exceed
a threshold (default 10/hour), a CRITICAL log is emitted.
"""

import asyncio
import logging
import time
from collections import deque

logger = logging.getLogger(__name__)

FAILURE_THRESHOLD = 10
WINDOW_SECONDS = 3600

# Deque of failure timestamps (monotonic) within the sliding window
_failure_times: deque[float] = deque()


def _prune() -> None:
    """Remove failure timestamps older than the window."""
    cutoff = time.monotonic() - WINDOW_SECONDS
    while _failure_times and _failure_times[0] < cutoff:
        _failure_times.popleft()


def get_failure_count() -> int:
    """Return background task failures in the last hour."""
    _prune()
    return len(_failure_times)


def monitored_task(coro, *, name: str = "unnamed") -> asyncio.Task:
    """Create an asyncio task that logs and counts failures.

    Drop-in replacement for asyncio.create_task() with monitoring.
    """

    async def _wrapper():
        try:
            await coro
        except asyncio.CancelledError:
            raise
        except Exception:
            now = time.monotonic()
            _failure_times.append(now)
            _prune()
            count = len(_failure_times)
            logger.error(
                "Background task '%s' failed", name, exc_info=True,
            )
            if count >= FAILURE_THRESHOLD:
                logger.critical(
                    "Background task failure threshold breached: "
                    "%d failures in the last hour (threshold: %d)",
                    count, FAILURE_THRESHOLD,
                )

    return asyncio.create_task(_wrapper(), name=f"monitored:{name}")
