"""
Elite gold equities agent v10.

Architecture:
1. Query corpus: NotebookLM (primary, RAG over uploaded documents) with automatic
   fallback to Gemini processing of local files in data/gold-corpus/{TICKER}/.
2. Ask Claude to extract a rich structured JSON payload.
3. Apply deterministic overlays for stage normalisation, evidence weighting, risk flags,
   proxy valuation, asset-level scenario NAVs, underwriting tests, reconciliation flags,
   study schedule backfill and recommendation logic.

NotebookLM auth (browser cookies) expires every 1-2 weeks. When it does, the agent
falls back to Gemini local corpus automatically. To restore NotebookLM:
  1. Run Get NotebookLM Auth.bat from Desktop
  2. Copy NOTEBOOKLM_AUTH_JSON.txt content
  3. Update NOTEBOOKLM_AUTH_JSON in Railway dashboard

This module is designed as a screening / underwriting agent for listed gold equities.
It is intentionally conservative when data is missing.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import re
import time
from copy import deepcopy
from datetime import date
from typing import Any, Dict, List, Optional

from google import genai
from google.genai import types

try:
    from notebooklm import NotebookLMClient
    _HAS_NOTEBOOKLM = True
except ImportError:
    _HAS_NOTEBOOKLM = False

import config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Result cache -- avoids re-running the full pipeline for the same ticker
# ---------------------------------------------------------------------------

_result_cache: Dict[str, Dict[str, Any]] = {}
_cache_timestamps: Dict[str, float] = {}
_CACHE_TTL_SECONDS = 3600 * 24  # 24 hours


def get_cached_result(ticker: str) -> Optional[Dict[str, Any]]:
    """Return cached gold analysis if available and fresh."""
    ticker = ticker.upper()
    ts = _cache_timestamps.get(ticker)
    if ts is not None and (time.time() - ts) < _CACHE_TTL_SECONDS:
        return _result_cache.get(ticker)
    return None


def cache_result(ticker: str, result: Dict[str, Any]) -> None:
    """Cache a gold analysis result."""
    ticker = ticker.upper()
    _result_cache[ticker] = result
    _cache_timestamps[ticker] = time.time()


# ---------------------------------------------------------------------------
# NotebookLM state -- tracks whether NLM auth is working this session
# ---------------------------------------------------------------------------

_nlm_auth_ok: bool = True  # optimistic; flipped on first auth failure
_nlm_last_error: Optional[str] = None

# ---------------------------------------------------------------------------
# Corpus directory -- local document fallback when NotebookLM is unavailable
# ---------------------------------------------------------------------------

_CORPUS_DIR = os.path.join(config.PROJECT_ROOT, "data", "gold-corpus")
_SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".md"}


def _get_corpus_path(ticker: str) -> str:
    """Return the corpus directory path for a ticker."""
    return os.path.join(_CORPUS_DIR, ticker.upper())


def _list_corpus_files(ticker: str) -> List[str]:
    """List document files in a ticker's corpus directory."""
    corpus_path = _get_corpus_path(ticker)
    if not os.path.isdir(corpus_path):
        return []
    return sorted(
        f for f in os.listdir(corpus_path)
        if os.path.splitext(f)[1].lower() in _SUPPORTED_EXTENSIONS
    )


# ---------------------------------------------------------------------------
# Health check -- verify Gemini API and corpus availability
# ---------------------------------------------------------------------------

_last_successful_check: Optional[float] = None


async def check_gold_health() -> Dict[str, Any]:
    """Check NotebookLM and Gemini connectivity, corpus document availability."""
    global _last_successful_check

    if not config.GEMINI_API_KEY:
        return {"status": "not_configured", "detail": "GEMINI_API_KEY not set"}

    # Check which tickers have local corpus documents
    corpus_status: Dict[str, int] = {}
    if os.path.isdir(_CORPUS_DIR):
        for d in sorted(os.listdir(_CORPUS_DIR)):
            dpath = os.path.join(_CORPUS_DIR, d)
            if os.path.isdir(dpath):
                files = _list_corpus_files(d)
                if files:
                    corpus_status[d] = len(files)

    # NotebookLM status
    nlm_status = "unavailable"
    nlm_detail = None
    if not _HAS_NOTEBOOKLM:
        nlm_detail = "notebooklm-py not installed"
    elif not config.NOTEBOOKLM_AUTH_JSON:
        nlm_status = "not_configured"
        nlm_detail = "NOTEBOOKLM_AUTH_JSON not set"
    elif not config.NOTEBOOKLM_GOLD_NOTEBOOK_ID:
        nlm_status = "not_configured"
        nlm_detail = "NOTEBOOKLM_GOLD_NOTEBOOK_ID not set"
    elif not _nlm_auth_ok:
        nlm_status = "auth_expired"
        nlm_detail = _nlm_last_error or "Cookies expired. Run Get NotebookLM Auth.bat and update NOTEBOOKLM_AUTH_JSON in Railway."
    else:
        nlm_status = "configured"

    # Quick Gemini connectivity test
    try:
        client = genai.Client(api_key=config.GEMINI_API_KEY)
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=config.GEMINI_MODEL,
            contents="Reply with exactly: OK",
            config={"max_output_tokens": 10},
        )
        _last_successful_check = time.time()
        return {
            "status": "healthy",
            "gemini_model": config.GEMINI_MODEL,
            "notebooklm": nlm_status,
            "notebooklm_detail": nlm_detail,
            "corpus_source": "notebooklm" if nlm_status == "configured" else "gemini_local",
            "local_corpus_tickers": corpus_status,
            "cached_tickers": list(_result_cache.keys()),
            "last_successful": _last_successful_check,
        }
    except Exception as exc:
        return {
            "status": "error",
            "detail": str(exc),
            "notebooklm": nlm_status,
            "local_corpus_tickers": corpus_status,
            "last_successful": _last_successful_check,
        }


# ---------------------------------------------------------------------------
# Corpus query set
# ---------------------------------------------------------------------------

