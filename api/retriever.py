"""
Retrieval engine for research passages.

Uses hybrid ranking (BM25 + cosine similarity) with Reciprocal Rank Fusion
to find the most relevant passages for a given ticker + user question.
"""

import math
import re
from collections import Counter

from ingest import Passage, get_passages, get_ingest_version


# ---------------------------------------------------------------------------
# Tokeniser
# ---------------------------------------------------------------------------

_STOP_WORDS = frozenset({
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
    "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "and", "but", "or", "nor", "not", "so", "yet", "both",
    "each", "all", "any", "few", "more", "most", "other", "some", "such",
    "no", "only", "same", "than", "too", "very", "just", "because",
    "if", "when", "while", "this", "that", "these", "those", "it", "its",
    "what", "which", "who", "whom", "how", "where", "why", "i", "me",
    "my", "we", "our", "you", "your", "he", "him", "his", "she", "her",
    "they", "them", "their",
})


def _tokenize(text: str) -> list[str]:
    """Lowercase, split, remove stopwords."""
    tokens = re.findall(r"[a-z0-9]+(?:\.[a-z0-9]+)*", text.lower())
    return [t for t in tokens if t not in _STOP_WORDS and len(t) > 1]


# ---------------------------------------------------------------------------
# BM25 scorer
# ---------------------------------------------------------------------------

class BM25:
    """Okapi BM25 ranking over a corpus of Passage objects."""

    def __init__(self, passages: list[Passage], k1: float = 1.5, b: float = 0.75):
        self.passages = passages
        self.k1 = k1
        self.b = b
        self.corpus_size = len(passages)

        # Tokenise each passage
        self.doc_tokens: list[list[str]] = []
        self.doc_freqs: list[Counter] = []
        self.doc_lens: list[int] = []

        for p in passages:
            tokens = _tokenize(p.content)
            self.doc_tokens.append(tokens)
            self.doc_freqs.append(Counter(tokens))
            self.doc_lens.append(len(tokens))

        self.avg_dl = sum(self.doc_lens) / max(self.corpus_size, 1)

        # IDF: number of docs containing each term
        self.df: Counter = Counter()
        for freq in self.doc_freqs:
            for term in freq:
                self.df[term] += 1

    def _idf(self, term: str) -> float:
        n = self.df.get(term, 0)
        return math.log((self.corpus_size - n + 0.5) / (n + 0.5) + 1)

    def score(
        self, query: str, weight_overrides: dict[int, float] | None = None,
    ) -> list[tuple[float, Passage]]:
        """Score all passages against a query. Returns sorted (score, passage) pairs.

        Args:
            query: Search query string.
            weight_overrides: Optional {id(passage): weight} map for per-query
                boosting (alignment, section hints) without rebuilding the index.
        """
        query_tokens = _tokenize(query)
        if not query_tokens:
            return [(0.0, p) for p in self.passages]

        results = []
        for i, passage in enumerate(self.passages):
            score = 0.0
            dl = self.doc_lens[i]
            freq = self.doc_freqs[i]

            for term in query_tokens:
                tf = freq.get(term, 0)
                idf = self._idf(term)
                numerator = tf * (self.k1 + 1)
                denominator = tf + self.k1 * (1 - self.b + self.b * dl / self.avg_dl)
                score += idf * numerator / denominator

            # Apply passage weight (override if provided)
            w = (weight_overrides or {}).get(id(passage), passage.weight)
            score *= w
            results.append((score, passage))

        results.sort(key=lambda x: -x[0])
        return results


# ---------------------------------------------------------------------------
# Cosine similarity
# ---------------------------------------------------------------------------

def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


# ---------------------------------------------------------------------------
# Reciprocal Rank Fusion
# ---------------------------------------------------------------------------

_RRF_K = 60  # Standard RRF constant


def _rrf_score(
    passages: list[Passage],
    bm25_ranked: list[tuple[float, Passage]],
    query_embedding: list[float] | None,
) -> list[tuple[float, Passage]]:
    """Combine BM25 and embedding ranks using Reciprocal Rank Fusion.

    RRF_score = 1/(k + bm25_rank) + 1/(k + embedding_rank)
    Passages without embeddings use BM25 rank only.
    """
    # Build passage identity -> BM25 rank (1-based)
    bm25_rank: dict[int, int] = {}
    for rank, (_, p) in enumerate(bm25_ranked, start=1):
        bm25_rank[id(p)] = rank

    # Build embedding rank (1-based) via cosine similarity
    emb_rank: dict[int, int] = {}
    if query_embedding:
        emb_scored = []
        for p in passages:
            if p.embedding is not None:
                sim = _cosine_similarity(query_embedding, p.embedding)
                emb_scored.append((sim, p))
        emb_scored.sort(key=lambda x: -x[0])
        for rank, (_, p) in enumerate(emb_scored, start=1):
            emb_rank[id(p)] = rank

    # Compute RRF score per passage
    results = []
    for p in passages:
        pid = id(p)
        bm25_r = bm25_rank.get(pid)
        emb_r = emb_rank.get(pid)

        score = 0.0
        if bm25_r is not None:
            score += 1.0 / (_RRF_K + bm25_r)
        if emb_r is not None:
            score += 1.0 / (_RRF_K + emb_r)

        results.append((score, p))

    results.sort(key=lambda x: -x[0])
    return results


