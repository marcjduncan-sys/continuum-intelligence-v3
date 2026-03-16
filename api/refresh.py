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
from price_drivers import run_price_driver_analysis
from gold_agent import run_gold_analysis
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
# Batch refresh infrastructure
# ---------------------------------------------------------------------------

@dataclass
class BatchRefreshJob:
    batch_id: str
    tickers: list = field(default_factory=list)
    status: str = "queued"  # queued | in_progress | completed | partially_failed
    started_at: float = field(default_factory=time.time)
    completed_at: float | None = None
    per_ticker_status: dict = field(default_factory=dict)
    errors: dict = field(default_factory=dict)

    @property
    def total_completed(self) -> int:
        return sum(
            1 for s in self.per_ticker_status.values() if s.get("status") == "completed"
        )

    @property
    def total_failed(self) -> int:
        return sum(
            1 for s in self.per_ticker_status.values() if s.get("status") == "failed"
        )

    @property
    def total_in_progress(self) -> int:
        return sum(
            1
            for s in self.per_ticker_status.values()
            if s.get("status") not in ("completed", "failed", "queued")
        )

    @property
    def progress_pct(self) -> int:
        if not self.tickers:
            return 0
        done = self.total_completed + self.total_failed
        return int(done / len(self.tickers) * 100)

    def to_dict(self) -> dict:
        return {
            "batch_id": self.batch_id,
            "status": self.status,
            "overall_progress_pct": self.progress_pct,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "total": len(self.tickers),
            "total_completed": self.total_completed,
            "total_failed": self.total_failed,
            "total_in_progress": self.total_in_progress,
            "total_queued": len(self.tickers)
            - self.total_completed
            - self.total_failed
            - self.total_in_progress,
            "per_ticker_status": [
                self.per_ticker_status.get(
                    t,
                    {"ticker": t, "status": "queued", "progress_pct": 0, "stage_label": "Queued", "error": None},
                )
                for t in self.tickers
            ],
        }


batch_jobs: dict[str, BatchRefreshJob] = {}
_batch_semaphore: asyncio.Semaphore | None = None
_gather_semaphore: asyncio.Semaphore | None = None
_evidence_semaphore: asyncio.Semaphore | None = None


def _get_batch_semaphore() -> asyncio.Semaphore:
    global _batch_semaphore
    if _batch_semaphore is None:
        _batch_semaphore = asyncio.Semaphore(2)
    return _batch_semaphore


def _get_gather_semaphore() -> asyncio.Semaphore:
    """Limit concurrent data-gathering to avoid OOM on Railway."""
    global _gather_semaphore
    if _gather_semaphore is None:
        _gather_semaphore = asyncio.Semaphore(3)
    return _gather_semaphore


def _get_evidence_semaphore() -> asyncio.Semaphore:
    """Limit concurrent structure update calls (Gemini Flash)."""
    global _evidence_semaphore
    if _evidence_semaphore is None:
        _evidence_semaphore = asyncio.Semaphore(3)
    return _evidence_semaphore


def get_batch_job(batch_id: str) -> BatchRefreshJob | None:
    return batch_jobs.get(batch_id)


def get_latest_batch_job() -> BatchRefreshJob | None:
    if not batch_jobs:
        return None
    return max(batch_jobs.values(), key=lambda j: j.started_at)


def is_batch_running() -> bool:
    for job in batch_jobs.values():
        if job.status in ("queued", "in_progress"):
            return True
    return False


