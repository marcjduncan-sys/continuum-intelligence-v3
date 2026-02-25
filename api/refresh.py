"""
Refresh orchestrator for per-stock data updates.

Four-stage pipeline:
  1. Data Gathering   — Yahoo Finance, ASX announcements, news search
  2. Specialist Analysis — Gemini extracts structured evidence updates
  3. Hypothesis Synthesis — Claude re-weights hypotheses and updates narrative
  4. Write Results     — Merge into research JSON, update index

Uses in-memory job tracking (sufficient for 21-stock POC).
"""

import asyncio
import json
import logging
import os
import time
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import anthropic

import config
from gemini_client import gemini_completion
from web_search import gather_all_data

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Job tracking
# ---------------------------------------------------------------------------

STAGES = [
    "gathering_data",
    "specialist_analysis",
    "hypothesis_synthesis",
    "writing_results",
    "completed",
]


@dataclass
class RefreshJob:
    ticker: str
    status: str = "gathering_data"
    stage_index: int = 0
    started_at: float = field(default_factory=time.time)
    completed_at: float | None = None
    error: str | None = None
    result: dict | None = None

    @property
    def progress_pct(self) -> int:
        if self.status == "completed":
            return 100
        if self.status == "failed":
            return 0
        return min(self.stage_index * 25, 100)

    @property
    def stage_label(self) -> str:
        labels = {
            "gathering_data": "Searching for new data...",
            "specialist_analysis": "Analysing evidence...",
            "hypothesis_synthesis": "Synthesising hypotheses...",
            "writing_results": "Updating page...",
            "completed": "Complete",
            "failed": "Failed",
        }
        return labels.get(self.status, self.status)

    def to_dict(self) -> dict:
        return {
            "ticker": self.ticker,
            "status": self.status,
            "stage_index": self.stage_index,
            "stage_label": self.stage_label,
            "progress_pct": self.progress_pct,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "error": self.error,
        }


# Global job store
refresh_jobs: dict[str, RefreshJob] = {}


def get_job(ticker: str) -> RefreshJob | None:
    return refresh_jobs.get(ticker.upper())


def is_running(ticker: str) -> bool:
    job = get_job(ticker)
    return job is not None and job.status not in ("completed", "failed")


# ---------------------------------------------------------------------------
# Research data paths
# ---------------------------------------------------------------------------

def _data_dir() -> Path:
    """Get the data/research directory relative to index.html."""
    index_dir = Path(config.INDEX_HTML_PATH).parent
    return index_dir / "data" / "research"


def _load_research(ticker: str) -> dict:
    """Load existing research JSON for a ticker."""
    path = _data_dir() / f"{ticker}.json"
    if not path.exists():
        raise FileNotFoundError(f"No research file for {ticker}")
    with open(path) as f:
        return json.load(f)


def _save_research(ticker: str, data: dict) -> None:
    """Save updated research JSON."""
    path = _data_dir() / f"{ticker}.json"
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    logger.info(f"Saved updated research for {ticker}")


def _update_index(ticker: str, data: dict) -> None:
    """Update the _index.json summary entry for this ticker."""
    index_path = _data_dir() / "_index.json"
    if not index_path.exists():
        return

    try:
        with open(index_path) as f:
            index = json.load(f)

        # Find and update the entry for this ticker
        if isinstance(index, list):
            for i, entry in enumerate(index):
                if entry.get("ticker", "").upper() == ticker:
                    # Update key fields in the index entry
                    index[i]["price"] = data.get("price", entry.get("price"))
                    index[i]["date"] = data.get("date", entry.get("date"))
                    if "verdict" in data and isinstance(data["verdict"], dict):
                        index[i]["verdict"] = data["verdict"].get("text", entry.get("verdict", ""))
                    break
        elif isinstance(index, dict):
            if ticker in index:
                index[ticker]["price"] = data.get("price", index[ticker].get("price"))
                index[ticker]["date"] = data.get("date", index[ticker].get("date"))

        with open(index_path, "w") as f:
            json.dump(index, f, indent=2, ensure_ascii=False)

    except Exception as e:
        logger.warning(f"Failed to update _index.json: {e}")


