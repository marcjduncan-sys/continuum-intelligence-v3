"""
Text Sanitisation Boundary Module

Single entry point for cleaning all LLM-generated and external text before it
enters the data pipeline. Every pipeline that receives text from an LLM, web
scraper, PDF extractor, or external API MUST call sanitise_text() on the raw
response before merging, storing, or returning it.

This module is the permanent fix for Bug Family 1 (encoding contamination).
See docs/recurring-issues-registry.md for the full history.

Usage:
    from text_sanitise import sanitise_text

    clean = sanitise_text(raw_llm_response)   # str, dict, or list
"""

import re
from typing import Any


# ---------------------------------------------------------------------------
# Unicode emoji pattern (covers most common emoji ranges)
# ---------------------------------------------------------------------------

_EMOJI_PATTERN = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F680-\U0001F6FF"  # transport & map
    "\U0001F1E0-\U0001F1FF"  # flags
    "\U00002702-\U000027B0"  # dingbats
    "\U000024C2-\U0001F251"  # enclosed chars
    "\U0001F900-\U0001F9FF"  # supplemental symbols
    "\U0001FA00-\U0001FA6F"  # chess symbols
    "\U0001FA70-\U0001FAFF"  # symbols extended-A
    "\U00002600-\U000026FF"  # misc symbols
    "\U0000FE00-\U0000FE0F"  # variation selectors
    "\U0000200D"             # zero width joiner
    "\U00002B50"             # star
    "\U0000203C-\U00003299"  # misc
    "]+",
    flags=re.UNICODE,
)

# Mojibake patterns (double-encoded UTF-8 sequences)
_MOJIBAKE_MAP: dict[str, str] = {
    "\u00e2\u0080\u0093": "\u2013",  # en-dash
    "\u00e2\u0080\u0094": "\u2014",  # em-dash (will be replaced below)
    "\u00e2\u0080\u0098": "\u2018",  # left single quote (will be replaced below)
    "\u00e2\u0080\u0099": "\u2019",  # right single quote (will be replaced below)
    "\u00e2\u0080\u009c": "\u201c",  # left double quote (will be replaced below)
    "\u00e2\u0080\u009d": "\u201d",  # right double quote (will be replaced below)
    "\u00e2\u0080\u00a6": "\u2026",  # ellipsis
    "\u00e2\u0080\u00a2": "\u2022",  # bullet
    "\u00c2\u00a0": " ",             # non-breaking space double-encoded
}

# Characters that must not appear in output text
_CONTAMINATION_MAP: dict[str, str] = {
    "\u2014": "\u2013",   # em-dash -> en-dash (style rule: no em-dashes)
    "\u201c": '"',         # left double curly quote -> straight
    "\u201d": '"',         # right double curly quote -> straight
    "\u2018": "'",         # left single curly quote -> straight
    "\u2019": "'",         # right single curly quote -> straight
    "\u00a0": " ",         # non-breaking space -> regular space
}


def _sanitise_string(s: str) -> str:
    """Sanitise a single string: fix mojibake, replace contamination chars, strip emoji."""
    # Phase 1: fix double-encoded mojibake sequences
    for bad, good in _MOJIBAKE_MAP.items():
        s = s.replace(bad, good)
    # Phase 2: replace contamination characters
    for bad, good in _CONTAMINATION_MAP.items():
        s = s.replace(bad, good)
    # Phase 3: strip emoji
    s = _EMOJI_PATTERN.sub("", s)
    return s


def sanitise_text(obj: Any) -> Any:
    """
    Recursively sanitise all strings in the given object.

    Handles str, dict, and list. Other types pass through unchanged.
    This is the boundary enforcement function -- call it on raw LLM/external
    output BEFORE merging with existing data.
    """
    if isinstance(obj, str):
        return _sanitise_string(obj)
    elif isinstance(obj, dict):
        return {k: sanitise_text(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitise_text(item) for item in obj]
    return obj