_QUERIES: List[tuple[str, str]] = [
    (
        "company_stage_and_asset_base",
        "Classify {ticker} as one of: senior major, multi-asset producer, single-asset producer, emerging producer, turnaround producer, construction developer, near-term developer, pre-feasibility developer, advanced explorer, royalty/streaming. List core assets, stage of each asset, ownership, country, and whether value is concentrated in one asset.",
    ),
    (
        "deposit_type_and_geology",
        "What are the deposit types for {ticker}'s main gold assets? Include orebody style, geometry, depth, continuity, width, strip ratio context, reserve grade, and any geological features that materially affect mineability or valuation.",
    ),
    (
        "resource_reserve_quality",
        "What are {ticker}'s current JORC or NI 43-101 resources and reserves? Include tonnes, grade, ounces, Measured/Indicated/Inferred split, Proven/Probable split, cut-off assumptions, reserve life, and reserve conversion comments.",
    ),
    (
        "metallurgy_and_recovery",
        "Describe the metallurgy for {ticker}'s main assets. Include oxide/transitional/fresh mix, refractory or free-milling characteristics, expected and actual recoveries, deleterious elements, and any metallurgical risks that could impair economics.",
    ),
    (
        "mineability_and_engineering",
        "Describe mining method, mineability, geotechnical constraints, hydrology, ventilation or haulage bottlenecks, infrastructure dependencies, and any engineering issues that could affect throughput, dilution, recovery or costs for {ticker}.",
    ),
    (
        "operating_reconciliation",
        "How have {ticker}'s operations reconciled versus resource model, reserve model, feasibility study and guidance? Include mined grade, plant grade, recovery, throughput versus nameplate, dilution, ore loss, and any guidance misses.",
    ),
    (
        "quarterly_bridge_extract",
        "Extract a quarter-by-quarter or period-by-period operating bridge for {ticker} where available. Include guidance, actual production, AISC, recovery, throughput, grade and any explicit misses versus plan or study assumptions.",
    ),
    (
        "cost_structure",
        "What is {ticker}'s cost structure? Include AISC per ounce, cash cost per ounce, major mining, processing, labour, diesel, power and royalty drivers, and any evidence costs are structurally rising or falling.",
    ),
    (
        "production_profile",
        "What is {ticker}'s recent and guided annual gold production? Include current output, guidance, ramp-up profile, project sequencing, and any stated medium-term production outlook.",
    ),
    (
        "capital_intensity_and_capex",
        "What are {ticker}'s initial capex, sustaining capex and growth capex requirements by key asset? Include capex timing, capex per annual ounce if disclosed or inferable, and any evidence of capex overrun risk.",
    ),
    (
        "balance_sheet_and_funding",
        "What is {ticker}'s current balance sheet position? Include cash, debt, net cash or net debt, liquidity runway, debt maturities, covenants, funding gap, refinancing risk and planned funding sources.",
    ),
    (
        "royalties_streams_and_fiscal",
        "What royalties, streams, profit shares, government interests, tax regimes or fiscal burdens apply to {ticker}'s assets? Include burden by asset where possible and any terms that materially impair NAV.",
    ),
    (
        "development_schedule_and_permitting",
        "For {ticker}'s development assets, what is the expected schedule for permits, financing, construction, commissioning and first production? Include critical path items, approvals, infrastructure dependencies and likely delay risks.",
    ),
    (
        "exploration_and_reserve_replacement",
        "What exploration upside or reserve replacement opportunity exists for {ticker}? Include near-mine versus regional opportunity, reserve replacement record, discovery cost, drilling focus and whether exploration can extend mine life or fill spare mill capacity.",
    ),
    (
        "management_and_execution",
        "Assess {ticker}'s board and management track record. Include mine build experience, operational delivery, guidance accuracy, capital allocation, dilution history, M&A record and incentive alignment.",
    ),
    (
        "jurisdiction_and_esg",
        "What jurisdiction, permitting, social licence, environmental, native title, community or sovereign risks are relevant to {ticker}? Include country exposure by asset and any recent legal or regulatory issues.",
    ),
    (
        "accounting_quality",
        "Identify any accounting or disclosure issues for {ticker}. Include capitalised stripping, sustaining versus growth capex classification, inventory and stockpile treatment, hedge accounting, by-product credits, one-offs, and study assumptions versus reported outcomes.",
    ),
    (
        "peer_valuation",
        "How does {ticker} compare with relevant listed gold peers on P/NAV, EV per reserve ounce, EV per resource ounce, EV per production ounce, reserve life, AISC and jurisdiction? Include any cited peer set, median multiples and valuation commentary.",
    ),
    (
        "valuation_and_sensitivities",
        "What valuation metrics are disclosed or inferable for {ticker}? Include NAV, P/NAV, NPV by project, IRR, payback, gold price sensitivity, FX sensitivity, recovery sensitivity, capex sensitivity and downside cases.",
    ),
    (
        "study_schedule_extract",
        "Extract any annual mine plan or study schedule for {ticker}'s main assets. Include yearly production ounces, grade, recovery, throughput, strip ratio, sustaining capex and mine life if disclosed. If unavailable, state that clearly.",
    ),
    (
        "catalysts_and_failure_modes",
        "What are the key 6–18 month catalysts and principal failure modes for {ticker}? Include reserve updates, studies, financing, commissioning, reconciliation risk, metallurgical risk, cost blowouts and any binary events.",
    ),
]

# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are a senior mining investment committee analyst with the combined skills of a chief geologist, mining engineer, metallurgist, mining executive and top-ranked gold equities analyst.

Analyse the asset before the company, and the company before the stock.
Treat missing information as a risk. Do not fill gaps with confident invention.
Prefer technical reports, quarterly reports and annual reports over presentations or commentary.
Where corpus evidence conflicts, prefer the most technical, most recent, and most directly attributable source.

Label statements internally as fact or inference. Output only JSON.
Use Australian English.

Return ONLY valid JSON matching this schema exactly. If a field is unknown, return null, [] or an explicit information gap.

{
  "ticker": "ASX:XYZ or TSX:XYZ string",
  "company_name": "string",
  "analysis_date": "YYYY-MM-DD",
  "sector": "gold",
  "company_stage": "one of the allowed stage labels",
  "executive_summary": "2-4 sentences with most material fact first",
  "investment_view": {
    "bull_case": "string",
    "base_case": "string",
    "bear_case": "string",
    "what_must_be_true": ["string"],
    "monitoring_trigger": "specific condition"
  },
  "scorecard": {
    "geology_score": 0,
    "engineering_score": 0,
    "financial_score": 0,
    "management_score": 0,
    "jurisdiction_score": 0,
    "composite_score": 0,
    "skew_score": 0
  },
  "key_metrics": {
    "gold_price_assumption_usd_per_oz": null,
    "fx_assumption": null,
    "aisc_per_oz_usd": null,
    "cash_cost_per_oz_usd": null,
    "production_koz_annual": null,
    "resources_koz": null,
    "reserves_koz": null,
    "reserve_grade_gt": null,
    "recovery_pct": null,
    "mine_life_years": null,
    "initial_capex_usd_m": null,
    "sustaining_capex_usd_m": null,
    "net_cash_debt_usd_m": null,
    "liquidity_runway_months": null,
    "flagship_asset_nav_pct": null
  },
  "assets": [
    {
      "name": "string",
      "country": "string or null",
      "ownership_pct": null,
      "stage": "string or null",
      "deposit_type": "string or null",
      "mining_method": "string or null",
      "resources_koz": null,
      "reserves_koz": null,
      "reserve_grade_gt": null,
      "recovery_pct": null,
      "annual_production_koz": null,
      "mine_life_years": null,
      "aisc_per_oz_usd": null,
      "cash_cost_per_oz_usd": null,
      "initial_capex_usd_m": null,
      "sustaining_capex_usd_m": null,
      "royalty_burden_pct": null,
      "disclosed_npv_usd_m": null,
      "study_stage": "string or null",
      "study_schedule": [
        {
          "year_index": 1,
          "production_koz": null,
          "grade_gt": null,
          "recovery_pct": null,
          "throughput_mt": null,
          "strip_ratio": null,
          "sustaining_capex_usd_m": null
        }
      ],
      "technical_red_flags": ["string"],
      "information_gaps": ["string"]
    }
  ],
  "valuation": {
    "enterprise_value_usd_m": null,
    "market_cap_usd_m": null,
    "screening_nav_usd_m": null,
    "ic_nav_usd_m": null,
    "downside_nav_usd_m": null,
    "upside_nav_usd_m": null,
    "p_nav": null,
    "ev_per_reserve_oz_usd": null,
    "ev_per_resource_oz_usd": null,
    "ev_per_production_oz_usd": null,
    "fcf_yield_spot_pct": null,
    "valuation_notes": "string"
  },
  "sensitivities": {
    "gold_price_down_15_nav_usd_m": null,
    "gold_price_up_15_nav_usd_m": null,
    "fx_plus_5pct_nav_usd_m": null,
    "recovery_minus_2pt_nav_usd_m": null,
    "capex_plus_15pct_nav_usd_m": null,
    "delay_6m_nav_usd_m": null
  },
  "peer_frame": {
    "peer_group": ["string"],
    "relative_valuation_comment": "string"
  },
  "risks": {
    "top_failure_modes": ["string"],
    "technical_red_flags": ["string"],
    "hard_risk_flags": ["string"],
    "information_gaps": ["string"]
  },
  "management_assessment": "string",
  "recommendation": {
    "status": "Proceed or Pass or Defer",
    "reason": "string",
    "confidence": 0.0
  },
  "evidence": [
    {
      "label": "string",
      "finding": "string",
      "source": "string",
      "source_type": "technical_report | quarterly | annual_report | presentation | commentary | other",
      "source_quality_score": 1
    }
  ],
  "corpus_sources_queried": ["string"]
}
"""

_ALLOWED_STAGES = {
    "senior_major",
    "multi_asset_producer",
    "single_asset_producer",
    "emerging_producer",
    "turnaround_producer",
    "construction_developer",
    "near_term_developer",
    "pre_feasibility_developer",
    "advanced_explorer",
    "royalty_streaming",
}

_SOURCE_QUALITY = {
    "technical_report": 5,
    "quarterly": 5,
    "annual_report": 4,
    "presentation": 2,
    "commentary": 1,
    "other": 1,
}

_BASE_DISCOUNT_RATE = {
    "senior_major": 0.05,
    "multi_asset_producer": 0.06,
    "single_asset_producer": 0.07,
    "emerging_producer": 0.08,
    "turnaround_producer": 0.10,
    "construction_developer": 0.10,
    "near_term_developer": 0.11,
    "pre_feasibility_developer": 0.13,
    "advanced_explorer": 0.16,
    "royalty_streaming": 0.06,
}

_JURISDICTION_PREMIUM = {
    "australia": 0.00,
    "canada": 0.00,
    "usa": 0.00,
    "united states": 0.00,
    "new zealand": 0.00,
    "finland": 0.01,
    "ghana": 0.03,
    "mexico": 0.03,
    "argentina": 0.05,
    "ecuador": 0.05,
    "tanzania": 0.05,
    "burkina faso": 0.06,
    "mali": 0.07,
    "papua new guinea": 0.06,
    "mongolia": 0.05,
}

# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def run_gold_analysis(ticker: str, force: bool = False, notebook_id: str = "") -> dict:
    ticker = ticker.upper()

    has_nlm = (
        _HAS_NOTEBOOKLM
        and _nlm_auth_ok
        and config.NOTEBOOKLM_AUTH_JSON
        and (config.NOTEBOOKLM_GOLD_NOTEBOOK_ID or notebook_id)
    )
    if not config.GEMINI_API_KEY and not has_nlm:
        raise RuntimeError("Neither GEMINI_API_KEY nor NotebookLM configured")

    if not force:
        cached = get_cached_result(ticker)
        if cached:
            logger.info("Gold agent: returning cached result for %s", ticker)
            return cached

    corpus = await _query_corpus(ticker, notebook_id=notebook_id)
    extracted = await _synthesise(ticker, corpus)
    result = _post_process(extracted, corpus)
    cache_result(ticker, result)
    return result


# ---------------------------------------------------------------------------
# Corpus helpers -- Gemini document processing
# ---------------------------------------------------------------------------


def _load_corpus_parts(ticker: str) -> List[Any]:
    """Load all documents from the ticker's corpus directory as Gemini parts."""
    corpus_path = _get_corpus_path(ticker)
    if not os.path.isdir(corpus_path):
        raise RuntimeError(
            f"No gold corpus directory for {ticker}. "
            f"Create {corpus_path}/ and add PDF/TXT/MD research documents."
        )

    files = _list_corpus_files(ticker)
    if not files:
        raise RuntimeError(
            f"No documents in {corpus_path}/. "
            f"Add PDF, TXT, or MD files containing research for {ticker}."
        )

    parts: List[Any] = []
    for fname in files:
        fpath = os.path.join(corpus_path, fname)
        ext = os.path.splitext(fname)[1].lower()

        if ext == ".pdf":
            with open(fpath, "rb") as fh:
                parts.append(types.Part.from_bytes(data=fh.read(), mime_type="application/pdf"))
            logger.info("Gold corpus: loaded PDF %s (%d bytes)", fname, os.path.getsize(fpath))
        else:
            with open(fpath, "r", encoding="utf-8", errors="replace") as fh:
                text = fh.read()
            parts.append(f"=== Document: {fname} ===\n{text}")
            logger.info("Gold corpus: loaded text %s (%d chars)", fname, len(text))

    return parts