# ---------------------------------------------------------------------------
# Gemini specialist prompts
# ---------------------------------------------------------------------------

EVIDENCE_UPDATE_SYSTEM = """\
You are a specialist equity research analyst. Given existing evidence cards and new data \
(price movements, ASX announcements, news), update the evidence assessment.

For each evidence card, assess whether the new data changes the finding or tension. \
Return a JSON object with this structure:

{
  "cards": [
    {
      "number": 1,
      "title": "1. Corporate Communications",
      "updated_finding": "Updated finding text based on new data",
      "updated_tension": "Updated tension text if changed, or null if unchanged",
      "material_change": true/false
    }
  ],
  "summary": "Brief summary of what changed across evidence domains"
}

Only update cards where new data is genuinely material. For cards with no relevant new data, \
set material_change to false and keep the finding unchanged.
Be specific. Cite dates, numbers, and sources from the provided data."""

HYPOTHESIS_UPDATE_SYSTEM = """\
You are a senior equity research analyst at Continuum Intelligence. You assess competing \
hypotheses for ASX-listed companies using structured evidence.

Given the current hypothesis weights, updated evidence cards, and new market data, \
re-assess each hypothesis. Return a JSON object:

{
  "hypotheses": [
    {
      "tier": "n1",
      "title": "N1: [title]",
      "updated_score": "XX%",
      "direction": "up|down|steady",
      "rationale": "Brief rationale for the score change"
    }
  ],
  "narrative_update": "2-3 sentence update to the dominant narrative based on new evidence",
  "verdict_update": "Updated verdict text (2-3 sentences on what the market is pricing vs reality)",
  "key_catalyst": "The single most important upcoming catalyst"
}

Be rigorous. Scores should reflect genuine probability weighting. \
If nothing material has changed, keep scores steady and say so."""


# ---------------------------------------------------------------------------
# Main refresh pipeline
# ---------------------------------------------------------------------------

async def run_refresh(ticker: str) -> dict:
    """
    Execute the full 4-stage refresh pipeline for a single stock.

    Parameters
    ----------
    ticker : str
        ASX ticker code (uppercase).

    Returns
    -------
    dict
        The updated research JSON.
    """
    ticker = ticker.upper()
    job = RefreshJob(ticker=ticker)
    refresh_jobs[ticker] = job

    try:
        # Load existing research
        research = _load_research(ticker)
        company_name = research.get("company", ticker)

        # ---- Stage 1: Data Gathering ----
        job.status = "gathering_data"
        job.stage_index = 1
        logger.info(f"[{ticker}] Stage 1: Gathering data...")

        gathered = await gather_all_data(ticker, company_name)

        # ---- Stage 2: Specialist Analysis (Gemini) ----
        job.status = "specialist_analysis"
        job.stage_index = 2
        logger.info(f"[{ticker}] Stage 2: Specialist analysis (Gemini)...")

        evidence_update = await _run_evidence_specialists(
            ticker, research, gathered
        )

        # ---- Stage 3: Hypothesis Synthesis (Claude) ----
        job.status = "hypothesis_synthesis"
        job.stage_index = 3
        logger.info(f"[{ticker}] Stage 3: Hypothesis synthesis (Claude)...")

        hypothesis_update = await _run_hypothesis_synthesis(
            ticker, research, evidence_update, gathered
        )

        # ---- Stage 4: Write Results ----
        job.status = "writing_results"
        job.stage_index = 4
        logger.info(f"[{ticker}] Stage 4: Writing results...")

        updated_research = _merge_updates(
            research, gathered, evidence_update, hypothesis_update
        )

        _save_research(ticker, updated_research)
        _update_index(ticker, updated_research)

        # Mark complete
        job.status = "completed"
        job.stage_index = 5
        job.completed_at = time.time()
        job.result = updated_research
        logger.info(
            f"[{ticker}] Refresh completed in {job.completed_at - job.started_at:.1f}s"
        )

        return updated_research

    except Exception as e:
        job.status = "failed"
        job.error = str(e)
        job.completed_at = time.time()
        logger.error(f"[{ticker}] Refresh failed: {e}", exc_info=True)
        raise


