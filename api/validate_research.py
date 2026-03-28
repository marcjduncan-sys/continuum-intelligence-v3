"""
Research Data Validation & Auto-Fix Module

Two functions:
  fix(data)      — auto-corrects 13 known drift patterns, returns corrected data
  validate(data) — checks 19 rules, returns list of error strings (empty = pass)

Usage:
  from validate_research import fix, validate

  data = fix(data)          # auto-correct known issues
  errors = validate(data)   # check 19 rules
  if errors:
      for e in errors:
          print(f"  FAIL: {e}")
"""

import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

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

# Mojibake patterns (curly quotes, em-dashes incorrectly encoded)
_MOJIBAKE_MAP = {
    "\u00e2\u0080\u0093": "\u2013",  # en-dash
    "\u00e2\u0080\u0094": "\u2014",  # em-dash
    "\u00e2\u0080\u0098": "\u2018",  # left single quote
    "\u00e2\u0080\u0099": "\u2019",  # right single quote / apostrophe
    "\u00e2\u0080\u009c": "\u201c",  # left double quote
    "\u00e2\u0080\u009d": "\u201d",  # right double quote
    "\u00e2\u0080\u00a6": "\u2026",  # ellipsis
    "\u00e2\u0080\u00a2": "\u2022",  # bullet
    "\u00c2\u00a0": " ",             # non-breaking space double-encoded
}

