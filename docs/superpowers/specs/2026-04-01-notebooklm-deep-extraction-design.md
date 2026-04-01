# NotebookLM Deep Extraction and Persistence -- Design Spec

**Date:** 2026-04-01
**Status:** Approved (with architectural amendments from Gemini review)
**Builds on:** 2026-03-30-notebooklm-generation-pipeline-design.md (v1, now live)

---

## Problem Statement

The current NotebookLM integration (v1) queries 4 broad dimensions during refresh and injects them as ephemeral prompt context for Claude's narrative/hypothesis generation. The corpus context is never persisted. This creates three problems:

1. **The Strategist Chat cannot access NotebookLM intelligence.** It queries NotebookLM live per question, one question at a time, getting shallow answers to narrow questions rather than the deep forensic extraction that the source documents support.

2. **Extracted intelligence is discarded after each refresh.** Track 6 runs 4 queries, Claude reads them once during generation, and the raw corpus responses are lost. The next refresh re-queries the same 4 dimensions from scratch.

3. **The 4 current queries are too broad.** "What are the key financial metrics?" produces a surface-level summary. The source documents (annual reports, broker notes, filings) contain forensic-grade detail on earnings quality, margin decomposition, governance red flags, and variant perceptions that the current queries never extract.

## Objective

Extract deep, structured intelligence from NotebookLM notebooks using a forensic query battery (12 targeted questions), persist the responses as first-class research data in the ticker's JSON file, and make the persisted corpus available to all downstream consumers: narrative generation, hypothesis synthesis, evidence creation, and the Strategist Chat.

## Scope

### In scope (v2)

- Expanded `DEEP_EXTRACTION_QUERIES` constant (12 forensic queries across 5 phases)
- `run_deep_extraction(ticker) -> dict` function in notebook_context.py
- Concurrency limiter (semaphore) for NLM query batching -- max 3 concurrent queries with staggered dispatch
- Anti-hallucination guardrail (`NO_DATA_AVAILABLE` sentinel) appended to all queries
- Persistence of structured extraction results into `data/research/{TICKER}.json` under a new `notebookCorpus` top-level key
- New Track 6 logic: skip extraction if persisted corpus is fresh (< 24h), re-extract otherwise
- Strategist Chat reads from persisted corpus instead of querying NotebookLM live
- Narrative/hypothesis prompts read from persisted corpus (richer context than current 4-dimension injection)
- `_extractionFreshness` metadata field for staleness tracking
- One-off bulk backfill script for the 22 original tickers (`scripts/backfill_notebook_corpus.py`)

### Out of scope (v3+)

- Automated source document upload to NotebookLM (Google Drive bridge)
- Replacing NotebookLM with direct Gemini 1.5 Pro API calls
- Frontend rendering of corpus sections
- Per-sector query battery customisation
- Evidence card creation from corpus (future extension)
- NotebookLM health check in `/api/health`
- Event-driven extraction triggered by `last_document_uploaded` hash (v3 roadmap)

## Prerequisites (Manual, One-Time Per Notebook)

The deep extraction code produces forensic-grade output only if the upstream notebook is correctly conditioned. Two manual steps are required for each notebook before extraction delivers value. These cannot be automated via `notebooklm-py` v0.3.4.

### Step 0A: Set the Notebook Guide

In each NotebookLM notebook, navigate to Notebook Guide > Customise and paste the following system instruction:

> You are the Lead Forensic Equity Analyst and Short-Seller Researcher at a Tier-1 Institutional Hedge Fund. Every response must be an exhaustive, long-form technical analysis. Prioritise raw financial data, margin decomposition, Quality of Earnings (QoE), and cash flow conversion over management's public relations narratives. You are highly skeptical of 'Adjusted' metrics, capitalised expenses, and M&A-driven growth. For every claim, you MUST provide a pinpoint citation (Document Title and Page/Slide/Paragraph Number). If a critical data point is missing from the uploaded sources, explicitly highlight it as an '[INFORMATION GAP]'. Use precise accounting terminology (e.g., Working Capital Dynamics, ROIC, Capitalisation Rates, Statutory vs. Underlying, Purchase Price Allocation).

