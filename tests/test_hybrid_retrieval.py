"""
Tests for hybrid retrieval with Reciprocal Rank Fusion in api/retriever.py.

Covers:
  1. Pure BM25 fallback when no passages have embeddings
  2. Hybrid ranking changes result order vs BM25-only
  3. RRF math is correct
"""

import sys
import os
import math

# Allow importing from api/ without installing the package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

from ingest import Passage  # noqa: E402
from retriever import BM25, _rrf_score, _cosine_similarity, _RRF_K  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_passage(content: str, embedding: list[float] | None = None) -> Passage:
    return Passage("TEST", "test", "test", content, embedding=embedding)


# ---------------------------------------------------------------------------
# Test 1: Pure BM25 fallback (no embeddings)
# ---------------------------------------------------------------------------

def test_bm25_fallback_no_embeddings():
    """When no passages have embeddings, RRF uses BM25 rank only."""
    p1 = _make_passage("iron ore production increased sharply")
    p2 = _make_passage("dividend yield remains stable")
    p3 = _make_passage("iron ore exports to China grew")

    passages = [p1, p2, p3]
    bm25 = BM25(passages)
    bm25_ranked = bm25.score("iron ore")

    # No query embedding, no passage embeddings
    rrf_ranked = _rrf_score(passages, bm25_ranked, query_embedding=None)

    # With BM25-only, scores should be 1/(k + rank)
    for rank_idx, (score, _) in enumerate(rrf_ranked):
        expected = 1.0 / (_RRF_K + rank_idx + 1)
        assert abs(score - expected) < 1e-9, (
            f"Rank {rank_idx + 1}: expected {expected}, got {score}"
        )

    # BM25 order should be preserved (iron ore passages first)
    bm25_order = [id(p) for _, p in bm25_ranked]
    rrf_order = [id(p) for _, p in rrf_ranked]
    assert bm25_order == rrf_order, "BM25 fallback should preserve BM25 ranking order"


# ---------------------------------------------------------------------------
# Test 2: Hybrid ranking changes order vs BM25-only
# ---------------------------------------------------------------------------

def test_hybrid_ranking_changes_order():
    """Adding embeddings should change ranking vs BM25-only when
    embedding similarity disagrees with BM25 scores."""
    # Three passages with similar BM25 scores but different embedding similarities.
    # BM25 for "iron ore production": p1 > p2 > p3 (p1 has most keyword overlap)
    # Embedding for query: p3 closest, p2 middle, p1 furthest
    # RRF should reorder because embedding rank disagrees with BM25 rank.

    p1 = _make_passage(
        "iron ore production increased in the quarter",
        embedding=[1.0, 0.0, 0.0],  # far from query embedding
    )
    p2 = _make_passage(
        "iron ore exports grew steadily",
        embedding=[0.0, 0.7, 0.7],  # moderate similarity
    )
    p3 = _make_passage(
        "quarterly production volumes reported",
        embedding=[0.0, 1.0, 0.0],  # closest to query embedding
    )

    passages = [p1, p2, p3]
    bm25 = BM25(passages)
    bm25_ranked = bm25.score("iron ore production")

    # BM25 order
    bm25_ids = [id(p) for _, p in bm25_ranked]

    # Query embedding close to p3
    query_emb = [0.0, 1.0, 0.0]

    rrf_ranked = _rrf_score(passages, bm25_ranked, query_embedding=query_emb)
    rrf_ids = [id(p) for _, p in rrf_ranked]

    # p3 gets embedding rank 1 which boosts it; the hybrid order should differ
    assert rrf_ids != bm25_ids, "Hybrid ranking should differ from BM25-only when embeddings disagree"


# ---------------------------------------------------------------------------
# Test 3: RRF math is correct
# ---------------------------------------------------------------------------

def test_rrf_math_correct():
    """Verify RRF formula: score = 1/(k + bm25_rank) + 1/(k + emb_rank)."""
    p1 = _make_passage("alpha content here", embedding=[1.0, 0.0])
    p2 = _make_passage("beta content here", embedding=[0.0, 1.0])

    passages = [p1, p2]
    bm25 = BM25(passages)
    bm25_ranked = bm25.score("alpha")

    # BM25 should rank p1 first (has "alpha")
    assert bm25_ranked[0][1] is p1
    assert bm25_ranked[1][1] is p2

    # Query embedding close to p2
    query_emb = [0.0, 1.0]

    rrf_ranked = _rrf_score(passages, bm25_ranked, query_embedding=query_emb)

    # Embedding ranking: p2 (cos=1.0) rank 1, p1 (cos=0.0) rank 2
    # p1: BM25 rank 1, emb rank 2 -> 1/(60+1) + 1/(60+2) = 1/61 + 1/62
    # p2: BM25 rank 2, emb rank 1 -> 1/(60+2) + 1/(60+1) = 1/62 + 1/61
    expected_p1 = 1.0 / (_RRF_K + 1) + 1.0 / (_RRF_K + 2)
    expected_p2 = 1.0 / (_RRF_K + 2) + 1.0 / (_RRF_K + 1)

    scores = {id(p): s for s, p in rrf_ranked}
    assert abs(scores[id(p1)] - expected_p1) < 1e-9, (
        f"p1 score: expected {expected_p1}, got {scores[id(p1)]}"
    )
    assert abs(scores[id(p2)] - expected_p2) < 1e-9, (
        f"p2 score: expected {expected_p2}, got {scores[id(p2)]}"
    )

    # In this symmetric case scores are equal (same ranks, just swapped)
    assert abs(expected_p1 - expected_p2) < 1e-9