# Score colour mapping from hypothesis direction
_DIRECTION_COLOR_MAP = {
    "upside": "var(--signal-green)",
    "bullish": "var(--signal-green)",
    "up": "var(--signal-green)",
    "neutral": "var(--signal-amber)",
    "base": "var(--signal-amber)",
    "steady": "var(--signal-amber)",
    "downside": "var(--text-muted)",
    "bearish": "var(--text-muted)",
    "down": "var(--text-muted)",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _strip_currency(val: Any) -> float | None:
    """Try to parse a value as a number, stripping currency symbols."""
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        cleaned = val.replace("$", "").replace("A$", "").replace("US$", "").replace(",", "").replace(" ", "").strip()
        try:
            return float(cleaned)
        except (ValueError, TypeError):
            return None
    return None


def _recursive_fix_strings(obj: Any) -> Any:
    """Recursively fix mojibake, strip emoji, and replace em-dashes from all strings."""
    if isinstance(obj, str):
        s = obj
        # Fix mojibake
        for bad, good in _MOJIBAKE_MAP.items():
            s = s.replace(bad, good)
        # Replace em-dashes with en-dashes (style rule: no em-dashes)
        s = s.replace("\u2014", "\u2013")
        # Strip emoji
        s = _EMOJI_PATTERN.sub("", s)
        return s
    elif isinstance(obj, dict):
        return {k: _recursive_fix_strings(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_recursive_fix_strings(item) for item in obj]
    return obj


def _strip_html(html: str) -> str:
    """Strip HTML tags from a string for length checking."""
    return re.sub(r"<[^>]+>", "", html)


# ---------------------------------------------------------------------------
# fix() — Auto-correct 12 known drift patterns
# ---------------------------------------------------------------------------

def fix(data: dict) -> dict:
    """
    Auto-correct known data drift issues. Returns the corrected dict.

    Fixes applied:
      1. String prices → float in position_in_range
      2. gapPct → gap_pct key rename + percentage string → float
      3. Missing current_price in position_in_range
      4. Empty scoreColor → derive from hypothesis direction
      5. indexReturn == 0 → default 6.5
      6. Recalculate relativeReturn
      7. Mojibake cleanup (recursive)
      8. Strip emoji (recursive)
      9. Trim heroCompanyDescription if > 600 chars
     10. Missing confidenceClass on coverage rows
     11. Fix footer counts from actual data
     12. Normalise score strings ("42%" → "42")
    """
    # --- 7 & 8: Mojibake + emoji cleanup (do first, applies to everything) ---
    data = _recursive_fix_strings(data)

    # --- 1: String prices → float in position_in_range ---
    pir = (data.get("hero") or {}).get("position_in_range", {})
    if pir:
        worlds = pir.get("worlds", [])
        for w in worlds:
            if "price" in w:
                parsed = _strip_currency(w["price"])
                if parsed is not None:
                    w["price"] = parsed

        # --- 2: gapPct → gap_pct key rename ---
        for w in worlds:
            if "gapPct" in w:
                val = w.pop("gapPct")
                # Convert percentage string to float ("+15%" → 0.15)
                if isinstance(val, str):
                    cleaned = val.replace("%", "").replace("+", "").strip()
                    try:
                        w["gap_pct"] = float(cleaned) / 100.0
                    except (ValueError, TypeError):
                        w["gap_pct"] = 0
                elif isinstance(val, (int, float)):
                    # If it's already > 1, assume it's a percentage
                    w["gap_pct"] = val / 100.0 if abs(val) > 1 else val
                else:
                    w["gap_pct"] = 0

        # --- 3: Missing current_price ---
        if "current_price" not in pir or not pir["current_price"]:
            pir["current_price"] = data.get("price", 0)

    # --- 4: Empty scoreColor → derive from hypothesis direction ---
    hypotheses = data.get("hypotheses", [])
    verdict_scores = (data.get("verdict") or {}).get("scores", [])

    for vs in verdict_scores:
        if not vs.get("scoreColor"):
            # Try to match to a hypothesis by tier prefix
            label = vs.get("label", "").lower()
            matched_direction = None
            for hyp in hypotheses:
                tier = hyp.get("tier", "").lower()
                if label.startswith(tier[:2]):
                    matched_direction = hyp.get("direction", "").lower()
                    break
            if matched_direction:
                vs["scoreColor"] = _DIRECTION_COLOR_MAP.get(
                    matched_direction, "var(--text-muted)"
                )
            else:
                vs["scoreColor"] = "var(--text-muted)"

    # --- 5: indexReturn == 0 → default 6.5 ---
    ta = data.get("technicalAnalysis") or {}
    rp = ta.get("relativePerformance") or {}
    vs_index = rp.get("vsIndex") or {}
    if vs_index.get("indexReturn", 0) == 0:
        vs_index["indexReturn"] = 6.5

    # --- 6: Recalculate relativeReturn ---
    if vs_index:
        stock_ret = vs_index.get("stockReturn", 0)
        index_ret = vs_index.get("indexReturn", 0)
        vs_index["relativeReturn"] = round(stock_ret - index_ret, 1)

    # --- 9: Trim heroCompanyDescription if > 600 chars ---
    desc = data.get("heroCompanyDescription", "")
    if desc:
        stripped = _strip_html(desc)
        if len(stripped) > 600:
            # Truncate at sentence boundary
            sentences = re.split(r'(?<=[.!?])\s+', stripped[:620])
            if len(sentences) > 1:
                truncated = " ".join(sentences[:-1])
            else:
                truncated = stripped[:580] + "..."
            data["heroCompanyDescription"] = truncated

    # --- 10: Missing confidenceClass on coverage rows ---
    gaps = data.get("gaps") or {}
    for row in gaps.get("coverageRows", []):
        if not row.get("confidenceClass"):
            confidence = row.get("confidence", "").lower()
            if "high" in confidence:
                row["confidenceClass"] = "td-green"
            elif "low" in confidence:
                row["confidenceClass"] = "td-amber"
            else:
                row["confidenceClass"] = "td-amber"

    # --- 11: Fix footer counts from actual data ---
    footer = data.get("footer") or {}
    hyp_count = len(hypotheses)
    if hyp_count > 0:
        # Check if initiated (scores are not "?")
        is_initiated = any(
            h.get("score", "?") not in ("?", "", None) and h.get("score", "?") != "?"
            for h in hypotheses
        )
        footer["hypothesesCount"] = f"{hyp_count} Active" if is_initiated else f"{hyp_count} Pending"

    coverage_rows = gaps.get("coverageRows", [])
    if coverage_rows:
        footer["domainCount"] = f"{len(coverage_rows)} of 10"

    # --- 12: Normalise score strings ---
    for vs in verdict_scores:
        score_val = vs.get("score", "")
        if isinstance(score_val, str) and "%" in score_val:
            # "42%" → "42"  (frontend does parseInt which handles both)
            vs["score"] = score_val.replace("%", "").strip() + "%"

    # --- 13 (fix): Sync verdict.scores from hypotheses (canonical source) ---
    if len(hypotheses) == len(verdict_scores) == 4:
        for vs, hyp in zip(verdict_scores, hypotheses):
            hyp_score = hyp.get("score", "")
            if hyp_score:
                vs["score"] = hyp_score

    return data


# ---------------------------------------------------------------------------
# validate() — 19 rule checks
# ---------------------------------------------------------------------------

def validate(data: dict) -> list[str]:
    """
    Validate a research JSON against the 19 schema rules.
    Returns a list of error strings. Empty list = all checks passed.

    Only checks initiated stocks (where hypotheses have real scores).
    """
    errors: list[str] = []

    # Quick check: is this an initiated stock?
    hypotheses = data.get("hypotheses", [])
    if not hypotheses:
        errors.append("No hypotheses found")
        return errors

    is_scaffold = all(
        h.get("score") in ("?", "", None) for h in hypotheses
    )
    if is_scaffold:
        # Scaffold stocks get basic checks only
        if len(hypotheses) != 4:
            errors.append(f"Expected 4 hypotheses, got {len(hypotheses)}")
        return errors

    # --- Rule 1: position_in_range.current_price ---
    hero = data.get("hero") or {}
    pir = hero.get("position_in_range") or {}
    cp = pir.get("current_price")
    if cp is None or not isinstance(cp, (int, float)) or cp <= 0:
        errors.append(
            f"Rule 1: hero.position_in_range.current_price must be numeric > 0, got {cp!r}"
        )

    # --- Rule 2: position_in_range.worlds length ---
    worlds = pir.get("worlds", [])
    if len(worlds) != 4:
        errors.append(f"Rule 2: position_in_range.worlds must have exactly 4 items, got {len(worlds)}")

    # --- Rule 3: world prices are numeric and > 0 ---
    for i, w in enumerate(worlds):
        price = w.get("price")
        if price is None or not isinstance(price, (int, float)) or price <= 0:
            errors.append(
                f"Rule 3: worlds[{i}].price must be numeric > 0, got {price!r}"
            )

    # --- Rule 4: world labels are descriptive ---
    bad_prefixes = ("n1", "n2", "n3", "n4")
    for i, w in enumerate(worlds):
        label = w.get("label", "")
        if not label or not label.strip():
            errors.append(f"Rule 4: worlds[{i}].label is empty")
        elif label.lower().startswith(bad_prefixes):
            errors.append(
                f"Rule 4: worlds[{i}].label should be descriptive (not '{label}'). "
                f"Use names like 'Commodity Rout', 'Balanced Cycle'."
            )

    # --- Rule 5: verdict.scores length ---
    verdict = data.get("verdict") or {}
    scores = verdict.get("scores") or []
    if len(scores) != 4:
        errors.append(f"Rule 5: verdict.scores must have exactly 4 items, got {len(scores)}")

    # --- Rule 6: scoreColor non-empty and valid ---
    for i, s in enumerate(scores):
        color = s.get("scoreColor", "")
        if not color or not color.strip():
            errors.append(f"Rule 6: verdict.scores[{i}].scoreColor is empty")
        elif not (color.startswith("var(--") or color.startswith("#")):
            errors.append(
                f"Rule 6: verdict.scores[{i}].scoreColor must be CSS variable or hex, got '{color}'"
            )

    # --- Rule 7: scores sum to ~100 ---
    total = 0
    for i, s in enumerate(scores):
        score_str = str(s.get("score", "0")).replace("%", "").strip()
        try:
            total += int(score_str)
        except (ValueError, TypeError):
            errors.append(f"Rule 7: verdict.scores[{i}].score not parseable: {s.get('score')!r}")

    if scores and not (90 <= total <= 110):
        errors.append(f"Rule 7: verdict scores sum to {total}, expected 90-110")

    # --- Rule 8: identity.rows >= 5 ---
    identity = data.get("identity") or {}
    rows = identity.get("rows") or []
    if len(rows) < 5:
        errors.append(f"Rule 8: identity.rows has {len(rows)} rows, need >= 5")

    # --- Rule 9: heroMetrics >= 5 ---
    hero_metrics = data.get("heroMetrics", [])
    if len(hero_metrics) < 5:
        errors.append(f"Rule 9: heroMetrics has {len(hero_metrics)} items, need >= 5")

    # --- Rule 10: featuredMetrics >= 3 ---
    featured = data.get("featuredMetrics", [])
    if len(featured) < 3:
        errors.append(f"Rule 10: featuredMetrics has {len(featured)} items, need >= 3")

    # --- Rule 11: indexReturn != 0 ---
    ta = data.get("technicalAnalysis") or {}
    rp = ta.get("relativePerformance") or {}
    vs_index = rp.get("vsIndex") or {}
    if vs_index.get("indexReturn", 0) == 0:
        errors.append("Rule 11: technicalAnalysis indexReturn is 0 (use ~6.5 default)")

    # --- Rule 12: heroCompanyDescription < 600 chars stripped ---
    desc = data.get("heroCompanyDescription", "")
    if desc:
        stripped_len = len(_strip_html(desc))
        if stripped_len > 600:
            errors.append(
                f"Rule 12: heroCompanyDescription is {stripped_len} chars stripped, max 600"
            )

    # --- Rule 13: 10 coverageRows with non-empty confidenceClass ---
    gaps = data.get("gaps") or {}
    coverage = gaps.get("coverageRows") or []
    if len(coverage) != 10:
        errors.append(f"Rule 13: gaps.coverageRows has {len(coverage)} rows, need 10")
    for i, cr in enumerate(coverage):
        if not cr.get("confidenceClass") and not cr.get("confidence"):
            errors.append(f"Rule 13: coverageRows[{i}] missing confidenceClass")

    # --- Rule 14: 10 evidence cards with finding > 50 chars ---
    evidence = data.get("evidence") or {}
    cards = evidence.get("cards") or []
    if len(cards) != 10:
        errors.append(f"Rule 14: evidence.cards has {len(cards)}, need 10")
    for i, card in enumerate(cards):
        finding = card.get("finding", "")
        if len(finding) < 50:
            errors.append(
                f"Rule 14: evidence.cards[{i}].finding is only {len(finding)} chars (need > 50)"
            )

    # --- Rule 15: 4 hypotheses with supporting/contradicting arrays ---
    if len(hypotheses) != 4:
        errors.append(f"Rule 15: expected 4 hypotheses, got {len(hypotheses)}")
    for i, h in enumerate(hypotheses):
        sup = h.get("supporting", [])
        con = h.get("contradicting", [])
        if not isinstance(sup, list) or len(sup) < 1:
            errors.append(f"Rule 15: hypotheses[{i}] missing supporting evidence")
        if not isinstance(con, list) or len(con) < 1:
            errors.append(f"Rule 15: hypotheses[{i}] missing contradicting evidence")
        # Check they're not just "Pending analysis" placeholders
        if sup and all("pending" in s.lower() for s in sup):
            errors.append(f"Rule 15: hypotheses[{i}] supporting is still placeholder")

    # --- Rule 16: priceHistory >= 200 positive numbers ---
    ph = data.get("priceHistory", [])
    if len(ph) < 200:
        errors.append(f"Rule 16: priceHistory has {len(ph)} entries, need >= 200")
    for i, p in enumerate(ph):
        if not isinstance(p, (int, float)) or p <= 0:
            errors.append(f"Rule 16: priceHistory[{i}] is not a positive number: {p!r}")
            break  # Only report first bad entry

    # --- Rule 17: No mojibake ---
    json_str = json.dumps(data, ensure_ascii=False)
    mojibake_patterns = ["\u00e2\u0080\u0093", "\u00e2\u0080\u0094", "\u00e2\u0080\u0098",
                         "\u00e2\u0080\u0099", "\u00e2\u0080\u009c", "\u00e2\u0080\u009d",
                         "\u00c2\u00a0"]
    for pat in mojibake_patterns:
        if pat in json_str:
            errors.append(f"Rule 17: Mojibake detected: {pat!r}")
            break

    # --- Rule 18: No emoji ---
    if _EMOJI_PATTERN.search(json_str):
        errors.append("Rule 18: Emoji characters detected in data")

    # --- Rule 19: verdict.scores must match hypotheses (canonical source) ---
    if len(hypotheses) == len(scores) == 4:
        for i, (h, vs) in enumerate(zip(hypotheses, scores)):
            h_score = str(h.get("score", "")).replace("%", "").strip()
            v_score = str(vs.get("score", "")).replace("%", "").strip()
            if h_score and v_score and h_score != v_score:
                errors.append(
                    f"Rule 19: verdict.scores[{i}] ({v_score}%) diverges from "
                    f"hypotheses[{i}] ({h_score}%); hypotheses are the source of truth"
                )

    return errors