async def _query_corpus(ticker: str, notebook_id: str = "") -> Dict[str, str]:
    """Query corpus: try NotebookLM first, fall back to Gemini local files."""
    global _nlm_auth_ok, _nlm_last_error

    # --- Attempt 1: NotebookLM (primary when configured) ---
    effective_notebook = (
        notebook_id
        or config.NOTEBOOKLM_TICKER_NOTEBOOKS.get(ticker, "")
        or config.NOTEBOOKLM_GOLD_NOTEBOOK_ID
    )
    if (
        _HAS_NOTEBOOKLM
        and _nlm_auth_ok
        and config.NOTEBOOKLM_AUTH_JSON
        and effective_notebook
    ):
        try:
            return await _query_notebooklm(ticker, notebook_id=effective_notebook)
        except Exception as exc:
            err_str = str(exc).lower()
            if "auth" in err_str or "401" in err_str or "cookie" in err_str or "login" in err_str or "forbidden" in err_str or "403" in err_str:
                _nlm_auth_ok = False
                _nlm_last_error = (
                    f"NotebookLM auth expired: {exc}. "
                    "Run Get NotebookLM Auth.bat, copy NOTEBOOKLM_AUTH_JSON.txt content, "
                    "and update the Railway variable."
                )
                logger.warning("NotebookLM auth failed for %s, falling back to Gemini local: %s", ticker, exc)
            else:
                logger.warning("NotebookLM query failed for %s (notebook=%s): %s", ticker, effective_notebook, exc)
                # If using a per-ticker notebook, do not fall through to Gemini local
                if notebook_id:
                    raise RuntimeError(
                        f"NotebookLM query failed for {ticker} with notebook {effective_notebook}: {exc}"
                    )

    # --- Attempt 2: Gemini local corpus (fallback) ---
    # Skip Gemini fallback if no local corpus exists for this ticker
    corpus_path = _get_corpus_path(ticker)
    if not os.path.isdir(corpus_path):
        raise RuntimeError(
            f"NotebookLM query failed for {ticker} and no local corpus exists at {corpus_path}. "
            f"Either fix NotebookLM auth or create the corpus directory with research documents."
        )
    return await _query_gemini_local(ticker)


async def _query_notebooklm(ticker: str, notebook_id: str = "") -> Dict[str, str]:
    """Query NotebookLM for corpus answers.

    Uses NOTEBOOKLM_AUTH_JSON env var for auth (loaded by from_storage()).
    Accepts optional per-ticker notebook_id override.
    """
    notebook_id = notebook_id or config.NOTEBOOKLM_GOLD_NOTEBOOK_ID

    async with await NotebookLMClient.from_storage() as client:
        results: Dict[str, str] = {}
        for key, query in _QUERIES:
            formatted = query.format(ticker=ticker)
            response = await client.chat.ask(
                notebook_id=notebook_id,
                message=formatted,
            )
            text = response.text if hasattr(response, "text") else str(response)
            results[key] = text

    logger.info(
        "Gold corpus (NotebookLM): answered %d/%d questions for %s",
        len(results), len(_QUERIES), ticker,
    )
    return results


async def _query_gemini_local(ticker: str) -> Dict[str, str]:
    """Query local corpus documents using Gemini (fallback)."""
    doc_parts = _load_corpus_parts(ticker)

    # Build all 20 questions into a single prompt
    questions_block = "\n\n".join(
        f"### QUESTION: {key}\n{query.format(ticker=ticker)}"
        for key, query in _QUERIES
    )

    prompt = (
        f"Analyse the uploaded documents for {ticker}. "
        f"Answer each question below based ONLY on the document content. "
        f"If a question cannot be answered from the documents, state that explicitly "
        f"and note what information is missing.\n\n"
        f"{questions_block}\n\n"
        f"Return a JSON object where each key is the QUESTION key (e.g. "
        f"\"company_stage_and_asset_base\") and the value is your detailed answer "
        f"as a string. Include specific numbers, grades, costs, dates, and source "
        f"references where available."
    )

    system_instruction = (
        "You are a senior mining investment analyst. "
        "Answer questions about gold mining companies based strictly on the provided documents. "
        "Be thorough, specific, and quantitative. "
        "Prefer technical reports, quarterly reports, and annual reports over presentations. "
        "Include numbers, grades, costs, dates, and direct quotes where available. "
        "Use Australian English."
    )

    client = genai.Client(api_key=config.GEMINI_API_KEY)

    # Send documents + questions as a single Gemini call
    response = await asyncio.to_thread(
        client.models.generate_content,
        model=config.GEMINI_MODEL,
        contents=[*doc_parts, prompt],
        config={
            "max_output_tokens": 16384,
            "temperature": 0.2,
            "system_instruction": system_instruction,
            "response_mime_type": "application/json",
        },
    )

    raw = (response.text or "").strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        raw = raw.rsplit("```", 1)[0]

    corpus: Dict[str, str] = json.loads(raw)

    # Ensure all query keys exist
    for key, _ in _QUERIES:
        if key not in corpus:
            corpus[key] = "(not answered by Gemini -- document may lack this information)"

    logger.info(
        "Gold corpus: Gemini answered %d/%d questions for %s",
        sum(1 for k, _ in _QUERIES if k in corpus and not corpus[k].startswith("(not answered")),
        len(_QUERIES),
        ticker,
    )
    return corpus


