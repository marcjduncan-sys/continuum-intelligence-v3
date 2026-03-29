"""
RBA (Reserve Bank of Australia) data scraper.

Downloads and parses XLS statistical tables and the calendar page.
Stores results in macro_series (source='RBA') and economic_calendar.

RBA publishes CSV/XLS files at known URLs. No API key required.
Uses defensive column-name-based parsing as the RBA occasionally
changes table format.
"""

import asyncio
import csv
import io
import logging
import re
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(30.0, connect=15.0)

# RBA table configurations
# Each table maps to a URL and the series we want to extract.
# column_pattern is a regex matched against column headers (case-insensitive).
_TABLES: list[dict[str, Any]] = [
    {
        "url": "https://www.rba.gov.au/statistics/tables/csv/a02hist.csv",
        "table_name": "A02 - Cash Rate",
        "series": [
            {
                "column_pattern": r"cash\s*rate\s*target",
                "series_id": "CASH_RATE",
                "description": "RBA Cash Rate Target",
                "unit": "%",
                "frequency": "D",
            },
        ],
    },
    {
        "url": "https://www.rba.gov.au/statistics/tables/csv/f01hist.csv",
        "table_name": "F01 - Money Market Rates",
        "series": [
            {
                "column_pattern": r"cash\s*rate",
                "series_id": "CASH_RATE_ACTUAL",
                "description": "RBA Cash Rate (Actual)",
                "unit": "%",
                "frequency": "D",
            },
        ],
    },
    {
        "url": "https://www.rba.gov.au/statistics/tables/csv/f02hist.csv",
        "table_name": "F02 - Capital Market Yields",
        "series": [
            {
                "column_pattern": r"2\s*year",
                "series_id": "AU_2Y",
                "description": "Australia 2Y Government Bond Yield",
                "unit": "%",
                "frequency": "D",
            },
            {
                "column_pattern": r"3\s*year",
                "series_id": "AU_3Y",
                "description": "Australia 3Y Government Bond Yield",
                "unit": "%",
                "frequency": "D",
            },
            {
                "column_pattern": r"5\s*year",
                "series_id": "AU_5Y",
                "description": "Australia 5Y Government Bond Yield",
                "unit": "%",
                "frequency": "D",
            },
            {
                "column_pattern": r"10\s*year",
                "series_id": "AU_10Y",
                "description": "Australia 10Y Government Bond Yield",
                "unit": "%",
                "frequency": "D",
            },
        ],
    },
    {
        "url": "https://www.rba.gov.au/statistics/tables/csv/f11hist.csv",
        "table_name": "F11 - Exchange Rates",
        "series": [
            {
                "column_pattern": r"USD",
                "series_id": "AUDUSD",
                "description": "AUD/USD Exchange Rate",
                "unit": "USD",
                "frequency": "D",
            },
            {
                "column_pattern": r"(TWI|trade.weighted)",
                "series_id": "AU_TWI",
                "description": "AUD Trade Weighted Index",
                "unit": "index",
                "frequency": "D",
            },
        ],
    },
    {
        "url": "https://www.rba.gov.au/statistics/tables/csv/d01hist.csv",
        "table_name": "D01 - Credit Aggregates",
        "series": [
            {
                "column_pattern": r"total\s*credit.*growth|credit.*total.*growth",
                "series_id": "CREDIT_GROWTH",
                "description": "Australia Total Credit Growth",
                "unit": "%",
                "frequency": "M",
            },
            {
                "column_pattern": r"housing\s*credit.*growth|credit.*housing.*growth",
                "series_id": "HOUSING_CREDIT_GROWTH",
                "description": "Australia Housing Credit Growth",
                "unit": "%",
                "frequency": "M",
            },
        ],
    },
    {
        "url": "https://www.rba.gov.au/statistics/tables/csv/g01hist.csv",
        "table_name": "G01 - CPI",
        "series": [
            {
                "column_pattern": r"all\s*groups.*year|year.*all\s*groups",
                "series_id": "CPI_YOY",
                "description": "Australia CPI All Groups YoY (RBA)",
                "unit": "%",
                "frequency": "Q",
            },
            {
                "column_pattern": r"trimmed\s*mean",
                "series_id": "CPI_TRIMMED_MEAN",
                "description": "Australia Trimmed Mean CPI",
                "unit": "%",
                "frequency": "Q",
            },
        ],
    },
    {
        "url": "https://www.rba.gov.au/statistics/tables/csv/i02hist.csv",
        "table_name": "I02 - Commodity Prices",
        "series": [
            {
                "column_pattern": r"iron\s*ore",
                "series_id": "IRON_ORE",
                "description": "Iron Ore Price (RBA Index)",
                "unit": "index",
                "frequency": "M",
            },
            {
                "column_pattern": r"gold",
                "series_id": "GOLD",
                "description": "Gold Price (RBA Index)",
                "unit": "index",
                "frequency": "M",
            },
            {
                "column_pattern": r"copper",
                "series_id": "COPPER",
                "description": "Copper Price (RBA Index)",
                "unit": "index",
                "frequency": "M",
            },
            {
                "column_pattern": r"base\s*metals",
                "series_id": "BASE_METALS",
                "description": "Base Metals Price (RBA Index)",
                "unit": "index",
                "frequency": "M",
            },
        ],
    },
]