# ---------------------------------------------------------------------------
# BM25 index cache (per-ticker, invalidated on re-ingest)
# ---------------------------------------------------------------------------

# {ticker_or_None: (ingest_version, BM25)}
_bm25_cache: dict[str | None, tuple[int, BM25]] = {}


def _get_bm25(ticker: str | None, passages: list[Passage]) -> BM25:
    """Return a cached BM25 index for the given ticker, rebuilding if stale."""
    version = get_ingest_version()
    cached = _bm25_cache.get(ticker)
    if cached is not None and cached[0] == version:
        return cached[1]
    bm25 = BM25(passages)
    _bm25_cache[ticker] = (version, bm25)
    return bm25


def invalidate_bm25_cache(ticker: str | None = None) -> None:
    """Manually invalidate BM25 cache. If ticker is None, clear all."""
    if ticker is None:
        _bm25_cache.clear()
    else:
        _bm25_cache.pop(ticker, None)
        _bm25_cache.pop(None, None)  # all-tickers entry is also stale


# ---------------------------------------------------------------------------
# Section boosting based on question type
# ---------------------------------------------------------------------------

_SECTION_HINTS: dict[str, list[str]] = {
    "bull": ["hypothesis", "verdict", "narrative"],
    "bear": ["hypothesis", "verdict", "narrative"],
    "upside": ["hypothesis", "verdict", "narrative"],
    "downside": ["hypothesis", "verdict", "narrative"],
    "thesis": ["hypothesis", "verdict", "narrative"],
    "hypothesis": ["hypothesis"],
    "risk": ["tripwire", "discriminator", "hypothesis", "evidence"],
    "catalyst": ["tripwire", "discriminator"],
    "tripwire": ["tripwire"],
    "evidence": ["evidence"],
    "regulatory": ["evidence"],
    "competitor": ["evidence"],
    "valuation": ["identity", "reference", "narrative"],
    "price": ["technical", "identity", "reference"],
    "technical": ["technical"],
    "chart": ["technical"],
    "metric": ["identity", "reference", "overview"],
    "financial": ["identity", "reference"],
    "dividend": ["identity", "reference"],
    "margin": ["evidence", "hypothesis", "identity"],
    "gap": ["gaps"],
    "unknown": ["gaps"],
    "narrative": ["narrative"],
    "overview": ["overview"],
    "summary": ["verdict", "overview", "narrative"],
    "fresh": ["freshness"],
}


def _detect_section_boost(query: str) -> list[str]:
    """Detect which sections to boost based on query keywords."""
    query_lower = query.lower()
    boosted = set()
    for keyword, sections in _SECTION_HINTS.items():
        if keyword in query_lower:
            boosted.update(sections)
    return list(boosted)


# ---------------------------------------------------------------------------
# Thesis alignment filter
# ---------------------------------------------------------------------------

def _filter_by_alignment(passages: list[Passage], alignment: str | None) -> list[Passage]:
    """
    Optionally filter/boost passages that match a thesis alignment.
    alignment can be: 'bullish', 'bearish', 'neutral', or a specific tier like 't1', 't2'.
    """
    if not alignment:
        return passages

    alignment_lower = alignment.lower().strip()

    direction_map = {
        "bullish": "upside",
        "bull": "upside",
        "bearish": "downside",
        "bear": "downside",
    }

    # Check if it's a tier reference
    if alignment_lower in ("t1", "t2", "t3", "t4"):
        # Boost passages related to that tier
        boosted = []
        for p in passages:
            if alignment_lower in p.tags:
                p_copy = Passage(p.ticker, p.section, p.subsection, p.content, p.tags, p.weight * 1.5, embedding=p.embedding)
                boosted.append(p_copy)
            else:
                boosted.append(p)
        return boosted

    # Check if it's a direction
    direction = direction_map.get(alignment_lower, alignment_lower)
    if direction in ("upside", "downside", "neutral"):
        boosted = []
        for p in passages:
            if direction in p.tags:
                p_copy = Passage(p.ticker, p.section, p.subsection, p.content, p.tags, p.weight * 1.3, embedding=p.embedding)
                boosted.append(p_copy)
            else:
                boosted.append(p)
        return boosted

    return passages


