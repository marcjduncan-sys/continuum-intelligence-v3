#!/usr/bin/env python3
"""
RBA Local Scraper -- downloads RBA statistical tables and pushes parsed
series to the Continuum Intelligence backend via POST /api/economist/ingest-rba.

Intended to run on a local machine (not Fly.io) because the RBA website
blocks cloud IPs via Akamai WAF.

Usage:
    python tools/rba_local_scraper.py \\
        --url https://your-backend/api/economist/ingest-rba \\
        --api-key YOUR_CI_API_KEY

Tables scraped:
    a02hist.csv  - Cash rate target
    f01hist.csv  - 90-day bank bill rate
    f02hist.csv  - AU 2Y, 3Y, 5Y, 10Y government bond yields
    f11hist.csv  - AUD/USD, AUD/NZD, TWI
    d01hist.csv  - Total credit growth, housing credit growth
    g01hist.csv  - CPI headline, CPI trimmed mean (quarterly YoY)
"""

import argparse
import csv
import logging
import sys
from datetime import datetime

import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

RBA_BASE = "https://www.rba.gov.au/statistics/tables/csv"

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-AU,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


def _download_csv(table_name: str) -> str:
    """Download an RBA CSV table and return its text content."""
    url = f"{RBA_BASE}/{table_name}"
    logger.info("Downloading %s", url)
    resp = requests.get(url, headers=BROWSER_HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.text


def _parse_rba_csv(text: str) -> list[dict[str, str]]:
    """Parse RBA CSV format into list of row dicts.

    RBA CSVs have metadata rows before the header. The header row
    starts with 'Series ID' or 'Title'. We skip until we find it.
    """
    lines = text.strip().splitlines()
    header_idx = None
    for i, line in enumerate(lines):
        if line.startswith("Series ID") or line.startswith("Title"):
            header_idx = i
            break
    if header_idx is None:
        for i, line in enumerate(lines):
            if "," in line and not line.startswith("#"):
                header_idx = i
                break
    if header_idx is None:
        logger.warning("Could not find header row in CSV")
        return []
    reader = csv.DictReader(lines[header_idx:])
    return list(reader)


def _last_valid_value(rows, col_name):
    """Find the last non-empty value in a column, returning (value, date)."""
    if not rows:
        return None, None
    date_col = None
    for key in rows[0].keys():
        lower = key.strip().lower()
        if lower in ("date", "series id", "title"):
            date_col = key
            break
    if date_col is None:
        date_col = list(rows[0].keys())[0]
    for row in reversed(rows):
        val = row.get(col_name, "").strip()
        if val and val not in ("", "na", "n/a", "-"):
            date_str = row.get(date_col, "").strip() if date_col else ""
            return val, date_str
    return None, None


def _find_column(rows, *search_terms):
    """Find a column name containing any of the search terms (case-insensitive)."""
    if not rows:
        return None
    for col in rows[0].keys():
        col_lower = col.lower()
        for term in search_terms:
            if term.lower() in col_lower:
                return col
    return None


def _format_date(date_str):
    """Try to normalise an RBA date string to YYYY-MM-DD."""
    if not date_str:
        return ""
    for fmt in ("%d-%b-%Y", "%d/%m/%Y", "%Y-%m-%d", "%b-%Y", "%d-%b-%y"):
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return date_str.strip()


def scrape_a02(text):
    """a02hist.csv: Cash rate target."""
    rows = _parse_rba_csv(text)
    col = _find_column(rows, "cash rate target", "cash rate")
    if not col:
        logger.warning("a02: cash rate column not found")
        return []
    val, date = _last_valid_value(rows, col)
    if val is None:
        return []
    return [{"series_id": "rba_cash_rate", "description": "RBA Cash Rate Target",
             "value": float(val), "date": _format_date(date), "unit": "%", "frequency": "D"}]


def scrape_f01(text):
    """f01hist.csv: 90-day bank bill rate."""
    rows = _parse_rba_csv(text)
    col = _find_column(rows, "90-day", "90 day", "bank accepted")
    if not col:
        logger.warning("f01: 90-day bank bill column not found")
        return []
    val, date = _last_valid_value(rows, col)
    if val is None:
        return []
    return [{"series_id": "rba_90d_bill", "description": "AU 90-Day Bank Bill Rate",
             "value": float(val), "date": _format_date(date), "unit": "%", "frequency": "D"}]


def scrape_f02(text):
    """f02hist.csv: AU government bond yields (2Y, 3Y, 5Y, 10Y)."""
    rows = _parse_rba_csv(text)
    series = []
    targets = [
        ("2 year", "rba_au_2y", "AU 2Y Government Bond Yield"),
        ("3 year", "rba_au_3y", "AU 3Y Government Bond Yield"),
        ("5 year", "rba_au_5y", "AU 5Y Government Bond Yield"),
        ("10 year", "rba_au_10y", "AU 10Y Government Bond Yield"),
    ]
    for search, sid, desc in targets:
        col = _find_column(rows, search)
        if not col:
            logger.warning("f02: column for %r not found", search)
            continue
        val, date = _last_valid_value(rows, col)
        if val is not None:
            series.append({"series_id": sid, "description": desc,
                           "value": float(val), "date": _format_date(date),
                           "unit": "%", "frequency": "D"})
    return series


def scrape_f11(text):
    """f11hist.csv: Exchange rates (AUD/USD, AUD/NZD, TWI)."""
    rows = _parse_rba_csv(text)
    series = []
    targets = [
        ("usd", "rba_aud_usd", "AUD/USD Exchange Rate", "AUD/USD"),
        ("nzd", "rba_aud_nzd", "AUD/NZD Exchange Rate", "AUD/NZD"),
        ("twi", "rba_twi", "AUD Trade-Weighted Index", "index"),
    ]
    for search, sid, desc, unit in targets:
        col = _find_column(rows, search)
        if not col:
            logger.warning("f11: column for %r not found", search)
            continue
        val, date = _last_valid_value(rows, col)
        if val is not None:
            series.append({"series_id": sid, "description": desc,
                           "value": float(val), "date": _format_date(date),
                           "unit": unit, "frequency": "D"})
    return series


def scrape_d01(text):
    """d01hist.csv: Credit aggregates (total credit, housing credit)."""
    rows = _parse_rba_csv(text)
    series = []
    targets = [
        ("total credit", "rba_credit_total", "AU Total Credit Growth MoM Annualised"),
        ("housing", "rba_credit_housing", "AU Housing Credit Growth MoM Annualised"),
    ]
    for search, sid, desc in targets:
        col = _find_column(rows, search)
        if not col:
            logger.warning("d01: column for %r not found", search)
            continue
        val, date = _last_valid_value(rows, col)
        if val is not None:
            series.append({"series_id": sid, "description": desc,
                           "value": float(val), "date": _format_date(date),
                           "unit": "%", "frequency": "M"})
    return series


def scrape_g01(text):
    """g01hist.csv: CPI (headline and trimmed mean, quarterly YoY)."""
    rows = _parse_rba_csv(text)
    series = []
    targets = [
        ("all groups", "rba_cpi_headline", "AU CPI Headline YoY"),
        ("trimmed mean", "rba_cpi_trimmed", "AU CPI Trimmed Mean YoY"),
    ]
    for search, sid, desc in targets:
        col = _find_column(rows, search)
        if not col:
            if "all groups" in search:
                col = _find_column(rows, "consumer price index", "cpi")
            elif "trimmed" in search:
                col = _find_column(rows, "trimmed")
        if not col:
            logger.warning("g01: column for %r not found", search)
            continue
        val, date = _last_valid_value(rows, col)
        if val is not None:
            series.append({"series_id": sid, "description": desc,
                           "value": float(val), "date": _format_date(date),
                           "unit": "%", "frequency": "Q"})
    return series


TABLE_SCRAPERS = {
    "a02hist.csv": scrape_a02,
    "f01hist.csv": scrape_f01,
    "f02hist.csv": scrape_f02,
    "f11hist.csv": scrape_f11,
    "d01hist.csv": scrape_d01,
    "g01hist.csv": scrape_g01,
}


def main():
    parser = argparse.ArgumentParser(
        description="Scrape RBA tables and push to Continuum Intelligence backend"
    )
    parser.add_argument("--url", required=True,
                        help="Backend ingest URL (e.g. https://ci-api.fly.dev/api/economist/ingest-rba)")
    parser.add_argument("--api-key", required=True, help="CI API key for authentication")
    parser.add_argument("--dry-run", action="store_true",
                        help="Parse tables but do not POST to backend")
    args = parser.parse_args()

    all_series = []
    for table_name, scraper_fn in TABLE_SCRAPERS.items():
        try:
            text = _download_csv(table_name)
            series = scraper_fn(text)
            logger.info("%s: extracted %d series", table_name, len(series))
            all_series.extend(series)
        except Exception as exc:
            logger.error("Failed to scrape %s: %s", table_name, exc)

    if not all_series:
        logger.error("No series extracted from any table")
        sys.exit(1)

    logger.info("Total series extracted: %d", len(all_series))
    for s in all_series:
        logger.info("  %s = %s (%s)", s["series_id"], s["value"], s["date"])

    if args.dry_run:
        logger.info("Dry run: skipping POST")
        return

    payload = {"source": "RBA", "series": all_series}
    logger.info("POSTing %d series to %s", len(all_series), args.url)
    resp = requests.post(
        args.url,
        json=payload,
        headers={"Content-Type": "application/json", "X-API-Key": args.api_key},
        timeout=30,
    )

    if resp.status_code == 200:
        result = resp.json()
        logger.info("Success: %s", result)
    else:
        logger.error("POST failed: HTTP %d -- %s", resp.status_code, resp.text[:500])
        sys.exit(1)


if __name__ == "__main__":
    main()
