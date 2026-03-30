"""
Refresh orchestrator for per-stock data updates.

Five-track pipeline (Tracks 2-5 run in parallel after Stage 1):
  1. Data Gathering        — Yahoo Finance, ASX announcements, news search
  2. Evidence + Synthesis  — Gemini evidence update then Claude hypothesis synthesis (sequential)
  3. Structure Update      — Gemini Flash refreshes evidence intro, discriminators, gaps, identity, TA commentary
  4. Price Drivers         — Dedicated price driver analysis
  5. Gold Overlay          — Gold-sector analysis (only for gold stocks)
  Final: Write Results     — Merge all track outputs into research JSON, update index

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
from zoneinfo import ZoneInfo
from pathlib import Path
from typing import Any

import config
import re

import llm


def _build_generation_meta(gathered: dict | None) -> dict:
    """Capture macro driver snapshot at narrative generation time.

    Stored as research["_generation_meta"] so the frontend can compare
    current macro values against the conditions when the narrative was written.
    Used by the staleness badge (BEAD-005) and regime detector (BEAD-004).
    """
    meta: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "drivers": {},
    }
    if not gathered:
        return meta

    macro_ctx = gathered.get("macro_context")
    if not macro_ctx:
        return meta

    for cp in macro_ctx.get("commodity_prices", []):
        price = cp.get("price")
        if price is None:
            continue
        key = cp.get("name", cp.get("ticker", "unknown"))
        key = key.lower().replace(" ", "_")
        meta["drivers"][key] = {
            "value": price,
            "change_pct": cp.get("change_pct"),
            "ticker": cp.get("ticker", ""),
        }

    return meta


def _build_regime_section(gathered: dict | None) -> str:
    """Build a regime break context block for LLM prompt injection.

    If gathered["regime_context"] exists (set by the regime refresh endpoint),
    returns a formatted section alerting the LLM to a material macro shift.
    Otherwise returns empty string (no change to existing prompt flow).
    """
    if not gathered:
        return ""
    rc = gathered.get("regime_context")
    if not rc:
        return ""

    parts = [
        "\n## REGIME BREAK ALERT",
        "A material macro regime change has been detected since the last analysis:",
        f"- Variable: {rc.get('variable', 'unknown')}",
        f"- Previous (30d mean): {rc.get('baseline', 'N/A')}",
        f"- Current: {rc.get('current', 'N/A')}",
    ]
    change_pct = rc.get("change_pct")
    sigma = rc.get("sigma")
    if change_pct is not None and sigma is not None:
        parts.append(f"- Move: {change_pct:+.1f}% ({sigma:.1f} sigma)")
    elif change_pct is not None:
        parts.append(f"- Move: {change_pct:+.1f}%")

    parts.append(
        "\nCRITICAL: Your hypothesis reweighting and narrative MUST explicitly address "
        "this regime change. Do not treat this as incremental drift -- it is a structural "
        "shift in the operating environment."
    )
    return "\n".join(parts)


from gemini_client import gemini_completion
from validate_research import fix as validate_fix, validate as validate_check
from web_search import gather_all_data
from price_drivers import run_price_driver_analysis
from gold_agent import run_gold_analysis
from github_commit import commit_files_to_github
import notebook_context

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Narrative timestamp stripping
# ---------------------------------------------------------------------------
_TIMESTAMP_RE = re.compile(
    r"<strong>\s*\[(Updated|Coverage Initiated)\s+[^]]*\]\s*</strong>\s*"
)


def _strip_narrative_timestamps(text: str) -> str:
    """Remove [Updated ...] / [Coverage Initiated ...] prefixes from narrative text."""
    if not text:
        return text
    return _TIMESTAMP_RE.sub("", text).strip()


# ---------------------------------------------------------------------------
# Scaffold detection
# ---------------------------------------------------------------------------

def _is_scaffold(research: dict) -> bool:
    """Detect if the research JSON is a scaffold (no real content yet)."""
    # Check evidence cards are empty
    cards = research.get("evidence", {}).get("cards", [])
    if len(cards) == 0:
        return True
    # Check if all hypothesis scores are "?"
    hypotheses = research.get("hypotheses", [])
    if hypotheses and all(h.get("score") == "?" for h in hypotheses):
        return True
    return False


def _has_real_evidence(research: dict) -> bool:
    """Check if evidence cards have real content (not just scaffolds)."""
    cards = research.get("evidence", {}).get("cards", [])
    if len(cards) < 10:
        return False
    # If any card has a finding longer than 100 chars, it's real content
    return any(len(c.get("finding", "")) > 100 for c in cards)

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
    stage_errors: list = field(default_factory=list)

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
            "stage_errors": self.stage_errors,
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
_batch_semaphore_loop: asyncio.AbstractEventLoop | None = None
_gather_semaphore: asyncio.Semaphore | None = None
_gather_semaphore_loop: asyncio.AbstractEventLoop | None = None


def _get_batch_semaphore() -> asyncio.Semaphore:
    global _batch_semaphore, _batch_semaphore_loop
    loop = asyncio.get_running_loop()
    if _batch_semaphore is None or _batch_semaphore_loop is not loop:
        _batch_semaphore = asyncio.Semaphore(2)
        _batch_semaphore_loop = loop
    return _batch_semaphore


def _get_gather_semaphore() -> asyncio.Semaphore:
    """Limit concurrent data-gathering to avoid OOM on Railway."""
    global _gather_semaphore, _gather_semaphore_loop
    loop = asyncio.get_running_loop()
    if _gather_semaphore is None or _gather_semaphore_loop is not loop:
        _gather_semaphore = asyncio.Semaphore(3)
        _gather_semaphore_loop = loop
    return _gather_semaphore


_evidence_semaphore: asyncio.Semaphore | None = None
_evidence_semaphore_loop: asyncio.AbstractEventLoop | None = None


def _get_evidence_semaphore() -> asyncio.Semaphore:
    """Limit concurrent structure update calls (Gemini Flash)."""
    global _evidence_semaphore, _evidence_semaphore_loop
    loop = asyncio.get_running_loop()
    if _evidence_semaphore is None or _evidence_semaphore_loop is not loop:
        _evidence_semaphore = asyncio.Semaphore(3)
        _evidence_semaphore_loop = loop
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


_JOB_TTL_SECONDS = 3600  # 1 hour


def _evict_stale_jobs() -> None:
    """Remove completed/failed jobs older than TTL to prevent memory leaks."""
    now = time.time()
    stale_tickers = [
        t
        for t, j in refresh_jobs.items()
        if j.status in ("completed", "failed")
        and j.completed_at
        and now - j.completed_at > _JOB_TTL_SECONDS
    ]
    for t in stale_tickers:
        del refresh_jobs[t]
    stale_batches = [
        bid
        for bid, j in batch_jobs.items()
        if j.status in ("completed", "failed", "partially_failed")
        and j.completed_at
        and now - j.completed_at > _JOB_TTL_SECONDS
    ]
    for bid in stale_batches:
        del batch_jobs[bid]
    if stale_tickers or stale_batches:
        logger.info(
            f"Evicted {len(stale_tickers)} stale ticker jobs, "
            f"{len(stale_batches)} stale batch jobs"
        )


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
        scaffold_mode = _is_scaffold(research)

        if scaffold_mode:
            logger.info(f"[BATCH][{ticker}] COVERAGE INITIATION — scaffold detected")

        # ---- Stage 1: Data Gathering (gather semaphore limits concurrency) ----
        async with gather_sem:
            job.status = "gathering_data"
            job.stage_index = 1
            batch_job.per_ticker_status[ticker] = job.to_dict()
            logger.info(f"[BATCH][{ticker}] Stage 1: Gathering data...")

            gathered = await gather_all_data(
                ticker, company_name,
                sector=research.get("sector"),
                sector_sub=research.get("sectorSub"),
            )

        # ---- Stages 2-3: Acquire semaphore for LLM-heavy work ----
        async def _batch_evidence_and_synthesis():
            """Track 2: evidence then synthesis, under batch semaphore."""
            async with semaphore:
                # Stage 2: Evidence
                job.status = "specialist_analysis"
                job.stage_index = 2
                batch_job.per_ticker_status[ticker] = job.to_dict()
                if scaffold_mode and not _has_real_evidence(research):
                    logger.info(f"[BATCH][{ticker}] Stage 2: Creating evidence cards...")
                    ev = await _run_evidence_creation(
                        ticker, research, gathered
                    )
                elif scaffold_mode and _has_real_evidence(research):
                    logger.info(f"[BATCH][{ticker}] Stage 2: Evidence already exists, skipping")
                    ev = {"cards": research.get("evidence", {}).get("cards", [])}
                else:
                    logger.info(f"[BATCH][{ticker}] Stage 2: Specialist analysis...")
                    ev = await _run_evidence_specialists(
                        ticker, research, gathered
                    )

                # Stage 3: Hypothesis / Coverage Initiation
                job.status = "hypothesis_synthesis"
                job.stage_index = 3
                batch_job.per_ticker_status[ticker] = job.to_dict()
                if scaffold_mode:
                    logger.info(f"[BATCH][{ticker}] Stage 3: Full coverage initiation...")
                    hyp = await _run_coverage_initiation(
                        ticker, research, ev, gathered
                    )
                else:
                    logger.info(f"[BATCH][{ticker}] Stage 3: Hypothesis synthesis...")
                    hyp = await _run_hypothesis_synthesis(
                        ticker, research, ev, gathered
                    )
            return ev, hyp

        async def _batch_price_drivers():
            """Track 4: price drivers (parallel with evidence track)."""
            try:
                return await run_price_driver_analysis(
                    ticker, research.get("company", ticker),
                    sector=research.get("sector"),
                )
            except Exception as e:
                logger.warning(f"[BATCH][{ticker}] Track 4 price drivers failed (non-fatal): {e}")
                return None

        async def _batch_gold_overlay():
            """Track 5: gold overlay (parallel, only for gold stocks)."""
            sector_sub = (research.get("sectorSub") or "").lower()
            if "gold" not in sector_sub:
                return None
            try:
                return await run_gold_analysis(ticker)
            except Exception as e:
                logger.warning(f"[BATCH][{ticker}] Track 5 gold overlay failed (non-fatal): {e}")
                if hasattr(job, "stage_errors"):
                    job.stage_errors.append(f"Track 5 (gold): {e}")
                return None

        async def _batch_notebook_corpus():
            """Track 6: NotebookLM corpus context (parallel)."""
            try:
                corpus = await notebook_context.query_notebook_batch(ticker)
                if corpus:
                    gathered["notebook_corpus"] = corpus
                    logger.info(f"[BATCH][{ticker}] Track 6: NotebookLM corpus retrieved ({len([v for v in corpus.values() if v])} dimensions)")
            except Exception as e:
                logger.warning(f"[BATCH][{ticker}] Track 6 notebook corpus failed (non-fatal): {e}")

        # Run all tracks in parallel
        (ev_hyp_result, structure_result, pd_result, gold_result, _nlm_result) = (
            await asyncio.gather(
                _batch_evidence_and_synthesis(),
                _run_structure_update(ticker, research, gathered),
                _batch_price_drivers(),
                _batch_gold_overlay(),
                _batch_notebook_corpus(),
                return_exceptions=True,
            )
        )

        # Unpack Track 2 or propagate failure
        if isinstance(ev_hyp_result, Exception):
            raise ev_hyp_result
        evidence_update, hypothesis_update = ev_hyp_result

        # Non-critical track exceptions
        if isinstance(structure_result, Exception):
            structure_result = None
        if isinstance(pd_result, Exception):
            pd_result = None
        if isinstance(gold_result, Exception):
            gold_result = None
        if isinstance(_nlm_result, Exception):
            logger.warning(f"[BATCH][{ticker}] Track 6 notebook corpus exception (non-fatal): {_nlm_result}")

        # ---- Stage 4: Write Results (no semaphore) ----
        job.status = "writing_results"
        job.stage_index = 4
        batch_job.per_ticker_status[ticker] = job.to_dict()
        logger.info(f"[BATCH][{ticker}] Stage 4: Writing results...")

        if scaffold_mode:
            updated_research = _merge_initiation(
                research, gathered, evidence_update, hypothesis_update,
                structure_update=structure_result,
                price_driver_result=pd_result,
                gold_result=gold_result,
            )
        else:
            updated_research = _merge_updates(
                research, gathered, evidence_update, hypothesis_update,
                structure_update=structure_result,
                price_driver_result=pd_result,
                gold_result=gold_result,
            )

        # Generate technical analysis if missing
        price_data = gathered.get("price_data", {})
        if "error" not in price_data:
            ta = _generate_technical_analysis(ticker, price_data, research.get("priceHistory", []))
            if ta:
                updated_research["technicalAnalysis"] = ta

        _save_research(ticker, updated_research)
        _update_index(ticker, updated_research)

        # Persist to GitHub so data survives Railway redeploys
        await _commit_refresh_to_github(ticker)

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
    _evict_stale_jobs()
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
    """Get the data/research directory (project root)."""
    return Path(config.PROJECT_ROOT) / "data" / "research"


def _live_data_dir() -> Path:
    """Get the data/research directory served by /data/ endpoint (project root)."""
    return Path(config.PROJECT_ROOT) / "data" / "research"


def _load_research(ticker: str) -> dict:
    """Load existing research JSON for a ticker.

    Prefers the live data directory (served by /data/ endpoint) over
    the dist build directory to ensure we read what the frontend sees.
    """
    live_path = _live_data_dir() / f"{ticker}.json"
    if live_path.exists():
        with open(live_path) as f:
            return json.load(f)
    # Fallback to dist path (e.g. during build or if live dir is missing)
    dist_path = _data_dir() / f"{ticker}.json"
    if dist_path.exists():
        with open(dist_path) as f:
            return json.load(f)
    raise FileNotFoundError(f"No research file for {ticker}")


def _validate_research_structure(data: dict, ticker: str) -> tuple[bool, str | None]:
    """Validate research JSON has required structure before writing.

    Returns (is_valid, error_message). Rejects empty data, missing
    required keys, and empty hypothesis lists. This gate prevents
    malformed refresh output from overwriting good research files.
    """
    if not data:
        return False, f"{ticker}: empty data"

    required_keys = ["hypotheses", "evidence", "narrative", "skew"]
    missing = [k for k in required_keys if k not in data]
    if missing:
        return False, f"{ticker}: missing required keys: {missing}"

    hyps = data.get("hypotheses")
    if not isinstance(hyps, list) or len(hyps) == 0:
        return False, f"{ticker}: hypotheses must be a non-empty list"

    evidence = data.get("evidence")
    if isinstance(evidence, dict):
        cards = evidence.get("cards", [])
        if not isinstance(cards, list) or len(cards) == 0:
            return False, f"{ticker}: evidence.cards must be a non-empty list"

    return True, None


def _save_research(ticker: str, data: dict) -> None:
    """Save updated research JSON to both live data dir and dist dir.

    The /data/ endpoint serves from PROJECT_ROOT/data/ (live dir),
    while the catch-all frontend route serves from dist/. Both must
    be updated so the refresh result is immediately visible.

    VALIDATION GATE: rejects structurally invalid data to prevent
    blank research pages from malformed refresh output.
    """
    # Structural validation gate: reject before writing
    is_valid, error = _validate_research_structure(data, ticker)
    if not is_valid:
        logger.error(f"Research refresh REJECTED: {error}")
        raise ValueError(f"Research validation failed: {error}")

    # Auto-fix common data quality issues before persisting
    data = validate_fix(data)
    errors = validate_check(data)
    if errors:
        logger.warning(f"[{ticker}] Validation warnings after fix: {errors}")

    content = json.dumps(data, indent=2, ensure_ascii=False)

    # Write to live data dir (served by /data/ endpoint)
    live_path = _live_data_dir() / f"{ticker}.json"
    if live_path.parent.exists():
        with open(live_path, "w") as f:
            f.write(content)
        logger.info(f"Saved research for {ticker} to live data dir")

    # Write to dist dir (served by catch-all frontend route)
    dist_path = _data_dir() / f"{ticker}.json"
    if dist_path.parent.exists():
        with open(dist_path, "w") as f:
            f.write(content)
        logger.info(f"Saved research for {ticker} to dist dir")


def _update_index(ticker: str, data: dict) -> None:
    """Update the _index.json summary entry for this ticker."""

    def _apply_update(index_path: Path) -> None:
        if not index_path.exists():
            return
        with open(index_path) as f:
            index = json.load(f)

        if isinstance(index, list):
            for i, entry in enumerate(index):
                if entry.get("ticker", "").upper() == ticker:
                    index[i]["price"] = data.get("price", entry.get("price"))
                    index[i]["date"] = data.get("date", entry.get("date"))
                    if "verdict" in data and isinstance(data["verdict"], dict):
                        index[i]["verdict"] = data["verdict"].get("text", entry.get("verdict", ""))
                    break
        elif isinstance(index, dict):
            # Extract the same fields sync-index.js uses for home page cards
            _INDEX_FIELDS = [
                "ticker", "tickerFull", "exchange", "company", "sector", "sectorSub",
                "price", "currency", "date", "reportId", "priceHistory",
                "heroDescription", "heroCompanyDescription", "heroMetrics",
                "skew", "verdict", "featuredMetrics", "featuredPriceColor", "featuredRationale",
                "hypotheses", "identity", "footer", "_deepResearch",
            ]
            entry = {k: data[k] for k in _INDEX_FIELDS if k in data}
            if ticker in index:
                index[ticker].update(entry)
            else:
                index[ticker] = entry

        with open(index_path, "w") as f:
            json.dump(index, f, indent=2, ensure_ascii=False)

    try:
        _apply_update(_live_data_dir() / "_index.json")
    except Exception as e:
        logger.warning(f"Failed to update live _index.json: {e}")

    try:
        _apply_update(_data_dir() / "_index.json")
    except Exception as e:
        logger.warning(f"Failed to update dist _index.json: {e}")


async def _commit_refresh_to_github(ticker: str) -> None:
    """Commit refreshed research JSON and index to GitHub so data survives redeploys."""
    token = config.GITHUB_TOKEN
    if not token:
        logger.debug(f"[{ticker}] GITHUB_TOKEN not set, skipping commit")
        return

    files = {}
    research_path = _live_data_dir() / f"{ticker}.json"
    if research_path.exists():
        files[f"data/research/{ticker}.json"] = research_path

    index_path = _live_data_dir() / "_index.json"
    if index_path.exists():
        files["data/research/_index.json"] = index_path

    if not files:
        return

    try:
        await commit_files_to_github(
            files,
            f"Refresh {ticker}: {datetime.now(ZoneInfo('Australia/Sydney')).strftime('%d-%b-%y %H:%M AEST')}",
            token,
        )
    except Exception as e:
        logger.warning(f"[{ticker}] GitHub commit after refresh failed (non-fatal): {e}")


# ---------------------------------------------------------------------------
# Coverage initiation prompts (for scaffold → full research)
# ---------------------------------------------------------------------------

EVIDENCE_CREATION_SYSTEM = """\
You are a specialist equity research analyst initiating coverage on a new ASX-listed stock.

