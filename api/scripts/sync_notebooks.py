"""Auto-sync notebooklm-notebooks.json from NotebookLM account.

Pulls all notebooks, extracts ticker codes from names (e.g. "CBA - Commonwealth Bank" -> "CBA"),
and writes the registry file. Preserves _-prefixed metadata keys.

Usage:
    cd continuum-intelligence-v3 && python api/scripts/sync_notebooks.py
"""

from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

from notebooklm import NotebookLMClient

# Resolve registry path relative to repo root
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
REGISTRY_PATH = REPO_ROOT / "data" / "config" / "notebooklm-notebooks.json"


async def sync_registry() -> None:
    async with await NotebookLMClient.from_storage() as client:
        notebooks = await client.notebooks.list()

    mapping: dict[str, str] = {}
    skipped: list[str] = []

    for nb in notebooks:
        # Extract ticker from name: "CBA - Commonwealth Bank" -> "CBA"
        # Matches 2-4 uppercase letters at the start of the name
        match = re.match(r"^([A-Z]{2,4})\b", nb.title.strip())
        if match:
            ticker = match.group(1)
            if ticker in mapping:
                print(f"  WARNING: Duplicate ticker {ticker} (notebooks: {mapping[ticker]}, {nb.id}). Keeping first.")
                skipped.append(f"{nb.title} ({nb.id})")
            else:
                mapping[ticker] = nb.id
        else:
            skipped.append(f"{nb.title} ({nb.id})")

    # Preserve _-prefixed metadata keys from existing registry
    existing: dict = {}
    if REGISTRY_PATH.exists():
        try:
            existing = json.loads(REGISTRY_PATH.read_text())
        except (json.JSONDecodeError, OSError):
            pass

    meta = {k: v for k, v in existing.items() if k.startswith("_")}
    output = {**meta, **dict(sorted(mapping.items()))}

    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    REGISTRY_PATH.write_text(json.dumps(output, indent=2) + "\n")

    print(f"\nMapped {len(mapping)} notebooks to {REGISTRY_PATH}:")
    for ticker, nid in sorted(mapping.items()):
        print(f"  {ticker}: {nid}")

    if skipped:
        print(f"\nSkipped {len(skipped)} notebooks (no ticker pattern in name):")
        for s in skipped:
            print(f"  {s}")

    # Show diff from previous registry
    prev_tickers = {k for k in existing if not k.startswith("_")}
    new_tickers = set(mapping.keys()) - prev_tickers
    removed_tickers = prev_tickers - set(mapping.keys())
    if new_tickers:
        print(f"\nNew tickers added: {', '.join(sorted(new_tickers))}")
    if removed_tickers:
        print(f"\nTickers removed (notebook renamed/deleted?): {', '.join(sorted(removed_tickers))}")


if __name__ == "__main__":
    asyncio.run(sync_registry())