# ---------------------------------------------------------------------------
# Public retrieval API
# ---------------------------------------------------------------------------

async def retrieve(
    query: str,
    ticker: str | None = None,
    thesis_alignment: str | None = None,
    max_passages: int = 12,
    user_passages: list[dict] | None = None,
) -> list[dict]:
    """
    Retrieve the most relevant passages for a query using hybrid ranking.

    Combines BM25 keyword scoring with cosine similarity on embeddings
    via Reciprocal Rank Fusion (RRF). Falls back to BM25-only when
    embeddings are unavailable.

    Args:
        query: The user's question.
        ticker: Stock ticker to filter by (e.g. "WOW").
        thesis_alignment: Optional thesis alignment filter.
        max_passages: Maximum number of passages to return.
        user_passages: Optional list of user-uploaded source passage dicts.
            Each dict should have: content, section, subsection, tags, weight,
            embedding, source_name. These are ranked separately then merged
            with platform passages via RRF.

    Returns:
        List of passage dicts with relevance scores and source_origin.
    """
    # Get candidate passages
    passages = get_passages(ticker)

    # Build weight overrides for alignment and section boosting
    # (avoids creating new Passage copies, lets us cache the BM25 index)
    weight_overrides: dict[int, float] = {}

    if passages:
        # Thesis alignment boosting
        if thesis_alignment:
            alignment_lower = thesis_alignment.lower().strip()
            direction_map = {
                "bullish": "upside", "bull": "upside",
                "bearish": "downside", "bear": "downside",
            }
            if alignment_lower in ("t1", "t2", "t3", "t4"):
                for p in passages:
                    if alignment_lower in p.tags:
                        weight_overrides[id(p)] = p.weight * 1.5
            else:
                direction = direction_map.get(alignment_lower, alignment_lower)
                if direction in ("upside", "downside", "neutral"):
                    for p in passages:
                        if direction in p.tags:
                            weight_overrides[id(p)] = p.weight * 1.3

        # Section boosting based on query type
        boosted_sections = _detect_section_boost(query)
        if boosted_sections:
            for p in passages:
                if p.section in boosted_sections:
                    base = weight_overrides.get(id(p), p.weight)
                    weight_overrides[id(p)] = base * 1.4

    # Generate query embedding (once per call, shared by platform + user ranking)
    query_embedding = None
    all_passages = passages or []
    has_any_embedding = any(p.embedding is not None for p in all_passages)
    if not has_any_embedding and user_passages:
        has_any_embedding = any(up.get("embedding") for up in user_passages)
    if has_any_embedding:
        try:
            import embeddings
            query_embedding = await embeddings.generate_embedding(query)
        except Exception:
            pass  # Fall back to BM25-only

    # --- Platform passage ranking ---
    platform_rrf: list[tuple[float, Passage]] = []
    if passages:
        bm25 = _get_bm25(ticker, passages)
        bm25_ranked = bm25.score(query, weight_overrides=weight_overrides or None)
        platform_rrf = _rrf_score(passages, bm25_ranked, query_embedding)

    # --- User passage ranking (ephemeral BM25, not cached) ---
    user_rrf: list[tuple[float, Passage]] = []
    user_source_names: dict[int, str] = {}  # id(Passage) -> source_name
    if user_passages:
        user_passage_objs = []
        for up in user_passages:
            p = Passage(
                ticker=ticker or "",
                section=up.get("section", "external"),
                subsection=up.get("subsection", "uploaded"),
                content=up["content"],
                tags=up.get("tags", []),
                weight=up.get("weight", 1.0),
                embedding=up.get("embedding"),
            )
            user_passage_objs.append(p)
            if up.get("source_name"):
                user_source_names[id(p)] = up["source_name"]

        if user_passage_objs:
            user_bm25 = BM25(user_passage_objs)
            user_bm25_ranked = user_bm25.score(query)
            user_rrf = _rrf_score(user_passage_objs, user_bm25_ranked, query_embedding)

    # --- Merge platform + user results by RRF score ---
    if not platform_rrf and not user_rrf:
        return []

    # Tag each result with its origin, then merge and sort
    merged: list[tuple[float, Passage, str]] = []
    for score, p in platform_rrf:
        merged.append((score, p, "platform"))
    for score, p in user_rrf:
        sn = user_source_names.get(id(p))
        origin = f"user:{sn}" if sn else "user"
        merged.append((score, p, origin))

    merged.sort(key=lambda x: -x[0])

    # Return top-k
    results = []
    for score, passage, origin in merged[:max_passages]:
        result = passage.to_dict()
        result["relevance_score"] = round(score, 4)
        result["source_origin"] = origin
        results.append(result)

    return results