Given the company's sector, recent announcements, news, market data, and commodity/macro context, \
CREATE a comprehensive set of 10 evidence domain cards from scratch.

Return a JSON object with this exact structure:
{
  "cards": [
    {
      "number": 1,
      "title": "1. Corporate Communications",
      "epistemicClass": "ep-motivated",
      "epistemicLabel": "Motivated",
      "finding": "2-4 sentence finding based on available data. Be specific with numbers and dates.",
      "tension": "1-2 sentence tension or counter-narrative. What contradicts the finding?",
      "table": null,
      "tags": [{"text": "Supports N1", "class": "supports"}],
      "source": "Cited sources (ASX announcements, news, reports)"
    }
  ]
}

You MUST create exactly 10 cards with these domains:
1. Corporate Communications (ep-motivated, Motivated) - company press releases, investor presentations
2. Regulatory Filings & Financial Statements (ep-verified, Verified) - financial results, ASIC filings
3. Broker Research (ep-modeled, Modelled) - consensus estimates, broker views (infer from news)
4. Competitor Disclosures (ep-verified, Verified) - peer company announcements, market position
5. Economic Data (ep-measured, Measured) - macro indicators, commodity prices, rates
6. Alternative Data (ep-observed, Observed) - operational indicators, ESG, channel checks
7. Academic Research (ep-peer, Peer-Reviewed) - industry studies, structural trends
8. Media & Social (ep-unverified, Unverified) - financial media coverage, market commentary
9. Leadership & Governance (ep-observed, Observed) - management changes, insider trades, governance
10. Ownership & Capital Flows (ep-measured, Measured) - institutional holders, fund flows, capital structure

Tag rules for cards:
- Use "Supports N1" (class "supports") if the finding favours the growth/upside hypothesis
- Use "Supports N2" (class "supports") if the finding favours the base case
- Use "Supports N3" (class "contradicts") if the finding favours the risk/downside hypothesis
- Use "Supports N4" (class "contradicts") if the finding favours a disruption/catalyst
- Use "Ambiguous" (class "") if the evidence is mixed

Be specific. Cite real data from the provided inputs. If you lack data for a domain, state what is \
known from the available inputs and note the data limitation in the tension field.
CRITICAL FORMATTING: Do not use em-dashes (the long dash character) anywhere in your response. \
Use en-dashes, hyphens, or restructure the sentence instead. Do not use emoji characters. \
Use only ASCII text, HTML entities, and standard punctuation."""


FULL_INITIATION_SYSTEM = """\
You are a senior equity research analyst at Continuum Intelligence initiating coverage on a new \
ASX-listed stock. You use the Analysis of Competing Hypotheses (ACH) framework.

Given the company overview, sector, recent data, evidence cards, and commodity/macro context, \
create a COMPLETE research analysis from scratch. This is initial coverage; there is no existing \
analysis to update.

Return a JSON object with ALL of the following fields:

