"""Tests for api/validator.py - hallucination detection (Phase 1)."""

import sys
from pathlib import Path

# Allow imports from api/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from validator import validate_response, FlaggedClaim, ValidationResult


def _make_passages(*contents: str) -> list[dict]:
    """Helper: build minimal passage dicts from content strings."""
    return [{"content": c, "section": "test", "subsection": "test"} for c in contents]


# ---- Test 1: No flags when all claims are grounded ----

def test_no_flags_when_grounded():
    """Claims that appear in passages should not be flagged."""
    passages = _make_passages(
        "The stock trades at $42.50 with a P/E of 18.3x.",
        "Revenue grew 12.5% in Q3 2025.",
    )
    response = "The stock is at $42.50, with revenue growth of 12.5% and a multiple of 18.3x."
    result = validate_response(response, passages)

    assert result.original_text == response
    assert result.flagged_claims == []
    assert result.annotated_text == response  # No disclaimers appended


# ---- Test 2: Flags when claims are fabricated ----

def test_flags_fabricated_claims():
    """Claims not in any passage should be flagged."""
    passages = _make_passages("The company reported revenue of $1.2B.")
    response = "The stock trades at $99.00 with a P/E of 45.2x and grew 88%."
    result = validate_response(response, passages)

    assert result.original_text == response
    assert len(result.flagged_claims) == 3  # $99.00, 45.2x, 88%
    claim_texts = {fc.claim_text for fc in result.flagged_claims}
    assert "$99.00" in claim_texts
    assert "45.2x" in claim_texts
    assert "88%" in claim_texts
    # Annotated text should have disclaimers
    assert "[Unverified:" in result.annotated_text
    assert "$99.00" in result.annotated_text


# ---- Test 3: Mixed grounded and fabricated ----

def test_mixed_grounded_and_fabricated():
    """Only ungrounded claims get flagged; grounded ones are fine."""
    passages = _make_passages("Earnings grew 15% last quarter.")
    response = "Earnings grew 15% but the target of $200.00 seems aggressive."
    result = validate_response(response, passages)

    assert len(result.flagged_claims) == 1
    assert result.flagged_claims[0].claim_text == "$200.00"
    assert result.flagged_claims[0].claim_type == "dollar"
    # 15% should NOT be flagged
    flagged_texts = {fc.claim_text for fc in result.flagged_claims}
    assert "15%" not in flagged_texts


# ---- Test 4: Empty response ----

def test_empty_response():
    """Empty response should return clean result with no flags."""
    result = validate_response("", _make_passages("Some passage"))

    assert result.original_text == ""
    assert result.flagged_claims == []
    assert result.annotated_text == ""


# ---- Test 5: Date claims ----

def test_date_claims():
    """Date-format claims should be extracted and validated."""
    passages = _make_passages("Results expected in Q3 2025.")
    response = "We expect results in Q3 2025, with a follow-up in FY2027."
    result = validate_response(response, passages)

    # Q3 2025 is grounded, FY2027 is not
    assert len(result.flagged_claims) == 1
    assert "FY2027" in result.flagged_claims[0].claim_text


# ---- Test 6: Duplicate claims are deduplicated ----

def test_duplicate_claims_deduplicated():
    """The same ungrounded claim appearing twice should only be flagged once."""
    passages = _make_passages("Nothing relevant here.")
    response = "The price is $50.00 and we reiterate our $50.00 target."
    result = validate_response(response, passages)

    assert len(result.flagged_claims) == 1
    assert result.flagged_claims[0].claim_text == "$50.00"


# ---- Test 7: No passages at all ----

def test_no_passages():
    """All claims should be flagged when no passages are provided."""
    response = "Revenue was $500 with 20% growth."
    result = validate_response(response, [])

    assert len(result.flagged_claims) == 2
    flagged_texts = {fc.claim_text for fc in result.flagged_claims}
    assert "$500" in flagged_texts
    assert "20%" in flagged_texts


# ---- Test 8: Grounded price + ungrounded price + grounded percentage ----

def test_grounded_vs_ungrounded_price_and_percentage():
    """Exact acceptance-criteria scenario: one grounded price, one fabricated, one grounded %."""
    passages = _make_passages(
        "Consensus target is $42.50. Revenue grew 15% in the last quarter."
    )
    response = (
        "The consensus target of $42.50 looks right, but we think $55.00 is "
        "more realistic given 15% revenue growth."
    )
    result = validate_response(response, passages)

    # $42.50 grounded, 15% grounded, $55.00 NOT grounded
    assert len(result.flagged_claims) == 1
    assert result.flagged_claims[0].claim_text == "$55.00"
    assert result.flagged_claims[0].claim_type == "dollar"
    assert "[Unverified:" in result.annotated_text
    assert "$55.00" in result.annotated_text
    # Grounded claims must NOT appear in disclaimers
    assert "$42.50" not in result.annotated_text.split("\n\n", 1)[-1]
    assert "15%" not in result.annotated_text.split("\n\n", 1)[-1]


# ---- Test 9: Hypothesis labels and system-prompt patterns are not claims ----

def test_no_false_positives_on_framework_labels():
    """Section labels (H1, T3, N2) and word-count ranges must not be extracted as claims."""
    passages = _make_passages("Some research content.")
    # Simulate an LLM response that references framework labels
    response = (
        "See hypothesis H1 for the bull case. T3 tripwire was triggered. "
        "Refer to section N2 above."
    )
    result = validate_response(response, passages)

    assert result.flagged_claims == []
    assert result.annotated_text == response
