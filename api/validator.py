"""
Hallucination detector (Phase 1) - regex-based claim extraction + passage matching.

Extracts numeric claims (dollar amounts, percentages, P/E ratios, dates) from
LLM responses and cross-references them against retrieved passages. Claims not
grounded in any passage get flagged with a disclaimer.
"""

import re
from dataclasses import dataclass, field


@dataclass
class FlaggedClaim:
    """A numeric claim not found in any retrieved passage."""
    claim_text: str  # The raw matched string, e.g. "$42.50" or "12.3%"
    claim_type: str  # "dollar", "percentage", "ratio", "date"


@dataclass
class ValidationResult:
    """Result of validating an LLM response against retrieved passages."""
    original_text: str
    flagged_claims: list[FlaggedClaim] = field(default_factory=list)
    annotated_text: str = ""


# ---------------------------------------------------------------------------
# Claim extraction patterns
# ---------------------------------------------------------------------------

# Dollar amounts: $1, $42.50, $1,234.56, A$30
_DOLLAR_RE = re.compile(r"[A-Z]?\$[\d,]+(?:\.\d{1,2})?")

# Percentages: 12%, 3.5%, -0.8%
_PERCENT_RE = re.compile(r"-?\d+(?:\.\d+)?%")

# Ratios: 12.3x, 0.8x (P/E, EV/EBITDA multiples)
_RATIO_RE = re.compile(r"\d+(?:\.\d+)?x\b")

# Specific dates: "15 March 2025", "March 15, 2025", "Q3 2025", "FY2025",
#   "H1 2025", "CY2025", "1H25", "2H25"
_DATE_RE = re.compile(
    r"\b(?:"
    r"\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}"
    r"|"
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}"
    r"|"
    r"[QH][1-4]\s*\d{4}"
    r"|"
    r"(?:FY|CY|1H|2H)\s*\d{2,4}"
    r")\b",
    re.IGNORECASE,
)


def _extract_claims(text: str) -> list[tuple[str, str]]:
    """Return (matched_string, claim_type) pairs from response text."""
    claims: list[tuple[str, str]] = []
    for m in _DOLLAR_RE.finditer(text):
        claims.append((m.group(), "dollar"))
    for m in _PERCENT_RE.finditer(text):
        claims.append((m.group(), "percentage"))
    for m in _RATIO_RE.finditer(text):
        claims.append((m.group(), "ratio"))
    for m in _DATE_RE.finditer(text):
        claims.append((m.group(), "date"))
    return claims


def _normalise(s: str) -> str:
    """Lowercase, collapse whitespace, strip commas for fuzzy matching."""
    return re.sub(r"[\s,]+", " ", s.lower()).strip()


def _claim_in_passages(claim: str, passage_texts: list[str]) -> bool:
    """Check whether a claim string appears (possibly fuzzy) in any passage."""
    norm_claim = _normalise(claim)
    for pt in passage_texts:
        if norm_claim in pt:
            return True
    return False


def validate_response(
    response_text: str,
    passages: list[dict],
) -> ValidationResult:
    """Validate LLM response claims against retrieved passages.

    Parameters
    ----------
    response_text : str
        The LLM-generated response.
    passages : list[dict]
        Retrieved passage dicts (must have a "content" key).

    Returns
    -------
    ValidationResult
        Contains original text, any flagged claims, and annotated text
        (original text with disclaimer lines appended for unverified claims).
    """
    if not response_text:
        return ValidationResult(original_text=response_text, annotated_text=response_text)

    # Pre-normalise all passage content once
    passage_texts = [_normalise(p.get("content", "")) for p in passages]

    claims = _extract_claims(response_text)
    flagged: list[FlaggedClaim] = []

    for claim_text, claim_type in claims:
        if not _claim_in_passages(claim_text, passage_texts):
            # Deduplicate identical claim strings
            if not any(f.claim_text == claim_text for f in flagged):
                flagged.append(FlaggedClaim(claim_text=claim_text, claim_type=claim_type))

    if not flagged:
        return ValidationResult(
            original_text=response_text,
            flagged_claims=[],
            annotated_text=response_text,
        )

    # Build disclaimer lines
    disclaimers = []
    for fc in flagged:
        disclaimers.append(f"[Unverified: the claim about {fc.claim_text} was not found in the research passages]")

    annotated = response_text.rstrip() + "\n\n" + "\n".join(disclaimers)

    return ValidationResult(
        original_text=response_text,
        flagged_claims=flagged,
        annotated_text=annotated,
    )