This instruction persists across all queries to that notebook. It conditions NotebookLM to produce skeptical, citation-heavy, data-dense responses rather than balanced summaries.

### Step 0B: Upload the Forensic Rubric as a Source Document

Create a file named `00_FORENSIC_RUBRIC.txt` containing the full 5-phase forensic research directive (Phases 1-5: Earnings Quality, Structural Growth, Margin Quality, Governance, Variant Perception). Upload it as a source to each notebook.

This serves as a "Trojan Horse": NotebookLM's retrieval layer references the rubric alongside the financial documents when answering queries. When our extraction queries reference concepts like "Quality of Earnings" or "Variant Perception", the rubric provides the methodological framework that shapes the response.

The rubric file is stored at `data/config/00_FORENSIC_RUBRIC.txt` in the repository for reference, but must be manually uploaded to each notebook via the NotebookLM web UI.

### Operational Rollout

For the 24 existing notebooks: set the guide and upload the rubric manually before running the bulk backfill script. For new notebooks created via auto-provisioning: the guide and rubric must be set manually after provisioning completes (add to the post-provisioning checklist in CLAUDE.md).

Future: if `notebooklm-py` adds support for notebook guide configuration or source upload, automate these steps in `provision_notebook()`.

## Architecture

### Critical Constraint: Concurrency Limiter

NotebookLM is a consumer web application wrapper, not an enterprise API. Firing 12 parallel queries into a single notebook session will trigger Google's anti-abuse protections (rate limiting, session drops, silent failures).

**Requirement:** `run_deep_extraction()` must use an `asyncio.Semaphore(3)` to limit concurrent queries to 3 at a time, with a 1-2 second stagger between batches. This pushes Track 6 wall-clock time from ~60s to ~120-150s. Because the 24h freshness skip means extraction runs at most once per day (during the 02:00 AEDT batch cron), this latency is invisible to users.

```python
_EXTRACTION_CONCURRENCY = 3
_EXTRACTION_STAGGER_SECONDS = 1.5

async def run_deep_extraction(ticker: str) -> dict[str, str | None]:
    sem = asyncio.Semaphore(_EXTRACTION_CONCURRENCY)
    async def _limited_query(dim, question):
        async with sem:
            result = await _query_one(dim, question)
            await asyncio.sleep(_EXTRACTION_STAGGER_SECONDS)
            return result
    pairs = await asyncio.gather(
        *[_limited_query(dim, q) for dim, q in DEEP_EXTRACTION_QUERIES]
    )
    return {dim: text for dim, text in pairs if text is not None}
```

### Phase 1: Query Battery Design

12 targeted queries across 5 analytical phases. Each query includes an anti-hallucination guardrail suffix.

**Anti-hallucination guardrail:** Every query is appended with:
> "If the uploaded documents do not contain specific data to answer this, output the exact phrase 'NO_DATA_AVAILABLE'. Do not infer or guess."

Responses containing `NO_DATA_AVAILABLE` are treated as None (dimension omitted from persisted corpus).