{
  "hypotheses": [
    {
      "tier": "n1",
      "title": "N1: [Bullish/Growth/Recovery Scenario Title]",
      "direction": "upside",
      "updated_score": "XX%",
      "updated_description": "2-3 sentence description of this bullish scenario. What needs to happen for this to play out?",
      "supporting": ["Evidence point 1 supporting this hypothesis", "Evidence point 2"],
      "contradicting": ["Evidence point against this hypothesis"]
    },
    {
      "tier": "n2",
      "title": "N2: [Base Case/Status Quo Title]",
      "direction": "neutral",
      "updated_score": "XX%",
      "updated_description": "2-3 sentence base case scenario.",
      "supporting": ["Supporting evidence"],
      "contradicting": ["Contradicting evidence"]
    },
    {
      "tier": "n3",
      "title": "N3: [Bear Case/Risk/Downside Title]",
      "direction": "downside",
      "updated_score": "XX%",
      "updated_description": "2-3 sentence bear case.",
      "supporting": ["Supporting evidence"],
      "contradicting": ["Contradicting evidence"]
    },
    {
      "tier": "n4",
      "title": "N4: [Disruption/Catalyst/Tail Scenario Title]",
      "direction": "upside or downside",
      "updated_score": "XX%",
      "updated_description": "2-3 sentence tail risk or catalyst scenario.",
      "supporting": ["Supporting evidence"],
      "contradicting": ["Contradicting evidence"]
    }
  ],

  "company_description": "4-6 sentence company overview using HTML. Describe what the company does, \
its market position, key assets, and why it matters. Use <strong> for company name and key facts. \
End with 'ASX: [TICKER]' reference.",

  "skew": {
    "direction": "bullish or bearish or neutral",
    "rationale": "2-3 sentence explanation of the probability skew and what drives it."
  },

  "embedded_thesis": "3-5 sentence paragraph describing what the current price embeds. \
Reference the CURRENT price. The financial data section above provides BOTH a Forward P/E and a \
Trailing P/E -- these are different numbers. Use them correctly: the Forward P/E reflects \
consensus earnings estimates, the Trailing P/E reflects reported historical earnings. If the \
Forward P/E is significantly lower than the Trailing P/E, the market expects an earnings \
recovery. Do NOT confuse or swap these two values. Plain text, no HTML.",

  "skew_description": "2-3 sentence summary of the hypothesis weightings and directional skew.",

  "position_in_range": {
    "current_price": 42.50,
    "worlds": [
      {"label": "Bear Case", "price": 35.00},
      {"label": "Base Case", "price": 42.00},
      {"label": "Bull Case", "price": 55.00},
      {"label": "Catalyst", "price": 65.00}
    ],
    "note": "World prices are indicative -- pending full W1-W4 valuation build"
  },

  "narrative_rewrite": "Full dominant narrative (6-10 sentences). Use HTML: <strong> for emphasis, \
<span class='key-stat'> for key numbers. Describe what is driving the stock right now, \
key catalysts, risks, and what the evidence says. Do NOT include any [Updated ...] or \
[Coverage Initiated ...] timestamp prefixes -- timestamps are added automatically.",

  "price_implication": "HTML bullet-format content describing what the current price assumes. \
Use <br> separators between bullets.",

  "evidence_check": "HTML paragraph (3-5 sentences) assessing how strong the evidence base is. \
What domains have good data? Where are the gaps? How consistent is the evidence?",

  "narrative_stability": "HTML paragraph (3-5 sentences) evaluating how robust the current narrative \
is. What could destabilise it? What is the next test?",

  "verdict_update": "Updated verdict text (4-6 sentences). What is the market pricing? Is that right? \
Where is the skew? Reference current price and key data points. Use <span class='key-stat'> for numbers.",

  "next_decision_point": {
    "event": "The next material upcoming catalyst",
    "date": "Expected date (YYYY-MM-DD or descriptive like 'August 2026')",
    "metric": "What to watch for",
    "thresholds": "Specific levels or outcomes that would shift the thesis"
  },

  "key_catalyst": "The single most important upcoming catalyst",

  "tripwires": [
    {
      "date": "MONTH YEAR",
      "name": "Short catalyst name",
      "conditions": [
        {"if": "If [positive scenario]", "valence": "positive", "then": "Then [positive implication]"},
        {"if": "If [negative scenario]", "valence": "negative", "then": "Then [negative implication]"}
      ],
      "source": "Source citation"
    }
  ],

  "discriminators": [
    {
      "diagnosticity": "HIGH",
      "diagnosticityClass": "disc-high",
      "evidence": "Description of the high-diagnostic data point",
      "discriminatesBetween": "N1 vs N3 (or whichever hypotheses)",
      "currentReading": "Current status/level",
      "readingClass": "td-amber or td-green or td-red"
    }
  ],

  "gaps": {
    "coverageRows": [
      {
        "domain": "Corporate Comms",
        "coverageLevel": "full or good or limited",
        "coverageLabel": "Full or Good or Limited",
        "freshness": "Date or period of latest data",
        "confidence": "High/Medium/Low with qualifier",
        "confidenceClass": ""
      }
    ],
    "couldntAssess": ["List of domains or data we could not assess"],
    "analyticalLimitations": "Paragraph describing inherent limitations of the analysis."
  },

  "non_discriminating": "HTML bullet list of metrics that appear important but don't actually \
discriminate between the competing hypotheses."
}

CRITICAL RULES:
- The four hypothesis scores MUST sum to exactly 100%.
- Use integer percentages (e.g., "35%", not "34.7%").
- N2 (base case) should typically carry the highest weight for a new coverage initiation.
- Tripwires must reference FUTURE events only.
- Be specific with numbers, dates, and citations from the provided data.
- If data is limited, say so explicitly rather than fabricating.
- Create 3 discriminator rows and at least 2 tripwire cards.
- Gaps should cover all 10 evidence domains.
- Reference the current price throughout.
- CRITICAL: Do not use emoji characters anywhere in your response. Do not use em-dashes (the long dash character) anywhere. Use en-dashes, hyphens, or restructure the sentence instead. Use only ASCII text, HTML entities, and standard punctuation.
- position_in_range.worlds prices MUST be plain numbers (e.g. 35.00), NOT dollar-sign strings.
- position_in_range.worlds labels must be descriptive (e.g. "Bear Case", "Bull Case"), NOT "N1 Bull" or "N2 Base".
- Each gap coverageRow must have confidenceClass set to one of: "td-green", "td-amber", "td-red".
- Return the response as a single JSON object with no markdown fences."""


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
Be specific. Cite dates, numbers, and sources from the provided data.

You may also receive commodity prices and sector-relevant macro headlines. Use these to assess \
how external market conditions affect the company's evidence cards, particularly the Economic \
Data domain. For example, commodity price moves are material for miners and energy producers, \
interest rate expectations matter for banks and REITs, and FX moves affect offshore earners.

CRITICAL FORMATTING: Do not use em-dashes (the long dash character) anywhere in your response. \
Use en-dashes, hyphens, or restructure the sentence instead. Do not use emoji characters. \
Use only ASCII text, HTML entities, and standard punctuation."""

REQUIRED_REFRESH_FIELDS = [
    "hypotheses", "embedded_thesis", "skew_description",
    "narrative_rewrite", "price_implication", "evidence_check",
    "narrative_stability", "verdict_update", "next_decision_point",
    "position_in_range", "company_description",
]


def _validate_synthesis_response(result: dict, ticker: str) -> tuple[bool, list[str]]:
    """Check that the LLM returned all required fields. Returns (is_complete, missing_fields)."""
    missing = [f for f in REQUIRED_REFRESH_FIELDS if not result.get(f)]
    if missing:
        logger.warning(f"[{ticker}] Synthesis response missing {len(missing)} fields: {missing}")
    return len(missing) == 0, missing


HYPOTHESIS_UPDATE_SYSTEM = """\
You are a senior equity research analyst at Continuum Intelligence. You assess competing \
hypotheses for ASX-listed companies using structured evidence.

Given the current hypothesis weights, updated evidence cards, new market data, and the \
existing narrative sections, perform a FULL research update. You must rewrite all narrative \
content to reflect current reality. Do not leave stale references to past events as if \
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
      "updated_description": "Updated 2-3 sentence description of this hypothesis scenario"
    }
  ],
  "embedded_thesis": "Rewritten 3-5 sentence paragraph describing what the current price embeds. \
Reference the CURRENT price (provided), not old prices. The financial data section below provides \
BOTH a Forward P/E and a Trailing P/E -- these are different numbers. Use them correctly: the \
Forward P/E reflects consensus earnings estimates, the Trailing P/E reflects reported historical \
earnings. Do NOT confuse or swap these two values. Describe what assumptions the market is \
making at this level. Use plain text, no HTML.",
  "skew_description": "Rewritten 2-3 sentence summary of hypothesis weightings and directional skew.",
  "narrative_rewrite": "Full rewrite of the dominant narrative (4-8 sentences). Use HTML formatting: \
<strong> for emphasis, <span class='key-stat'> for key numbers. Must reflect ALL recent events \
including any results, announcements, or catalysts from the gathered data. Do NOT reference past \
events as future events. Do NOT include any [Updated ...] or [Coverage Initiated ...] timestamp \
prefixes -- timestamps are added automatically.",
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
  },
  "position_in_range": {
    "current_price": 42.50,
    "worlds": [
      {"label": "Bear Case", "price": 35.00},
      {"label": "Base Case", "price": 42.00},
      {"label": "Bull Case", "price": 55.00},
      {"label": "Catalyst", "price": 65.00}
    ]
  },
  "company_description": "Updated 4-6 sentence company overview using HTML. Describe what the \
company does, its market position, key assets, and current state. Reference the CURRENT price. \
Use <strong> for company name and key facts. End with ASX ticker reference."
}

MACRO & COMMODITY CONTEXT:
You may receive commodity prices and sector macro headlines alongside company-specific data. \
For commodity-exposed companies (miners, energy producers), commodity price movements are MATERIAL \
to hypothesis weighting: a 10%+ move in iron ore, oil, or copper directly affects earnings and \
should shift narrative emphasis. For rate-sensitive companies (banks, REITs), interest rate \
expectations matter. For software/healthcare companies, AUD/USD affects earnings translation. \
Incorporate these external factors where relevant. If a geopolitical event (war, sanctions, supply \
disruption) is driving commodity moves, explain the causal chain in the narrative.

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
- new_tripwire MUST reference a FUTURE event (date after today). Provide the next material catalyst.
- position_in_range.worlds prices MUST be plain numbers (e.g. 35.00), NOT dollar-sign strings.
- position_in_range.worlds labels must be descriptive (e.g. "Bear Case", "Bull Case"), NOT "N1 Bull" or "N2 Base".
- position_in_range MUST reflect the current price and updated hypothesis weights. Recalculate world prices based on current evidence.
- company_description MUST reference the CURRENT price and any material recent events. Do not leave stale price references.
- You MUST return ALL fields listed in the schema above. Omitting fields causes stale content on the platform.
- CRITICAL FORMATTING: Do not use em-dashes (the long dash character) anywhere in your response. Use en-dashes, hyphens, or restructure the sentence instead. Do not use emoji characters. Use only ASCII text, HTML entities, and standard punctuation."""


# ---------------------------------------------------------------------------
# Main refresh pipeline
# ---------------------------------------------------------------------------

