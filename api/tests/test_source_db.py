"""Tests for source_db.py -- research source CRUD operations.

Uses AsyncMock to simulate asyncpg pool behaviour without a live database.
Follows the test patterns established in test_embedding_cache.py and
test_portfolio.py.
"""

import asyncio
import json
import sys
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Allow imports from api/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import source_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _uuid() -> str:
    return str(uuid.uuid4())


class _AsyncCM:
    """Minimal async context manager wrapping a mock connection."""

    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *args):
        return False


def _mock_pool():
    """Return a mock asyncpg pool with acquire() context manager."""
    pool = MagicMock()
    conn = AsyncMock()
    pool.acquire.return_value = _AsyncCM(conn)
    return pool, conn


# ---------------------------------------------------------------------------
# create_source
# ---------------------------------------------------------------------------

def test_create_source_returns_dict_with_uuid():
    """create_source returns a dict with a UUID id field."""
    pool, conn = _mock_pool()
    source_id = _uuid()
    conn.fetchrow.return_value = {
        "id": source_id,
        "user_id": _uuid(),
        "guest_id": None,
        "ticker": "BHP",
        "source_name": "Macquarie",
        "source_type": "broker",
        "document_date": None,
        "file_name": "bhp_note.pdf",
        "page_count": 12,
        "char_count": 8400,
        "created_at": "2026-03-27T10:00:00+00:00",
        "active": True,
    }
    result = asyncio.run(source_db.create_source(
        pool,
        user_id=_uuid(),
        guest_id=None,
        ticker="BHP",
        source_name="Macquarie",
        file_name="bhp_note.pdf",
        page_count=12,
        char_count=8400,
    ))
    assert result is not None
    assert result["id"] == source_id
    assert result["ticker"] == "BHP"
    conn.fetchrow.assert_called_once()


def test_create_source_returns_none_when_no_identity():
    """create_source returns None when both user_id and guest_id are None."""
    pool, _ = _mock_pool()
    result = asyncio.run(source_db.create_source(
        pool, user_id=None, guest_id=None, ticker="BHP", source_name="Test",
    ))
    assert result is None


def test_create_source_returns_none_when_pool_is_none():
    """create_source returns None when pool is None (DB unavailable)."""
    result = asyncio.run(source_db.create_source(
        None, user_id=_uuid(), guest_id=None, ticker="BHP", source_name="Test",
    ))
    assert result is None


# ---------------------------------------------------------------------------
# create_view
# ---------------------------------------------------------------------------

def test_create_view_links_to_source():
    """create_view stores the source_id correctly."""
    pool, conn = _mock_pool()
    view_id = _uuid()
    source_id = _uuid()
    conn.fetchrow.return_value = {
        "id": view_id,
        "source_id": source_id,
        "aligned_hypothesis": "N2",
        "alignment_confidence": 0.75,
        "direction": "upside",
        "price_target": 5.40,
        "conviction_signals": json.dumps({"language_strength": "high"}),
        "key_evidence": json.dumps([{"point": "iron ore demand"}]),
        "key_risks": json.dumps([{"point": "China slowdown"}]),
        "summary": "Bullish on BHP",
        "raw_decomposition": None,
        "created_at": "2026-03-27T10:00:00+00:00",
    }
    result = asyncio.run(source_db.create_view(
        pool,
        source_id=source_id,
        aligned_hypothesis="N2",
        alignment_confidence=0.75,
        direction="upside",
        price_target=5.40,
        conviction_signals={"language_strength": "high"},
        key_evidence=[{"point": "iron ore demand"}],
        key_risks=[{"point": "China slowdown"}],
        summary="Bullish on BHP",
    ))
    assert result is not None
    assert result["source_id"] == source_id
    assert result["aligned_hypothesis"] == "N2"


# ---------------------------------------------------------------------------
# insert_passages
# ---------------------------------------------------------------------------

def test_insert_passages_returns_count():
    """insert_passages returns the number of passages inserted."""
    pool, conn = _mock_pool()
    source_id = _uuid()
    user_id = _uuid()
    conn.fetchrow.return_value = {"user_id": user_id, "guest_id": None}
    conn.fetchval.return_value = 0  # no existing passages

    passages = [
        {"content": "Iron ore prices rose 3%", "section": "external", "subsection": "uploaded"},
        {"content": "BHP dividend yield at 4.2%", "section": "external", "subsection": "uploaded"},
    ]
    count = asyncio.run(source_db.insert_passages(
        pool, source_id=source_id, ticker="BHP", passages=passages,
    ))
    assert count == 2
    assert conn.execute.call_count == 2


def test_insert_passages_raises_on_cap_exceeded():
    """insert_passages raises ValueError when passage cap would be exceeded."""
    pool, conn = _mock_pool()
    source_id = _uuid()
    conn.fetchrow.return_value = {"user_id": _uuid(), "guest_id": None}
    conn.fetchval.return_value = 195  # already near cap

    passages = [{"content": f"passage {i}"} for i in range(10)]
    with pytest.raises(ValueError, match="Passage cap exceeded"):
        asyncio.run(source_db.insert_passages(
            pool, source_id=source_id, ticker="BHP", passages=passages,
        ))


