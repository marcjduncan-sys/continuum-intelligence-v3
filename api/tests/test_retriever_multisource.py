"""Tests for multi-source retrieval in retriever.py.

Validates that the user_passages parameter correctly blends user-uploaded
source passages with platform passages via separate BM25 indices and RRF,
without breaking existing retrieval behaviour.
"""

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

# Allow imports from api/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import ingest
import retriever


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _setup_platform_passages(ticker: str = "TST", count: int = 5):
    """Inject minimal platform passages into the ingest store."""
    ingest._store = {}
    ingest._all_passages = []
    ingest._embeddings = {}
    ingest._ingest_version = 1

    passages = []
    for i in range(count):
        p = ingest.Passage(
            ticker=ticker,
            section="overview",
            subsection=f"item_{i}",
            content=f"Platform passage {i} about iron ore mining operations and dividends",
            tags=["t1"] if i % 2 == 0 else ["t2"],
            weight=1.0,
        )
        passages.append(p)

    ingest._store[ticker] = passages
    ingest._all_passages = passages
    return passages


def _make_user_passages(count: int = 3, source_name: str = "Macquarie"):
    """Create user passage dicts matching the expected format."""
    return [
        {
            "content": f"User research passage {i} about iron ore market outlook",
            "section": "external",
            "subsection": "uploaded",
            "tags": [],
            "weight": 1.0,
            "embedding": None,
            "source_name": source_name,
        }
        for i in range(count)
    ]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_retrieve_no_user_passages_returns_platform_with_origin():
    """retrieve() with no user_passages returns only platform passages
    with source_origin='platform'."""
    _setup_platform_passages()
    retriever._bm25_cache.clear()

    results = asyncio.run(retriever.retrieve(
        query="iron ore mining",
        ticker="TST",
        max_passages=5,
        user_passages=None,
    ))

    assert len(results) > 0
    for r in results:
        assert r["source_origin"] == "platform"
        assert "relevance_score" in r


def test_retrieve_with_user_passages_returns_blended():
    """retrieve() with user_passages returns blended platform + user results."""
    _setup_platform_passages()
    retriever._bm25_cache.clear()
    user_p = _make_user_passages(3, source_name="Goldman Sachs")

    results = asyncio.run(retriever.retrieve(
        query="iron ore market outlook",
        ticker="TST",
        max_passages=10,
        user_passages=user_p,
    ))

    origins = {r["source_origin"] for r in results}
    assert "platform" in origins
    assert any(o.startswith("user:") for o in origins), "Expected user-origin passages in results"


def test_user_passages_have_correct_source_origin():
    """User passages appear with source_origin='user:{source_name}'."""
    _setup_platform_passages()
    retriever._bm25_cache.clear()
    user_p = _make_user_passages(2, source_name="Macquarie")

    results = asyncio.run(retriever.retrieve(
        query="iron ore market",
        ticker="TST",
        max_passages=10,
        user_passages=user_p,
    ))

    user_results = [r for r in results if r["source_origin"].startswith("user:")]
    assert len(user_results) > 0
    for r in user_results:
        assert r["source_origin"] == "user:Macquarie"


def test_max_passages_cap_respected_with_blended():
    """max_passages cap is respected across blended platform + user results."""
    _setup_platform_passages(count=10)
    retriever._bm25_cache.clear()
    user_p = _make_user_passages(10)

    results = asyncio.run(retriever.retrieve(
        query="iron ore",
        ticker="TST",
        max_passages=5,
        user_passages=user_p,
    ))

    assert len(results) <= 5


def test_user_passages_without_embeddings_still_rank():
    """User passages without embeddings rank via BM25-only (graceful fallback)."""
    _setup_platform_passages()
    retriever._bm25_cache.clear()
    user_p = [
        {
            "content": "Detailed analysis of iron ore supply chain disruptions",
            "section": "external",
            "subsection": "uploaded",
            "tags": [],
            "weight": 1.5,
            "embedding": None,
            "source_name": "Internal",
        },
    ]

    results = asyncio.run(retriever.retrieve(
        query="iron ore supply chain",
        ticker="TST",
        max_passages=10,
        user_passages=user_p,
    ))

    user_results = [r for r in results if r["source_origin"].startswith("user")]
    assert len(user_results) > 0, "User passages without embeddings should still appear"


def test_empty_user_passages_behaves_like_none():
    """Empty user_passages=[] behaves identically to user_passages=None."""
    _setup_platform_passages()
    retriever._bm25_cache.clear()

    results_none = asyncio.run(retriever.retrieve(
        query="iron ore mining",
        ticker="TST",
        max_passages=5,
        user_passages=None,
    ))

    retriever._bm25_cache.clear()

    results_empty = asyncio.run(retriever.retrieve(
        query="iron ore mining",
        ticker="TST",
        max_passages=5,
        user_passages=[],
    ))

    assert len(results_none) == len(results_empty)
    for r_none, r_empty in zip(results_none, results_empty):
        assert r_none["content"] == r_empty["content"]
        assert r_none["source_origin"] == r_empty["source_origin"] == "platform"


def test_user_passages_only_when_no_platform():
    """When no platform passages exist, user passages still rank and return."""
    ingest._store = {}
    ingest._all_passages = []
    retriever._bm25_cache.clear()

    user_p = _make_user_passages(3, source_name="UBS")

    results = asyncio.run(retriever.retrieve(
        query="iron ore market outlook",
        ticker="NODATA",
        max_passages=5,
        user_passages=user_p,
    ))

    assert len(results) > 0
    for r in results:
        assert r["source_origin"] == "user:UBS"
