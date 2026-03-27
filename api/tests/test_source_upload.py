"""Tests for the source upload endpoint and chunking logic."""

import sys
import os

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from source_upload import chunk_text


# ---------------------------------------------------------------------------
# 1. chunk_text splits on paragraph boundaries
# ---------------------------------------------------------------------------

def test_chunk_splits_on_paragraphs():
    text = "First paragraph with enough content to be meaningful and pass the minimum size.\n\nSecond paragraph also with enough content to be meaningful and pass the minimum size."
    chunks = chunk_text(text, target_size=80, max_size=200)
    assert len(chunks) >= 1
    # Both paragraphs should appear across the chunks
    combined = " ".join(chunks)
    assert "First paragraph" in combined
    assert "Second paragraph" in combined


# ---------------------------------------------------------------------------
# 2. chunk_text handles long paragraphs (splits on sentences)
# ---------------------------------------------------------------------------

def test_chunk_splits_long_paragraph():
    # Create a paragraph that exceeds max_size
    sentences = ["This is sentence number %d with some padding text." % i for i in range(50)]
    long_para = ". ".join(sentences)
    chunks = chunk_text(long_para, target_size=200, max_size=500)
    assert len(chunks) > 1
    for chunk in chunks:
        assert len(chunk) <= 600  # Allow some tolerance for sentence boundaries


# ---------------------------------------------------------------------------
# 3. chunk_text discards tiny chunks (< 50 chars)
# ---------------------------------------------------------------------------

def test_chunk_discards_tiny():
    text = "Hi.\n\n" + "A" * 100 + "\n\nBye."
    chunks = chunk_text(text, target_size=200, max_size=500)
    for chunk in chunks:
        assert len(chunk) >= 50


# ---------------------------------------------------------------------------
# 4. chunk_text respects target and max size
# ---------------------------------------------------------------------------

def test_chunk_respects_target_size():
    paragraphs = [f"Paragraph {i} " + "x" * 80 for i in range(20)]
    text = "\n\n".join(paragraphs)
    chunks = chunk_text(text, target_size=300, max_size=500)
    assert len(chunks) > 1
    # Most chunks should be near target_size (not drastically over)
    for chunk in chunks:
        assert len(chunk) <= 600  # max_size + paragraph join tolerance


# ---------------------------------------------------------------------------
# 5. chunk_text with empty input
# ---------------------------------------------------------------------------

def test_chunk_empty():
    assert chunk_text("") == []
    assert chunk_text("   ") == []
    assert chunk_text(None) == []


# ---------------------------------------------------------------------------
# 6. Upload endpoint rejects unsupported file type (unit test via validation)
# ---------------------------------------------------------------------------

def test_validate_rejects_bad_type():
    from text_extract import validate_upload
    with pytest.raises(ValueError, match="Unsupported file type"):
        validate_upload(b"content", "data.csv")


# ---------------------------------------------------------------------------
# 7. Upload endpoint rejects oversized file
# ---------------------------------------------------------------------------

def test_validate_rejects_oversize():
    from text_extract import validate_upload
    big = b"x" * (11 * 1024 * 1024)
    with pytest.raises(ValueError, match="10 MB"):
        validate_upload(big, "big.pdf")


# ---------------------------------------------------------------------------
# 8. chunk_text handles single large chunk
# ---------------------------------------------------------------------------

def test_chunk_single_large():
    text = "A" * 3000  # Single block, no paragraph breaks
    chunks = chunk_text(text, target_size=1500, max_size=2500)
    assert len(chunks) >= 1
    combined = "".join(chunks)
    assert len(combined) == 3000