# ---------------------------------------------------------------------------
# Stage 2: Evidence specialists (Gemini)
# ---------------------------------------------------------------------------

async def _run_evidence_specialists(
    ticker: str,
    research: dict,
    gathered: dict,
) -> dict:
    """Run Gemini evidence card update."""
    # Format existing evidence for context
    existing_cards = research.get("evidence", {}).get("cards", [])
    cards_summary = []
    for card in existing_cards:
        cards_summary.append({
            "number": card.get("number"),
            "title": card.get("title"),
            "finding": card.get("finding"),
            "tension": card.get("tension"),
        })

    # Format gathered data
    price_data = gathered.get("price_data", {})
    announcements = gathered.get("announcements", [])
    news = gathered.get("news", [])

    user_prompt = f"""## Stock: {ticker} ({research.get('company', '')})
## Current Price: {price_data.get('price', 'N/A')} ({price_data.get('change_pct', 0):+.1f}%)

## Existing Evidence Cards:
{json.dumps(cards_summary, indent=2)}

## New ASX Announcements (last 30 days):
{json.dumps(announcements[:10], indent=2)}

## Recent News Headlines:
{json.dumps(news[:8], indent=2)}

Please assess each evidence card against this new data and return the updated assessment as JSON."""

    try:
        result = gemini_completion(
            system_prompt=EVIDENCE_UPDATE_SYSTEM,
            user_prompt=user_prompt,
            json_mode=True,
        )
        return result if isinstance(result, dict) else {}
    except Exception as e:
        logger.error(f"[{ticker}] Evidence specialist failed: {e}")
        return {"cards": [], "summary": f"Evidence update failed: {e}"}


# ---------------------------------------------------------------------------
# Stage 3: Hypothesis synthesis (Claude)
# ---------------------------------------------------------------------------

async def _run_hypothesis_synthesis(
    ticker: str,
    research: dict,
    evidence_update: dict,
    gathered: dict,
) -> dict:
    """Run Claude hypothesis re-weighting."""
    # Format current hypotheses
    hypotheses_summary = []
    for h in research.get("hypotheses", []):
        hypotheses_summary.append({
            "tier": h.get("tier"),
            "title": h.get("title"),
            "score": h.get("score"),
            "description": h.get("description", "")[:300],
        })

    # Format evidence changes
    evidence_changes = evidence_update.get("summary", "No material changes detected.")
    updated_cards = evidence_update.get("cards", [])
    material_changes = [c for c in updated_cards if c.get("material_change")]

    price_data = gathered.get("price_data", {})

    user_prompt = f"""## Stock: {ticker} ({research.get('company', '')})
## Current Price: A${price_data.get('price', 'N/A')} ({price_data.get('change_pct', 0):+.1f}%)
## 52-Week Range: A${price_data.get('low_52w', 'N/A')} - A${price_data.get('high_52w', 'N/A')}

## Current Hypothesis Weights:
{json.dumps(hypotheses_summary, indent=2)}

## Current Verdict:
{research.get('verdict', {}).get('text', 'N/A')[:500]}

## Evidence Update Summary:
{evidence_changes}

## Material Evidence Changes:
{json.dumps(material_changes, indent=2) if material_changes else 'No material changes.'}

## Recent ASX Announcements:
{json.dumps(gathered.get('announcements', [])[:5], indent=2)}

Please re-assess each hypothesis weight and provide updated narrative and verdict as JSON."""

    try:
        if not config.ANTHROPIC_API_KEY:
            # Fallback: use Gemini for synthesis if Claude not configured
            logger.warning(f"[{ticker}] No Anthropic key, using Gemini for synthesis")
            return gemini_completion(
                system_prompt=HYPOTHESIS_UPDATE_SYSTEM,
                user_prompt=user_prompt,
                json_mode=True,
            )

        # Use Claude for the judgment-heavy synthesis
        client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
        response = client.messages.create(
            model=config.ANTHROPIC_MODEL,
            max_tokens=2048,
            system=HYPOTHESIS_UPDATE_SYSTEM + "\n\nRespond with valid JSON only.",
            messages=[{"role": "user", "content": user_prompt}],
        )

        text = ""
        for block in response.content:
            if block.type == "text":
                text += block.text

        # Parse JSON from Claude response (may have markdown code fences)
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            text = text.rsplit("```", 1)[0]

        return json.loads(text)

    except Exception as e:
        logger.error(f"[{ticker}] Hypothesis synthesis failed: {e}")
        return {
            "hypotheses": [],
            "narrative_update": f"Synthesis unavailable: {e}",
            "verdict_update": None,
            "key_catalyst": None,
        }