async def _run_single_in_batch(
    ticker: str, batch_job: BatchRefreshJob
) -> dict | None:
    """Run a single-ticker refresh within a batch, using semaphore for stages 2-3."""
    ticker = ticker.upper()
    semaphore = _get_batch_semaphore()
    gather_sem = _get_gather_semaphore()

    # Create per-ticker job entry (so individual /status endpoint also works)
    job = RefreshJob(ticker=ticker)
    refresh_jobs[ticker] = job

    # Update batch tracking
    batch_job.per_ticker_status[ticker] = job.to_dict()

    try:
        # Load existing research
        research = _load_research(ticker)
        company_name = research.get("company", ticker)

        # ---- Stage 1: Data Gathering (gather semaphore limits concurrency) ----
        async with gather_sem:
            job.status = "gathering_data"
            job.stage_index = 1
            batch_job.per_ticker_status[ticker] = job.to_dict()
            logger.info(f"[BATCH][{ticker}] Stage 1: Gathering data...")

            gathered = await gather_all_data(ticker, company_name)

        # ---- Stages 2-3: Acquire semaphore for LLM-heavy work ----
        async with semaphore:
            job.status = "specialist_analysis"
            job.stage_index = 2
            batch_job.per_ticker_status[ticker] = job.to_dict()
            logger.info(f"[BATCH][{ticker}] Stage 2: Parallel analysis tracks...")

            # All analysis tracks run in parallel
            async def _ev_then_synth():
                ev = await _run_evidence_specialists(ticker, research, gathered)
                job.status = "hypothesis_synthesis"
                job.stage_index = 3
                batch_job.per_ticker_status[ticker] = job.to_dict()
                logger.info(f"[BATCH][{ticker}] Stage 3: Hypothesis synthesis...")
                hyp = await _run_hypothesis_synthesis(ticker, research, ev, gathered)
                return ev, hyp

            async def _struct_track():
                logger.info(f"[BATCH][{ticker}] Track 3: Structure update...")
                return await _run_structure_update(ticker, research, gathered)

            async def _pd_track():
                logger.info(f"[BATCH][{ticker}] Track 4: Price drivers...")
                try:
                    return await run_price_driver_analysis(
                        ticker, company_name, force=True,
                    )
                except Exception as e:
                    logger.error(f"[BATCH][{ticker}] Price drivers failed: {e}")
                    return None

            is_gold = "gold" in research.get("sectorSub", "").lower()

            async def _gold_track():
                if not is_gold:
                    return None
                logger.info(f"[BATCH][{ticker}] Track 5: Gold overlay...")
                try:
                    return await run_gold_analysis(ticker, force=True)
                except Exception as e:
                    logger.error(f"[BATCH][{ticker}] Gold overlay failed: {e}")
                    return None

            (evidence_update, hypothesis_update), structure_update, price_driver_result, gold_result = (
                await asyncio.gather(
                    _ev_then_synth(),
                    _struct_track(),
                    _pd_track(),
                    _gold_track(),
                )
            )

        # ---- Stage 4: Write Results (no semaphore) ----
        job.status = "writing_results"
        job.stage_index = 4
        batch_job.per_ticker_status[ticker] = job.to_dict()
        logger.info(f"[BATCH][{ticker}] Stage 4: Writing results...")

        updated_research = _merge_updates(
            research, gathered, evidence_update, hypothesis_update,
            structure_update=structure_update,
            price_driver_result=price_driver_result,
            gold_result=gold_result,
        )

        _save_research(ticker, updated_research)
        _update_index(ticker, updated_research)

        # Mark complete
        job.status = "completed"
        job.stage_index = 5
        job.completed_at = time.time()
        job.result = updated_research
        batch_job.per_ticker_status[ticker] = job.to_dict()
        logger.info(
            f"[BATCH][{ticker}] Completed in {job.completed_at - job.started_at:.1f}s"
        )

        return updated_research

    except Exception as e:
        job.status = "failed"
        job.error = str(e)
        job.completed_at = time.time()
        batch_job.per_ticker_status[ticker] = job.to_dict()
        batch_job.errors[ticker] = str(e)
        logger.error(f"[BATCH][{ticker}] Failed: {e}", exc_info=True)
        return None


