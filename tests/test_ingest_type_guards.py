"""
Tests for isinstance type guards in api/ingest.py _chunk_stock().

Covers commit b557ab7 which added isinstance(x, dict) checks before .get()
calls on alignmentSummary and priceImplication to prevent AttributeError when
a malformed market update writes a plain string into either field.
"""

import sys
import os

# Allow importing from api/ without installing the package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

from ingest import _chunk_stock  # noqa: E402


# ---------------------------------------------------------------------------
# Minimal stock data helpers
# ---------------------------------------------------------------------------

def _base_data():
    """Minimal valid stock dict -- no narrative, no evidence."""
    return {
        "company": "Test Co",
        "sector": "Test",
    }


def _with_alignment(alignment_value):
    data = _base_data()
    data["evidence"] = {"alignmentSummary": alignment_value}
    return data


def _with_price_implication(pi_value):
    data = _base_data()
    data["narrative"] = {"priceImplication": pi_value}
    return data


# ---------------------------------------------------------------------------
# alignmentSummary type guard tests
# ---------------------------------------------------------------------------

def test_alignment_as_string_does_not_raise():
    """A plain string in alignmentSummary must not raise AttributeError."""
    data = _with_alignment("Bull thesis supported by 3 of 4 hypotheses.")
    # Should not raise -- guard prevents .get() on the string
    passages = _chunk_stock("TEST", data)
    assert isinstance(passages, list)


def test_alignment_as_string_not_in_passages():
    """A plain string alignment must not produce an alignment_summary passage."""
    data = _with_alignment("Some summary string.")
    passages = _chunk_stock("TEST", data)
    subsections = [p.subsection for p in passages]
    assert "alignment_summary" not in subsections


def test_alignment_as_dict_with_summary_included():
    """A well-formed dict alignment must produce an alignment_summary passage."""
    data = _with_alignment({
        "summary": {"t1": "Supports", "t2": "Neutral", "t3": "Contradicts", "t4": "Supports"},
    })
    passages = _chunk_stock("TEST", data)
    subsections = [p.subsection for p in passages]
    assert "alignment_summary" in subsections


def test_alignment_as_none_does_not_raise():
    """None alignment must not raise."""
    data = _with_alignment(None)
    passages = _chunk_stock("TEST", data)
    assert isinstance(passages, list)
    subsections = [p.subsection for p in passages]
    assert "alignment_summary" not in subsections


# ---------------------------------------------------------------------------
# priceImplication type guard tests
# ---------------------------------------------------------------------------

def test_price_implication_as_string_does_not_raise():
    """A plain string in priceImplication must not raise AttributeError."""
    data = _with_price_implication("Upside to A$55 on 12-month view.")
    passages = _chunk_stock("TEST", data)
    assert isinstance(passages, list)


def test_price_implication_as_string_not_in_passages():
    """A plain string priceImplication must not produce a price_implication passage."""
    data = _with_price_implication("Some price string.")
    passages = _chunk_stock("TEST", data)
    subsections = [p.subsection for p in passages]
    assert "price_implication" not in subsections


def test_price_implication_as_dict_included():
    """A well-formed dict priceImplication must produce a price_implication passage."""
    data = _with_price_implication({
        "label": "Bull target",
        "content": "Upside to A$55 on 12-month view given earnings upgrade cycle.",
    })
    passages = _chunk_stock("TEST", data)
    subsections = [p.subsection for p in passages]
    assert "price_implication" in subsections


def test_price_implication_as_none_does_not_raise():
    """None priceImplication must not raise."""
    data = _with_price_implication(None)
    passages = _chunk_stock("TEST", data)
    assert isinstance(passages, list)
    subsections = [p.subsection for p in passages]
    assert "price_implication" not in subsections
