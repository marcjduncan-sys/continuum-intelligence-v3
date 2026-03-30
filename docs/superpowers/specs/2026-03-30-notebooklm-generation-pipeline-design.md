# NotebookLM Generation Pipeline Integration -- Design Spec

**Date:** 2026-03-30
**Status:** Approved
**Approach:** Approach A (batch query as parallel track, inject into generation prompts)

---

## Objective

Inject NotebookLM corpus context into narrative generation and thesis/hypothesis construction during coverage initiation and refresh. When a ticker has a registered notebook with substantive source documents, the published research content is grounded in actual company filings and reports.

## Scope

### In scope (v1)

- `query_notebook_batch(ticker) -> dict[str, str | None]` in notebook_context.py
- `build_corpus_section(ticker, corpus) -> str` in notebook_context.py
- `GENERATION_QUERIES` constant (4 dimension queries) in notebook_context.py
- Track 3 parallel track in both `run_refresh()` and the batch pipeline in refresh.py
- Corpus section injection in `_run_coverage_initiation()` and `_run_hypothesis_synthesis()`
- Tests for batch query and corpus formatter

### Out of scope

- Evidence creation enrichment (future extension)
- Sector-specific query batteries
- Config changes (per-query cap of 2000 chars is correct)
- Frontend changes
- Gold agent modifications

## Architecture

### Query Strategy

4 targeted queries per ticker, each prefixed with `Regarding {ticker}:`:

| Dimension | Query |
|-----------|-------|
| operations | What are the core business operations, key assets, production metrics, and operational performance? |
| financials | What are the key financial metrics, recent results, earnings guidance, and balance sheet position? |
| risks | What are the main risks, regulatory issues, controversies, or operational challenges? |
| catalysts | What are the upcoming catalysts, strategic initiatives, expansion plans, or corporate actions? |

Queries run in parallel within a single `NotebookLMClient` session.

### Data Flow

```
run_refresh(ticker)
  Stage 1: gather_all_data()
  Parallel tracks:
    Track 2: evidence + synthesis (15-30s)
      Stage 3 reads gathered["notebook_corpus"] for prompt injection
    Track 3: query_notebook_batch(ticker) (6-8s) -> gathered["notebook_corpus"]
    Track 4: price drivers (existing)
    Track 5: gold overlay (existing)
  Stage 4: merge + write (existing, unchanged)
```

Track 3 mutates the `gathered` dict directly. Track 2's Stage 3 reads it. Timing: Track 3 completes before Stage 3 starts in the common case. If not, graceful degradation: `gathered.get("notebook_corpus")` returns None, corpus section skipped.

### Prompt Integration

Corpus section injected after macro context, before closing instruction, in both `_run_coverage_initiation()` and `_run_hypothesis_synthesis()`:

```
## Source Document Context for {ticker}
The following is grounded in curated research documents (annual reports,
filings, presentations). Use it to anchor your analysis with specific
facts, figures, and operational detail. Do not reproduce verbatim.

### Operations & Assets
{corpus text}

### Financials & Guidance
{corpus text}
...
```

`build_corpus_section()` returns empty string if no dimension has content.

### Error Handling

- No notebook: returns {}, corpus section skipped
- Auth expired: flips `_nlm_auth_ok` to False, all subsequent batch tickers skip instantly
- Per-query timeout: that dimension returns None, others may succeed (partial corpus)
- All queries fail: empty dict, corpus section skipped
- Track 3 exception: caught and swallowed, non-fatal

### Content Standards

- Corpus text is raw from source documents (may contain em-dashes)
- Prompt instruction: "Do not reproduce verbatim"
- Existing system prompt em-dash prohibition covers output
- NLM content is evidence to ground analysis, not text to echo

## File Changes

| File | Action | Lines |
|------|--------|-------|
| `api/notebook_context.py` | Add batch query, corpus formatter, constant | +50 |
| `api/refresh.py` | Add Track 3, inject corpus in 2 functions | +25 |
| `api/tests/test_notebook_context.py` | Add batch and formatter tests | +60 |

## Acceptance Criteria

1. For a ticker with a notebook, refresh produces narrative/thesis grounded in corpus content.
2. For a ticker without a notebook, refresh behaviour is identical to today.
3. NLM auth expiry does not block or fail any refresh.
4. Partial corpus (e.g. 3/4 dimensions) is correctly injected.
5. Batch refresh (25 tickers) works with NLM integration.
6. All existing tests pass. New tests cover batch query and formatter.