async def run_batch_refresh(batch_id: str, tickers: list[str]) -> dict:
    """Execute batch refresh for all tickers with controlled parallelism."""
    batch_job = BatchRefreshJob(batch_id=batch_id, tickers=tickers, status="in_progress")
    batch_jobs[batch_id] = batch_job

    # Initialise per-ticker status
    for t in tickers:
        batch_job.per_ticker_status[t] = {
            "ticker": t,
            "status": "queued",
            "stage_index": 0,
            "stage_label": "Queued",
            "progress_pct": 0,
            "started_at": None,
            "completed_at": None,
            "error": None,
        }

    logger.info(f"[BATCH] Starting batch {batch_id} for {len(tickers)} tickers")

    # Launch all tickers; semaphore controls concurrency at stages 2-3
    results = await asyncio.gather(
        *[_run_single_in_batch(t, batch_job) for t in tickers],
        return_exceptions=True,
    )

    # Handle any unexpected exceptions from gather
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            t = tickers[i]
            if t not in batch_job.errors:
                batch_job.errors[t] = str(result)
                batch_job.per_ticker_status[t] = {
                    "ticker": t,
                    "status": "failed",
                    "stage_index": 0,
                    "stage_label": "Failed",
                    "progress_pct": 0,
                    "started_at": None,
                    "completed_at": time.time(),
                    "error": str(result),
                }

    # Mark batch complete
    batch_job.completed_at = time.time()
    if batch_job.total_failed == 0:
        batch_job.status = "completed"
    elif batch_job.total_completed == 0:
        batch_job.status = "failed"
    else:
        batch_job.status = "partially_failed"

    elapsed = batch_job.completed_at - batch_job.started_at
    logger.info(
        f"[BATCH] {batch_id} finished in {elapsed:.0f}s — "
        f"{batch_job.total_completed} completed, {batch_job.total_failed} failed"
    )

    return batch_job.to_dict()


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

Given the current hypothesis weights, updated evidence cards, new market data, and the \
existing narrative sections, perform a FULL research update. You must rewrite all narrative \
content to reflect current reality — do not leave stale references to past events as if \
they are future events.

Return a JSON object with ALL of the following fields:

{
  "hypotheses": [
    {
      "tier": "n1",
      "title": "N1: [title]",
      "updated_score": "XX%",
      "direction": "up|down|steady",
      "rationale": "Brief rationale for the score change",
      "updated_description": "Updated 2-3 sentence description of this hypothesis scenario",
      "supporting": ["One sentence per item citing the evidence domain. 3-5 items."],
      "contradicting": ["One sentence per item citing the evidence domain. 2-4 items."]
    }
  ],
  "summary_paragraph": "Fresh 3-5 sentence verdict summary capturing the current state of play. \
Do not use 'Initiating coverage' or 'First look'. This is an ongoing research position.",
  "embedded_thesis": "Rewritten 3-5 sentence paragraph describing what the current price embeds. \
Reference the CURRENT price (provided), not old prices. Describe what assumptions the market is \
making at this level. Use plain text, no HTML.",
  "skew_description": "Rewritten 2-3 sentence summary of hypothesis weightings and directional skew.",
  "narrative_rewrite": "Full rewrite of the dominant narrative (4-8 sentences). Use HTML formatting: \
<strong> for emphasis, <span class='key-stat'> for key numbers. Must reflect ALL recent events \
including any results, announcements, or catalysts from the gathered data. Do NOT reference past \
events as future events.",
  "price_implication": "Rewritten HTML content describing what the current price assumes. Use \
bullet format with <br> separators. Reference the current price.",
  "evidence_check": "Rewritten HTML paragraph assessing how much evidence supports vs contradicts \
the dominant narrative.",
  "narrative_stability": "Rewritten HTML paragraph evaluating narrative robustness and what could \
change it.",
  "verdict_update": "Updated verdict text (3-5 sentences on what the market is pricing vs reality \
at the current price). Must reference current price and recent events.",
  "next_decision_point": {
    "event": "The next material upcoming catalyst (NOT a past event)",
    "date": "Expected date (YYYY-MM-DD or descriptive)",
    "metric": "What to watch for",
    "thresholds": "Specific levels or outcomes that would shift the thesis"
  },
  "key_catalyst": "The single most important upcoming catalyst",
  "tripwire_updates": [
    {
      "index": 0,
      "status": "resolved or still_pending or updated",
      "resolution": "What actually happened (for resolved). Null if still pending.",
      "new_date": "Updated date if event was postponed. Null if unchanged."
    }
  ],
  "new_tripwire": {
    "date": "FUTURE catalyst date (must be after today)",
    "name": "Short catalyst name",
    "conditions": [
      {"if": "If [positive scenario]", "valence": "positive", "then": "Then [implication]"},
      {"if": "If [negative scenario]", "valence": "negative", "then": "Then [implication]"}
    ],
    "source": "Source citation"
  }
}

