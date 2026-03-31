"""
BEAD-005: Backfill explicit polarity field across all research JSONs.

For each ticker:
1. Add polarity to verdict scores (inferred from label keywords)
2. Fix hypothesis direction ONLY where title is the generic scaffold label
   and direction is clearly a scaffold artifact (N4 Disruption/Catalyst = downside)
3. Recompute skew using corrected formula
4. Output diff table for review

Usage:
    python scripts/backfill-polarity.py                    # Dry run (default)
    python scripts/backfill-polarity.py --apply            # Write all changes to disk
    python scripts/backfill-polarity.py --polarity-only    # Write ONLY polarity fields (no skew/direction changes)
"""

import json
import os
import sys
from pathlib import Path

UPSIDE_KW = ["growth", "recovery", "turnaround", "franchise", "quality", "moat"]
DOWNSIDE_KW = ["risk", "downside", "erosion", "pressure", "decline",
               "competition", "credit", "regulatory", "threat"]


def infer_polarity(label: str) -> str:
    """Mirror of _inferPolarity in src/lib/dom.js. Keep in sync."""
    if not label:
        return "neutral"
    l = label.lower()
    if any(k in l for k in UPSIDE_KW):
        return "upside"
    if any(k in l for k in DOWNSIDE_KW):
        return "downside"
    return "neutral"


def compute_skew(hypotheses: list[dict]) -> dict:
    """Mirror of computeSkewScore in src/lib/dom.js.
    Normalise scores to 100, resolve polarity, sum upside vs downside."""
    raw = []
    for h in hypotheses:
        s = h.get("score", "0")
        if isinstance(s, str):
            try:
                s = int(s.replace("%", "").strip())
            except (ValueError, TypeError):
                s = 0
        raw.append(max(5, min(80, int(s) if isinstance(s, (int, float)) else 0)))
    total = sum(raw) or 1
    norm = [r / total * 100 for r in raw]
    bull = 0.0
    bear = 0.0
    for i, h in enumerate(hypotheses):
        direction = h.get("direction") or infer_polarity(h.get("title", ""))
        if direction == "upside":
            bull += norm[i]
        elif direction == "downside":
            bear += norm[i]
    bull = round(bull)
    bear = round(bear)
    score = bull - bear
    direction = "upside" if score > 5 else "downside" if score < -5 else "balanced"
    return {"bull": bull, "bear": bear, "score": score, "direction": direction}


def old_compute_skew(hypotheses: list[dict]) -> int:
    """Old formula for comparison: normalise all to 100, sum upside - downside."""
    if not hypotheses:
        return 0
    raw = []
    for h in hypotheses:
        s = h.get("score", "0")
        if isinstance(s, str):
            try:
                s = int(s.replace("%", "").strip())
            except (ValueError, TypeError):
                s = 0
        raw.append(max(5, min(80, int(s) if isinstance(s, (int, float)) else 0)))
    total = sum(raw) or 1
    norm = [r / total * 100 for r in raw]
    bull = 0
    bear = 0
    for i, h in enumerate(hypotheses):
        d = h.get("direction", "downside")
        if d == "upside":
            bull += norm[i]
        elif d == "downside":
            bear += norm[i]
    return round(bull - bear)


# Generic scaffold titles that should have neutral polarity
GENERIC_NEUTRAL_TITLES = {
    "N4: Disruption/Catalyst",
    "N4 Disruption/Catalyst",
    "Disruption/Catalyst",
}


def process_ticker(filepath: Path, apply: bool, polarity_only: bool = False) -> dict | None:
    """Process a single research JSON. Returns diff info or None if no changes."""
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    ticker = filepath.stem
    if ticker == "_index":
        return None

    hypotheses = data.get("hypotheses", [])
    verdict = data.get("verdict", {})
    scores = verdict.get("scores", [])

    if not hypotheses:
        return None

    # Compute old skew BEFORE any modifications (using old default-to-downside logic)
    old_skew = old_compute_skew(hypotheses)

    changes = []

    # 1. Fix hypothesis direction for generic scaffold artifacts only
    if not polarity_only:
        for h in hypotheses:
            title = h.get("title", "")
            old_dir = h.get("direction", "")
            if title in GENERIC_NEUTRAL_TITLES and old_dir == "downside":
                h["direction"] = "neutral"
                changes.append(f"hyp {title}: direction downside -> neutral")

    # 2. Add polarity to verdict scores
    polarity_changes = []
    for s in scores:
        if "polarity" not in s:
            pol = infer_polarity(s.get("label", ""))
            s["polarity"] = pol
            polarity_changes.append(f"score {s.get('label', '?')}: +polarity={pol}")
    changes.extend(polarity_changes)

    # 3. Compute new skew with corrected formula and hypothesis directions
    new_result = compute_skew(hypotheses)
    new_skew = new_result["score"]
    new_dir = new_result["direction"]

    # Build polarity summary
    pols = []
    for h in hypotheses:
        d = h.get("direction") or infer_polarity(h.get("title", ""))
        pols.append(d[0].upper() if d else "?")

    result = {
        "ticker": ticker,
        "polarities": "/".join(pols),
        "old_skew": old_skew,
        "new_skew": new_skew,
        "delta": new_skew - old_skew,
        "new_dir": new_dir,
        "changes": len(changes),
    }

    # 4. Update hero.skew and skew.direction (skip in polarity-only mode)
    if not polarity_only:
        hero = data.get("hero")
        if hero and isinstance(hero, dict):
            hero["skew"] = new_dir.upper()
        skew_obj = data.get("skew")
        if skew_obj and isinstance(skew_obj, dict):
            skew_obj["direction"] = new_dir

    should_write = (apply and changes) or (polarity_only and polarity_changes)
    if should_write:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")

    return result


def main():
    apply = "--apply" in sys.argv
    polarity_only = "--polarity-only" in sys.argv
    research_dir = Path("data/research")

    if not research_dir.exists():
        print(f"ERROR: {research_dir} not found. Run from repo root.")
        sys.exit(1)

    files = sorted(research_dir.glob("*.json"))
    results = []

    for f in files:
        if f.stem == "_index":
            continue
        r = process_ticker(f, apply, polarity_only)
        if r:
            results.append(r)

    # Print diff table
    print(f"\n{'TICKER':<8} {'POLARITIES':<12} {'OLD_SKEW':>8} {'NEW_SKEW':>8} {'DELTA':>6} {'NEW_DIR':<10} {'CHANGES':>7}")
    print("-" * 70)
    for r in results:
        print(f"{r['ticker']:<8} {r['polarities']:<12} {r['old_skew']:>+8} {r['new_skew']:>+8} {r['delta']:>+6} {r['new_dir']:<10} {r['changes']:>7}")

    # Summary
    negative = sum(1 for r in results if r["new_skew"] < -5)
    positive = sum(1 for r in results if r["new_skew"] > 5)
    balanced = sum(1 for r in results if -5 <= r["new_skew"] <= 5)
    total = len(results)
    changed = sum(1 for r in results if r["delta"] != 0)

    print(f"\n--- Summary ---")
    print(f"Total tickers: {total}")
    print(f"Negative skew: {negative} ({negative/total*100:.0f}%)" if total else "")
    print(f"Positive skew: {positive} ({positive/total*100:.0f}%)" if total else "")
    print(f"Balanced:      {balanced} ({balanced/total*100:.0f}%)" if total else "")
    print(f"Skew changed:  {changed}")
    mode = "POLARITY ONLY (applied)" if polarity_only else "APPLIED" if apply else "DRY RUN (use --apply to write changes)"
    print(f"\nMode: {mode}")


if __name__ == "__main__":
    main()