async def run_refresh(ticker: str, regime_context: dict | None = None) -> dict:
    """
    Execute the full 4-stage refresh pipeline for a single stock.

    Detects scaffold data automatically and switches to coverage initiation
    mode, which creates full research content from scratch instead of
    incrementally updating.

    Parameters
    ----------
    ticker : str
        ASX ticker code (uppercase).
    regime_context : dict, optional
        If provided (from regime refresh endpoint), injected into gathered data
        so LLM prompts address the macro regime shift explicitly.

    Returns
    -------
    dict
        The updated research JSON.
    """
    _evict_stale_jobs()
    ticker = ticker.upper()
    job = RefreshJob(ticker=ticker)
    refresh_jobs[ticker] = job

    try:
        # Load existing research
        research = _load_research(ticker)
        company_name = research.get("company", ticker)
        scaffold_mode = _is_scaffold(research)

        if scaffold_mode:
            logger.info(f"[{ticker}] COVERAGE INITIATION — scaffold detected, generating full research")

        # ---- Stage 1: Data Gathering ----
        job.status = "gathering_data"
        job.stage_index = 1
        logger.info(f"[{ticker}] Stage 1: Gathering data...")

        gathered = await gather_all_data(
            ticker, company_name,
            sector=research.get("sector"),
            sector_sub=research.get("sectorSub"),
        )

        # Inject regime context if this refresh was triggered by a regime break
        if regime_context:
            gathered["regime_context"] = regime_context

        # ---- Track 2: Evidence + Synthesis (sequential within track) ----
        async def _track_evidence_and_synthesis():
            """Track 2: evidence specialists then hypothesis synthesis (sequential)."""
            job.status = "specialist_analysis"
            job.stage_index = 2
            if scaffold_mode and not _has_real_evidence(research):
                logger.info(f"[{ticker}] Stage 2: Creating evidence cards from scratch (Gemini)...")
                ev = await _run_evidence_creation(
                    ticker, research, gathered
                )
            elif scaffold_mode and _has_real_evidence(research):
                logger.info(f"[{ticker}] Stage 2: Evidence cards already exist, skipping creation")
                ev = {"cards": research.get("evidence", {}).get("cards", [])}
            else:
                logger.info(f"[{ticker}] Stage 2: Specialist analysis (Gemini)...")
                ev = await _run_evidence_specialists(
                    ticker, research, gathered
                )

            # Track Stage 2 failures
            ev_cards = ev.get("cards", [])
            if not ev_cards:
                ev_summary = ev.get("summary", "no summary")
                job.stage_errors.append(f"Stage 2 (evidence): 0 cards returned. {ev_summary}")
                logger.error(f"[{ticker}] Stage 2 produced 0 evidence cards: {ev_summary}")

            job.status = "hypothesis_synthesis"
            job.stage_index = 3
            if scaffold_mode:
                logger.info(f"[{ticker}] Stage 3: Full coverage initiation (Claude)...")
                hyp = await _run_coverage_initiation(
                    ticker, research, ev, gathered
                )
            else:
                logger.info(f"[{ticker}] Stage 3: Hypothesis synthesis (Claude)...")
                hyp = await _run_hypothesis_synthesis(
                    ticker, research, ev, gathered
                )

            # Track Stage 3 failures
            hyp_list = hyp.get("hypotheses", [])
            if not hyp_list:
                narr = hyp.get("narrative_rewrite", "no narrative")
                job.stage_errors.append(f"Stage 3 (hypothesis): 0 hypotheses returned. keys={list(hyp.keys())}")
                logger.error(f"[{ticker}] Stage 3 produced 0 hypotheses: {narr[:200]}")

            return ev, hyp

        # ---- Track 4: Price drivers (parallel) ----
        async def _track_price_drivers():
            """Track 4: run price driver analysis."""
            try:
                logger.info(f"[{ticker}] Track 4: Price driver analysis...")
                return await run_price_driver_analysis(
                    ticker,
                    research.get("company", ticker),
                    sector=research.get("sector"),
                )
            except Exception as e:
                logger.warning(f"[{ticker}] Track 4 price drivers failed (non-fatal): {e}")
                if hasattr(job, "stage_errors"):
                    job.stage_errors.append(f"Track 4 (drivers): {e}")
                return None

        # ---- Track 5: Gold overlay (parallel, only for gold stocks) ----
        async def _track_gold_overlay():
            """Track 5: run gold analysis for gold-sector stocks."""
            sector_sub = (research.get("sectorSub") or "").lower()
            if "gold" not in sector_sub:
                return None
            try:
                logger.info(f"[{ticker}] Track 5: Gold overlay analysis...")
                return await run_gold_analysis(ticker)
            except Exception as e:
                logger.warning(f"[{ticker}] Track 5 gold overlay failed (non-fatal): {e}")
                if hasattr(job, "stage_errors"):
                    job.stage_errors.append(f"Track 5 (gold): {e}")
                return None

        # ---- Track 6: NotebookLM corpus context (parallel) ----
        async def _track_notebook_corpus():
            """Track 6: query NotebookLM for corpus context to enrich generation."""
            try:
                corpus = await notebook_context.query_notebook_batch(ticker)
                if corpus:
                    gathered["notebook_corpus"] = corpus
                    logger.info(f"[{ticker}] Track 6: NotebookLM corpus retrieved ({len([v for v in corpus.values() if v])} dimensions)")
            except Exception as e:
                logger.warning(f"[{ticker}] Track 6 notebook corpus failed (non-fatal): {e}")

        # ---- Run all tracks in parallel ----
        logger.info(f"[{ticker}] Launching parallel tracks (2+3, 3-structure, 4-drivers, 5-gold, 6-nlm)...")
        (ev_hyp_result, structure_result, price_driver_result, gold_result, _nlm_result) = (
            await asyncio.gather(
                _track_evidence_and_synthesis(),
                _run_structure_update(ticker, research, gathered),
                _track_price_drivers(),
                _track_gold_overlay(),
                _track_notebook_corpus(),
                return_exceptions=True,
            )
        )

        # Unpack Track 2 result (tuple of evidence, hypothesis) or handle exception
        if isinstance(ev_hyp_result, Exception):
            logger.error(f"[{ticker}] Track 2+3 failed: {ev_hyp_result}")
            raise ev_hyp_result
        evidence_update, hypothesis_update = ev_hyp_result

        # Handle exceptions from non-critical tracks gracefully
        if isinstance(structure_result, Exception):
            logger.warning(f"[{ticker}] Track 3 structure exception (non-fatal): {structure_result}")
            structure_result = None
        if isinstance(price_driver_result, Exception):
            logger.warning(f"[{ticker}] Track 4 price drivers exception (non-fatal): {price_driver_result}")
            price_driver_result = None
        if isinstance(gold_result, Exception):
            logger.warning(f"[{ticker}] Track 5 gold overlay exception (non-fatal): {gold_result}")
            gold_result = None
        if isinstance(_nlm_result, Exception):
            logger.warning(f"[{ticker}] Track 6 notebook corpus exception (non-fatal): {_nlm_result}")

        # ---- Stage 4: Write Results ----
        job.status = "writing_results"
        job.stage_index = 4
        logger.info(f"[{ticker}] Stage 4: Writing results...")

        if scaffold_mode:
            updated_research = _merge_initiation(
                research, gathered, evidence_update, hypothesis_update,
                structure_update=structure_result,
                price_driver_result=price_driver_result,
                gold_result=gold_result,
            )
        else:
            updated_research = _merge_updates(
                research, gathered, evidence_update, hypothesis_update,
                structure_update=structure_result,
                price_driver_result=price_driver_result,
                gold_result=gold_result,
            )

        # Generate technical analysis from price data (both modes)
        price_data = gathered.get("price_data", {})
        if "error" not in price_data:
            ta = _generate_technical_analysis(ticker, price_data, research.get("priceHistory", []))
            if ta:
                updated_research["technicalAnalysis"] = ta
                logger.info(f"[{ticker}] Regenerated technical analysis section")

        _save_research(ticker, updated_research)
        _update_index(ticker, updated_research)

        # Persist to GitHub so data survives Railway redeploys
        await _commit_refresh_to_github(ticker)

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
# Helper: format expanded data-provider sections for LLM prompts
# ---------------------------------------------------------------------------

def _format_expanded_data(gathered: dict, *, compact: bool = False) -> str:
    """Build prompt sections for data-provider fields in *gathered*.

    Parameters
    ----------
    gathered : dict
        Output of ``gather_all_data()``.
    compact : bool
        If True, truncate large sections for the structure-update prompt
        which has a tighter token budget.

    Returns a string ready to append to the user_prompt. Empty string if
    no expanded data is present (all providers unconfigured / errored).
    """
    parts: list[str] = []

    # --- EODHD Fundamentals ---
    fundamentals = gathered.get("fundamentals", {})
    if fundamentals:
        fin_stmts = fundamentals.get("financial_statements", {})
        if fin_stmts:
            # Compact mode: latest quarter only; full: up to 4 quarters
            income = fin_stmts.get("income_quarterly", [])
            balance = fin_stmts.get("balance_quarterly", [])
            cashflow = fin_stmts.get("cashflow_quarterly", [])
            limit = 1 if compact else 4
            if income:
                parts.append(f"\n## Financial Statements -- Income (quarterly, latest {limit}):")
                parts.append(json.dumps(income[:limit], indent=2))
            if balance:
                parts.append(f"\n## Financial Statements -- Balance Sheet (quarterly, latest {limit}):")
                parts.append(json.dumps(balance[:limit], indent=2))
            if cashflow:
                parts.append(f"\n## Financial Statements -- Cash Flow (quarterly, latest {limit}):")
                parts.append(json.dumps(cashflow[:limit], indent=2))

        analyst_est = fundamentals.get("analyst_estimates", {})
        if analyst_est:
            parts.append("\n## Analyst Consensus & Estimates (EODHD):")
            parts.append(json.dumps(analyst_est, indent=2))

        insider_txns = fundamentals.get("insider_transactions", [])
        if insider_txns:
            limit = 5 if compact else 15
            parts.append(f"\n## Insider Transactions (latest {limit}):")
            parts.append(json.dumps(insider_txns[:limit], indent=2))

        analyst_ratings = fundamentals.get("analyst_ratings", {})
        if analyst_ratings:
            parts.append("\n## Analyst Ratings Summary:")
            parts.append(json.dumps(analyst_ratings, indent=2))

    # --- Alpha Vantage (cross-validation, lower priority) ---
    av = gathered.get("alpha_vantage", {})
    if av and not compact:
        av_income = av.get("income_statement", {})
        av_overview = av.get("company_overview", {})
        if av_income:
            parts.append("\n## Alpha Vantage Income Statement (cross-validation):")
            reports = av_income.get("quarterlyReports", [])[:2]
            parts.append(json.dumps(reports, indent=2))
        if av_overview:
            parts.append("\n## Alpha Vantage Company Overview:")
            parts.append(json.dumps(av_overview, indent=2))

    # --- RBA Yields ---
    rba = gathered.get("rba_yields", {})
    if rba:
        parts.append("\n## RBA Yield Curve:")
        parts.append(json.dumps(rba, indent=2))

    # --- US Peer Comparables (Finnhub) ---
    peers = gathered.get("us_peers", {})
    if peers:
        parts.append("\n## US Peer Analyst Sentiment (Finnhub):")
        parts.append(json.dumps(peers, indent=2))

    # --- Technical Indicators (Twelve Data) ---
    ta = gathered.get("technical_indicators", {})
    if ta:
        parts.append("\n## Technical Indicators (Twelve Data):")
        parts.append(json.dumps(ta, indent=2))

    # --- Structured ASX Announcements ---
    asx_json = gathered.get("asx_announcements_structured", [])
    if asx_json and not compact:
        limit = 10
        parts.append(f"\n## ASX Announcements -- Structured (latest {limit}):")
        parts.append(json.dumps(asx_json[:limit], indent=2))

    if not parts:
        return ""
    return "\n".join(parts)


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

    # Format macro context if available
    macro_section = ""
    macro_ctx = gathered.get("macro_context")
    if macro_ctx:
        parts = [f"\n## Macro & Commodity Context ({macro_ctx.get('sector_label', '')})"]
        for cp in macro_ctx.get("commodity_prices", []):
            parts.append(f"- {cp['name']} ({cp['ticker']}): {cp['currency']}{cp['price']} ({cp['change_pct']:+.1f}% today)")
        macro_news = macro_ctx.get("macro_news", [])
        if macro_news:
            parts.append("\n### Sector-Relevant Macro Headlines:")
            for mn in macro_news[:5]:
                parts.append(f"- {mn['title']} ({mn['source']})")
                if mn.get("snippet"):
                    parts.append(f"  > {mn['snippet'][:150]}")
        macro_section = "\n".join(parts)

    user_prompt = f"""## Stock: {ticker} ({research.get('company', '')})
## Current Price: {price_data.get('price', 'N/A')} ({price_data.get('change_pct', 0):+.1f}%)

## Existing Evidence Cards:
{json.dumps(cards_summary, indent=2)}

## New ASX Announcements (last 30 days):
{json.dumps(announcements[:10], indent=2)}

## Recent News Headlines:
{json.dumps(news[:8], indent=2)}
{macro_section}
{_build_regime_section(gathered)}
{_format_expanded_data(gathered)}

Please assess each evidence card against this new data and return the updated assessment as JSON."""

    try:
        result = await llm.complete(
            model=config.GEMINI_MODEL,
            system=EVIDENCE_UPDATE_SYSTEM,
            messages=[{"role": "user", "content": user_prompt}],
            json_mode=True,
            max_tokens=16384,
            feature="evidence-update",
            ticker=ticker,
        )
        return result.json if isinstance(result.json, dict) else {}
    except Exception as e:
        logger.error(f"[{ticker}] Evidence specialist failed: {e}")
        return {"cards": [], "summary": f"Evidence update failed: {e}"}


# ---------------------------------------------------------------------------
# Stage 2 (scaffold): Evidence creation from scratch (Gemini)
# ---------------------------------------------------------------------------