CRITICAL RULES:
- Today's date is provided in the prompt. Any event with a date before today has ALREADY HAPPENED.
- Rewrite ALL narrative sections to reflect current reality.
- Reference the CURRENT price, not old prices.
- If results or announcements have been released, discuss what they SHOWED, not what they might show.
- If a material event has occurred but detailed results are NOT in the provided data, state that \
the event has occurred. Describe ONLY what is factually known (e.g., from headlines, snippets, or \
observable market reaction). NEVER use conditional or speculative language ("if results disappoint", \
"should guidance miss") about events that have already happened.
- When rewriting narrative_stability: if a key test or catalyst has already occurred, do NOT describe \
the narrative as "resting on" that upcoming event. Describe what the event revealed or, if outcome \
details are unavailable, state the event occurred and the narrative now rests on the next catalyst.
- Scores should reflect genuine probability weighting.
- The four hypothesis scores MUST sum to exactly 100%. Express each as an integer percentage (e.g. "25%", not "24.7%").
- If nothing material has changed, keep scores steady and say so, but still ensure narratives \
reference current prices and dates correctly.
- For tripwire_updates: any tripwire with a date BEFORE today MUST have status "resolved". \
Describe what actually happened in the resolution field. If you lack specific outcome details, \
say "Event occurred [date]; outcome details pending data update."
- new_tripwire MUST reference a FUTURE event (date after today). Provide the next material catalyst."""


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

        # ---- Stage 2: Parallel analysis tracks ----
        job.status = "specialist_analysis"
        job.stage_index = 2
        logger.info(f"[{ticker}] Stage 2: Running analysis tracks in parallel...")

        # Tracks run in parallel:
        # - Evidence chain: evidence specialists (Gemini) -> hypothesis synthesis (Claude)
        # - Structure update: Gemini Flash (independent)
        # - Price drivers: 3-layer LLM pipeline (independent)
        async def _evidence_then_synthesis():
            ev = await _run_evidence_specialists(ticker, research, gathered)
            job.status = "hypothesis_synthesis"
            job.stage_index = 3
            logger.info(f"[{ticker}] Stage 3: Hypothesis synthesis (Claude)...")
            hyp = await _run_hypothesis_synthesis(ticker, research, ev, gathered)
            return ev, hyp

        async def _structure_track():
            logger.info(f"[{ticker}] Track 3: Structure update (Gemini Flash)...")
            return await _run_structure_update(ticker, research, gathered)

        async def _price_drivers_track():
            logger.info(f"[{ticker}] Track 4: Price drivers...")
            try:
                return await run_price_driver_analysis(
                    ticker, company_name, force=True,
                )
            except Exception as e:
                logger.error(f"[{ticker}] Price drivers failed: {e}")
                return None

        is_gold = "gold" in research.get("sectorSub", "").lower()

        async def _gold_track():
            if not is_gold:
                return None
            logger.info(f"[{ticker}] Track 5: Gold overlay analysis...")
            try:
                return await run_gold_analysis(ticker, force=True)
            except Exception as e:
                logger.error(f"[{ticker}] Gold overlay failed: {e}")
                return None

        # Run all tracks concurrently
        (evidence_update, hypothesis_update), structure_update, price_driver_result, gold_result = (
            await asyncio.gather(
                _evidence_then_synthesis(),
                _structure_track(),
                _price_drivers_track(),
                _gold_track(),
            )
        )

        # ---- Stage 4: Write Results ----
        job.status = "writing_results"
        job.stage_index = 4
        logger.info(f"[{ticker}] Stage 4: Writing results...")

        updated_research = _merge_updates(
            research, gathered, evidence_update, hypothesis_update,
            structure_update=structure_update,
            price_driver_result=price_driver_result,
            gold_result=gold_result,
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
# Track 3: Structure update (Gemini Flash) — refreshes stale sections
# ---------------------------------------------------------------------------

STRUCTURE_UPDATE_SYSTEM = """\
You are a senior equity research analyst updating the structural sections of a stock report. \
Given the current research JSON and fresh market data, produce updated content for the sections \
that need refreshing. Write in the voice of a top-tier institutional research house: authoritative, \
precise, economical. No filler, no hedging, no em-dashes.

