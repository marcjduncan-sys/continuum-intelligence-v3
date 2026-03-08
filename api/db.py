"""
Database connection module — asyncpg connection pool.

If DATABASE_URL is not set, all functions are no-ops (dev mode tolerance).
"""

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

_pool = None


async def get_pool():
    """Return the shared asyncpg connection pool. No-op if DATABASE_URL unset."""
    global _pool
    if _pool is not None:
        return _pool

    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        logger.warning("DATABASE_URL not set — database features disabled")
        return None

    try:
        import asyncpg
        _pool = await asyncpg.create_pool(
            database_url,
            min_size=1,
            max_size=10,
            command_timeout=30,
        )
        logger.info("asyncpg connection pool created")
        await run_migrations(_pool)
        return _pool
    except Exception as exc:
        logger.error("Failed to create database pool: %s", exc)
        return None


async def run_migrations(pool):
    """Execute the initial schema migration. Idempotent."""
    if pool is None:
        return
    migration_path = Path(__file__).parent / "migrations" / "001_initial.sql"
    if not migration_path.exists():
        logger.warning("Migration file not found: %s", migration_path)
        return
    sql = migration_path.read_text()
    async with pool.acquire() as conn:
        await conn.execute(sql)
    logger.info("Database migrations applied")


async def close_pool():
    """Gracefully close the connection pool on shutdown."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("asyncpg connection pool closed")