async def _run_evidence_creation(
    ticker: str,
    research: dict,
    gathered: dict,
) -> dict:
    """Create 10 evidence domain cards from scratch for a new stock."""
    price_data = gathered.get("price_data", {})
    announcements = gathered.get("announcements", [])
    news = gathered.get("news", [])
    earnings_news = gathered.get("earnings_news", [])

    # Format macro context if available
    macro_section = ""
    macro_ctx = gathered.get("macro_context")
    if macro_ctx:
        parts = [f"\n## Macro & Commodity Context ({macro_ctx.get('sector_label', '')})"]
        for cp in macro_ctx.get("commodity_prices", []):
            parts.append(f"- {cp['name']} ({cp['ticker']}): {cp['currency']}{cp['price']} ({cp['change_pct']:+.1f}% today)")
        macro_news = macro_ctx.get("macro_news", [])
        if macro_news:
            parts.append("\n### Sector-Relevant Macro Headlines:")
            for mn in macro_news[:5]:
                parts.append(f"- {mn['title']} ({mn['source']})")
                if mn.get("snippet"):
                    parts.append(f"  > {mn['snippet'][:200]}")
        macro_section = "\n".join(parts)

    user_prompt = f"""## INITIATING COVERAGE: {ticker} ({research.get('company', '')})
## Sector: {research.get('sector', 'N/A')} / {research.get('sectorSub', 'N/A')}
## Current Price: A${price_data.get('price', 'N/A')}
## 52-Week Range: A${price_data.get('low_52w', 'N/A')} - A${price_data.get('high_52w', 'N/A')}
## Market Cap: A${price_data.get('market_cap', 'N/A')}

## Recent ASX Announcements:
{json.dumps(announcements[:12], indent=2)}

## Recent News Headlines:
{json.dumps(news[:10], indent=2)}

## Earnings/Results News:
{json.dumps(earnings_news[:8], indent=2)}
{macro_section}
{_build_regime_section(gathered)}
{_format_expanded_data(gathered)}

Please create all 10 evidence domain cards for this stock based on the available data."""

    try:
        result = await llm.complete(
            model=config.GEMINI_MODEL,
            system=EVIDENCE_CREATION_SYSTEM,
            messages=[{"role": "user", "content": user_prompt}],
            json_mode=True,
            max_tokens=16384,
            max_retries=4,
            feature="evidence-creation",
            ticker=ticker,
        )
        raw_json = result.json
        logger.info(
            f"[{ticker}] Evidence creation raw response: "
            f"type={type(raw_json).__name__}, "
            f"keys={list(raw_json.keys()) if isinstance(raw_json, dict) else 'N/A'}, "
            f"text_preview={result.text[:200] if result.text else 'empty'}"
        )
        parsed = raw_json if isinstance(raw_json, dict) else {}
        cards = parsed.get("cards", [])
        logger.info(f"[{ticker}] Evidence creation returned {len(cards)} cards")
        if not cards:
            logger.error(
                f"[{ticker}] Evidence creation returned 0 cards! "
                f"Full parsed keys: {list(parsed.keys()) if parsed else 'empty dict'}"
            )
        return parsed if parsed else {"cards": []}
    except Exception as e:
        logger.error(f"[{ticker}] Evidence creation failed: {e}", exc_info=True)
        return {"cards": [], "summary": f"Evidence creation failed: {e}"}


# ---------------------------------------------------------------------------
# Stage 3 (scaffold): Full coverage initiation (Claude)
# ---------------------------------------------------------------------------

async def _run_coverage_initiation(
    ticker: str,
    research: dict,
    evidence_update: dict,
    gathered: dict,
) -> dict:
    """Run Claude to generate full coverage analysis from scratch."""
    price_data = gathered.get("price_data", {})
    announcements = gathered.get("announcements", [])
    news = gathered.get("news", [])
    earnings_news = gathered.get("earnings_news", [])

    # Format evidence cards just created by Gemini
    evidence_cards = evidence_update.get("cards", [])
    cards_text = json.dumps(evidence_cards[:10], indent=2) if evidence_cards else "No evidence cards available."

    # Format macro context
    macro_section = ""
    macro_ctx = gathered.get("macro_context")
    if macro_ctx:
        parts = [f"\n## Macro & Commodity Context ({macro_ctx.get('sector_label', '')})"]
        parts.append("Key external drivers for this stock's sector:")
        for cp in macro_ctx.get("commodity_prices", []):
            parts.append(f"- {cp['name']}: {cp['currency']}{cp['price']} ({cp['change_pct']:+.1f}% today)")
        macro_news = macro_ctx.get("macro_news", [])
        if macro_news:
            parts.append("\n### Sector Macro Headlines:")
            for mn in macro_news[:6]:
                parts.append(f"- {mn['title']} ({mn['source']})")
                if mn.get("snippet"):
                    parts.append(f"  > {mn['snippet'][:200]}")
        macro_section = "\n".join(parts)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Build financial context from Yahoo quoteSummary data
    def _fc(key, label, fmt="raw"):
        v = price_data.get(key)
        if v is None:
            return f"- {label}: N/A"
        if fmt == "pct":
            return f"- {label}: {v * 100:.1f}%"
        if fmt == "big":
            abs_v = abs(v)
            if abs_v >= 1e12:
                return f"- {label}: A${v / 1e12:.1f}T"
            if abs_v >= 1e9:
                return f"- {label}: A${v / 1e9:.1f}B"
            if abs_v >= 1e6:
                return f"- {label}: A${v / 1e6:.0f}M"
            return f"- {label}: A${v:,.0f}"
        if fmt == "ratio":
            return f"- {label}: {v:.1f}x"
        return f"- {label}: {v}"

    financial_context = "\n".join([
        "\n## FINANCIAL DATA (from Yahoo Finance):",
        _fc("forward_pe", "Forward P/E", "ratio"),
        _fc("trailing_pe", "Trailing P/E", "ratio"),
        _fc("ev_to_ebitda", "EV/EBITDA", "ratio"),
        _fc("dividend_yield", "Dividend Yield", "pct"),
        _fc("revenue", "Revenue (FY)", "big"),
        _fc("ebitda", "EBITDA (FY)", "big"),
        _fc("total_debt", "Total Debt", "big"),
        _fc("enterprise_value", "Enterprise Value", "big"),
    ])

    user_prompt = f"""## INITIATING COVERAGE - TODAY'S DATE: {today}

## Stock: {ticker} ({research.get('company', '')})
## Sector: {research.get('sector', 'N/A')} / {research.get('sectorSub', 'N/A')}
## Current Price: A${price_data.get('price', 'N/A')}
## 52-Week High: A${price_data.get('high_52w', 'N/A')}
## 52-Week Low: A${price_data.get('low_52w', 'N/A')}
## Market Cap: A${price_data.get('market_cap', 'N/A')}
{financial_context}

## Evidence Cards (just created):
{cards_text}

## Recent ASX Announcements:
{json.dumps(announcements[:8], indent=2)}

## Recent News:
{json.dumps(news[:8], indent=2)}

## Earnings/Results News:
{json.dumps(earnings_news[:5], indent=2)}
{macro_section}
{_build_regime_section(gathered)}
{notebook_context.build_corpus_section(ticker, gathered.get("notebook_corpus", {}))}

This is INITIAL COVERAGE. Create a complete research analysis with all hypotheses, narrative \
sections, verdict, tripwires, discriminators, and gaps assessment. Be thorough and specific."""

    # Claude primary, Gemini fallback via llm.complete()
    try:
        resp = await llm.complete(
            model=config.ANTHROPIC_MODEL,
            system=FULL_INITIATION_SYSTEM,
            messages=[{"role": "user", "content": user_prompt}],
            max_tokens=16384,
            temperature=0,
            json_mode=True,
            feature="coverage-init",
            ticker=ticker,
            fallback_model=config.GEMINI_MODEL,
            max_retries=2,
        )
        raw_json = resp.json
        logger.info(
            f"[{ticker}] Coverage initiation raw response: "
            f"type={type(raw_json).__name__}, "
            f"keys={list(raw_json.keys()) if isinstance(raw_json, dict) else 'N/A'}, "
            f"text_preview={resp.text[:300] if resp.text else 'empty'}"
        )
        result = raw_json if isinstance(raw_json, dict) else {}
    except Exception as e:
        logger.error(f"[{ticker}] Coverage initiation failed (all providers): {e}", exc_info=True)
        return {
            "hypotheses": [],
            "narrative_rewrite": f"Coverage initiation failed (both Claude and Gemini): {e}",
            "verdict_update": None,
        }

    hyp_count = len(result.get("hypotheses", []))
    trip_count = len(result.get("tripwires", []))
    disc_count = len(result.get("discriminators", []))
    logger.info(
        f"[{ticker}] Coverage initiation: "
        f"{hyp_count} hypotheses, {trip_count} tripwires, {disc_count} discriminators"
    )
    if not hyp_count:
        logger.error(
            f"[{ticker}] Coverage initiation returned 0 hypotheses! "
            f"Full result keys: {list(result.keys()) if result else 'empty dict'}"
        )
    return result


# ---------------------------------------------------------------------------
# Technical analysis generation from price data
# ---------------------------------------------------------------------------