Return a JSON object with ALL of these fields:

{
  "evidence_intro": "Updated 2-3 sentence introduction for the evidence section, summarising the \
current evidence landscape across all domains.",

  "alignment_summary": {
    "headers": ["Domain", "N1", "N2", "N3", "N4"],
    "rows": [
      {"domain": "Corporate Communications", "n1": "supports|contradicts|neutral", "n2": "...", "n3": "...", "n4": "..."},
      {"domain": "Regulatory Filings", "n1": "...", "n2": "...", "n3": "...", "n4": "..."},
      {"domain": "Broker Research", "n1": "...", "n2": "...", "n3": "...", "n4": "..."},
      {"domain": "Competitor Disclosures", "n1": "...", "n2": "...", "n3": "...", "n4": "..."},
      {"domain": "Economic Data", "n1": "...", "n2": "...", "n3": "...", "n4": "..."},
      {"domain": "Alternative Data", "n1": "...", "n2": "...", "n3": "...", "n4": "..."},
      {"domain": "Media & Social", "n1": "...", "n2": "...", "n3": "...", "n4": "..."}
    ]
  },

  "discriminators": {
    "intro": "Updated 2-3 sentence intro identifying which evidence most powerfully distinguishes \
between the competing hypotheses.",
    "rows": [
      {"evidence": "Description of discriminating evidence", "diagnosticity": "high|medium|low", \
"favours": "N1|N2|N3|N4", "source": "Evidence domain"}
    ],
    "nonDiscriminating": "1-2 sentences describing evidence that is consistent with multiple hypotheses \
and therefore not diagnostic."
  },

  "gaps": {
    "coverageRows": [
      {"domain": "Domain name", "status": "covered|partial|gap", "detail": "Brief explanation"}
    ],
    "couldntAssess": ["List of specific questions the evidence cannot currently answer"],
    "analyticalLimitations": "1-2 paragraph description of analytical limitations and what additional \
data would strengthen the assessment."
  },

  "identity": {
    "overview": "Updated 3-5 sentence company overview reflecting current state, recent events, \
and market position. Include current market cap if available.",
    "rows": [
      {"label": "Sector", "value": "..."},
      {"label": "Market Cap", "value": "A$X.XXbn"},
      {"label": "Revenue (LTM)", "value": "..."},
      {"label": "Employees", "value": "..."},
      {"label": "Listed", "value": "ASX"}
    ]
  },

  "technical_commentary": "Updated 2-3 paragraph technical analysis commentary. Reference the \
current price, moving averages, RSI, volume patterns, and key support/resistance levels. Use the \
technical indicators provided. No em-dashes."
}

RULES:
- Use values "supports", "contradicts", or "neutral" for alignment cells.
- Discriminator rows should focus on the 4-6 most diagnostic pieces of evidence.
- Gaps should honestly identify what the analysis cannot assess.
- Identity overview must reflect current reality, not stale initiation text.
- Technical commentary must reference the actual indicator values provided.
- No em-dashes. Use commas, semicolons, colons, or periods.
- No filler phrases: "It is worth noting", "Notably", "Importantly".
- Write for portfolio managers who read 30 research notes before lunch."""


async def _run_structure_update(
    ticker: str,
    research: dict,
    gathered: dict,
) -> dict:
    """Run Gemini Flash to update structural sections (identity, discriminators, gaps, etc.)."""
    price_data = gathered.get("price_data", {})
    computed = gathered.get("computed", {})
    indicators = computed.get("technical_numbers", {})

    # Build hypothesis summary for alignment table context
    hypotheses_summary = []
    for h in research.get("hypotheses", []):
        hypotheses_summary.append({
            "tier": h.get("tier"),
            "title": h.get("title"),
            "score": h.get("score"),
            "direction": h.get("direction", ""),
            "description": h.get("description", "")[:200],
        })

    # Build evidence cards summary
    evidence_cards = []
    for card in research.get("evidence", {}).get("cards", []):
        evidence_cards.append({
            "number": card.get("number"),
            "title": card.get("title"),
            "finding": card.get("finding", "")[:300],
        })

    # Build current identity/discriminators/gaps for context
    current_identity = research.get("identity", {})
    current_discriminators = research.get("discriminators", {})
    current_gaps = research.get("gaps", {})

    user_prompt = f"""## Stock: {ticker} ({research.get('company', '')})