# ---------------------------------------------------------------------------
# Stage 4: Merge updates into research JSON
# ---------------------------------------------------------------------------

def _merge_updates(
    research: dict,
    gathered: dict,
    evidence_update: dict,
    hypothesis_update: dict,
) -> dict:
    """Merge all updates into a copy of the research JSON."""
    updated = deepcopy(research)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # -- Price update --
    price_data = gathered.get("price_data", {})
    if "error" not in price_data:
        updated["price"] = str(price_data.get("price", updated.get("price", "")))
        updated["currency"] = price_data.get("currency", "A$")

        # Update hero metrics if they exist
        if "heroMetrics" in updated:
            for m in updated["heroMetrics"]:
                if m.get("label") in ("Price", "Share Price", "Current Price"):
                    m["value"] = f"A${price_data['price']:.2f}"
                elif m.get("label") == "52-Week Range":
                    m["value"] = f"A${price_data.get('low_52w', 0):.2f} - A${price_data.get('high_52w', 0):.2f}"

        # Update price history for sparkline
        if price_data.get("price_history"):
            updated["priceHistory"] = price_data["price_history"]

    # -- Evidence card updates --
    evidence_cards = evidence_update.get("cards", [])
    existing_cards = updated.get("evidence", {}).get("cards", [])
    for update_card in evidence_cards:
        if not update_card.get("material_change"):
            continue
        card_num = update_card.get("number")
        for existing in existing_cards:
            if existing.get("number") == card_num:
                if update_card.get("updated_finding"):
                    existing["finding"] = update_card["updated_finding"]
                if update_card.get("updated_tension"):
                    existing["tension"] = update_card["updated_tension"]
                break

    # -- Hypothesis weight updates --
    hyp_updates = hypothesis_update.get("hypotheses", [])
    for hu in hyp_updates:
        tier = hu.get("tier", "").lower()
        for h in updated.get("hypotheses", []):
            if h.get("tier", "").lower() == tier:
                if hu.get("updated_score"):
                    h["score"] = hu["updated_score"]
                    h["scoreWidth"] = hu["updated_score"]
                # Update direction in verdict scores
                direction = hu.get("direction", "steady")
                dir_map = {
                    "up": ("&uarr;", "Rising"),
                    "down": ("&darr;", "Falling"),
                    "steady": ("&rarr;", "Steady"),
                }
                arrow, text = dir_map.get(direction, ("&rarr;", "Steady"))
                if "verdict" in updated and "scores" in updated["verdict"]:
                    for vs in updated["verdict"]["scores"]:
                        if vs.get("label", "").lower().startswith(tier[:2]):
                            vs["score"] = hu.get("updated_score", vs.get("score"))
                            vs["dirArrow"] = arrow
                            vs["dirText"] = text
                break

    # -- Narrative update --
    if hypothesis_update.get("narrative_update"):
        if "narrative" in updated and isinstance(updated["narrative"], dict):
            # Prepend the update to the existing narrative
            existing_narrative = updated["narrative"].get("theNarrative", "")
            update_text = hypothesis_update["narrative_update"]
            updated["narrative"]["theNarrative"] = (
                f"<strong>[Updated {now}]</strong> {update_text}<br><br>"
                f"{existing_narrative}"
            )

    # -- Verdict update --
    if hypothesis_update.get("verdict_update"):
        if "verdict" in updated and isinstance(updated["verdict"], dict):
            updated["verdict"]["text"] = hypothesis_update["verdict_update"]

    # -- Timestamp --
    updated["date"] = now
    updated["_lastRefreshed"] = datetime.now(timezone.utc).isoformat()

    return updated