def _generate_technical_analysis(
    ticker: str,
    price_data: dict,
    price_history: list,
) -> dict | None:
    """Generate technical analysis section from price history."""
    if not price_history or len(price_history) < 10:
        return None

    prices = [float(p) for p in price_history if p is not None]
    if len(prices) < 10:
        return None

    current_price = float(price_data.get("price", prices[-1]))
    high_52w = float(price_data.get("high_52w", max(prices)))
    low_52w = float(price_data.get("low_52w", min(prices)))

    # Calculate moving averages
    ma50 = sum(prices[-50:]) / min(len(prices), 50) if len(prices) >= 10 else current_price
    ma200 = sum(prices) / len(prices)  # Use all available data as proxy

    # Determine trend direction
    recent_10 = prices[-10:]
    older_10 = prices[-20:-10] if len(prices) >= 20 else prices[:10]
    avg_recent = sum(recent_10) / len(recent_10)
    avg_older = sum(older_10) / len(older_10)
    trend_dir = "Up" if avg_recent > avg_older * 1.02 else ("Down" if avg_recent < avg_older * 0.98 else "Sideways")

    # Golden / death cross
    crossover_type = "Golden Cross" if ma50 > ma200 else "Death Cross"

    # Drawdown from 52w high
    drawdown = ((current_price - high_52w) / high_52w * 100)

    # Range position (0=low, 100=high)
    range_span = high_52w - low_52w
    range_position = int((current_price - low_52w) / range_span * 100) if range_span > 0 else 50

    # Volatility — avg daily range as %
    daily_ranges = []
    for i in range(1, min(len(prices), 31)):
        daily_range = abs(prices[-i] - prices[-i - 1]) / prices[-i - 1] * 100 if prices[-i - 1] > 0 else 0
        daily_ranges.append(daily_range)
    avg_daily_range_30 = round(sum(daily_ranges) / len(daily_ranges), 1) if daily_ranges else 0

    # Find peak and trough in available data
    peak_price = max(prices)
    peak_idx = prices.index(peak_price)
    trough_price = min(prices)
    trough_idx = prices.index(trough_price)

    now = datetime.now(timezone.utc)

    return {
        "date": now.strftime("%d %B %Y"),
        "period": "1 Year",
        "source": "Continuum Technical Intelligence",
        "regime": "Uptrend" if trend_dir == "Up" else ("Downtrend" if trend_dir == "Down" else "Consolidation"),
        "clarity": "Clear" if abs(avg_recent - avg_older) / avg_older > 0.05 else "Mixed",
        "price": {"current": round(current_price, 2), "currency": "A$"},
        "movingAverages": {
            "ma50": {"value": round(ma50, 1), "date": now.strftime("%d %b %Y")},
            "ma200": {"value": round(ma200, 1), "date": now.strftime("%d %b %Y")},
            "crossover": {
                "type": crossover_type,
                "date": now.strftime("%B %Y"),
                "description": "50-day MA crossed above 200-day MA (golden cross)"
                if crossover_type == "Golden Cross"
                else "50-day MA crossed below 200-day MA (death cross)",
            },
            "priceVsMa50": round((current_price - ma50) / ma50 * 100, 1),
            "priceVsMa200": round((current_price - ma200) / ma200 * 100, 1),
        },
        "trend": {
            "direction": trend_dir,
            "duration": f"{min(len(prices) // 20, 12)} months",
            "structure": f"Price in {trend_dir.lower()}trend relative to 50-day and 200-day moving averages.",
            "peak": {"price": round(peak_price, 2), "date": "Recent"},
            "trough": {"price": round(trough_price, 2), "date": "Recent"},
            "drawdown": round(drawdown, 1),
        },
        "keyLevels": {
            "support": {"price": round(min(prices[-20:]) if len(prices) >= 20 else trough_price, 2), "method": "Recent low / swing support"},
            "resistance": {"price": round(max(prices[-20:]) if len(prices) >= 20 else peak_price, 2), "method": "Recent high / swing resistance"},
            "fiftyTwoWeekHigh": {"price": round(high_52w, 2), "date": "Last 12 months"},
            "fiftyTwoWeekLow": {"price": round(low_52w, 2), "date": "Last 12 months"},
        },
        "volume": {
            "latestVs20DayAvg": 1.0,
            "latestDate": now.strftime("%d %B %Y"),
            "priorSpikes": [],
        },
        "volatility": {
            "latestDailyRange": {
                "high": round(max(prices[-2:]), 2) if len(prices) >= 2 else round(current_price, 2),
                "low": round(min(prices[-2:]), 2) if len(prices) >= 2 else round(current_price, 2),
                "date": now.strftime("%d %B %Y"),
            },
            "latestRangePercent": round(avg_daily_range_30, 1),
            "avgDailyRangePercent30": round(avg_daily_range_30, 1),
            "avgDailyRangePercent90": round(avg_daily_range_30, 1),
        },
        "meanReversion": {
            "vsMa50": round((current_price - ma50) / ma50 * 100, 1),
            "vsMa200": round((current_price - ma200) / ma200 * 100, 1),
            "rangePosition": range_position,
            "rangeHigh": round(high_52w, 2),
            "rangeLow": round(low_52w, 2),
        },
        "inflectionPoints": [],
        "relativePerformance": {
            "vsIndex": {
                "name": "S&P/ASX 200",
                "period": "12 months",
                "stockReturn": round((current_price - prices[0]) / prices[0] * 100, 1) if prices[0] > 0 else 0,
                "indexReturn": 0,
                "relativeReturn": round((current_price - prices[0]) / prices[0] * 100, 1) if prices[0] > 0 else 0,
            },
        },
    }


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

    # Format macro context if available
    macro_section = ""
    macro_ctx = gathered.get("macro_context")
    if macro_ctx:
        parts = [f"\n## Macro & Commodity Context ({macro_ctx.get('sector_label', '')})"]
        parts.append("These are the key external drivers for this stock's sector:")
        for cp in macro_ctx.get("commodity_prices", []):
            parts.append(f"- {cp['name']}: {cp['currency']}{cp['price']} ({cp['change_pct']:+.1f}% today)")
        macro_news = macro_ctx.get("macro_news", [])
        if macro_news:
            parts.append("\n### Sector Macro/Geopolitical Headlines (past week):")
            for mn in macro_news[:6]:
                parts.append(f"- {mn['title']} ({mn['source']})")
                if mn.get("snippet"):
                    parts.append(f"  > {mn['snippet'][:150]}")
        parts.append(
            "\nConsider how these macro factors affect hypothesis weightings, "
            "the embedded thesis, and narrative sections."
        )
        macro_section = "\n".join(parts)

    user_prompt = f"""## TODAY'S DATE: {today}

## Stock: {ticker} ({research.get('company', '')})
## Current Price: A${price_data.get('price', 'N/A')} ({price_data.get('change_pct', 0):+.1f}%)
## 52-Week Range: A${price_data.get('low_52w', 'N/A')} - A${price_data.get('high_52w', 'N/A')}

## Key Financial Metrics (from Yahoo Finance -- use these exact values):
- Forward P/E: {f"{price_data['forward_pe']:.1f}x" if price_data.get('forward_pe') else 'N/A'}
- Trailing P/E: {f"{price_data['trailing_pe']:.1f}x" if price_data.get('trailing_pe') else 'N/A'}
- EV/EBITDA: {f"{price_data['ev_to_ebitda']:.1f}x" if price_data.get('ev_to_ebitda') else 'N/A'}
- Dividend Yield: {f"{price_data['dividend_yield'] * 100:.1f}%" if price_data.get('dividend_yield') is not None else 'N/A'}
- Market Cap: A${price_data.get('market_cap', 'N/A')}

## Current Hypothesis Weights:
{json.dumps(hypotheses_summary, indent=2)}

## Current Verdict:
{research.get('verdict', {}).get('text', 'N/A')[:500]}

## Current Embedded Thesis (hero.embedded_thesis):
{hero.get('embedded_thesis', 'N/A')[:500]}

## Current Skew Description:
{hero.get('skew_description', 'N/A')[:300]}

## Current Narrative (theNarrative):
{_strip_narrative_timestamps(narrative.get('theNarrative', 'N/A'))[:800]}

## Current Price Implication:
{narrative.get('priceImplication', {}).get('content', 'N/A')[:500] if isinstance(narrative.get('priceImplication'), dict) else 'N/A'}

## Current Evidence Check:
{narrative.get('evidenceCheck', 'N/A')[:400]}

## Current Narrative Stability:
{narrative.get('narrativeStability', 'N/A')[:400]}

## Current Next Decision Point:
{json.dumps(hero.get('next_decision_point', {}), indent=2)}

## Current Position In Range:
{json.dumps(hero.get('position_in_range', {}), indent=2)}

## Current Company Description (heroCompanyDescription):
{research.get('heroCompanyDescription', 'N/A')[:600]}

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
{macro_section}
{_build_regime_section(gathered)}
{notebook_context.build_corpus_section(ticker, gathered.get("notebook_corpus", {}))}

## Current Tripwires (catalysts being watched):
{json.dumps(tripwires_summary, indent=2)}

IMPORTANT: Any event with a date BEFORE {today} has ALREADY HAPPENED. Rewrite all narrative \
sections to reflect this. Do not describe past events as upcoming. For each tripwire with a date \
before today, set status to "resolved" in tripwire_updates.

Please provide the FULL updated JSON with all narrative rewrites and tripwire updates."""

    # Claude primary, Gemini fallback via llm.complete()
    try:
        resp = await llm.complete(
            model=config.ANTHROPIC_MODEL,
            system=HYPOTHESIS_UPDATE_SYSTEM,
            messages=[{"role": "user", "content": user_prompt}],
            max_tokens=8192,
            temperature=0,
            json_mode=True,
            feature="hypothesis-synthesis",
            ticker=ticker,
            fallback_model=config.GEMINI_MODEL,
            max_retries=2,
        )
        result = resp.json if isinstance(resp.json, dict) else {}
    except Exception as e:
        logger.error(f"[{ticker}] Hypothesis synthesis failed (all providers): {e}")
        return {
            "hypotheses": [],
            "narrative_update": f"Synthesis unavailable: {e}",
            "verdict_update": None,
            "key_catalyst": None,
        }

    # -- Completeness check with single retry for missing fields --
    is_complete, missing = _validate_synthesis_response(result, ticker)
    if not is_complete and len(missing) > 2:
        logger.info(
            f"[{ticker}] Retrying synthesis - {len(missing)} required fields missing: {missing}"
        )
        retry_prompt = (
            user_prompt
            + f"\n\nCRITICAL: Your previous response was missing these required fields: "
            + f"{missing}. You MUST include ALL fields listed in the schema. "
            + f"Return the COMPLETE JSON object."
        )
        try:
            resp2 = await llm.complete(
                model=config.ANTHROPIC_MODEL,
                system=HYPOTHESIS_UPDATE_SYSTEM,
                messages=[{"role": "user", "content": retry_prompt}],
                max_tokens=8192,
                temperature=0,
                json_mode=True,
                feature="hypothesis-synthesis-retry",
                ticker=ticker,
                max_retries=1,
            )
            result2 = resp2.json if isinstance(resp2.json, dict) else {}
            # Backfill only the missing fields from retry response
            for fld in missing:
                if result2.get(fld):
                    result[fld] = result2[fld]
                    logger.info(f"[{ticker}] Recovered field '{fld}' from retry")
            _, still_missing = _validate_synthesis_response(result, ticker)
            if still_missing:
                logger.warning(
                    f"[{ticker}] Still missing after retry: {still_missing}"
                )
        except Exception as e:
            logger.warning(f"[{ticker}] Synthesis retry failed (non-fatal): {e}")

    return result


# ---------------------------------------------------------------------------
# Track 3: Gemini structure update (evidence intro, alignment, discriminators, gaps, identity, TA commentary)
# ---------------------------------------------------------------------------

STRUCTURE_UPDATE_SYSTEM = """\
You are a specialist equity research analyst performing a structural quality pass on a research report.

Given the current research JSON and freshly gathered data, update the STRUCTURAL sections of the report:
- evidence.intro: 2-3 sentence introduction to the evidence base
- evidence.alignmentSummary: 1-2 sentence summary of how evidence aligns across domains
- discriminators: array of high-diagnosticity data points (keep existing format)
- gaps: coverage assessment with coverageRows, couldntAssess, analyticalLimitations
- identity: object with {sector, sectorSub, marketCap, style} reflecting current data
- technicalAnalysis.commentary: 2-4 sentence plain-text summary of the technical picture

Return a JSON object with exactly these keys:
{
  "evidence_intro": "...",
  "alignment_summary": "...",
  "discriminators": [...],
  "gaps": {...},
  "identity": {...},
  "technical_commentary": "..."
}

Only update fields where the new data provides a meaningful improvement. If a section is already \
high quality and the new data does not change it, return null for that field.
Do not use emoji characters. Do not use em-dashes (the long dash character) anywhere. \
Use en-dashes, hyphens, or restructure the sentence instead. \
Use only ASCII text, HTML entities, and standard punctuation."""


async def _run_structure_update(
    ticker: str,
    research: dict,
    gathered: dict,
) -> dict | None:
    """Track 3: Use Gemini Flash to refresh structural/quality sections of the report."""
    sem = _get_evidence_semaphore()
    price_data = gathered.get("price_data", {})

    # Build a compact context for the structure pass
    existing_discriminators = research.get("discriminators", {}).get("rows", [])
    existing_gaps = research.get("gaps", {})
    existing_identity = {
        "sector": research.get("sector"),
        "sectorSub": research.get("sectorSub"),
        "marketCap": price_data.get("market_cap"),
    }
    existing_evidence_intro = research.get("evidence", {}).get("intro", "")
    existing_ta_commentary = (research.get("technicalAnalysis") or {}).get("commentary", "")

    user_prompt = f"""## Stock: {ticker} ({research.get('company', '')})
## Sector: {research.get('sector', 'N/A')} / {research.get('sectorSub', 'N/A')}
## Current Price: A${price_data.get('price', 'N/A')}
## Market Cap: A${price_data.get('market_cap', 'N/A')}

## Current Evidence Intro:
{existing_evidence_intro}

## Current Discriminators:
{json.dumps(existing_discriminators[:5], indent=2)}

## Current Gaps:
{json.dumps(existing_gaps, indent=2)[:2000]}

## Current Identity:
{json.dumps(existing_identity, indent=2)}

## Current TA Commentary:
{existing_ta_commentary[:500]}

## Recent News Headlines:
{json.dumps(gathered.get('news', [])[:5], indent=2)}

## Recent ASX Announcements:
{json.dumps(gathered.get('announcements', [])[:5], indent=2)}
{_format_expanded_data(gathered, compact=True)}

Please provide updated structural sections as JSON."""

    async with sem:
        try:
            result = await llm.complete(
                model=config.GEMINI_MODEL,
                system=STRUCTURE_UPDATE_SYSTEM,
                messages=[{"role": "user", "content": user_prompt}],
                json_mode=True,
                max_tokens=8192,
                feature="structure-update",
                ticker=ticker,
            )
            parsed = result.json if isinstance(result.json, dict) else {}
            if parsed:
                logger.info(f"[{ticker}] Track 3 structure update: keys={list(parsed.keys())}")
            return parsed or None
        except Exception as e:
            logger.warning(f"[{ticker}] Track 3 structure update failed (non-fatal): {e}")
            return None


# ---------------------------------------------------------------------------
# Stage 4: Merge updates into research JSON
# ---------------------------------------------------------------------------