## Current Price: A${price_data.get('price', 'N/A')} ({price_data.get('change_pct', 0):+.1f}%)
## 52-Week Range: A${price_data.get('low_52w', 'N/A')} - A${price_data.get('high_52w', 'N/A')}
## Market Cap: {price_data.get('market_cap', 'N/A')}

## Technical Indicators:
MA50: {indicators.get('ma50', 'N/A')}
MA200: {indicators.get('ma200', 'N/A')}
RSI(14): {indicators.get('rsi14', 'N/A')}
Price vs MA50: {indicators.get('price_vs_ma50_pct', 'N/A')}%
Price vs MA200: {indicators.get('price_vs_ma200_pct', 'N/A')}%
Volume Ratio (vs 20d avg): {indicators.get('volume_ratio', 'N/A')}
Drawdown from 52w High: {indicators.get('drawdown_pct', 'N/A')}%
Range Position: {indicators.get('range_position', 'N/A')}

## Current Hypotheses:
{json.dumps(hypotheses_summary, indent=2)}

## Current Evidence Cards:
{json.dumps(evidence_cards, indent=2)}

## Current Identity Section:
{json.dumps(current_identity, indent=2) if current_identity else 'Not yet populated.'}

## Current Discriminators:
{json.dumps(current_discriminators, indent=2) if current_discriminators else 'Not yet populated.'}

## Current Gaps:
{json.dumps(current_gaps, indent=2) if current_gaps else 'Not yet populated.'}

## Recent ASX Announcements:
{json.dumps(gathered.get('announcements', [])[:8], indent=2)}

## Recent News:
{json.dumps(gathered.get('news', [])[:6], indent=2)}

Please produce the updated structural sections as JSON."""

    try:
        result = gemini_completion(
            system_prompt=STRUCTURE_UPDATE_SYSTEM,
            user_prompt=user_prompt,
            json_mode=True,
            max_tokens=6144,
            temperature=0.2,
        )
        return result if isinstance(result, dict) else {}
    except Exception as e:
        logger.error(f"[{ticker}] Structure update failed: {e}")
        return {}


# ---------------------------------------------------------------------------
# Stage 3: Hypothesis synthesis (Claude)
# ---------------------------------------------------------------------------

async def _run_hypothesis_synthesis(
    ticker: str,
    research: dict,
    evidence_update: dict,
    gathered: dict,
) -> dict:
    """Run Claude hypothesis re-weighting and full narrative rewrite."""
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

    # Extract existing narrative sections for context
    hero = research.get("hero", {})
    narrative = research.get("narrative", {})
    skew = research.get("skew", {})

    # Extract tripwires for temporal resolution
    tripwires_summary = []
    for i, tw in enumerate(research.get("tripwires", {}).get("cards", [])):
        tripwires_summary.append({
            "index": i,
            "date": tw.get("date", ""),
            "name": tw.get("name", ""),
            "conditions_count": len(tw.get("conditions", [])),
            "first_condition": tw.get("conditions", [{}])[0].get("if", "") if tw.get("conditions") else "",
        })

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    user_prompt = f"""## TODAY'S DATE: {today}

## Stock: {ticker} ({research.get('company', '')})
## Current Price: A${price_data.get('price', 'N/A')} ({price_data.get('change_pct', 0):+.1f}%)
## 52-Week Range: A${price_data.get('low_52w', 'N/A')} - A${price_data.get('high_52w', 'N/A')}

## Current Hypothesis Weights:
{json.dumps(hypotheses_summary, indent=2)}

## Current Verdict:
{research.get('verdict', {}).get('text', 'N/A')[:500]}

## Current Embedded Thesis (hero.embedded_thesis):
{hero.get('embedded_thesis', 'N/A')[:500]}

## Current Skew Description:
{hero.get('skew_description', 'N/A')[:300]}

## Current Narrative (theNarrative):
{narrative.get('theNarrative', 'N/A')[:800]}