| Phase | Dimension | Query | Purpose |
|-------|-----------|-------|---------|
| 1 | earnings_quality | What specific accounting policies, revenue recognition methods, and non-recurring items appear in the financial statements? Identify any changes in accounting treatment between periods. | Forensic earnings quality |
| 1 | earnings_composition | Break down revenue and earnings by segment, geography, and customer concentration. What percentage of revenue comes from the top 3 customers or contracts? | Concentration risk |
| 1 | cash_flow_reconciliation | Quantify the exact variance between statutory/GAAP net income, management's "underlying/adjusted" income, and free cash flow. Identify specific add-backs, working capital anomalies, and capitalised vs expensed costs. | Cash conversion forensics |
| 2 | structural_growth | What are the specific organic growth drivers vs acquisition-driven growth? Quantify the capex, R&D, and reinvestment rates relative to depreciation. | Growth durability |
| 2 | competitive_position | What are the specific barriers to entry, switching costs, or network effects? How has market share moved over the last 3 years? | Moat assessment |
| 3 | margin_decomposition | Decompose gross and operating margins by segment. What are the specific cost drivers, input cost exposures, and pricing power indicators? | Margin quality |
| 3 | capital_allocation | What is management's track record on capital allocation: M&A returns, buyback timing, dividend sustainability, and balance sheet leverage trajectory? | Capital stewardship |
| 4 | governance_flags | What are the specific related-party transactions, executive compensation structures, board independence issues, or insider trading patterns? | Governance red flags |
| 4 | disclosure_quality | How transparent are the disclosures? Identify areas where management provides less detail than peers, or where disclosures have changed between periods. | Information asymmetry |
| 5 | variant_perception | What claims does management make that are not independently verifiable from the source documents? Where does the company's narrative diverge from the financial data? | Variant perception |
| 5 | key_assumptions | What are the 3-5 assumptions that must be true for the current valuation to be justified? What evidence exists for or against each? | Thesis-critical assumptions |
| 5 | catalyst_timeline | What specific dated events (results, contract renewals, regulatory decisions, debt maturities) could materially change the investment thesis in the next 12 months? | Actionable catalysts |

### Phase 2: Data Flow

```
run_refresh(ticker)
  Stage 1: gather_all_data()
  Parallel tracks:
    Track 2: evidence + synthesis
    Track 3: structure update
    Track 4: price drivers
    Track 5: gold overlay
    Track 6: deep extraction (NEW)
      1. Check persisted corpus freshness in research JSON
         - If < 24h old and not force_corpus: load persisted -> gathered["notebook_corpus"]
         - If stale or missing: run_deep_extraction(ticker) (~120-150s with semaphore)
      2. Store results in gathered["notebook_corpus"]
  Stage 3: narrative/hypothesis generation
    - Reads gathered["notebook_corpus"] (now 12 dimensions, not 4)
    - build_corpus_section() updated to handle expanded dimensions
  Stage 4: merge + write
    - Writes notebookCorpus to research JSON alongside existing sections
```

Track 6 mutates the `gathered` dict directly. The freshness skip means Track 6 completes in <1ms on subsequent refreshes within 24h (read from persisted JSON, not re-extraction).

### Phase 3: Research JSON Schema Addition

New top-level key in `data/research/{TICKER}.json`:

```json
{
  "notebookCorpus": {
    "_extractedAt": "2026-04-01T14:30:00+11:00",
    "_notebookId": "a6daaef6-4053-45f5-966b-5a8f6a7791b8",
    "_queryCount": 12,
    "_dimensionsPopulated": 10,
    "earnings_quality": "...[extracted text, max 4000 chars per dimension]...",
    "earnings_composition": "...",
    "cash_flow_reconciliation": "...",
    "structural_growth": "...",
    "competitive_position": "...",
    "margin_decomposition": "...",
    "capital_allocation": "...",
    "governance_flags": "...",
    "disclosure_quality": "...",
    "variant_perception": "...",
    "key_assumptions": "...",
    "catalyst_timeline": "..."
  }
}
```

Dimensions that returned None, timed out, or contained `NO_DATA_AVAILABLE` are omitted from the object. The `_dimensionsPopulated` count enables downstream consumers to assess corpus completeness.

### Phase 4: Strategist Chat Integration

Current flow:
```
User question -> query_notebook(ticker, question) -> live NLM query (60s timeout risk) -> inject as <notebook_context>
```

New flow:
```
User question -> load persisted notebookCorpus from research JSON -> select relevant dimensions -> inject as <notebook_context>
```

The Strategist Chat no longer queries NotebookLM live. Instead, it reads the persisted corpus and selects the most relevant dimensions based on the user's question. This is faster (no 60s timeout risk), more reliable (no auth dependency at chat time), and richer (12 dimensions of deep extraction vs one shallow live query).

**Dimension selection:** Hard-coded synonym map routing question intent to 2-4 relevant dimensions:

```python
_DIMENSION_ROUTES = {
    # Financial forensics
    ("earnings", "profit", "revenue", "income", "accounting", "recognition"):
        ["earnings_quality", "earnings_composition", "cash_flow_reconciliation"],
    # Growth & competition
    ("growth", "market share", "moat", "competitive", "barriers"):
        ["structural_growth", "competitive_position"],
    # Margins & costs
    ("margin", "cost", "pricing", "input", "opex"):
        ["margin_decomposition", "capital_allocation"],
    # Governance & disclosure
    ("governance", "board", "insider", "compensation", "related party",
     "disclosure", "transparency", "options", "turnover"):
        ["governance_flags", "disclosure_quality"],
    # Thesis & catalysts
    ("thesis", "assumption", "valuation", "catalyst", "event", "trigger",
     "risk", "variant"):
        ["variant_perception", "key_assumptions", "catalyst_timeline"],
    # Cash flow specific
    ("cash flow", "fcf", "working capital", "capex", "free cash",
     "add-back", "adjusted"):
        ["cash_flow_reconciliation", "capital_allocation"],
}
```

**Fallback rule:** If the keyword matcher fails to find a high-confidence match, inject the entire 12-dimension corpus into Claude's context window (truncated to context budget). Claude's attention mechanism will find the relevant content.

**Transition safety:** If no persisted corpus exists for a ticker, fall back to the existing live NLM query (v1 behaviour).

### Phase 5: Narrative/Hypothesis Prompt Upgrade

`build_corpus_section()` is updated to accept the expanded dimension set:

| Key | Label in prompt |
|-----|----------------|
| earnings_quality | Earnings Quality Assessment |
| earnings_composition | Revenue & Earnings Composition |
| cash_flow_reconciliation | Cash Flow Reconciliation |
| structural_growth | Structural Growth Analysis |
| competitive_position | Competitive Position & Moat |
| margin_decomposition | Margin Decomposition |
| capital_allocation | Capital Allocation Track Record |
| governance_flags | Governance & Red Flags |
| disclosure_quality | Disclosure Quality |
| variant_perception | Variant Perception |
| key_assumptions | Key Thesis Assumptions |
| catalyst_timeline | Catalyst Timeline |

**Context budget:** `build_corpus_section()` accepts an optional `max_chars` parameter (default 48,000, approx 12,000 tokens). At 4,000 chars per dimension across 12 dimensions, the full corpus fits within budget without truncation in the common case. If total exceeds the budget, dimensions are truncated proportionally with priority ordering: `key_assumptions` > `variant_perception` > `cash_flow_reconciliation` > `earnings_quality` > `catalyst_timeline` > remainder alphabetically.

The 48k budget is justified: Claude's 200k-token context window can easily absorb 12k tokens of forensic corpus without degrading generation quality. The prior 6k cap was stripping exactly the pinpoint citations and footnote data that make the extraction valuable.

## Bulk Backfill Script

`scripts/backfill_notebook_corpus.py` -- one-off migration for the 22 original tickers that had research generated without corpus context.

```
For each ticker in notebooklm-notebooks.json:
  1. Load existing research JSON
  2. Check if notebookCorpus exists and is populated
  3. If missing or empty: run_deep_extraction(ticker)
  4. Persist to research JSON
  5. Sleep 30s between tickers (rate limit protection)
  6. Log progress and failures
```

Run sequentially overnight. Do not parallelise across tickers. Expected runtime: ~22 tickers x (150s extraction + 30s sleep) = ~66 minutes.

## Error Handling

- No notebook registered: extraction skipped, `notebookCorpus` not written (tickers without notebooks unaffected)
- Auth expired: extraction skipped, existing persisted corpus retained (stale but present)
- Partial extraction (e.g. 8/12 dimensions): persisted with `_dimensionsPopulated: 8`, downstream consumers work with what's available
- `NO_DATA_AVAILABLE` responses: treated as None, dimension omitted, `_dimensionsPopulated` decremented
- Extraction timeout (entire batch): logged, existing corpus retained
- Force refresh: `POST /api/refresh/TICKER?force_corpus=true` bypasses freshness check
- Concurrency limiter prevents NLM session drops from anti-abuse protections

