# NotebookLM Analyst Chat Integration -- Design Spec

**Date:** 2026-03-30
**Status:** Approved
**Approach:** Approach A (inline query with context block injection)

---

## Objective

Integrate NotebookLM as a supplementary research data source for the Analyst Chat across all CIv3 tickers that have a registered notebook. NotebookLM context is evidence to be weighed, not instruction.

## Scope

### In scope (v1)

- New module `api/notebook_context.py` with a single public function `query_notebook(ticker, question) -> str | None`
- Injection of NotebookLM context into the research-chat endpoint between passage retrieval and user message construction
- Independent auth state tracking (separate from gold agent)
- Unified reset-auth endpoint `POST /api/notebooklm/reset-auth` that resets both modules
- Configurable context cap and query timeout in `config.py`
- notebooklm-py upgrade from >=0.3.3 to >=0.3.4
- Unit tests for the new module

### Out of scope (v2+)

- Automated notebook creation during add-stock pipeline
- Automatic document upload from refresh pipeline
- Notebook health check in `/api/health`
- Frontend changes
- Source metadata fabrication for NLM responses

## Architecture

### Data flow

```
research_chat() in main.py
  1. Validate ticker, load user identity              (existing)
  2. Fetch user-uploaded source passages from DB       (existing)
  3. Retrieve vector/BM25 passages                     (existing)
  4. Build passage context string                      (existing)
  5. Query NotebookLM                                  (NEW)
     - Lookup: config.NOTEBOOKLM_TICKER_NOTEBOOKS.get(ticker)
     - No entry -> return None (0ms)
     - Has entry -> NotebookLMClient.from_storage()
                    client.chat.ask(notebook_id, question)
                    Success -> return text (capped at NOTEBOOKLM_CONTEXT_MAX_CHARS)
                    Exception -> log, return None
  6. Build user message with <notebook_context> block  (modified)
  7. Build system prompt + memories                    (existing)
  8. Call Claude via llm.complete()                     (existing)
  9. Validate, build sources, persist                  (existing)
```

### Query formulation

The user's question is sent to NotebookLM with a ticker prefix for disambiguation:

```python
query = f"Regarding {ticker}: {question}"
```

No reformulation. NLM's corpus search is semantic.

### Response integration

NLM response is injected as a `<notebook_context>` block in the user message, separate from `<research_context>`:

```
{structured_research_context}

<research_context>
  ...existing passages...
</research_context>

<notebook_context>
  ## Supplementary Corpus Context for {ticker}
  Source: NotebookLM corpus (curated research documents)

  {nlm_response_text}
</notebook_context>

**Stock:** {ticker}
**Question:** {question}
```

Separate tag so Claude can distinguish provenance. Labelled "supplementary" so Claude weighs it as additional evidence, not primary. No source passages returned for NLM content in the response `sources` array.

### Error handling

| Failure | Auth flag | Log level | User impact |
|---------|-----------|-----------|-------------|
| No notebook | n/a | none | none |
| Auth expired | flip to False | warning | none (silent skip) |
| Timeout (10s) | unchanged | warning | none (silent skip) |
| Rate limit | unchanged | warning | none (silent skip) |
| Empty response (<20 chars) | unchanged | info | none (silent skip) |

Auth expiry detection uses the same heuristic as gold_agent.py: exception string matching for "auth", "401", "cookie", "login", "forbidden", "403".

### Auth state

Each module owns its own `_nlm_auth_ok` flag:
- `notebook_context._nlm_auth_ok` (chat module)
- `gold_agent._nlm_auth_ok` (gold module)

Both expose a `reset_auth()` function. The unified endpoint `POST /api/notebooklm/reset-auth` calls both.

### Configuration

| Config key | Default | Source |
|------------|---------|--------|
| `NOTEBOOKLM_CONTEXT_MAX_CHARS` | 2000 | env var or hardcoded default |
| `NOTEBOOKLM_QUERY_TIMEOUT_SECONDS` | 10 | env var or hardcoded default |
| `NOTEBOOKLM_TICKER_NOTEBOOKS` | from JSON file + env override | existing, unchanged |
| `NOTEBOOKLM_AUTH_JSON` | env var | existing, unchanged |

### Notebook lifecycle (v1)

Manual only:
1. Create notebook in NotebookLM web UI
2. Upload curated research documents
3. Add `"TICKER": "notebook-uuid"` to `data/config/notebooklm-notebooks.json`
4. Commit and push (picked up on next deploy) or set env var override for immediate activation

### File changes

| File | Action | Lines |
|------|--------|-------|
| `api/notebook_context.py` | Create | ~80 |
| `api/config.py` | Add 2 config vars | +3 |
| `api/gold_agent.py` | Add `reset_auth()` function | +6 |
| `api/main.py` | Import, inject NLM query, add reset endpoint | +20 |
| `api/requirements.txt` | Bump notebooklm-py version | 1 line changed |
| `api/tests/test_notebook_context.py` | Create | ~120 |

### Design constraints (non-negotiable)

1. Graceful degradation: Analyst Chat works identically for tickers without notebooks.
2. Silent failure: NLM query failures never surface as user errors.
3. No new semaphore pressure: NLM is an HTTP call, not an LLM call.
4. Gold agent independence: gold agent untouched, continues via own endpoint.
5. No frontend changes.
6. Additive only: no modifications to existing behaviour for non-notebook tickers.
7. Content standards: no em dashes, lead with material facts.

### Acceptance criteria

1. For a ticker with a registered notebook (e.g. OBM), the Analyst Chat response includes context from the notebook corpus.
2. For a ticker without a notebook (e.g. EVN), the Analyst Chat behaves identically to today.
3. If NotebookLM auth is expired, the chat proceeds without NLM context and logs a warning.
4. If NLM query times out (>10s), the chat proceeds without NLM context and logs a warning.
5. `POST /api/notebooklm/reset-auth` resets auth flags in both notebook_context and gold_agent modules.
6. NLM response text is capped at `NOTEBOOKLM_CONTEXT_MAX_CHARS` characters.
7. All new code has unit tests.
8. `npm run test:unit` and `pytest` pass after implementation.