def _compute_skew_from_hypotheses(hypotheses: list) -> str:
    """
    Compute skew direction from hypothesis scores.
    Mirrors JS normaliseScores() (floor=5, ceiling=80) + computeSkewScore().
    Returns 'upside', 'downside', or 'balanced'.
    """
    if not hypotheses:
        return "balanced"
    raw = []
    for h in hypotheses:
        s = h.get("score", "50%")
        try:
            raw.append(max(5.0, min(80.0, float(str(s).strip("%")))))
        except (ValueError, TypeError):
            raw.append(50.0)
    total = sum(raw) or 1.0
    norm = [r / total * 100 for r in raw]
    net = 0.0
    for i, h in enumerate(hypotheses):
        direction = (h.get("direction") or "neutral").lower()
        if direction == "upside":
            net += norm[i]
        elif direction == "downside":
            net -= norm[i]
    if net > 5:
        return "upside"
    elif net < -5:
        return "downside"
    return "balanced"


def _merge_updates(
    research: dict,
    gathered: dict,
    evidence_update: dict,
    hypothesis_update: dict,
    structure_update: dict | None = None,
    price_driver_result: dict | None = None,
    gold_result: dict | None = None,
) -> dict:
    """Merge all updates into a copy of the research JSON."""
    updated = deepcopy(research)
    now = datetime.now(ZoneInfo("Australia/Sydney")).strftime("%d-%b-%y %H:%M AEST")

    # Capture existing skew before any hypothesis updates — used for momentum signal
    old_skew = (updated.get("hero") or {}).get("skew", "")

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
        # Yahoo may return [{date, close}, ...] objects or plain [number, ...].
        # Always normalise to plain numbers before storing.
        raw_ph = price_data.get("price_history")
        if raw_ph:
            if isinstance(raw_ph[0], dict):
                updated["priceHistory"] = [
                    pt["close"] for pt in raw_ph
                    if isinstance(pt, dict) and pt.get("close") is not None
                ]
            else:
                updated["priceHistory"] = raw_ph

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
                            vs["score"] = h["score"]
                            vs["dirArrow"] = arrow
                            vs["dirText"] = text
                break

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
        # Persist previous skew and recompute hero.skew from refreshed hypothesis scores
        updated["hero"]["previousSkew"] = old_skew
        updated["hero"]["skew"] = _compute_skew_from_hypotheses(
            updated.get("hypotheses", [])
        ).upper()

        # -- Position in range (refresh) --
        if hypothesis_update.get("position_in_range"):
            pir = hypothesis_update["position_in_range"]
            current_price_num = float(
                str(price_data.get("price", 0)).replace("$", "").replace(",", "")
            ) if "error" not in price_data else 0
            if "current_price" not in pir or pir["current_price"] is None:
                pir["current_price"] = current_price_num
            else:
                try:
                    pir["current_price"] = float(
                        str(pir["current_price"]).replace("$", "").replace(",", "")
                    )
                except (ValueError, TypeError):
                    pir["current_price"] = current_price_num
            for w in pir.get("worlds", []):
                if isinstance(w.get("price"), str):
                    try:
                        w["price"] = float(w["price"].replace("$", "").replace(",", ""))
                    except (ValueError, TypeError):
                        pass
                w.pop("gapPct", None)
            updated["hero"]["position_in_range"] = pir
        elif "position_in_range" in updated.get("hero", {}):
            # Even if LLM didn't return new worlds, at least update current_price
            current_price_num = float(
                str(price_data.get("price", 0)).replace("$", "").replace(",", "")
            ) if "error" not in price_data else None
            if current_price_num:
                updated["hero"]["position_in_range"]["current_price"] = current_price_num

    # -- Company description (refresh) --
    if hypothesis_update.get("company_description"):
        updated["heroCompanyDescription"] = hypothesis_update["company_description"]

    # -- Full narrative rewrite --
    if "narrative" in updated and isinstance(updated["narrative"], dict):
        if hypothesis_update.get("narrative_rewrite"):
            cleaned = _strip_narrative_timestamps(hypothesis_update["narrative_rewrite"])
            updated["narrative"]["theNarrative"] = (
                f"<strong>[Updated {now}]</strong> "
                f"{cleaned}"
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
    if structure_update and isinstance(structure_update, dict):
        # evidence.intro
        if structure_update.get("evidence_intro"):
            updated.setdefault("evidence", {})["intro"] = structure_update["evidence_intro"]
        # evidence.alignmentSummary
        if structure_update.get("alignment_summary"):
            updated.setdefault("evidence", {})["alignmentSummary"] = structure_update["alignment_summary"]
        # discriminators
        su_disc = structure_update.get("discriminators")
        if su_disc and isinstance(su_disc, list):
            updated.setdefault("discriminators", {})["rows"] = su_disc
        # gaps
        su_gaps = structure_update.get("gaps")
        if su_gaps and isinstance(su_gaps, dict):
            updated["gaps"] = su_gaps
        # identity
        su_identity = structure_update.get("identity")
        if su_identity and isinstance(su_identity, dict):
            for k, v in su_identity.items():
                if v is not None:
                    updated[k] = v
        # technicalAnalysis.commentary
        if structure_update.get("technical_commentary"):
            updated.setdefault("technicalAnalysis", {})["commentary"] = (
                structure_update["technical_commentary"]
            )

    # -- Track 4: Price drivers --
    if price_driver_result and isinstance(price_driver_result, dict):
        updated["priceDrivers"] = price_driver_result

    # -- Track 5: Gold overlay --
    if gold_result and isinstance(gold_result, dict):
        updated["goldAnalysis"] = gold_result

    # -- Timestamp --
    updated["date"] = now
    updated["_lastRefreshed"] = datetime.now(timezone.utc).isoformat()

    # -- Generation metadata (macro driver snapshot for staleness detection) --
    updated["_generation_meta"] = _build_generation_meta(gathered)

    return updated


def _merge_initiation(
    research: dict,
    gathered: dict,
    evidence_update: dict,
    hypothesis_update: dict,
    structure_update: dict | None = None,
    price_driver_result: dict | None = None,
    gold_result: dict | None = None,
) -> dict:
    """Merge coverage initiation results into the scaffold, replacing placeholders."""
    ev_cards = evidence_update.get("cards", [])
    hyp_list = hypothesis_update.get("hypotheses", [])
    logger.info(
        f"_merge_initiation: evidence_cards={len(ev_cards)}, "
        f"hypotheses={len(hyp_list)}, "
        f"evidence_keys={list(evidence_update.keys())}, "
        f"hypothesis_keys={list(hypothesis_update.keys())}"
    )
    updated = deepcopy(research)
    now = datetime.now(ZoneInfo("Australia/Sydney")).strftime("%d-%b-%y %H:%M AEST")
    price_data = gathered.get("price_data", {})

    # -- Price update --
    if "error" not in price_data:
        updated["price"] = price_data.get("price", updated.get("price", ""))
        updated["currency"] = price_data.get("currency", "A$")
        # Update price history
        raw_ph = price_data.get("price_history")
        if raw_ph:
            if isinstance(raw_ph[0], dict):
                updated["priceHistory"] = [
                    pt["close"] for pt in raw_ph
                    if isinstance(pt, dict) and pt.get("close") is not None
                ]
            else:
                updated["priceHistory"] = raw_ph

    current_price = float(price_data.get("price", 0)) if "error" not in price_data else 0

    # -- Rebuild featuredMetrics from fresh Yahoo data --
    # The scaffold may have written N/A if Yahoo chart endpoint missed market_cap.
    # Stage 1 gathering re-fetches price data which may now have it.
    if "error" not in price_data:
        from scaffold import _build_featured_metrics, infer_archetype as _infer_arch

        _market_cap = price_data.get("market_cap")
        _currency = price_data.get("currency", "A$")
        _price = price_data.get("price", 0)
        _high_52w = price_data.get("high_52w", _price)
        _low_52w = price_data.get("low_52w", _price)

        _market_cap_str = f"{_currency}{_market_cap / 1e9:.1f}B" if _market_cap and _market_cap > 0 else "N/A"
        _drawdown = f"-{(1 - _price / _high_52w) * 100:.1f}%" if _high_52w and _high_52w > 0 else "0.0%"

        _forward_pe = price_data.get("forward_pe")
        _trailing_pe = price_data.get("trailing_pe")
        _dividend_yield = price_data.get("dividend_yield")

        def _fmt_ratio(v, suffix="x"):
            return f"{v:.1f}{suffix}" if v and v != 0 else "N/A"

        def _fmt_pct(v):
            return f"{v * 100:.1f}%" if v is not None else "N/A"

        _pe_str = _fmt_ratio(_forward_pe or _trailing_pe)
        _div_yield_str = _fmt_pct(_dividend_yield)
        _yield_color = _dividend_yield is not None and _dividend_yield > 0.03

        ticker = updated.get("ticker", "")
        _archetype = _infer_arch(
            ticker,
            updated.get("sector"),
            updated.get("sectorSub"),
            price_data,
        )

        rebuilt_metrics = _build_featured_metrics(
            _archetype, _market_cap_str, _pe_str, _div_yield_str,
            _yield_color, _drawdown, _price, _high_52w, _low_52w, _currency,
        )

        old_na = sum(1 for m in updated.get("featuredMetrics", []) if m.get("value") in (None, "N/A", "--"))
        new_na = sum(1 for m in rebuilt_metrics if m.get("value") in (None, "N/A", "--"))
        if new_na < old_na or old_na >= 3:
            updated["featuredMetrics"] = rebuilt_metrics
            logger.info(f"[{updated.get('ticker', '?')}] Rebuilt featuredMetrics: {old_na} N/A -> {new_na} N/A")

    # -- Replace evidence cards entirely --
    evidence_cards = evidence_update.get("cards", [])
    if evidence_cards:
        if "evidence" not in updated:
            updated["evidence"] = {}
        updated["evidence"]["cards"] = evidence_cards
        updated["evidence"]["intro"] = (
            "Evidence is assessed across ten epistemic domains, ranked by reliability. "
            "Each domain carries a distinct epistemic quality, from verified regulatory filings "
            "to unverified media commentary, ensuring the analyst understands what the evidence "
            "is before assessing what it means."
        )
        updated["evidence"]["alignmentSummary"] = None

    # -- Replace hypotheses entirely --
    hyp_updates = hypothesis_update.get("hypotheses", [])
    if hyp_updates:
        for hu in hyp_updates:
            tier = hu.get("tier", "").lower()
            for h in updated.get("hypotheses", []):
                if h.get("tier", "").lower() == tier:
                    h["score"] = hu.get("updated_score", h.get("score"))
                    h["scoreWidth"] = hu.get("updated_score", h.get("scoreWidth"))
                    h["scoreMeta"] = hu.get("rationale", "")
                    h["description"] = hu.get("updated_description", h.get("description"))
                    h["statusClass"] = "watching"
                    h["statusText"] = "Active Coverage"
                    # Replace supporting/contradicting evidence
                    if hu.get("supporting"):
                        h["supporting"] = hu["supporting"]
                    if hu.get("contradicting"):
                        h["contradicting"] = hu["contradicting"]
                    break

        # Update verdict scores
        if "verdict" in updated and "scores" in updated["verdict"]:
            for hu in hyp_updates:
                tier = hu.get("tier", "").lower()
                direction = hu.get("direction", "neutral")
                dir_map = {
                    "upside": ("&uarr;", "Upside"),
                    "neutral": ("&rarr;", "Base"),
                    "downside": ("&darr;", "Downside"),
                    "up": ("&uarr;", "Rising"),
                    "down": ("&darr;", "Falling"),
                    "steady": ("&rarr;", "Steady"),
                }
                arrow, text = dir_map.get(direction, ("&rarr;", "Base"))
                # Derive scoreColor from hypothesis direction
                color_map = {
                    "upside": "var(--signal-green)",
                    "bullish": "var(--signal-green)",
                    "neutral": "var(--signal-amber)",
                    "downside": "var(--signal-amber)",
                    "bearish": "var(--text-muted)",
                }
                score_color = color_map.get(direction, "var(--text-muted)")
                for vs in updated["verdict"]["scores"]:
                    if vs.get("label", "").lower().startswith(tier[:2]):
                        canonical = next(
                            (h["score"] for h in updated.get("hypotheses", [])
                             if h.get("tier", "").lower() == tier),
                            hu.get("updated_score", vs.get("score"))
                        )
                        vs["score"] = canonical
                        vs["scoreColor"] = score_color
                        vs["dirArrow"] = arrow
                        vs["dirText"] = text
                        vs["dirColor"] = None
                        break

    # -- Company description --
    if hypothesis_update.get("company_description"):
        updated["heroCompanyDescription"] = hypothesis_update["company_description"]

    # -- Skew --
    if hypothesis_update.get("skew"):
        skew_data = hypothesis_update["skew"]
        if isinstance(skew_data, dict):
            updated["skew"] = {
                "direction": skew_data.get("direction", "neutral"),
                "rationale": skew_data.get("rationale", ""),
            }

    # -- Hero section --
    if "hero" not in updated:
        updated["hero"] = {}
    if hypothesis_update.get("embedded_thesis"):
        updated["hero"]["embedded_thesis"] = hypothesis_update["embedded_thesis"]
    if hypothesis_update.get("skew_description"):
        updated["hero"]["skew_description"] = hypothesis_update["skew_description"]
    if hypothesis_update.get("position_in_range"):
        pir = hypothesis_update["position_in_range"]
        # Ensure current_price is set and numeric
        if "current_price" not in pir or pir["current_price"] is None:
            pir["current_price"] = current_price
        else:
            try:
                pir["current_price"] = float(str(pir["current_price"]).replace("$", "").replace(",", ""))
            except (ValueError, TypeError):
                pir["current_price"] = current_price
        # Ensure world prices are plain numbers, not dollar strings
        for w in pir.get("worlds", []):
            if isinstance(w.get("price"), str):
                try:
                    w["price"] = float(w["price"].replace("$", "").replace(",", ""))
                except (ValueError, TypeError):
                    pass
            # Remove gapPct if present (frontend calculates gap from prices)
            w.pop("gapPct", None)
        updated["hero"]["position_in_range"] = pir
    ndp = hypothesis_update.get("next_decision_point")
    if ndp and isinstance(ndp, dict) and ndp.get("event"):
        updated["hero"]["next_decision_point"] = {
            "event": ndp["event"],
            "date": ndp.get("date", "TBC"),
            "metric": ndp.get("metric", ""),
            "thresholds": ndp.get("thresholds", ""),
        }

    # -- Compute hero.skew from hypothesis scores (mirrors _merge_updates) --
    updated["hero"]["previousSkew"] = ""
    updated["hero"]["skew"] = _compute_skew_from_hypotheses(
        updated.get("hypotheses", [])
    ).upper()

    # -- Full narrative --
    if "narrative" not in updated:
        updated["narrative"] = {}
    if hypothesis_update.get("narrative_rewrite"):
        cleaned = _strip_narrative_timestamps(hypothesis_update["narrative_rewrite"])
        updated["narrative"]["theNarrative"] = (
            f"<strong>[Coverage Initiated {now}]</strong> "
            f"{cleaned}"
        )
    if hypothesis_update.get("price_implication"):
        updated["narrative"]["priceImplication"] = {
            "label": f"Embedded Assumptions at A${current_price:.2f}" if current_price else "Embedded Assumptions",
            "content": hypothesis_update["price_implication"],
        }
    if hypothesis_update.get("evidence_check"):
        updated["narrative"]["evidenceCheck"] = hypothesis_update["evidence_check"]
    if hypothesis_update.get("narrative_stability"):
        updated["narrative"]["narrativeStability"] = hypothesis_update["narrative_stability"]

    # -- Verdict --
    if hypothesis_update.get("verdict_update"):
        if "verdict" in updated and isinstance(updated["verdict"], dict):
            updated["verdict"]["text"] = hypothesis_update["verdict_update"]

    # -- Featured rationale --
    if hypothesis_update.get("skew_description"):
        updated["featuredRationale"] = hypothesis_update["skew_description"]

    # -- Tripwires (replace entirely) --
    tripwires_data = hypothesis_update.get("tripwires", [])
    if tripwires_data:
        if "tripwires" not in updated:
            updated["tripwires"] = {}
        updated["tripwires"]["cards"] = tripwires_data
        updated["tripwires"]["intro"] = (
            "The following catalysts could force a material revision to hypothesis weightings. "
            "Each carries conditional outcomes that map to specific narrative shifts."
        )

    # -- Discriminators (replace entirely) --
    discriminators_data = hypothesis_update.get("discriminators", [])
    if discriminators_data:
        updated["discriminators"] = {
            "intro": (
                "The following data points carry high diagnosticity: they can meaningfully "
                "shift probability between competing hypotheses."
            ),
            "rows": discriminators_data,
            "nonDiscriminating": hypothesis_update.get("non_discriminating"),
        }

    # -- Gaps (replace entirely) --
    gaps_data = hypothesis_update.get("gaps")
    if gaps_data and isinstance(gaps_data, dict):
        updated["gaps"] = gaps_data

    # -- Hero metrics refresh --
    if "heroMetrics" in updated and current_price:
        # Build lookup of fresh values keyed by label
        def _fmt_big(v, cur="A$"):
            if v is None or v == 0:
                return None
            abs_v = abs(v)
            if abs_v >= 1e12:
                return f"{cur}{v / 1e12:.1f}T"
            if abs_v >= 1e9:
                return f"{cur}{v / 1e9:.1f}B"
            if abs_v >= 1e6:
                return f"{cur}{v / 1e6:.0f}M"
            return f"{cur}{v:,.0f}"

        mc_str = _fmt_big(price_data.get("market_cap"))
        fwd_pe = price_data.get("forward_pe") or price_data.get("trailing_pe")
        pe_str = f"{fwd_pe:.1f}x" if fwd_pe else None
        div_y = price_data.get("dividend_yield")
        div_str = f"{div_y * 100:.1f}%" if div_y is not None else None
        h52 = price_data.get("high_52w")
        l52 = price_data.get("low_52w")
        cur = price_data.get("currency", "A$")

        label_value_map = {}
        if mc_str:
            label_value_map["Mkt Cap"] = mc_str
        if pe_str:
            label_value_map["Fwd P/E"] = pe_str
        if div_str:
            label_value_map["Div Yield"] = div_str
        if h52 is not None:
            label_value_map["52w High"] = f"{cur}{h52}"
        if l52 is not None:
            label_value_map["52w Low"] = f"{cur}{l52}"

        for m in updated["heroMetrics"]:
            fresh = label_value_map.get(m.get("label"))
            if fresh:
                m["value"] = fresh

    # -- Gaps: ensure confidenceClass on coverage rows --
    if "gaps" in updated and "coverageRows" in updated["gaps"]:
        for row in updated["gaps"]["coverageRows"]:
            if not row.get("confidenceClass"):
                conf = (row.get("confidence") or "").lower()
                if "high" in conf:
                    row["confidenceClass"] = "td-green"
                elif "medium" in conf or "moderate" in conf:
                    row["confidenceClass"] = "td-amber"
                else:
                    row["confidenceClass"] = "td-red"

    # -- Footer counts from actual data --
    evidence_cards = updated.get("evidence", {}).get("cards", [])
    hyp_list = updated.get("hypotheses", [])
    active_hyps = [h for h in hyp_list if h.get("score") and h["score"] != "?"]
    updated.setdefault("footer", {})
    if evidence_cards:
        domains_covered = len({c.get("name", "").split(":")[0].strip() for c in evidence_cards if c.get("name")})
        updated["footer"]["domainCount"] = f"{domains_covered} of 10"
    if active_hyps:
        updated["footer"]["hypothesesCount"] = f"{len(active_hyps)} Active"

    # -- Track 3: Structure update (identity, discriminators, gaps, TA commentary) --
    # In scaffold mode this was previously discarded. Now we merge it.
    if structure_update and isinstance(structure_update, dict):
        su_intro = structure_update.get("evidence_intro")
        if su_intro and "evidence" in updated:
            updated["evidence"]["intro"] = su_intro
        su_align = structure_update.get("alignment_summary")
        if su_align and "evidence" in updated:
            updated["evidence"]["alignmentSummary"] = su_align
        su_disc = structure_update.get("discriminators")
        if su_disc and isinstance(su_disc, list):
            updated.setdefault("discriminators", {})["rows"] = su_disc
        su_gaps = structure_update.get("gaps")
        if su_gaps and isinstance(su_gaps, dict):
            if not gaps_data:
                updated["gaps"] = su_gaps
        su_identity = structure_update.get("identity")
        if su_identity and isinstance(su_identity, dict):
            for k, v in su_identity.items():
                if v is not None:
                    updated[k] = v
        if structure_update.get("technical_commentary"):
            updated.setdefault("technicalAnalysis", {})["commentary"] = (
                structure_update["technical_commentary"]
            )

    # -- Track 4: Price drivers --
    if price_driver_result and isinstance(price_driver_result, dict):
        updated["priceDrivers"] = price_driver_result

    # -- Track 5: Gold overlay --
    if gold_result and isinstance(gold_result, dict):
        updated["goldAnalysis"] = gold_result

    # -- Rebuild identity table from gathered price data --
    # The scaffold writes N/A for financial fields when Yahoo is blocked.
    if "error" not in price_data:
        _cur = price_data.get("currency", "A$")
        _pr = price_data.get("price", 0)
        _mc = price_data.get("market_cap")
        _ev = price_data.get("enterprise_value")
        _h52 = price_data.get("high_52w", _pr)
        _l52 = price_data.get("low_52w", _pr)
        _fpe = price_data.get("forward_pe")
        _eve = price_data.get("ev_to_ebitda")
        _dy = price_data.get("dividend_yield")
        _dps = price_data.get("dividend_per_share")
        _rev = price_data.get("revenue")

        def _id_fmt(v, cur="A$"):
            if v is None or v == 0:
                return "N/A"
            a = abs(v)
            if a >= 1e12:
                return f"{cur}{v / 1e12:.1f}T"
            if a >= 1e9:
                return f"{cur}{v / 1e9:.1f}B"
            if a >= 1e6:
                return f"{cur}{v / 1e6:.0f}M"
            return f"{cur}{v:,.0f}"

        def _id_ratio(v, s="x"):
            return f"~{v:.1f}{s}" if v else "N/A"

        _range = f"{_cur}{_l52:.2f} \u2013 {_cur}{_h52:.2f}" if _h52 and _h52 > 0 else "N/A"
        _div_str = "N/A"
        if _dps and _dy:
            _div_str = f"{_cur}{_dps:.2f} (~{_dy * 100:.1f}%)"
        elif _dy:
            _div_str = f"~{_dy * 100:.1f}%"

        new_rows = [
            [["Ticker", f"{ticker}.AX", "td-mono"], ["Exchange", "ASX", "td-mono"]],
            [["Market Cap", _id_fmt(_mc), "td-mono"], ["Enterprise Value", _id_fmt(_ev), "td-mono"]],
            [["Share Price", f"{_cur}{_pr}", "td-mono"], ["52-Week Range", _range, "td-mono"]],
            [["Forward P/E", _id_ratio(_fpe), "td-mono"], ["EV/EBITDA", _id_ratio(_eve), "td-mono"]],
            [["Dividend Yield", _div_str, "td-mono"], ["Revenue (FY)", _id_fmt(_rev), "td-mono"]],
        ]

        existing_rows = updated.get("identity", {}).get("rows", [])
        existing_na = sum(
            1 for row in existing_rows for cell in row
            if len(cell) >= 2 and cell[1] in ("N/A", None, "")
        )
        if existing_na >= 4:
            if "identity" not in updated:
                updated["identity"] = {}
            updated["identity"]["rows"] = new_rows
            logger.info(f"[{ticker}] Rebuilt identity table ({existing_na} N/As replaced)")

    # -- Timestamp --
    updated["date"] = now
    updated["_lastRefreshed"] = datetime.now(timezone.utc).isoformat()

    # -- Generation metadata (macro driver snapshot for staleness detection) --
    updated["_generation_meta"] = _build_generation_meta(gathered)

    return updated
