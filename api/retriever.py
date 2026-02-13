"""
Retrieval engine for research passages.

Uses BM25 ranking with metadata filtering to find the most relevant
passages for a given ticker + user question.
"""

import math
import re
from collections import Counter

from ingest import Passage, get_passages


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

    def score(self, query: str) -> list[tuple[float, Passage]]:
        """Score all passages against a query. Returns sorted (score, passage) pairs."""
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

            # Apply passage weight
            score *= passage.weight
            results.append((score, passage))

        results.sort(key=lambda x: -x[0])
        return results


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
                p_copy = Passage(p.ticker, p.section, p.subsection, p.content, p.tags, p.weight * 1.5)
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
                p_copy = Passage(p.ticker, p.section, p.subsection, p.content, p.tags, p.weight * 1.3)
                boosted.append(p_copy)
            else:
                boosted.append(p)
        return boosted

    return passages


# ---------------------------------------------------------------------------
# Public retrieval API
# ---------------------------------------------------------------------------

def retrieve(
    query: str,
    ticker: str | None = None,
    thesis_alignment: str | None = None,
    max_passages: int = 12,
) -> list[dict]:
    """
    Retrieve the most relevant passages for a query.

    Args:
        query: The user's question.
        ticker: Stock ticker to filter by (e.g. "WOW").
        thesis_alignment: Optional thesis alignment filter.
        max_passages: Maximum number of passages to return.

    Returns:
        List of passage dicts with relevance scores.
    """
    # Get candidate passages
    passages = get_passages(ticker)
    if not passages:
        return []

    # Apply thesis alignment boosting
    passages = _filter_by_alignment(passages, thesis_alignment)

    # Section boosting based on query type
    boosted_sections = _detect_section_boost(query)
    if boosted_sections:
        adjusted = []
        for p in passages:
            if p.section in boosted_sections:
                p_adj = Passage(p.ticker, p.section, p.subsection, p.content, p.tags, p.weight * 1.4)
                adjusted.append(p_adj)
            else:
                adjusted.append(p)
        passages = adjusted

    # BM25 scoring
    bm25 = BM25(passages)
    scored = bm25.score(query)

    # Return top-k
    results = []
    for score, passage in scored[:max_passages]:
        result = passage.to_dict()
        result["relevance_score"] = round(score, 3)
        results.append(result)

    return results