def _parse_rba_csv(text: str) -> tuple[list[str], list[list[str]]]:
    """Parse an RBA CSV file, skipping header metadata rows.

    RBA CSVs have several metadata rows before the actual data.
    The first row starting with 'Series ID' or 'Title' is the header.

    Returns:
        Tuple of (headers, data_rows).
    """
    lines = text.strip().split("\n")
    headers: list[str] = []
    data_start = 0

    for i, line in enumerate(lines):
        # RBA CSVs: look for the row that has the date column
        if line.strip().startswith('"') or line.strip().startswith("Series"):
            # Try to parse as CSV
            reader = csv.reader(io.StringIO(line))
            row = next(reader, [])
            # The data header row typically starts with empty or 'date'
            lower_cols = [c.lower().strip() for c in row]
            if any("date" in c for c in lower_cols) or any("series" in c for c in lower_cols):
                headers = [c.strip() for c in row]
                data_start = i + 1
                break

    if not headers:
        # Fallback: just use the first row as headers
        reader = csv.reader(io.StringIO(lines[0]))
        headers = [c.strip() for c in next(reader, [])]
        data_start = 1

    data_rows: list[list[str]] = []
    for line in lines[data_start:]:
        if not line.strip():
            continue
        reader = csv.reader(io.StringIO(line))
        row = next(reader, [])
        if row and row[0].strip():
            data_rows.append([c.strip() for c in row])

    return headers, data_rows


def _find_column_index(headers: list[str], pattern: str) -> int | None:
    """Find the first column index matching a regex pattern (case-insensitive)."""
    regex = re.compile(pattern, re.IGNORECASE)
    for i, h in enumerate(headers):
        if regex.search(h):
            return i
    return None


def _extract_latest(
    data_rows: list[list[str]],
    col_idx: int,
    date_idx: int = 0,
) -> tuple[float | None, str | None, float | None, str | None]:
    """Extract the latest and previous non-empty values from a column.

    Assumes rows are in chronological order (oldest first),
    so we iterate in reverse.
    """
    last_val = None
    last_date = None
    prev_val = None
    prev_date = None

    for row in reversed(data_rows):
        if col_idx >= len(row):
            continue
        raw = row[col_idx].strip()
        if not raw or raw in ("", "na", "n/a", "-"):
            continue
        try:
            val = float(raw.replace(",", ""))
        except (ValueError, TypeError):
            continue

        date_str = row[date_idx].strip() if date_idx < len(row) else ""

        if last_val is None:
            last_val = val
            last_date = date_str
        elif prev_val is None:
            prev_val = val
            prev_date = date_str
            break

    return last_val, last_date, prev_val, prev_date


async def _fetch_rba_table(
    table: dict[str, Any],
    pool: Any,
    client: httpx.AsyncClient,
) -> int:
    """Fetch and parse a single RBA table, upsert matching series.

    Returns the number of series upserted.
    """
    url = table["url"]
    upserted = 0

    try:
        resp = await client.get(url)
        resp.raise_for_status()
    except Exception as exc:
        logger.error("RBA fetch failed for %s: %s", table["table_name"], exc)
        return 0

    headers, data_rows = _parse_rba_csv(resp.text)

    if not headers or not data_rows:
        logger.warning("RBA: no parseable data in %s", table["table_name"])
        return 0

    # Find date column
    date_idx = 0
    for i, h in enumerate(headers):
        if "date" in h.lower():
            date_idx = i
            break

    for series_cfg in table["series"]:
        col_idx = _find_column_index(headers, series_cfg["column_pattern"])
        if col_idx is None:
            logger.warning(
                "RBA: column pattern '%s' not found in %s headers: %s",
                series_cfg["column_pattern"],
                table["table_name"],
                headers[:10],
            )
            continue

        last_val, last_dt, prev_val, prev_dt = _extract_latest(
            data_rows, col_idx, date_idx
        )

        if last_val is None:
            logger.warning(
                "RBA: no valid data for %s in %s",
                series_cfg["series_id"],
                table["table_name"],
            )
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
                    "RBA",
                    series_cfg["series_id"],
                    series_cfg["description"],
                    series_cfg["frequency"],
                    last_val,
                    last_dt,
                    prev_val,
                    prev_dt,
                    series_cfg["unit"],
                )
            logger.info(
                "RBA: upserted %s = %s (%s)",
                series_cfg["series_id"], last_val, last_dt,
            )
            upserted += 1
        except Exception as exc:
            logger.error(
                "RBA: DB upsert failed for %s: %s",
                series_cfg["series_id"], exc,
            )

    return upserted