## Current Price Implication:
{narrative.get('priceImplication', {}).get('content', 'N/A')[:500] if isinstance(narrative.get('priceImplication'), dict) else 'N/A'}

## Current Evidence Check:
{narrative.get('evidenceCheck', 'N/A')[:400]}

## Current Narrative Stability:
{narrative.get('narrativeStability', 'N/A')[:400]}

## Current Next Decision Point:
{json.dumps(hero.get('next_decision_point', {}), indent=2)}

## Evidence Update Summary:
{evidence_changes}

## Material Evidence Changes:
{json.dumps(material_changes, indent=2) if material_changes else 'No material changes.'}

## Recent ASX Announcements:
{json.dumps(gathered.get('announcements', [])[:5], indent=2)}

## Recent News:
{json.dumps(gathered.get('news', [])[:5], indent=2)}

## Recent Earnings/Results News:
{json.dumps(gathered.get('earnings_news', [])[:5], indent=2)}

## Current Tripwires (catalysts being watched):
{json.dumps(tripwires_summary, indent=2)}

IMPORTANT: Any event with a date BEFORE {today} has ALREADY HAPPENED. Rewrite all narrative \
sections to reflect this. Do not describe past events as upcoming. For each tripwire with a date \
before today, set status to "resolved" in tripwire_updates.