async def _synthesise(ticker: str, corpus: Dict[str, str]) -> Dict[str, Any]:
    client = config.get_anthropic_client()
    corpus_block = "\n\n".join(f"### {k.upper()}\n{v}" for k, v in corpus.items())
    user_message = (
        f"Ticker: {ticker}\n"
        f"Analysis date: {date.today().isoformat()}\n\n"
        "Below is raw corpus output from document analysis. Extract the structured mining underwriting JSON. "
        "Prefer direct facts from technical reports, quarterlies and annual reports.\n\n"
        f"{corpus_block}\n\n"
        "Return only valid JSON."
    )

    response = client.messages.create(
        model=config.ANTHROPIC_MODEL,
        max_tokens=8192,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )
    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    return json.loads(raw)


# ---------------------------------------------------------------------------
# Deterministic overlay
# ---------------------------------------------------------------------------


def _post_process(data: Dict[str, Any], corpus: Dict[str, str]) -> Dict[str, Any]:
    data = deepcopy(data)
    data.setdefault("analysis_date", date.today().isoformat())
    data["sector"] = "gold"

    _normalise_stage(data)
    _normalise_evidence(data)
    _normalise_assets(data)
    _backfill_schedules_from_corpus(data, corpus)
    _backfill_quarterly_bridge(data, corpus)
    _backfill_key_metrics(data)
    _score_evidence_weight(data)
    _derive_asset_valuations(data)
    _derive_company_valuation(data)
    _derive_peer_frame_overlay(data, corpus)
    _derive_sensitivities(data)
    _apply_hard_risk_flags(data, corpus)
    _finalise_recommendation(data)
    _attach_metadata(data)
    _flatten_for_frontend(data)
    return data


# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------


def _normalise_stage(data: Dict[str, Any]) -> None:
    stage = _slug(data.get("company_stage"))
    alias_map = {
        "seniormajor": "senior_major",
        "majorsenior": "senior_major",
        "producer": "single_asset_producer",
        "multiassetproducer": "multi_asset_producer",
        "singleassetproducer": "single_asset_producer",
        "construction": "construction_developer",
        "developer": "near_term_developer",
        "prefeasibilitydeveloper": "pre_feasibility_developer",
        "advancedexplorer": "advanced_explorer",
        "royalty": "royalty_streaming",
        "streaming": "royalty_streaming",
    }
    stage = alias_map.get(stage, stage)
    if stage not in _ALLOWED_STAGES:
        stage = _infer_stage_from_assets(data)
    data["company_stage"] = stage


def _infer_stage_from_assets(data: Dict[str, Any]) -> str:
    assets = data.get("assets") or []
    stages = {_slug(a.get("stage")) for a in assets if isinstance(a, dict)}
    if "royalty" in stages or "streaming" in stages:
        return "royalty_streaming"
    if any("producer" in s for s in stages) and len(assets) >= 3:
        return "multi_asset_producer"
    if any("emerging" in s for s in stages):
        return "emerging_producer"
    if any("producer" in s for s in stages):
        return "single_asset_producer"
    if any("construction" in s for s in stages):
        return "construction_developer"
    if any("developer" in s for s in stages):
        return "near_term_developer"
    return "advanced_explorer"


def _normalise_evidence(data: Dict[str, Any]) -> None:
    ev = data.get("evidence") or []
    out = []
    for item in ev:
        if not isinstance(item, dict):
            continue
        source_type = item.get("source_type") or _infer_source_type(item.get("source") or "")
        source_type = source_type if source_type in _SOURCE_QUALITY else "other"
        item["source_type"] = source_type
        item["source_quality_score"] = int(item.get("source_quality_score") or _SOURCE_QUALITY[source_type])
        out.append(item)
    data["evidence"] = out


def _normalise_assets(data: Dict[str, Any]) -> None:
    assets = data.get("assets") or []
    out: List[Dict[str, Any]] = []
    for a in assets:
        if not isinstance(a, dict):
            continue
        a.setdefault("technical_red_flags", [])
        a.setdefault("information_gaps", [])
        a.setdefault("study_schedule", [])
        a["country"] = a.get("country") or None
        a["stage"] = a.get("stage") or data.get("company_stage")
        if isinstance(a.get("study_schedule"), list):
            cleaned_sched = []
            for yr in a["study_schedule"]:
                if isinstance(yr, dict):
                    cleaned_sched.append(
                        {
                            "year_index": _num(yr.get("year_index"), as_int=True) or 1,
                            "production_koz": _num(yr.get("production_koz")),
                            "grade_gt": _num(yr.get("grade_gt")),
                            "recovery_pct": _num(yr.get("recovery_pct")),
                            "throughput_mt": _num(yr.get("throughput_mt")),
                            "strip_ratio": _num(yr.get("strip_ratio")),
                            "sustaining_capex_usd_m": _num(yr.get("sustaining_capex_usd_m")),
                        }
                    )
            a["study_schedule"] = cleaned_sched
        out.append(a)
    data["assets"] = out


def _backfill_schedules_from_corpus(data: Dict[str, Any], corpus: Dict[str, str]) -> None:
    raw = corpus.get("study_schedule_extract") or ""
    if not raw:
        return
    assets = data.get("assets") or []
    if not assets:
        return

    parsed_by_asset = _parse_study_schedules(raw, [a.get("name") for a in assets if isinstance(a, dict)])
    for a in assets:
        if not isinstance(a, dict):
            continue
        existing = a.get("study_schedule") or []
        if existing:
            continue
        name = (a.get("name") or "").strip().lower()
        candidate = parsed_by_asset.get(name) or parsed_by_asset.get("__generic__")
        if candidate:
            a["study_schedule"] = candidate
            _push_unique(a.setdefault("information_gaps", []), "Study schedule backfilled from raw corpus text")