## Backward Compatibility

- Tickers without notebooks: zero change to research JSON or behaviour
- Tickers with notebooks: gain `notebookCorpus` key in JSON (additive, non-breaking)
- Existing `build_corpus_section()` call sites: continue working (expanded dimensions are a superset of the original 4)
- Strategist Chat: falls back to live NLM query if no persisted corpus exists (transition safety)
- Frontend: no changes required (notebookCorpus is backend-only data currently)

## Performance

- Deep extraction: 12 queries with semaphore(3) and 1.5s stagger = ~120-150s wall clock
- Freshness skip: if corpus < 24h old, Track 6 completes in <1ms (read persisted JSON)
- Batch refresh (25 tickers): extraction runs per-ticker within the existing parallel batch. Net impact: ~120-150s added to first refresh after deploy, negligible on subsequent runs within 24h window
- Strategist Chat: faster than current (file read vs live NLM query with 60s timeout risk)
- Bulk backfill: ~66 minutes one-off overnight run

## File Changes

| File | Action | Estimated lines |
|------|--------|----------------|
| `api/notebook_context.py` | Add DEEP_EXTRACTION_QUERIES, run_deep_extraction() with semaphore, update build_corpus_section(), add dimension_selector(), NO_DATA_AVAILABLE handling | +160 |
| `api/refresh.py` | Update Track 6 to use deep extraction with freshness skip, persist notebookCorpus in merge | +45 |
| `api/main.py` | Update research-chat to read persisted corpus instead of live query, add dimension selection | +30, -15 |
| `api/tests/test_notebook_context.py` | Tests for deep extraction, semaphore, dimension selection, expanded formatter, NO_DATA_AVAILABLE | +100 |
| `scripts/backfill_notebook_corpus.py` | One-off bulk backfill script | +80 |
| `data/config/00_FORENSIC_RUBRIC.txt` | Forensic research directive for manual upload to notebooks | +50 (already created) |

Total: ~415 lines added, ~15 removed (excluding rubric).

## Acceptance Criteria

1. For a ticker with a notebook, refresh produces `notebookCorpus` in the research JSON with up to 12 dimensions.
2. Subsequent refresh within 24h skips extraction and uses persisted corpus.
3. `force_corpus=true` parameter forces re-extraction regardless of freshness.
4. Concurrency limiter prevents more than 3 simultaneous NLM queries; no session drops or rate limiting.
5. `NO_DATA_AVAILABLE` responses are correctly filtered and not persisted.
6. Strategist Chat for a ticker with persisted corpus does not query NotebookLM live.
7. Strategist Chat for a ticker without persisted corpus falls back to live NLM query (existing behaviour).
8. Dimension selection routes user questions to relevant corpus dimensions.
9. Fallback: if no dimension match, full corpus injected (within context budget).
10. Narrative/hypothesis generation receives expanded corpus context (12 dimensions).
11. NLM auth expiry does not block refresh; stale corpus is retained.
12. Partial extraction (some dimensions None) is correctly persisted and consumed.
13. Bulk backfill script successfully populates notebookCorpus for all 22 original tickers.
14. All existing tests pass. New tests cover deep extraction, semaphore behaviour, freshness skip, dimension selection, NO_DATA_AVAILABLE handling, and expanded formatter.
15. Batch refresh (25 tickers) completes without timeout or resource exhaustion.

## v3 Roadmap (Out of Scope)

- **Event-driven extraction:** Trigger re-extraction only when `last_document_uploaded` timestamp in source folder is newer than `_extractedAt`. Replaces fixed 24h window.
- **Google Drive bridge:** Automate document upload from refresh pipeline to Drive folders synced with NotebookLM.
- **Sector-specific query batteries:** Mining tickers get geology/reserve queries; financials get NIM/provision queries.
- **Evidence card enrichment:** Generate evidence cards directly from corpus dimensions rather than relying solely on news/web sources.
