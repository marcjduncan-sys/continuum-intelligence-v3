#!/usr/bin/env python3
"""One-off bulk backfill: run deep extraction for all registered notebooks.

Populates notebookCorpus in each ticker's research JSON.
Sequential execution with 30s sleep between tickers to avoid NLM rate limits.

Usage:
    cd api && python ../scripts/backfill_notebook_corpus.py

Prerequisites:
    - NOTEBOOKLM_AUTH_JSON environment variable set with valid credentials
    - Each notebook must have Notebook Guide set (forensic analyst persona)
    - Each notebook should have 00_FORENSIC_RUBRIC.txt uploaded as source
"""

import asyncio
import json
import logging
import os
import sys
from pathlib import Path

# Add api/ to sys.path so we can import config and notebook_context
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'api'))

import config

try:
    import notebook_context
except ImportError as e:
    print(f"ERROR: Could not import notebook_context: {e}")
    print("Ensure you are running from the api/ directory: cd api && python ../scripts/backfill_notebook_corpus.py")
    sys.exit(1)

# Constants
SLEEP_BETWEEN_TICKERS = 30
DATA_DIR = Path(config.PROJECT_ROOT) / 'data' / 'research'

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s'
)
logger = logging.getLogger(__name__)


async def backfill_ticker(ticker: str) -> tuple[str, bool, str]:
    """
    Backfill a single ticker's notebookCorpus.

    Returns:
        (ticker, success, message)
    """
    json_path = DATA_DIR / f"{ticker}.json"

    # Check if research JSON exists
    if not json_path.exists():
        msg = f"Research JSON not found: {json_path}"
        logger.warning(f"{ticker}: {msg}")
        return (ticker, False, msg)

    # Load existing research data
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        msg = f"Failed to load research JSON: {e}"
        logger.warning(f"{ticker}: {msg}")
        return (ticker, False, msg)

    # Check if already populated
    notebook_corpus = data.get('notebookCorpus', {})
    dimensions_populated = notebook_corpus.get('_dimensionsPopulated', 0)

    if dimensions_populated >= 6:
        msg = f"Already populated ({dimensions_populated} dimensions)"
        logger.info(f"{ticker}: {msg}")
        return (ticker, True, msg)

    # Call run_deep_extraction (async function)
    logger.info(f"{ticker}: Running deep extraction...")
    try:
        result = await notebook_context.run_deep_extraction(ticker)
    except Exception as e:
        msg = f"run_deep_extraction() failed: {e}"
        logger.error(f"{ticker}: {msg}")
        return (ticker, False, msg)

    # Check if extraction was successful
    if not result or '_extractedAt' not in result:
        msg = "Deep extraction returned no valid result"
        logger.warning(f"{ticker}: {msg}")
        return (ticker, False, msg)

    # Write back to research JSON
    data['notebookCorpus'] = result
    try:
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        dimensions = result.get('_dimensionsPopulated', 0)
        msg = f"Success: {dimensions} dimensions populated"
        logger.info(f"{ticker}: {msg}")
        return (ticker, True, msg)
    except Exception as e:
        msg = f"Failed to write research JSON: {e}"
        logger.error(f"{ticker}: {msg}")
        return (ticker, False, msg)


async def main():
    """Main backfill orchestrator."""
    logger.info("Notebook corpus backfill starting...")

    # Load ticker registry from config
    tickers = sorted([
        k for k in config.NOTEBOOKLM_TICKER_NOTEBOOKS.keys()
        if not k.startswith('_')
    ])

    if not tickers:
        logger.error("No tickers found in NOTEBOOKLM_TICKER_NOTEBOOKS")
        return

    logger.info(f"Found {len(tickers)} registered notebooks: {', '.join(tickers)}")

    results = []
    for i, ticker in enumerate(tickers):
        ticker_result = await backfill_ticker(ticker)
        results.append(ticker_result)

        # Sleep before next ticker (except after the last one)
        if i < len(tickers) - 1:
            logger.info(f"Sleeping {SLEEP_BETWEEN_TICKERS}s before next ticker...")
            await asyncio.sleep(SLEEP_BETWEEN_TICKERS)

    # Summary
    succeeded = sum(1 for _, success, _ in results if success)
    failed = sum(1 for _, success, _ in results if not success)
    skipped = sum(1 for _, _, msg in results if 'Already populated' in msg)

    logger.info(
        "Backfill complete: %d succeeded, %d failed, "
        "%d skipped out of %d tickers",
        succeeded, failed, skipped, len(tickers),
    )

    # Log individual failures for follow-up
    for ticker, success, msg in results:
        if not success and 'Already populated' not in msg:
            logger.warning("  FAILED: %s -- %s", ticker, msg)


if __name__ == "__main__":
    asyncio.run(main())