async def _fetch_rba_calendar(pool: Any, client: httpx.AsyncClient) -> int:
    """Scrape RBA board meeting dates from the calendar page.

    Returns number of events stored.
    """
    url = "https://www.rba.gov.au/schedules-events/calendar.html"
    stored = 0

    try:
        resp = await client.get(url)
        resp.raise_for_status()
    except Exception as exc:
        logger.error("RBA calendar fetch failed: %s", exc)
        return 0

    html = resp.text
    # Match patterns like "3 February 2026" or "18 March 2026" in
    # context of "Board Meeting" or "Monetary Policy Decision"
    date_pattern = re.compile(
        r'(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|'
        r'September|October|November|December)\s+\d{4})',
        re.IGNORECASE,
    )
    meeting_pattern = re.compile(
        r'(monetary\s*policy\s*decision|board\s*meeting)',
        re.IGNORECASE,
    )

    # Simple approach: find table rows or list items containing meeting references
    # and extract dates near them
    lines = html.split("\n")
    meeting_dates: list[str] = []

    for i, line in enumerate(lines):
        if meeting_pattern.search(line):
            # Look for date in this line and nearby lines
            context = "\n".join(lines[max(0, i - 2):i + 3])
            matches = date_pattern.findall(context)
            meeting_dates.extend(matches)

    # Deduplicate
    seen: set[str] = set()
    unique_dates: list[str] = []
    for d in meeting_dates:
        if d not in seen:
            seen.add(d)
            unique_dates.append(d)

    for date_str in unique_dates:
        try:
            event_date = datetime.strptime(date_str, "%d %B %Y").date()
        except ValueError:
            continue

        try:
            async with pool.acquire() as conn:
                # Upsert: avoid duplicates for the same date/event
                await conn.execute(
                    """
                    INSERT INTO economic_calendar
                        (event_date, country, event_name, importance,
                         source, updated_at)
                    VALUES ($1, $2, $3, $4, $5, NOW())
                    ON CONFLICT (event_date, country, event_name, source) DO NOTHING
                    """,
                    event_date,
                    "AU",
                    "RBA Board Meeting / Monetary Policy Decision",
                    "HIGH",
                    "RBA",
                )
            stored += 1
        except Exception as exc:
            logger.error("RBA calendar: DB insert failed for %s: %s", date_str, exc)

    logger.info("RBA calendar: stored %d meeting dates", stored)
    return stored


async def refresh_all_rba(pool: Any) -> dict[str, int]:
    """Fetch all RBA tables and calendar, upsert into macro_series and economic_calendar.

    Args:
        pool: asyncpg connection pool.

    Returns:
        Dict mapping table/section name to count of series upserted.
    """
    if pool is None:
        logger.warning("RBA refresh skipped: no database pool")
        return {}

    logger.info("RBA refresh starting for %d tables + calendar", len(_TABLES))
    start = datetime.now(timezone.utc)
    results: dict[str, int] = {}

    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
        for table in _TABLES:
            try:
                count = await _fetch_rba_table(table, pool, client)
                results[table["table_name"]] = count
            except Exception as exc:
                logger.error("RBA: unexpected error for %s: %s", table["table_name"], exc)
                results[table["table_name"]] = 0
            await asyncio.sleep(1.0)

        # Calendar
        try:
            cal_count = await _fetch_rba_calendar(pool, client)
            results["calendar"] = cal_count
        except Exception as exc:
            logger.error("RBA calendar: unexpected error: %s", exc)
            results["calendar"] = 0

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    total = sum(results.values())
    logger.info("RBA refresh complete: %d items in %.1fs", total, elapsed)
    return results
