"""
Tests for staleness warning injection in api/ingest.py _chunk_stock().

Covers the requirement that passages for tickers with research older than
7 days have a warning prepended to every passage, while fresh research
(7 days or fewer) passes through unchanged.
"""

import sys
import os
from datetime import date, timedelta

# Allow importing from api/ without installing the package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

from ingest import _chunk_stock  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _base_data(last_refreshed: str) -> dict:
    """Minimal stock dict with a specific _lastRefreshed timestamp."""
    return {
        "company": "Test Co",
        "sector": "Test",
        "_lastRefreshed": last_refreshed,
    }


def _iso_days_ago(n: int) -> str:
    """Return an ISO 8601 timestamp for exactly N days ago."""
    d = date.today() - timedelta(days=n)
    return d.isoformat() + "T00:00:00+00:00"


# ---------------------------------------------------------------------------
# Warning injection tests
# ---------------------------------------------------------------------------

def test_staleness_warning_injected_when_stale():
    """Passages for a ticker reviewed > 7 days ago must have the warning prepended."""
    data = _base_data(_iso_days_ago(10))
    passages = _chunk_stock("TEST", data)
    assert passages, "Expected at least one passage"
    for p in passages:
        assert p.content.startswith("WARNING:"), (
            f"Expected staleness warning on all passages but got: {p.content[:80]}"
        )
    # Warning must include the actual day count and date (not placeholders)
    assert "10 days ago" in passages[0].content
    expected_date = (date.today() - timedelta(days=10)).isoformat()
    assert expected_date in passages[0].content


def test_no_warning_when_fresh():
    """Passages for a ticker reviewed within 7 days must not have a warning prepended."""
    data = _base_data(_iso_days_ago(3))
    passages = _chunk_stock("TEST", data)
    assert passages, "Expected at least one passage"
    for p in passages:
        assert not p.content.startswith("WARNING:"), (
            f"Unexpected staleness warning on fresh ticker: {p.content[:80]}"
        )
