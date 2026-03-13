#!/usr/bin/env python3
"""
One-time repair: sync verdict.scores from hypotheses in all research JSONs.

For each ticker, copies hypotheses[i].score into verdict.scores[i].score
by matching tier prefix (n1->N1, n2->N2, etc).

Run: python scripts/repair_verdict_scores.py
"""

import json
import os
from pathlib import Path

RESEARCH_DIR = Path(__file__).resolve().parent.parent / "data" / "research"

def repair_file(filepath: Path) -> dict:
    """Sync verdict.scores from hypotheses. Returns stats."""
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    hypotheses = data.get("hypotheses", [])
    verdict = data.get("verdict", {})
    scores = verdict.get("scores", [])

    if not hypotheses or not scores:
        return {"file": filepath.name, "status": "skipped", "reason": "missing hypotheses or verdict.scores"}

    changes = []
    for vs in scores:
        label = vs.get("label", "").lower()
        for hyp in hypotheses:
            tier = hyp.get("tier", "").lower()
            if tier and label.startswith(tier[:2]):
                old_score = vs.get("score", "?")
                new_score = hyp.get("score", old_score)
                if old_score != new_score:
                    changes.append(f"  {vs['label']}: {old_score} -> {new_score}")
                    vs["score"] = new_score
                break

    if changes:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        return {"file": filepath.name, "status": "fixed", "changes": changes}
    else:
        return {"file": filepath.name, "status": "already_synced"}


def main():
    json_files = sorted(RESEARCH_DIR.glob("*.json"))
    json_files = [f for f in json_files if f.name != "_index.json"]

    print(f"Scanning {len(json_files)} research files in {RESEARCH_DIR}\n")

    fixed = 0
    synced = 0
    skipped = 0

    for fp in json_files:
        result = repair_file(fp)
        status = result["status"]
        if status == "fixed":
            fixed += 1
            print(f"FIXED  {result['file']}")
            for c in result["changes"]:
                print(c)
        elif status == "already_synced":
            synced += 1
            print(f"OK     {result['file']}")
        else:
            skipped += 1
            print(f"SKIP   {result['file']} ({result['reason']})")

    print(f"\nDone: {fixed} fixed, {synced} already synced, {skipped} skipped")


if __name__ == "__main__":
    main()