def test_insert_passages_empty_list_returns_zero():
    """insert_passages with empty list returns 0 without DB calls."""
    pool, conn = _mock_pool()
    count = asyncio.run(source_db.insert_passages(
        pool, source_id=_uuid(), ticker="BHP", passages=[],
    ))
    assert count == 0
    conn.fetchrow.assert_not_called()


# ---------------------------------------------------------------------------
# list_sources
# ---------------------------------------------------------------------------

def test_list_sources_returns_ordered_with_view():
    """list_sources returns sources ordered by created_at DESC with nested view."""
    pool, conn = _mock_pool()
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    sid = uuid.uuid4()
    vid = uuid.uuid4()
    uid = uuid.uuid4()

    conn.fetch.return_value = [
        {
            "id": sid, "user_id": uid, "guest_id": None,
            "ticker": "BHP", "source_name": "Macquarie", "source_type": "broker",
            "document_date": None, "file_name": "bhp.pdf",
            "page_count": 10, "char_count": 5000, "created_at": now, "active": True,
            "view_id": vid, "aligned_hypothesis": "N1",
            "alignment_confidence": 0.80, "direction": "upside",
            "price_target": 45.00,
            "conviction_signals": json.dumps({"strength": "high"}),
            "key_evidence": json.dumps([{"point": "test"}]),
            "key_risks": json.dumps([{"point": "risk"}]),
            "summary": "Bullish outlook",
        },
    ]

    result = asyncio.run(source_db.list_sources(
        pool, ticker="BHP", user_id=str(uid), guest_id=None,
    ))
    assert len(result) == 1
    assert result[0]["source_name"] == "Macquarie"
    assert result[0]["view"] is not None
    assert result[0]["view"]["aligned_hypothesis"] == "N1"


def test_list_sources_empty_for_unknown_ticker():
    """list_sources returns empty list for a ticker with no sources."""
    pool, conn = _mock_pool()
    conn.fetch.return_value = []

    result = asyncio.run(source_db.list_sources(
        pool, ticker="ZZZ", user_id=_uuid(), guest_id=None,
    ))
    assert result == []


# ---------------------------------------------------------------------------
# delete_source
# ---------------------------------------------------------------------------

def test_delete_source_returns_true_on_success():
    """delete_source returns True when the source exists and is owned."""
    pool, conn = _mock_pool()
    conn.execute.return_value = "DELETE 1"

    deleted = asyncio.run(source_db.delete_source(
        pool, source_id=_uuid(), user_id=_uuid(), guest_id=None,
    ))
    assert deleted is True


def test_delete_source_returns_false_for_wrong_owner():
    """delete_source returns False when the caller does not own the source."""
    pool, conn = _mock_pool()
    conn.execute.return_value = "DELETE 0"

    deleted = asyncio.run(source_db.delete_source(
        pool, source_id=_uuid(), user_id=_uuid(), guest_id=None,
    ))
    assert deleted is False


def test_delete_source_returns_false_when_no_identity():
    """delete_source returns False when both user_id and guest_id are None."""
    pool, _ = _mock_pool()
    deleted = asyncio.run(source_db.delete_source(
        pool, source_id=_uuid(), user_id=None, guest_id=None,
    ))
    assert deleted is False


# ---------------------------------------------------------------------------
# get_source_passages
# ---------------------------------------------------------------------------

def test_get_source_passages_includes_source_name():
    """get_source_passages JOINs with research_sources to include source_name."""
    pool, conn = _mock_pool()
    conn.fetch.return_value = [
        {
            "content": "Iron ore outlook positive",
            "section": "external",
            "subsection": "uploaded",
            "tags": ["commodity"],
            "weight": 1.0,
            "embedding": [0.1] * 10,
            "source_name": "Goldman Sachs",
        },
    ]

    result = asyncio.run(source_db.get_source_passages(
        pool, ticker="BHP", user_id=_uuid(), guest_id=None,
    ))
    assert len(result) == 1
    assert result[0]["source_name"] == "Goldman Sachs"
    assert result[0]["content"] == "Iron ore outlook positive"
    assert result[0]["embedding"] == [0.1] * 10


# ---------------------------------------------------------------------------
# migrate_guest_sources
# ---------------------------------------------------------------------------

def test_migrate_guest_sources_transfers_ownership():
    """migrate_guest_sources updates guest sources to the authenticated user."""
    pool, conn = _mock_pool()
    conn.execute.return_value = "UPDATE 3"

    count = asyncio.run(source_db.migrate_guest_sources(
        pool, guest_id="guest-abc", user_id=_uuid(),
    ))
    assert count == 3
    conn.execute.assert_called_once()