def _parse_study_schedules(raw: str, asset_names: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    schedules: Dict[str, List[Dict[str, Any]]] = {}
    current = "__generic__"
    asset_lookup = {str(n).strip().lower(): str(n).strip().lower() for n in asset_names if n}
    year_pat = re.compile(r"(?:^|\b)(?:year\s*)?(\d{1,2})(?:\b|:)")
    for ln in lines:
        lower = ln.lower()
        matched_asset = None
        for asset in asset_lookup:
            if asset and asset in lower:
                matched_asset = asset
                break
        if matched_asset:
            current = matched_asset
            schedules.setdefault(current, [])

        y = year_pat.search(lower)
        if not y:
            continue
        year_index = int(y.group(1))
        row = {
            "year_index": year_index,
            "production_koz": _extract_metric(lower, [r"(\d+(?:\.\d+)?)\s*koz", r"production[^\d]*(\d+(?:\.\d+)?)", r"gold[^\d]*(\d+(?:\.\d+)?)\s*ko?z"]),
            "grade_gt": _extract_metric(lower, [r"(\d+(?:\.\d+)?)\s*g/t", r"grade[^\d]*(\d+(?:\.\d+)?)"]),
            "recovery_pct": _extract_metric(lower, [r"(\d+(?:\.\d+)?)\s*%\s*recovery", r"recovery[^\d]*(\d+(?:\.\d+)?)"]),
            "throughput_mt": _extract_metric(lower, [r"throughput[^\d]*(\d+(?:\.\d+)?)\s*mt", r"(\d+(?:\.\d+)?)\s*mt\b"]),
            "strip_ratio": _extract_metric(lower, [r"strip[^\d]*(\d+(?:\.\d+)?)", r"ratio[^\d]*(\d+(?:\.\d+)?)"]),
            "sustaining_capex_usd_m": _extract_metric(lower, [r"sustaining[^\d]*(\d+(?:\.\d+)?)\s*m", r"capex[^\d]*(\d+(?:\.\d+)?)\s*m"]),
        }
        if any(v is not None for k, v in row.items() if k != "year_index"):
            schedules.setdefault(current, []).append(row)

    for k, rows in list(schedules.items()):
        dedup = {row["year_index"]: row for row in rows}
        clean = [dedup[i] for i in sorted(dedup)]
        if clean:
            schedules[k] = clean
        else:
            del schedules[k]
    return schedules


def _backfill_quarterly_bridge(data: Dict[str, Any], corpus: Dict[str, str]) -> None:
    raw = corpus.get("quarterly_bridge_extract") or ""
    if not raw:
        return
    bridge = _parse_quarterly_bridge(raw)
    if not bridge:
        return
    data.setdefault("metadata", {})["quarterly_bridge"] = bridge


def _parse_quarterly_bridge(raw: str) -> List[Dict[str, Any]]:
    rows = []
    for ln in [x.strip() for x in raw.splitlines() if x.strip()]:
        lower = ln.lower()
        period = _extract_period(lower)
        if not period:
            continue
        row = {
            "period": period,
            "guided_production_koz": _extract_metric(lower, [r"guid(?:ance|ed)[^\d]*(\d+(?:\.\d+)?)\s*koz", r"target[^\d]*(\d+(?:\.\d+)?)\s*koz"]),
            "actual_production_koz": _extract_metric(lower, [r"actual[^\d]*(\d+(?:\.\d+)?)\s*koz", r"produced[^\d]*(\d+(?:\.\d+)?)\s*koz", r"production[^\d]*(\d+(?:\.\d+)?)\s*koz"]),
            "aisc_per_oz_usd": _extract_metric(lower, [r"aisc[^\d]*(\d+(?:\.\d+)?)", r"all-in sustaining[^\d]*(\d+(?:\.\d+)?)"]),
            "recovery_pct": _extract_metric(lower, [r"recovery[^\d]*(\d+(?:\.\d+)?)"]),
            "throughput_mt": _extract_metric(lower, [r"throughput[^\d]*(\d+(?:\.\d+)?)\s*mt"]),
            "grade_gt": _extract_metric(lower, [r"grade[^\d]*(\d+(?:\.\d+)?)", r"(\d+(?:\.\d+)?)\s*g/t"]),
        }
        if any(v is not None for k, v in row.items() if k != "period"):
            rows.append(row)
    return rows[:12]


def _backfill_key_metrics(data: Dict[str, Any]) -> None:
    km = data.setdefault("key_metrics", {})
    assets = data.get("assets") or []

    def asset_sum(key: str) -> Optional[float]:
        vals = [_num(a.get(key)) for a in assets]
        vals = [v for v in vals if v is not None]
        return round(sum(vals), 2) if vals else None

    def asset_wavg(key: str, weight_key: str = "annual_production_koz") -> Optional[float]:
        numer = 0.0
        denom = 0.0
        for a in assets:
            v = _num(a.get(key))
            w = _num(a.get(weight_key))
            if v is not None and w is not None and w > 0:
                numer += v * w
                denom += w
        return round(numer / denom, 2) if denom > 0 else None

    km["production_koz_annual"] = _coalesce_num(km.get("production_koz_annual"), asset_sum("annual_production_koz"))
    km["resources_koz"] = _coalesce_num(km.get("resources_koz"), asset_sum("resources_koz"))
    km["reserves_koz"] = _coalesce_num(km.get("reserves_koz"), asset_sum("reserves_koz"))
    km["reserve_grade_gt"] = _coalesce_num(km.get("reserve_grade_gt"), asset_wavg("reserve_grade_gt", "reserves_koz"))
    km["recovery_pct"] = _coalesce_num(km.get("recovery_pct"), asset_wavg("recovery_pct"))
    km["aisc_per_oz_usd"] = _coalesce_num(km.get("aisc_per_oz_usd"), asset_wavg("aisc_per_oz_usd"))
    km["cash_cost_per_oz_usd"] = _coalesce_num(km.get("cash_cost_per_oz_usd"), asset_wavg("cash_cost_per_oz_usd"))
    km["initial_capex_usd_m"] = _coalesce_num(km.get("initial_capex_usd_m"), asset_sum("initial_capex_usd_m"))
    km["sustaining_capex_usd_m"] = _coalesce_num(km.get("sustaining_capex_usd_m"), asset_sum("sustaining_capex_usd_m"))

    if km.get("mine_life_years") is None:
        res = _num(km.get("reserves_koz"))
        prod = _num(km.get("production_koz_annual"))
        if res and prod and prod > 0:
            km["mine_life_years"] = round(res / prod, 1)

    vals = [_num(a.get("disclosed_npv_usd_m")) or _num(a.get("base_nav_usd_m")) for a in assets]
    vals = [v for v in vals if v is not None and v > 0]
    flagship_nav = round(max(vals) / sum(vals) * 100, 1) if vals and sum(vals) > 0 else None
    km["flagship_asset_nav_pct"] = _coalesce_num(km.get("flagship_asset_nav_pct"), flagship_nav)


# ---------------------------------------------------------------------------
# Evidence and scoring
# ---------------------------------------------------------------------------


def _score_evidence_weight(data: Dict[str, Any]) -> None:
    scorecard = data.setdefault("scorecard", {})
    for k in [
        "geology_score",
        "engineering_score",
        "financial_score",
        "management_score",
        "jurisdiction_score",
        "composite_score",
        "skew_score",
    ]:
        scorecard[k] = int(_num(scorecard.get(k), as_int=True) or 0)

    ev = data.get("evidence") or []
    avg_quality = sum(e.get("source_quality_score", 1) for e in ev) / max(1, len(ev))
    composite = scorecard.get("composite_score") or 0
    if composite == 0:
        base = (
            scorecard["geology_score"]
            + scorecard["engineering_score"]
            + scorecard["financial_score"]
            + scorecard["management_score"]
            + scorecard["jurisdiction_score"]
        )
        composite = round(base / 5) if base else 0
    composite = min(100, max(0, round(composite + (avg_quality - 3) * 3)))
    scorecard["composite_score"] = composite

    skew = scorecard.get("skew_score") or 0
    if skew == 0:
        valuation = data.get("valuation") or {}
        p_nav = _num(valuation.get("p_nav"))
        skew = 50
        if p_nav is not None:
            if p_nav < 0.6:
                skew += 10
            elif p_nav > 1.2:
                skew -= 10
        if composite >= 70:
            skew += 8
        elif composite <= 40:
            skew -= 8
    scorecard["skew_score"] = int(min(80, max(5, round(skew))))


# ---------------------------------------------------------------------------
# Valuation
# ---------------------------------------------------------------------------


def _derive_asset_valuations(data: Dict[str, Any]) -> None:
    stage = data.get("company_stage") or "advanced_explorer"
    gold = _num((data.get("key_metrics") or {}).get("gold_price_assumption_usd_per_oz")) or 2900.0

    for a in data.get("assets") or []:
        if _num(a.get("disclosed_npv_usd_m")) is not None:
            disclosed = _num(a.get("disclosed_npv_usd_m"))
            a["base_nav_usd_m"] = round(disclosed, 1)
            a["downside_nav_usd_m"] = round(disclosed * 0.8, 1)
            a["upside_nav_usd_m"] = round(disclosed * 1.15, 1)
            a["ic_nav_usd_m"] = round(disclosed * 0.9, 1)
            a["discount_rate"] = round(_discount_rate(a, stage), 4)
            continue

        aisc = _num(a.get("aisc_per_oz_usd")) or _num((data.get("key_metrics") or {}).get("aisc_per_oz_usd"))
        prod = _num(a.get("annual_production_koz"))
        reserves = _num(a.get("reserves_koz"))
        mine_life = _num(a.get("mine_life_years"))
        init_capex = _num(a.get("initial_capex_usd_m")) or 0.0
        royalty = (_num(a.get("royalty_burden_pct")) or 0.0) / 100.0
        dr = _discount_rate(a, stage)
        a["discount_rate"] = round(dr, 4)

        if a.get("study_schedule"):
            base_nav = _schedule_npv(a, gold, dr, scenario="base")
            down_nav = _schedule_npv(a, gold, dr, scenario="downside")
            up_nav = _schedule_npv(a, gold, dr, scenario="upside")
        elif prod and aisc and (mine_life or reserves):
            life = mine_life or max(3.0, round((reserves / prod) if prod else 5.0, 1))
            base_nav = _proxy_schedule_npv(prod, life, gold, aisc, init_capex, _infer_sustaining_annual(a), dr, royalty, "base", _slug(a.get("stage")) or stage)
            down_nav = _proxy_schedule_npv(prod, life, gold, aisc, init_capex, _infer_sustaining_annual(a), dr, royalty, "downside", _slug(a.get("stage")) or stage)
            up_nav = _proxy_schedule_npv(prod, life, gold, aisc, init_capex, _infer_sustaining_annual(a), dr, royalty, "upside", _slug(a.get("stage")) or stage)
        elif reserves:
            oz_multiple = 180 if "producer" in stage else 90 if "developer" in stage else 35
            base_nav = max(0.0, reserves * oz_multiple / 1000.0 - init_capex)
            down_nav = base_nav * 0.7
            up_nav = base_nav * 1.2
        else:
            base_nav = down_nav = up_nav = None
            _push_unique(a.setdefault("information_gaps", []), "Insufficient asset data for valuation")

        if base_nav is not None:
            a["base_nav_usd_m"] = round(base_nav, 1)
            a["downside_nav_usd_m"] = round(down_nav, 1)
            a["upside_nav_usd_m"] = round(up_nav, 1)
            a["ic_nav_usd_m"] = round(base_nav * 0.85, 1)


def _derive_company_valuation(data: Dict[str, Any]) -> None:
    valuation = data.setdefault("valuation", {})
    km = data.get("key_metrics") or {}
    assets = data.get("assets") or []

    ev = _coalesce_num(valuation.get("enterprise_value_usd_m"), valuation.get("market_cap_usd_m"))
    valuation["enterprise_value_usd_m"] = ev

    screening_nav = _num(valuation.get("screening_nav_usd_m"))
    ic_nav = _num(valuation.get("ic_nav_usd_m"))
    downside_nav = _num(valuation.get("downside_nav_usd_m"))
    upside_nav = _num(valuation.get("upside_nav_usd_m"))

    asset_screening = sum((_num(a.get("base_nav_usd_m")) or 0.0) for a in assets)
    asset_ic = sum((_num(a.get("ic_nav_usd_m")) or 0.0) for a in assets)
    asset_down = sum((_num(a.get("downside_nav_usd_m")) or 0.0) for a in assets)
    asset_up = sum((_num(a.get("upside_nav_usd_m")) or 0.0) for a in assets)

    screening_nav = screening_nav if screening_nav is not None else (round(asset_screening, 1) if asset_screening > 0 else _company_proxy_nav(data))
    ic_nav = ic_nav if ic_nav is not None else (round(asset_ic, 1) if asset_ic > 0 else round(screening_nav * 0.88, 1) if screening_nav else None)
    downside_nav = downside_nav if downside_nav is not None else (round(asset_down, 1) if asset_down > 0 else round(screening_nav * 0.7, 1) if screening_nav else None)
    upside_nav = upside_nav if upside_nav is not None else (round(asset_up, 1) if asset_up > 0 else round(screening_nav * 1.2, 1) if screening_nav else None)

    valuation["screening_nav_usd_m"] = screening_nav
    valuation["ic_nav_usd_m"] = ic_nav
    valuation["downside_nav_usd_m"] = downside_nav
    valuation["upside_nav_usd_m"] = upside_nav

    if ev is not None and ic_nav and ic_nav > 0:
        valuation["p_nav"] = round(ev / ic_nav, 2)

    reserves = _num(km.get("reserves_koz"))
    resources = _num(km.get("resources_koz"))
    production = _num(km.get("production_koz_annual"))
    if ev is not None and reserves and reserves > 0:
        valuation["ev_per_reserve_oz_usd"] = round(ev * 1_000_000 / (reserves * 1000), 1)
    if ev is not None and resources and resources > 0:
        valuation["ev_per_resource_oz_usd"] = round(ev * 1_000_000 / (resources * 1000), 1)
    if ev is not None and production and production > 0:
        valuation["ev_per_production_oz_usd"] = round(ev * 1_000_000 / (production * 1000), 1)

    gold = _num(km.get("gold_price_assumption_usd_per_oz")) or 2900.0
    aisc = _num(km.get("aisc_per_oz_usd"))
    if ev is not None and production and aisc:
        margin = max(0.0, gold - aisc)
        indicative_fcf = production * 1000 * margin * 0.55 / 1_000_000
        valuation["fcf_yield_spot_pct"] = round(indicative_fcf / ev * 100, 1) if ev > 0 else None

    if not valuation.get("valuation_notes"):
        valuation["valuation_notes"] = "Screening NAV and IC NAV use disclosed project NPVs where available, otherwise conservative asset-level proxy DCF assumptions with stage and jurisdiction overlays."


def _company_proxy_nav(data: Dict[str, Any]) -> Optional[float]:
    km = data.get("key_metrics") or {}
    stage = data.get("company_stage") or "advanced_explorer"
    gold = _num(km.get("gold_price_assumption_usd_per_oz")) or 2900.0
    aisc = _num(km.get("aisc_per_oz_usd"))
    prod = _num(km.get("production_koz_annual"))
    reserves = _num(km.get("reserves_koz"))
    mine_life = _num(km.get("mine_life_years"))
    capex = _num(km.get("initial_capex_usd_m")) or 0.0

    if prod and aisc and mine_life:
        dr = _BASE_DISCOUNT_RATE.get(stage, 0.10)
        return round(
            _proxy_schedule_npv(prod, mine_life, gold, aisc, capex, _infer_company_sustaining(data), dr, 0.02, "base", stage),
            1,
        )
    if reserves:
        oz_multiple = 180 if "producer" in stage else 90 if "developer" in stage else 35
        return round(max(0.0, reserves * oz_multiple / 1000.0 - capex), 1)
    return None


def _derive_peer_frame_overlay(data: Dict[str, Any], corpus: Dict[str, str]) -> None:
    peer = data.setdefault("peer_frame", {})
    peer.setdefault("peer_group", [])
    valuation = data.get("valuation") or {}
    comment = peer.get("relative_valuation_comment") or ""
    p_nav = _num(valuation.get("p_nav"))
    peer_text = (comment + "\n" + (corpus.get("peer_valuation") or "")).lower()

    median_pnav = _extract_metric(peer_text, [r"median\s*p/?nav[^\d]*(\d+(?:\.\d+)?)", r"peer\s*p/?nav[^\d]*(\d+(?:\.\d+)?)"])
    median_ev_res = _extract_metric(peer_text, [r"median\s*ev[^\n]*reserve[^\d]*(\d+(?:\.\d+)?)", r"peer\s*ev[^\n]*reserve[^\d]*(\d+(?:\.\d+)?)"])
    peer["peer_median_p_nav"] = median_pnav
    peer["peer_median_ev_per_reserve_oz_usd"] = median_ev_res
    if p_nav is not None and median_pnav is not None and median_pnav > 0:
        peer["p_nav_discount_premium_pct"] = round((p_nav / median_pnav - 1) * 100, 1)
    else:
        peer["p_nav_discount_premium_pct"] = None

    if not peer.get("relative_valuation_comment"):
        if p_nav is not None and median_pnav is not None:
            delta = (p_nav / median_pnav - 1) * 100
            if delta <= -15:
                peer["relative_valuation_comment"] = "Trades at a discount to peer P/NAV, subject to asset and funding quality."
            elif delta >= 15:
                peer["relative_valuation_comment"] = "Trades at a premium to peer P/NAV, requiring stronger delivery or asset quality to justify."
            else:
                peer["relative_valuation_comment"] = "Trades broadly in line with peer P/NAV on the available corpus evidence."
        elif p_nav is not None:
            peer["relative_valuation_comment"] = "Relative valuation comment inferred from internal IC NAV because peer median was not extractable from corpus."
        else:
            peer["relative_valuation_comment"] = "Relative valuation not assessable from corpus."


def _derive_sensitivities(data: Dict[str, Any]) -> None:
    valuation = data.setdefault("valuation", {})
    sens = data.setdefault("sensitivities", {})
    base = _num(valuation.get("ic_nav_usd_m")) or _num(valuation.get("screening_nav_usd_m"))
    if base is None:
        return
    sens["gold_price_down_15_nav_usd_m"] = sens.get("gold_price_down_15_nav_usd_m") or round(base * 0.78, 1)
    sens["gold_price_up_15_nav_usd_m"] = sens.get("gold_price_up_15_nav_usd_m") or round(base * 1.18, 1)
    sens["fx_plus_5pct_nav_usd_m"] = sens.get("fx_plus_5pct_nav_usd_m") or round(base * 0.96, 1)
    sens["recovery_minus_2pt_nav_usd_m"] = sens.get("recovery_minus_2pt_nav_usd_m") or round(base * 0.93, 1)
    sens["capex_plus_15pct_nav_usd_m"] = sens.get("capex_plus_15pct_nav_usd_m") or round(base - ((_num((data.get("key_metrics") or {}).get("initial_capex_usd_m")) or 0.0) * 0.15), 1)
    sens["delay_6m_nav_usd_m"] = sens.get("delay_6m_nav_usd_m") or round(base * 0.94, 1)


# ---------------------------------------------------------------------------
# Risk flags and recommendation
# ---------------------------------------------------------------------------


def _apply_hard_risk_flags(data: Dict[str, Any], corpus: Dict[str, str]) -> None:
    risks = data.setdefault("risks", {})
    risks.setdefault("hard_risk_flags", [])
    risks.setdefault("technical_red_flags", [])
    risks.setdefault("top_failure_modes", [])
    risks.setdefault("information_gaps", [])

    km = data.get("key_metrics") or {}
    valuation = data.get("valuation") or {}
    stage = data.get("company_stage") or "advanced_explorer"
    gold = _num(km.get("gold_price_assumption_usd_per_oz")) or 2900.0
    aisc = _num(km.get("aisc_per_oz_usd"))
    mine_life = _num(km.get("mine_life_years"))
    runway = _num(km.get("liquidity_runway_months"))
    capex = _num(km.get("initial_capex_usd_m"))
    prod = _num(km.get("production_koz_annual"))
    p_nav = _num(valuation.get("p_nav"))
    downside_nav = _num(valuation.get("downside_nav_usd_m"))
    ev = _num(valuation.get("enterprise_value_usd_m"))
    flagship = _num(km.get("flagship_asset_nav_pct"))

    if aisc and aisc > gold * 0.85:
        _push_unique(risks["hard_risk_flags"], "Margin-risk: AISC exceeds 85% of spot gold price")
    if mine_life and mine_life < 5:
        _push_unique(risks["hard_risk_flags"], "Reserve-life risk: mine life below 5 years")
    if runway is not None and runway < 12:
        _push_unique(risks["hard_risk_flags"], "Funding risk: liquidity runway below 12 months")
    if capex and prod and "developer" in stage and capex / prod > 2500:
        _push_unique(risks["hard_risk_flags"], "Capex-intensity risk: initial capex exceeds US$2,500 per annual ounce")
    if p_nav and p_nav > 1.2:
        _push_unique(risks["hard_risk_flags"], "Valuation risk: trades above 1.2x IC NAV")
    if downside_nav and ev and ev > downside_nav:
        _push_unique(risks["hard_risk_flags"], "Downside coverage risk: EV exceeds downside NAV")
    if flagship and flagship > 80:
        _push_unique(risks["hard_risk_flags"], "Concentration risk: flagship asset exceeds 80% of NAV")

    corpus_blob = "\n".join(corpus.values()).lower()
    for needle, flag in [
        ("reconciliation", "Reconciliation risk flagged in corpus"),
        ("below guidance", "Execution risk: production below guidance referenced"),
        ("guidance miss", "Execution risk: guidance miss referenced"),
        ("missed guidance", "Execution risk: missed guidance referenced"),
        ("preg-robb", "Metallurgical complexity: preg-robbing risk"),
        ("refractory", "Metallurgical complexity: refractory ore"),
        ("dilution", "Operational risk: dilution pressure referenced"),
        ("ore loss", "Operational risk: ore loss referenced"),
        ("capitalised stripping", "Accounting risk: capitalised stripping treatment mentioned"),
        ("cost overrun", "Development risk: capex overrun mentioned"),
        ("delay", "Schedule risk: delays referenced"),
        ("commissioning", "Commissioning risk referenced in corpus"),
    ]:
        if needle in corpus_blob:
            _push_unique(risks["technical_red_flags"], flag)

    bridge = ((data.get("metadata") or {}).get("quarterly_bridge") or [])
    if bridge:
        misses = 0
        cost_spikes = 0
        for row in bridge:
            guided = _num(row.get("guided_production_koz"))
            actual = _num(row.get("actual_production_koz"))
            if guided and actual and actual < guided * 0.92:
                misses += 1
            aisc_row = _num(row.get("aisc_per_oz_usd"))
            if aisc_row and gold and aisc_row > gold * 0.9:
                cost_spikes += 1
        if misses >= 2:
            _push_unique(risks["hard_risk_flags"], "Delivery risk: multiple periods of production below guidance")
        if cost_spikes >= 2:
            _push_unique(risks["hard_risk_flags"], "Cost risk: multiple periods with AISC near spot gold price")

    for a in data.get("assets") or []:
        for flag in a.get("technical_red_flags") or []:
            _push_unique(risks["technical_red_flags"], flag)
        for gap in a.get("information_gaps") or []:
            _push_unique(risks["information_gaps"], gap)

    for key in ["hard_risk_flags", "technical_red_flags", "top_failure_modes", "information_gaps"]:
        risks[key] = _unique_preserve(risks.get(key) or [])[:12]


def _finalise_recommendation(data: Dict[str, Any]) -> None:
    rec = data.setdefault("recommendation", {})
    scorecard = data.get("scorecard") or {}
    risks = data.get("risks") or {}
    valuation = data.get("valuation") or {}

    composite = _num(scorecard.get("composite_score"), as_int=True) or 0
    hard_flags = len(risks.get("hard_risk_flags") or [])
    p_nav = _num(valuation.get("p_nav"))
    peer_prem = _num((data.get("peer_frame") or {}).get("p_nav_discount_premium_pct"))

    status = rec.get("status")
    if status not in {"Proceed", "Pass", "Defer"}:
        if composite >= 65 and hard_flags <= 2 and (p_nav is None or p_nav <= 0.9) and (peer_prem is None or peer_prem <= 10):
            status = "Proceed"
        elif composite < 45 or hard_flags >= 5 or (p_nav is not None and p_nav > 1.3) or (peer_prem is not None and peer_prem > 25):
            status = "Pass"
        else:
            status = "Defer"
    rec["status"] = status

    if not rec.get("reason"):
        if status == "Proceed":
            rec["reason"] = "Asset quality and valuation appear supportive relative to the hard-risk profile."
        elif status == "Pass":
            rec["reason"] = "Risk concentration, weak economics or valuation leave insufficient margin of safety."
        else:
            rec["reason"] = "Further technical, operating or financing evidence is required before underwriting."

    if rec.get("confidence") is None:
        conf = 0.55 + min(0.25, composite / 400) - min(0.2, hard_flags * 0.03)
        if len((data.get("evidence") or [])) < 6:
            conf -= 0.08
        rec["confidence"] = round(max(0.05, min(0.95, conf)), 2)


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------


def _discount_rate(asset: Dict[str, Any], company_stage: str) -> float:
    stage = _slug(asset.get("stage")) or company_stage
    base = _BASE_DISCOUNT_RATE.get(stage, _BASE_DISCOUNT_RATE.get(company_stage, 0.10))
    country = (asset.get("country") or "").strip().lower()
    premium = _JURISDICTION_PREMIUM.get(country, 0.02 if country else 0.02)
    return min(0.20, max(0.05, base + premium))


def _schedule_npv(asset: Dict[str, Any], gold_price: float, discount_rate: float, scenario: str = "base") -> float:
    schedule = asset.get("study_schedule") or []
    if not schedule:
        return 0.0
    royalty = (_num(asset.get("royalty_burden_pct")) or 0.0) / 100.0
    init_capex = _num(asset.get("initial_capex_usd_m")) or 0.0
    cash_cost = _num(asset.get("cash_cost_per_oz_usd"))
    aisc = _num(asset.get("aisc_per_oz_usd")) or cash_cost or (gold_price * 0.65)

    gp_mult, capex_mult, recovery_shift, delay_half = _scenario_params(scenario)
    gp = gold_price * gp_mult

    npv = -init_capex * capex_mult
    for row in schedule:
        year_idx = int(_num(row.get("year_index"), as_int=True) or 1)
        prod = _num(row.get("production_koz")) or 0.0
        rec = _num(row.get("recovery_pct")) or _num(asset.get("recovery_pct")) or 92.0
        sust = _num(row.get("sustaining_capex_usd_m")) or _infer_sustaining_annual(asset)
        strip_ratio = _num(row.get("strip_ratio")) or 0.0
        rec = max(50.0, rec + recovery_shift)
        effective_prod_oz = prod * 1000 * rec / max(1.0, (_num(row.get("recovery_pct")) or rec))
        strip_penalty = 1.0 - min(0.08, max(0.0, strip_ratio - 6.0) * 0.01)
        margin = max(0.0, gp * (1 - royalty) - aisc)
        annual_cf = effective_prod_oz * margin * strip_penalty / 1_000_000 - sust
        annual_cf *= 0.72 if annual_cf > 0 else 1.0
        t = year_idx + (0.5 if delay_half else 0.0)
        npv += annual_cf / ((1 + discount_rate) ** t)

    npv -= max(2.0, _infer_sustaining_annual(asset) * 0.5) / ((1 + discount_rate) ** (len(schedule) + 1))
    return max(0.0, npv)


def _proxy_schedule_npv(
    annual_koz: float,
    mine_life: float,
    gold_price: float,
    aisc: float,
    initial_capex: float,
    sustaining_annual: float,
    discount_rate: float,
    royalty_pct: float,
    scenario: str,
    stage: str,
) -> float:
    gp_mult, capex_mult, _recovery_shift, delay_half = _scenario_params(scenario)
    gp = gold_price * gp_mult
    life = max(1, int(math.ceil(mine_life)))
    npv = -(initial_capex * capex_mult)
    derisk = 1.0
    if "developer" in stage:
        derisk = 0.9 if scenario == "base" else 0.8 if scenario == "downside" else 0.95
    elif "explorer" in stage:
        derisk = 0.5 if scenario == "base" else 0.35 if scenario == "downside" else 0.6

    for year in range(1, life + 1):
        prod_factor = _prod_factor(year, life)
        annual_prod_oz = annual_koz * 1000 * prod_factor
        margin = max(0.0, gp * (1 - royalty_pct) - aisc)
        annual_cf = annual_prod_oz * margin / 1_000_000 - sustaining_annual * prod_factor
        annual_cf *= 0.72 if annual_cf > 0 else 1.0
        t = year + (0.5 if delay_half else 0.0)
        npv += annual_cf / ((1 + discount_rate) ** t)

    npv -= max(2.0, sustaining_annual * 0.5) / ((1 + discount_rate) ** (life + 1))
    return max(0.0, npv * derisk)


def _scenario_params(scenario: str) -> tuple[float, float, float, bool]:
    if scenario == "downside":
        return 0.85, 1.15, -2.0, True
    if scenario == "upside":
        return 1.15, 1.00, 1.0, False
    return 1.00, 1.00, 0.0, False


def _prod_factor(year: int, life: int) -> float:
    if life <= 3:
        return 1.0
    if year == 1:
        return 0.75
    if year == 2:
        return 0.95
    if year >= life - 1:
        return 0.85
    return 1.0


def _infer_sustaining_annual(asset: Dict[str, Any]) -> float:
    explicit = _num(asset.get("sustaining_capex_usd_m"))
    if explicit is not None:
        return explicit / max(1.0, _num(asset.get("mine_life_years")) or 1.0) if explicit > 40 else explicit
    prod = _num(asset.get("annual_production_koz")) or 0.0
    return max(3.0, prod * 35 / 1000)


def _infer_company_sustaining(data: Dict[str, Any]) -> float:
    km = data.get("key_metrics") or {}
    sustain = _num(km.get("sustaining_capex_usd_m"))
    if sustain is not None:
        life = _num(km.get("mine_life_years")) or 1.0
        return sustain / life if sustain > 40 else sustain
    prod = _num(km.get("production_koz_annual")) or 0.0
    return max(3.0, prod * 35 / 1000)


def _extract_metric(text: str, patterns: List[str]) -> Optional[float]:
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            try:
                return float(m.group(1))
            except Exception:
                pass
    return None


def _extract_period(text: str) -> Optional[str]:
    m = re.search(r"\b(q[1-4]\s*fy\d{2,4}|fy\d{2,4}\s*q[1-4]|q[1-4]\s*20\d{2}|fy\d{2,4}|h[1-2]\s*fy\d{2,4})\b", text)
    return m.group(1).upper().replace(" ", "") if m else None


def _infer_source_type(source: str) -> str:
    s = (source or "").lower()
    if "technical" in s or "pfs" in s or "dfs" in s or "feasibility" in s or "ni 43-101" in s or "jorc" in s:
        return "technical_report"
    if "quarter" in s or "appendix 5b" in s:
        return "quarterly"
    if "annual" in s or "10-k" in s or "20-f" in s:
        return "annual_report"
    if "presentation" in s or "deck" in s:
        return "presentation"
    if "broker" in s or "media" in s or "commentary" in s:
        return "commentary"
    return "other"


def _attach_metadata(data: Dict[str, Any]) -> None:
    data.setdefault("metadata", {})
    data["metadata"].update(
        {
            "agent_version": "elite_gold_agent_v10",
            "query_count": len(_QUERIES),
            "stage_framework": sorted(_ALLOWED_STAGES),
            "deterministic_overlays": [
                "study_schedule_backfill",
                "quarterly_bridge_backfill",
                "asset_proxy_dcf",
                "company_ic_nav",
                "peer_frame_overlay",
                "hard_risk_flags",
            ],
        }
    )


def _flatten_for_frontend(data: Dict[str, Any]) -> None:
    """Flatten raw gold agent output to the schema renderGoldDiscovery expects."""
    sc = data.get("scorecard") or {}
    iv = data.get("investment_view") or {}
    km = data.get("key_metrics") or {}

    # Top-level fields the frontend reads directly
    if "skew_score" not in data and "skew_score" in sc:
        data["skew_score"] = sc["skew_score"]
    if "verdict" not in data and data.get("executive_summary"):
        data["verdict"] = data["executive_summary"]
    if "hypothesis" not in data and (iv.get("bull_case") or iv.get("bear_case")):
        data["hypothesis"] = {
            "bull": iv.get("bull_case", ""),
            "bear": iv.get("bear_case", ""),
        }
    if "monitoring_trigger" not in data and iv.get("monitoring_trigger"):
        data["monitoring_trigger"] = iv["monitoring_trigger"]

    # Key metrics: frontend expects aisc_per_oz / net_cash_debt_aud_m
    if km.get("aisc_per_oz") is None and km.get("aisc_per_oz_usd") is not None:
        km["aisc_per_oz"] = km["aisc_per_oz_usd"]
    if km.get("net_cash_debt_aud_m") is None and km.get("net_cash_debt_usd_m") is not None:
        km["net_cash_debt_aud_m"] = km["net_cash_debt_usd_m"]


def _num(value: Any, as_int: bool = False) -> Optional[float]:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return int(value) if as_int else float(value)
    if isinstance(value, str):
        s = value.strip().lower().replace(",", "")
        mult = 1.0
        if s.endswith("bn"):
            mult = 1000.0
            s = s[:-2]
        elif s.endswith("m"):
            mult = 1.0
            s = s[:-1]
        elif s.endswith("k"):
            mult = 0.001
            s = s[:-1]
        match = re.search(r"-?\d+(?:\.\d+)?", s)
        if match:
            n = float(match.group(0)) * mult
            return int(n) if as_int else n
    return None


def _coalesce_num(*vals: Any) -> Optional[float]:
    for v in vals:
        n = _num(v)
        if n is not None:
            return n
    return None


def _slug(s: Any) -> str:
    if not s:
        return ""
    return re.sub(r"[^a-z]", "", str(s).lower())


def _unique_preserve(items: List[str]) -> List[str]:
    seen = set()
    out = []
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def _push_unique(items: List[str], value: str) -> None:
    if value not in items:
        items.append(value)
# NLM auth refresh Sun, Mar 15, 2026  7:30:22 PM
