"""Tests for passage embedding cache in api/ingest.py (Task B1)."""

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

# Allow imports from api/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import ingest


def _fake_vector() -> list[float]:
    """Return a deterministic 768-dim vector for testing."""
    return [0.1] * 768


def test_embedding_cache_populated():
    """After ingest + embed_all_passages, every passage has a cached embedding."""
    # Inject minimal passages directly into the module store
    ingest._store = {}
    ingest._all_passages = []
    ingest._embeddings = {}

    p = ingest.Passage("TST", "overview", "summary", "Test content", [], 1.0)
    ingest._store["TST"] = [p]
    ingest._all_passages = [p]

    with patch("ingest.generate_embedding", new_callable=AsyncMock, return_value=_fake_vector()):
        asyncio.run(ingest.embed_all_passages())

    vec = ingest.get_passage_embedding("TST", "overview", "summary")
    assert vec is not None
    assert len(vec) == 768
    assert vec == _fake_vector()


def test_embedding_none_on_api_failure():
    """If embedding API fails, passage still exists with None embedding."""
    ingest._store = {}
    ingest._all_passages = []
    ingest._embeddings = {}

    p = ingest.Passage("TST", "verdict", "summary", "Verdict text", [], 1.2)
    ingest._store["TST"] = [p]
    ingest._all_passages = [p]

    with patch("ingest.generate_embedding", new_callable=AsyncMock, return_value=None):
        asyncio.run(ingest.embed_all_passages())

    # Passage still in store
    assert len(ingest.get_passages("TST")) == 1

    # Embedding is None, not KeyError
    vec = ingest.get_passage_embedding("TST", "verdict", "summary")
    assert vec is None