Please provide the FULL updated JSON with all narrative rewrites and tripwire updates."""

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
            max_tokens=6144,
            temperature=0,
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
    structure_update: dict | None = None,
    price_driver_result: dict | None = None,
    gold_result: dict | None = None,
) -> dict:
    """Merge all track outputs into a copy of the research JSON."""
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

    # -- Computed technical indicators (Track 1, no LLM) --
    computed = gathered.get("computed", {})
    if computed:
        if "hero" not in updated:
            updated["hero"] = {}
        updated["hero"]["position_in_range"] = computed.get("position_in_range", 0.5)

        updated["three_layer_signal"] = computed.get("three_layer_signal", {})

        if "technicalAnalysis" not in updated:
            updated["technicalAnalysis"] = {}
        updated["technicalAnalysis"]["indicators"] = computed.get("technical_numbers", {})

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
                if hu.get("updated_description"):
                    h["description"] = hu["updated_description"]
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
                # Update per-hypothesis supporting/contradicting evidence
                if hu.get("supporting"):
                    h["supporting"] = hu["supporting"]
                if hu.get("contradicting"):
                    h["contradicting"] = hu["contradicting"]
                break

    # -- Summary paragraph (Track 2 expansion) --
    if hypothesis_update.get("summary_paragraph"):
        if "verdict" in updated and isinstance(updated["verdict"], dict):
            updated["verdict"]["summary"] = hypothesis_update["summary_paragraph"]

    # -- Hero section rewrites --
    if "hero" in updated:
        if hypothesis_update.get("embedded_thesis"):
            updated["hero"]["embedded_thesis"] = hypothesis_update["embedded_thesis"]
        if hypothesis_update.get("skew_description"):
            updated["hero"]["skew_description"] = hypothesis_update["skew_description"]
        # Update next decision point (must be a FUTURE event)
        ndp = hypothesis_update.get("next_decision_point")
        if ndp and isinstance(ndp, dict) and ndp.get("event"):
            updated["hero"]["next_decision_point"] = {
                "event": ndp["event"],
                "date": ndp.get("date", "TBC"),
                "metric": ndp.get("metric", ""),
                "thresholds": ndp.get("thresholds", ""),
            }

    # -- Full narrative rewrite --
    if "narrative" in updated and isinstance(updated["narrative"], dict):
        if hypothesis_update.get("narrative_rewrite"):
            updated["narrative"]["theNarrative"] = (
                f"<strong>[Updated {now}]</strong> "
                f"{hypothesis_update['narrative_rewrite']}"
            )
        elif hypothesis_update.get("narrative_update"):
            # Fallback: prepend short update if full rewrite not provided
            existing_narrative = updated["narrative"].get("theNarrative", "")
            updated["narrative"]["theNarrative"] = (
                f"<strong>[Updated {now}]</strong> "
                f"{hypothesis_update['narrative_update']}<br><br>"
                f"{existing_narrative}"
            )

        if hypothesis_update.get("price_implication"):
            if isinstance(updated["narrative"].get("priceImplication"), dict):
                updated["narrative"]["priceImplication"]["content"] = (
                    hypothesis_update["price_implication"]
                )
                # Update the label to reference current price
                price_str = price_data.get("price")
                if price_str:
                    updated["narrative"]["priceImplication"]["label"] = (
                        f"Embedded Assumptions at A${float(price_str):.2f}"
                    )

        if hypothesis_update.get("evidence_check"):
            updated["narrative"]["evidenceCheck"] = hypothesis_update["evidence_check"]

        if hypothesis_update.get("narrative_stability"):
            updated["narrative"]["narrativeStability"] = (
                hypothesis_update["narrative_stability"]
            )

    # -- Verdict update --
    if hypothesis_update.get("verdict_update"):
        if "verdict" in updated and isinstance(updated["verdict"], dict):
            updated["verdict"]["text"] = hypothesis_update["verdict_update"]

    # -- Tripwire updates --
    tripwire_updates = hypothesis_update.get("tripwire_updates", [])
    if tripwire_updates and "tripwires" in updated:
        cards = updated["tripwires"].get("cards", [])
        for tu in tripwire_updates:
            idx = tu.get("index")
            if idx is None or not (0 <= idx < len(cards)):
                continue
            status = tu.get("status", "")
            if status == "resolved" and tu.get("resolution"):
                # Mark card as resolved with outcome
                if "RESOLVED" not in cards[idx].get("name", ""):
                    cards[idx]["name"] = cards[idx]["name"] + " \u2014 RESOLVED"
                cards[idx]["conditions"].append({
                    "if": "OUTCOME",
                    "valence": "resolved",
                    "then": tu["resolution"],
                })
            elif status == "updated" and tu.get("new_date"):
                cards[idx]["date"] = tu["new_date"]

    # -- New tripwire (replace oldest resolved card if at max 4) --
    new_tw = hypothesis_update.get("new_tripwire")
    if new_tw and isinstance(new_tw, dict) and new_tw.get("name"):
        cards = updated.get("tripwires", {}).get("cards", [])
        # Validate it has required fields
        if new_tw.get("date") and new_tw.get("conditions"):
            if len(cards) >= 4:
                # Replace first resolved card
                replaced = False
                for i, c in enumerate(cards):
                    if "\u2014 RESOLVED" in c.get("name", ""):
                        cards[i] = new_tw
                        replaced = True
                        break
                if not replaced:
                    # All cards still pending — append anyway (will have 5)
                    cards.append(new_tw)
            else:
                cards.append(new_tw)

    # -- Track 3: Structure update (Gemini Flash) --
    if structure_update:
        # Evidence intro
        if structure_update.get("evidence_intro"):
            if "evidence" not in updated:
                updated["evidence"] = {}
            updated["evidence"]["intro"] = structure_update["evidence_intro"]

        # Alignment summary
        if structure_update.get("alignment_summary"):
            if "evidence" not in updated:
                updated["evidence"] = {}
            updated["evidence"]["alignmentSummary"] = structure_update["alignment_summary"]

        # Discriminators
        if structure_update.get("discriminators"):
            updated["discriminators"] = structure_update["discriminators"]

        # Gaps
        if structure_update.get("gaps"):
            updated["gaps"] = structure_update["gaps"]

        # Identity
        if structure_update.get("identity"):
            updated["identity"] = structure_update["identity"]

        # Technical commentary
        if structure_update.get("technical_commentary"):
            if "technicalAnalysis" not in updated:
                updated["technicalAnalysis"] = {}
            updated["technicalAnalysis"]["commentary"] = structure_update["technical_commentary"]

    # -- Track 4: Price Drivers --
    if price_driver_result:
        updated["priceDrivers"] = price_driver_result

    # -- Track 5: Gold Overlay (gold stocks only) --
    if gold_result:
        updated["goldAnalysis"] = gold_result

    # -- Timestamp --
    updated["date"] = now
    updated["_lastRefreshed"] = datetime.now(timezone.utc).isoformat()

    return updated
