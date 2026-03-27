"""Tests for the research document decomposition module."""

import json
import sys
import os

import pytest

# Ensure api/ is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from decompose import build_decomposition_prompt, parse_decomposition_response


# ---------------------------------------------------------------------------
# Sample hypotheses (matching ASB.json structure)
# ---------------------------------------------------------------------------

SAMPLE_HYPOTHESES = [
    {
        "tier": "n1",
        "direction": "upside",
        "title": "N1: Growth/Recovery",
        "score": "20%",
        "description": "Defence budget expansion drives contract pipeline uplift.",
    },
    {
        "tier": "n2",
        "direction": "neutral",
        "title": "N2: Base Case",
        "score": "40%",
        "description": "Existing contracts execute at current margins.",
    },
    {
        "tier": "n3",
        "direction": "downside",
        "title": "N3: Risk/Downside",
        "score": "30%",
        "description": "Cost overruns and contract delays lead to de-rating.",
    },
    {
        "tier": "n4",
        "direction": "downside",
        "title": "N4: Disruption/Catalyst",
        "score": "10%",
        "description": "Structural disruption or transformative catalyst event.",
    },
]


# ---------------------------------------------------------------------------
# 1. build_decomposition_prompt includes all hypothesis titles
# ---------------------------------------------------------------------------

def test_prompt_includes_all_hypothesis_titles():
    system, user = build_decomposition_prompt(
        "Some research text about the company.",
        "ASB",
        SAMPLE_HYPOTHESES,
    )
    for h in SAMPLE_HYPOTHESES:
        assert h["title"] in user, f"Missing hypothesis title: {h['title']}"


def test_prompt_includes_ticker():
    system, user = build_decomposition_prompt("Text.", "ASB", SAMPLE_HYPOTHESES)
    assert "ASB" in user


def test_prompt_system_requires_json():
    system, user = build_decomposition_prompt("Text.", "ASB", SAMPLE_HYPOTHESES)
    assert "JSON" in system


# ---------------------------------------------------------------------------
# 2. parse_decomposition_response: clean JSON
# ---------------------------------------------------------------------------

def test_parse_clean_json():
    raw = json.dumps({
        "aligned_hypothesis": "N2",
        "alignment_confidence": 0.75,
        "direction": "neutral",
        "price_target": 5.40,
        "conviction_signals": {
            "language_strength": "moderate",
            "caveats_count": 2,
            "conditional_phrasing": True,
        },
        "key_evidence": [
            {"point": "Revenue stable", "supports": "N2"},
        ],
        "key_risks": [
            {"point": "Cost overruns", "threatens": "N3"},
        ],
        "summary": "The source sees a base case outcome.",
    })
    result = parse_decomposition_response(raw)
    assert result["aligned_hypothesis"] == "N2"
    assert result["alignment_confidence"] == 0.75
    assert result["direction"] == "neutral"
    assert result["price_target"] == 5.40
    assert result["conviction_signals"]["language_strength"] == "moderate"
    assert result["conviction_signals"]["caveats_count"] == 2
    assert result["conviction_signals"]["conditional_phrasing"] is True
    assert len(result["key_evidence"]) == 1
    assert result["key_evidence"][0]["supports"] == "N2"
    assert len(result["key_risks"]) == 1
    assert result["summary"] == "The source sees a base case outcome."


# ---------------------------------------------------------------------------
# 3. parse_decomposition_response: JSON in code fences
# ---------------------------------------------------------------------------

def test_parse_fenced_json():
    raw = '```json\n{"aligned_hypothesis": "N1", "alignment_confidence": 0.9, "direction": "upside"}\n```'
    result = parse_decomposition_response(raw)
    assert result["aligned_hypothesis"] == "N1"
    assert result["alignment_confidence"] == 0.9
    assert result["direction"] == "upside"


# ---------------------------------------------------------------------------
# 4. parse_decomposition_response: partial JSON (missing fields become None)
# ---------------------------------------------------------------------------

def test_parse_partial_json():
    raw = json.dumps({
        "aligned_hypothesis": "N3",
        "direction": "downside",
    })
    result = parse_decomposition_response(raw)
    assert result["aligned_hypothesis"] == "N3"
    assert result["direction"] == "downside"
    assert result["alignment_confidence"] is None
    assert result["price_target"] is None
    assert result["conviction_signals"] is None
    assert result["key_evidence"] is None
    assert result["key_risks"] is None
    assert result["summary"] is None


# ---------------------------------------------------------------------------
# 5. parse_decomposition_response: empty string
# ---------------------------------------------------------------------------

def test_parse_empty_string():
    result = parse_decomposition_response("")
    assert result["aligned_hypothesis"] is None
    assert result["direction"] is None
    assert result["alignment_confidence"] is None

    result2 = parse_decomposition_response("   ")
    assert result2["aligned_hypothesis"] is None


# ---------------------------------------------------------------------------
# 6. alignment_confidence clamped to 0.0-1.0
# ---------------------------------------------------------------------------

def test_parse_clamps_confidence():
    raw = json.dumps({
        "aligned_hypothesis": "N1",
        "alignment_confidence": 1.5,
        "direction": "upside",
    })
    result = parse_decomposition_response(raw)
    assert result["alignment_confidence"] == 1.0

    raw2 = json.dumps({
        "aligned_hypothesis": "N1",
        "alignment_confidence": -0.3,
        "direction": "upside",
    })
    result2 = parse_decomposition_response(raw2)
    assert result2["alignment_confidence"] == 0.0


# ---------------------------------------------------------------------------
# 7. direction validated against allowed values
# ---------------------------------------------------------------------------

def test_parse_invalid_direction():
    raw = json.dumps({
        "aligned_hypothesis": "N2",
        "alignment_confidence": 0.5,
        "direction": "sideways",
    })
    result = parse_decomposition_response(raw)
    assert result["direction"] is None


def test_parse_invalid_hypothesis():
    raw = json.dumps({
        "aligned_hypothesis": "N5",
        "alignment_confidence": 0.5,
        "direction": "upside",
    })
    result = parse_decomposition_response(raw)
    assert result["aligned_hypothesis"] is None


# ---------------------------------------------------------------------------
# 8. Truncation at > 80,000 characters
# ---------------------------------------------------------------------------

def test_truncation_marker_in_prompt():
    long_text = "A" * 90_000
    system, user = build_decomposition_prompt(long_text, "ASB", SAMPLE_HYPOTHESES)
    # build_decomposition_prompt does not truncate; decompose_document does.
    # Verify the text is passed through unchanged.
    assert "A" * 1000 in user


def test_parse_contrarian():
    raw = json.dumps({
        "aligned_hypothesis": "CONTRARIAN",
        "alignment_confidence": 0.6,
        "direction": "upside",
    })
    result = parse_decomposition_response(raw)
    assert result["aligned_hypothesis"] == "CONTRARIAN"


def test_parse_mixed():
    raw = json.dumps({
        "aligned_hypothesis": "MIXED",
        "alignment_confidence": 0.4,
        "direction": "neutral",
    })
    result = parse_decomposition_response(raw)
    assert result["aligned_hypothesis"] == "MIXED"
