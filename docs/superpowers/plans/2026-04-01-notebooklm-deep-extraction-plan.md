# NotebookLM Deep Extraction v2 -- Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan. 5 agents work in parallel on independent domains. Agent E (integration + verification) runs AFTER Agents A-D complete.

**Goal:** Extract deep forensic intelligence from NotebookLM notebooks (12 queries), persist to research JSON, and serve persisted corpus to Strategist Chat and narrative generation.
**Architecture:** Semaphore-controlled extraction in Track 6, persistence in merge, persisted-first chat with fallback to live query.
**Tech Stack:** Python 3.11+, asyncio, notebooklm-py 0.3.4, pytest, FastAPI
**Spec:** `docs/superpowers/specs/2026-04-01-notebooklm-deep-extraction-design.md`

---

## Agent Assignments

| Agent | Role | Domain | Files | Dependencies |
|-------|------|--------|-------|--------------|
| **A -- Extractor** | Core extraction engine | notebook_context.py: queries, semaphore, NO_DATA_AVAILABLE | `api/notebook_context.py`, `api/tests/test_notebook_context.py` | None (independent) |
| **B -- Persister** | Research JSON persistence | refresh.py: Track 6 freshness skip, merge notebookCorpus | `api/refresh.py` | None (independent) |
| **C -- Router** | Chat dimension routing | main.py: persisted corpus reader, dimension selector | `api/main.py` | None (independent) |
| **D -- Backfiller** | One-off migration script | scripts/backfill_notebook_corpus.py | `scripts/backfill_notebook_corpus.py` | None (independent) |
| **E -- Integrator** | Wire everything together, run full verification | All files | Agents A-D complete |

---

## Agent A: Extractor (notebook_context.py)

### Task A1: Add DEEP_EXTRACTION_QUERIES constant and NO_DATA_AVAILABLE sentinel

**Files:**
- Modify: `api/notebook_context.py`

- [ ] **Step 1: Write failing test**

  Append to `api/tests/test_notebook_context.py`:

  ```python
  # ---------------------------------------------------------------------------
  # Test: DEEP_EXTRACTION_QUERIES
  # ---------------------------------------------------------------------------

  class TestDeepExtractionQueries:
      def test_has_12_queries(self):
          """Deep extraction battery must have exactly 12 queries."""
          import notebook_context
          assert len(notebook_context.DEEP_EXTRACTION_QUERIES) == 12

      def test_all_queries_have_anti_hallucination_suffix(self):
          """Every query must end with the NO_DATA_AVAILABLE guardrail."""
          import notebook_context
          for dim, query in notebook_context.DEEP_EXTRACTION_QUERIES:
              assert "NO_DATA_AVAILABLE" in query, f"Missing guardrail in {dim}"

      def test_dimension_names_are_unique(self):
          """All dimension names must be unique."""
          import notebook_context
          dims = [d for d, _ in notebook_context.DEEP_EXTRACTION_QUERIES]
          assert len(dims) == len(set(dims))

      def test_no_data_sentinel_constant_exists(self):
          """NO_DATA_AVAILABLE sentinel must be defined."""
          import notebook_context
          assert hasattr(notebook_context, "NO_DATA_SENTINEL")
          assert notebook_context.NO_DATA_SENTINEL == "NO_DATA_AVAILABLE"
  ```

- [ ] **Step 2: Run tests, verify FAIL**

  Run: `cd api && python -m pytest tests/test_notebook_context.py -v -k "DeepExtraction" 2>&1 | tail -10`
  Expected: FAIL (AttributeError: module has no attribute 'DEEP_EXTRACTION_QUERIES')

- [ ] **Step 3: Implement**

  In `api/notebook_context.py`, replace the existing `GENERATION_QUERIES` block (lines 340-345) with:

  ```python
  # ---------------------------------------------------------------------------
  # Query batteries
  # ---------------------------------------------------------------------------

  NO_DATA_SENTINEL = "NO_DATA_AVAILABLE"

  _ANTI_HALLUCINATION_SUFFIX = (
      " If the uploaded documents do not contain specific data to answer this, "
      "output the exact phrase 'NO_DATA_AVAILABLE'. Do not infer or guess."
  )

  DEEP_EXTRACTION_QUERIES: list[tuple[str, str]] = [
      ("earnings_quality",
       "What specific accounting policies, revenue recognition methods, and non-recurring items appear in the financial statements? Identify any changes in accounting treatment between periods." + _ANTI_HALLUCINATION_SUFFIX),
      ("earnings_composition",
       "Break down revenue and earnings by segment, geography, and customer concentration. What percentage of revenue comes from the top 3 customers or contracts?" + _ANTI_HALLUCINATION_SUFFIX),
      ("cash_flow_reconciliation",
       "Quantify the exact variance between statutory/GAAP net income, management's 'underlying/adjusted' income, and free cash flow. Identify specific add-backs, working capital anomalies, and capitalised vs expensed costs." + _ANTI_HALLUCINATION_SUFFIX),
      ("structural_growth",
       "What are the specific organic growth drivers vs acquisition-driven growth? Quantify the capex, R&D, and reinvestment rates relative to depreciation." + _ANTI_HALLUCINATION_SUFFIX),
      ("competitive_position",
       "What are the specific barriers to entry, switching costs, or network effects? How has market share moved over the last 3 years?" + _ANTI_HALLUCINATION_SUFFIX),
      ("margin_decomposition",
       "Decompose gross and operating margins by segment. What are the specific cost drivers, input cost exposures, and pricing power indicators?" + _ANTI_HALLUCINATION_SUFFIX),
      ("capital_allocation",
       "What is management's track record on capital allocation: M&A returns, buyback timing, dividend sustainability, and balance sheet leverage trajectory?" + _ANTI_HALLUCINATION_SUFFIX),
      ("governance_flags",
       "What are the specific related-party transactions, executive compensation structures, board independence issues, or insider trading patterns?" + _ANTI_HALLUCINATION_SUFFIX),
      ("disclosure_quality",
       "How transparent are the disclosures? Identify areas where management provides less detail than peers, or where disclosures have changed between periods." + _ANTI_HALLUCINATION_SUFFIX),
      ("variant_perception",
       "What claims does management make that are not independently verifiable from the source documents? Where does the company's narrative diverge from the financial data?" + _ANTI_HALLUCINATION_SUFFIX),
      ("key_assumptions",
       "What are the 3-5 assumptions that must be true for the current valuation to be justified? What evidence exists for or against each?" + _ANTI_HALLUCINATION_SUFFIX),
      ("catalyst_timeline",
       "What specific dated events (results, contract renewals, regulatory decisions, debt maturities) could materially change the investment thesis in the next 12 months?" + _ANTI_HALLUCINATION_SUFFIX),
  ]

  # Backward compatibility: v1 callers that reference GENERATION_QUERIES.
  # NOTE: query_notebook_batch() still uses this and runs unbounded asyncio.gather.
  # After v2 ships, Track 6 calls run_deep_extraction() instead. query_notebook_batch()
  # is retained only for Analyst Chat inline queries (4 dims was fine there).
  # Keep the original 4-query battery for that use case.
  GENERATION_QUERIES: list[tuple[str, str]] = [
      ("operations", "What are the core business operations, key assets, production metrics, and operational performance?"),
      ("financials", "What are the key financial metrics, recent results, earnings guidance, and balance sheet position?"),
      ("risks", "What are the main risks, regulatory issues, controversies, or operational challenges?"),
      ("catalysts", "What are the upcoming catalysts, strategic initiatives, expansion plans, or corporate actions?"),
  ]
  ```

- [ ] **Step 4: Run tests, verify PASS**

  Run: `cd api && python -m pytest tests/test_notebook_context.py -v -k "DeepExtraction"`
  Expected: 4 PASS

- [ ] **Step 5: Commit**

  ```bash
  git add api/notebook_context.py api/tests/test_notebook_context.py
  git commit -m "feat: add 12-query deep extraction battery with anti-hallucination guardrail"
  ```

### Task A2: Add run_deep_extraction() with semaphore and NO_DATA filtering

**Files:**
- Modify: `api/notebook_context.py`
- Modify: `api/tests/test_notebook_context.py`

- [ ] **Step 1: Write failing tests**

  Append to `api/tests/test_notebook_context.py`:

  ```python
  # ---------------------------------------------------------------------------
  # Test: run_deep_extraction
  # ---------------------------------------------------------------------------

  class TestRunDeepExtraction:
      def test_returns_empty_dict_when_no_notebook(self):
          """Tickers without a notebook return empty dict."""
          import notebook_context
          with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {}, clear=True):
              result = asyncio.run(notebook_context.run_deep_extraction("ZZZ"))
          assert result == {}

      def test_filters_no_data_available_responses(self):
          """Responses containing NO_DATA_AVAILABLE sentinel are filtered out."""
          import notebook_context
          notebook_context._nlm_auth_ok = True

          call_idx = 0
          async def _side_effect(**kwargs):
              nonlocal call_idx
              call_idx += 1
              resp = MagicMock()
              if call_idx % 3 == 0:
                  resp.text = "NO_DATA_AVAILABLE"
              else:
                  resp.text = "Substantive forensic analysis with citations and data."
              return resp

          mock_client = AsyncMock()
          mock_client.chat.ask = _side_effect
          mock_client.__aenter__ = AsyncMock(return_value=mock_client)
          mock_client.__aexit__ = AsyncMock(return_value=False)

          with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"CBA": "fake-uuid"}, clear=True):
              with patch("notebook_context._HAS_NOTEBOOKLM", True):
                  with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth"):
                      with patch("notebook_context.NotebookLMClient") as MockNLM:
                          MockNLM.from_storage = AsyncMock(return_value=mock_client)
                          result = asyncio.run(notebook_context.run_deep_extraction("CBA"))

          # NO_DATA_AVAILABLE responses should be excluded
          for v in result.values():
              assert "NO_DATA_AVAILABLE" not in v

      def test_includes_metadata_fields(self):
          """Result dict must include _extractedAt, _queryCount, _dimensionsPopulated."""
          import notebook_context
          notebook_context._nlm_auth_ok = True

          mock_response = MagicMock()
          mock_response.text = "Detailed forensic analysis of earnings quality."

          mock_client = AsyncMock()
          mock_client.chat.ask = AsyncMock(return_value=mock_response)
          mock_client.__aenter__ = AsyncMock(return_value=mock_client)
          mock_client.__aexit__ = AsyncMock(return_value=False)

          with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"CBA": "fake-uuid"}, clear=True):
              with patch("notebook_context._HAS_NOTEBOOKLM", True):
                  with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth"):
                      with patch("notebook_context.NotebookLMClient") as MockNLM:
                          MockNLM.from_storage = AsyncMock(return_value=mock_client)
                          result = asyncio.run(notebook_context.run_deep_extraction("CBA"))

          assert "_extractedAt" in result
          assert result["_queryCount"] == 12
          assert result["_dimensionsPopulated"] <= 12
          assert "_notebookId" in result

      def test_semaphore_limits_concurrency(self):
          """No more than 3 queries should be in-flight simultaneously."""
          import notebook_context
          notebook_context._nlm_auth_ok = True

          max_concurrent = 0
          current_concurrent = 0
          lock = asyncio.Lock()

          async def _tracking_ask(**kwargs):
              nonlocal max_concurrent, current_concurrent
              async with lock:
                  current_concurrent += 1
                  if current_concurrent > max_concurrent:
                      max_concurrent = current_concurrent
              await asyncio.sleep(0.01)
              async with lock:
                  current_concurrent -= 1
              resp = MagicMock()
              resp.text = "Detailed analysis response for concurrency test."
              return resp

          mock_client = AsyncMock()
          mock_client.chat.ask = _tracking_ask
          mock_client.__aenter__ = AsyncMock(return_value=mock_client)
          mock_client.__aexit__ = AsyncMock(return_value=False)

          with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"CBA": "fake-uuid"}, clear=True):
              with patch("notebook_context._HAS_NOTEBOOKLM", True):
                  with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth"):
                      with patch("notebook_context.NotebookLMClient") as MockNLM:
                          MockNLM.from_storage = AsyncMock(return_value=mock_client)
                          with patch.object(notebook_context, "_EXTRACTION_STAGGER_SECONDS", 0):
                              asyncio.run(notebook_context.run_deep_extraction("CBA"))

          assert max_concurrent <= 3, f"Max concurrent was {max_concurrent}, expected <= 3"
  ```

- [ ] **Step 2: Run tests, verify FAIL**

  Run: `cd api && python -m pytest tests/test_notebook_context.py -v -k "RunDeepExtraction" 2>&1 | tail -10`
  Expected: FAIL (AttributeError: module has no attribute 'run_deep_extraction')

- [ ] **Step 3: Implement run_deep_extraction()**

  In `api/notebook_context.py`, add after the existing `query_notebook_batch()` function:

  ```python
  # ---------------------------------------------------------------------------
  # Deep extraction: semaphore-controlled forensic query battery
  # ---------------------------------------------------------------------------

  _EXTRACTION_CONCURRENCY = 3
  _EXTRACTION_STAGGER_SECONDS = 1.5


  async def run_deep_extraction(ticker: str) -> dict[str, str | None]:
      """Run the full forensic extraction battery against a ticker's notebook.

      Uses a semaphore to limit concurrent NLM queries to 3 at a time,
      with a stagger delay between batches to avoid anti-abuse protections.

      Returns a dict with dimension keys + metadata fields:
        _extractedAt, _notebookId, _queryCount, _dimensionsPopulated

      Responses containing NO_DATA_SENTINEL are filtered out.
      Returns empty dict if no notebook, auth expired, or library not installed.
      """
      global _nlm_auth_ok, _nlm_last_error

      ticker = ticker.upper()
      notebook_id = await get_notebook_id(ticker)
      if not notebook_id:
          return {}

      if not _HAS_NOTEBOOKLM or not _nlm_auth_ok or not config.NOTEBOOKLM_AUTH_JSON:
          return {}

      sem = asyncio.Semaphore(_EXTRACTION_CONCURRENCY)
      results: dict[str, str | None] = {}

      try:
          async with await NotebookLMClient.from_storage() as client:

              async def _limited_query(dimension: str, question: str) -> tuple[str, str | None]:
                  async with sem:
                      query = f"Regarding {ticker}: {question}"
                      try:
                          response = await asyncio.wait_for(
                              client.chat.ask(notebook_id=notebook_id, question=query),
                              timeout=config.NOTEBOOKLM_QUERY_TIMEOUT_SECONDS,
                          )
                          text = response.text if hasattr(response, "text") else str(response)

                          # Filter NO_DATA_AVAILABLE sentinel
                          if text and NO_DATA_SENTINEL in text:
                              logger.info("NotebookLM deep: NO_DATA for %s/%s", ticker, dimension)
                              return dimension, None

                          if not text or len(text) < 20:
                              logger.info("NotebookLM deep: empty response for %s/%s", ticker, dimension)
                              return dimension, None

                          if len(text) > config.NOTEBOOKLM_CONTEXT_MAX_CHARS:
                              text = text[:config.NOTEBOOKLM_CONTEXT_MAX_CHARS]

                          return dimension, text

                      except asyncio.TimeoutError:
                          logger.warning("NotebookLM deep timeout for %s/%s", ticker, dimension)
                          return dimension, None
                      except Exception as exc:
                          err_str = str(exc).lower()
                          if any(marker in err_str for marker in _AUTH_ERROR_MARKERS):
                              if _nlm_auth_ok:
                                  _nlm_auth_ok = False
                                  _nlm_last_error = f"NotebookLM auth expired: {exc}"
                                  logger.warning("NotebookLM auth expired during deep extraction: %s", exc)
                          else:
                              logger.warning("NotebookLM deep query failed %s/%s: %s", ticker, dimension, exc)
                          return dimension, None
                      finally:
                          await asyncio.sleep(_EXTRACTION_STAGGER_SECONDS)

              pairs = await asyncio.gather(
                  *[_limited_query(dim, q) for dim, q in DEEP_EXTRACTION_QUERIES]
              )

              # Filter None values and build result
              for dim, text in pairs:
                  if text is not None:
                      results[dim] = text

      except Exception as exc:
          err_str = str(exc).lower()
          if any(marker in err_str for marker in _AUTH_ERROR_MARKERS):
              _nlm_auth_ok = False
              _nlm_last_error = f"NotebookLM auth expired: {exc}"
              logger.warning("NotebookLM auth expired during deep extraction session: %s", exc)
          else:
              logger.warning("NotebookLM deep extraction session failed for %s: %s", ticker, exc)
          return {}

      # Add metadata
      from datetime import datetime, timezone
      results["_extractedAt"] = datetime.now(timezone.utc).isoformat()
      results["_notebookId"] = notebook_id
      results["_queryCount"] = len(DEEP_EXTRACTION_QUERIES)
      results["_dimensionsPopulated"] = len([k for k in results if not k.startswith("_")])

      return results
  ```

- [ ] **Step 4: Run tests, verify PASS**

  Run: `cd api && python -m pytest tests/test_notebook_context.py -v -k "RunDeepExtraction"`
  Expected: 4 PASS

- [ ] **Step 5: Commit**

  ```bash
  git add api/notebook_context.py api/tests/test_notebook_context.py
  git commit -m "feat: add run_deep_extraction() with semaphore and NO_DATA filtering"
  ```

### Task A3: Update build_corpus_section() for 12 dimensions and context budget

**Files:**
- Modify: `api/notebook_context.py`
- Modify: `api/tests/test_notebook_context.py`

- [ ] **Step 1: Write failing tests**

  Append to `api/tests/test_notebook_context.py`:

  ```python
  class TestBuildCorpusSectionV2:
      def test_handles_12_dimension_corpus(self):
          """Expanded dimension set should produce labelled sections."""
          import notebook_context
          corpus = {
              "earnings_quality": "Accounting policy analysis text.",
              "cash_flow_reconciliation": "Cash flow bridge text.",
              "variant_perception": "Management claims vs data text.",
          }
          result = notebook_context.build_corpus_section("CBA", corpus)
          assert "Earnings Quality Assessment" in result
          assert "Cash Flow Reconciliation" in result
          assert "Variant Perception" in result

      def test_respects_max_chars_parameter(self):
          """Total output should not exceed max_chars."""
          import notebook_context
          corpus = {dim: "x" * 5000 for dim, _ in notebook_context.DEEP_EXTRACTION_QUERIES}
          result = notebook_context.build_corpus_section("CBA", corpus, max_chars=10000)
          assert len(result) <= 10000

      def test_backward_compatible_with_v1_dimensions(self):
          """Original 4 v1 dimension keys should still work."""
          import notebook_context
          corpus = {
              "operations": "Mining operations text.",
              "financials": "Financial metrics text.",
              "risks": "Risk factors text.",
              "catalysts": "Catalyst pipeline text.",
          }
          result = notebook_context.build_corpus_section("OBM", corpus)
          assert "Operations & Assets" in result
          assert "Financials & Guidance" in result

      def test_skips_metadata_keys(self):
          """Keys starting with _ should not appear as sections."""
          import notebook_context
          corpus = {
              "_extractedAt": "2026-04-01T00:00:00Z",
              "_queryCount": 12,
              "earnings_quality": "Analysis text.",
          }
          result = notebook_context.build_corpus_section("CBA", corpus)
          assert "_extractedAt" not in result
          assert "Earnings Quality Assessment" in result
  ```

- [ ] **Step 2: Run tests, verify FAIL**

  Run: `cd api && python -m pytest tests/test_notebook_context.py -v -k "CorpusSectionV2" 2>&1 | tail -10`
  Expected: FAIL (labels not found, max_chars not accepted)

- [ ] **Step 3: Update build_corpus_section()**

  Replace the existing `build_corpus_section()` in `api/notebook_context.py`:

  ```python
  _DEFAULT_CORPUS_MAX_CHARS = 48_000

  _DIMENSION_LABELS: dict[str, str] = {
      # v2 deep extraction dimensions
      "earnings_quality": "Earnings Quality Assessment",
      "earnings_composition": "Revenue & Earnings Composition",
      "cash_flow_reconciliation": "Cash Flow Reconciliation",
      "structural_growth": "Structural Growth Analysis",
      "competitive_position": "Competitive Position & Moat",
      "margin_decomposition": "Margin Decomposition",
      "capital_allocation": "Capital Allocation Track Record",
      "governance_flags": "Governance & Red Flags",
      "disclosure_quality": "Disclosure Quality",
      "variant_perception": "Variant Perception",
      "key_assumptions": "Key Thesis Assumptions",
      "catalyst_timeline": "Catalyst Timeline",
      # v1 backward compatibility
      "operations": "Operations & Assets",
      "financials": "Financials & Guidance",
      "risks": "Risks & Controversies",
      "catalysts": "Catalysts & Strategy",
  }

  # Priority order for truncation (highest priority first)
  _DIMENSION_PRIORITY = [
      "key_assumptions", "variant_perception", "cash_flow_reconciliation",
      "earnings_quality", "catalyst_timeline", "margin_decomposition",
      "competitive_position", "structural_growth", "capital_allocation",
      "governance_flags", "disclosure_quality", "earnings_composition",
      # v1 fallbacks
      "operations", "financials", "risks", "catalysts",
  ]


  def build_corpus_section(
      ticker: str,
      corpus: dict[str, str | None],
      max_chars: int = _DEFAULT_CORPUS_MAX_CHARS,
  ) -> str:
      """Format notebook corpus responses into a prompt section.

      Handles both v1 (4 dimensions) and v2 (12 dimensions) corpora.
      Skips metadata keys (starting with _). Truncates proportionally
      if total exceeds max_chars, respecting priority ordering.

      Returns empty string if no dimension has content.
      """
      # Collect non-metadata dimensions with content
      entries: list[tuple[str, str, str]] = []
      for key in _DIMENSION_PRIORITY:
          text = corpus.get(key)
          if text and isinstance(text, str) and not key.startswith("_"):
              label = _DIMENSION_LABELS.get(key, key.replace("_", " ").title())
              entries.append((key, label, text))

      # Also pick up any dimensions not in priority list
      for key, text in corpus.items():
          if (key.startswith("_") or not text or not isinstance(text, str)
                  or key in _DIMENSION_PRIORITY):
              continue
          label = _DIMENSION_LABELS.get(key, key.replace("_", " ").title())
          entries.append((key, label, text))

      if not entries:
          return ""

      header = (
          f"\n## Source Document Context for {ticker}\n"
          "The following is grounded in curated research documents (annual reports, "
          "filings, presentations). Use it to anchor your analysis with specific "
          "facts, figures, and operational detail. Do not reproduce verbatim."
      )
      header_len = len(header)
      budget = max_chars - header_len

      # Calculate total content length
      total_len = sum(len(t) + len(l) + 10 for _, l, t in entries)  # +10 for ### + newlines

      if total_len > budget and budget > 0:
          # Proportional truncation, preserving priority order
          per_entry = budget // len(entries)
          parts = [header]
          for _, label, text in entries:
              section_header = f"\n### {label}\n"
              available = per_entry - len(section_header)
              if available > 0:
                  parts.append(section_header + text[:available])
          return "".join(parts)

      parts = [header]
      for _, label, text in entries:
          parts.append(f"\n### {label}\n{text}")
      return "".join(parts)
  ```

- [ ] **Step 4: Run ALL notebook_context tests**

  Run: `cd api && python -m pytest tests/test_notebook_context.py -v`
  Expected: ALL PASS (existing v1 tests + new v2 tests)

- [ ] **Step 5: Commit**

  ```bash
  git add api/notebook_context.py api/tests/test_notebook_context.py
  git commit -m "feat: update build_corpus_section for 12 dimensions and 48k context budget"
  ```

### Task A4: Add dimension_selector() for Strategist Chat routing

**Files:**
- Modify: `api/notebook_context.py`
- Modify: `api/tests/test_notebook_context.py`

- [ ] **Step 1: Write failing tests**

  ```python
  class TestDimensionSelector:
      def test_margin_question_routes_to_margin_dimensions(self):
          import notebook_context
          dims = notebook_context.select_dimensions("What is the margin pressure?")
          assert "margin_decomposition" in dims

      def test_governance_question_routes_correctly(self):
          import notebook_context
          dims = notebook_context.select_dimensions("Any insider trading?")
          assert "governance_flags" in dims

      def test_cash_flow_question_routes_correctly(self):
          import notebook_context
          dims = notebook_context.select_dimensions("What is the FCF conversion?")
          assert "cash_flow_reconciliation" in dims

      def test_no_match_returns_all_dimensions(self):
          import notebook_context
          dims = notebook_context.select_dimensions("Tell me everything about this company")
          assert len(dims) >= 10  # Should return all or most dimensions

      def test_returns_list_of_strings(self):
          import notebook_context
          dims = notebook_context.select_dimensions("earnings quality")
          assert isinstance(dims, list)
          assert all(isinstance(d, str) for d in dims)
  ```

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement select_dimensions()**

  In `api/notebook_context.py`, add:

  ```python
  # ---------------------------------------------------------------------------
  # Dimension selector for Strategist Chat
  # ---------------------------------------------------------------------------

  _DIMENSION_ROUTES: list[tuple[tuple[str, ...], list[str]]] = [
      (("earnings", "profit", "revenue", "income", "accounting", "recognition"),
       ["earnings_quality", "earnings_composition", "cash_flow_reconciliation"]),
      (("growth", "market share", "moat", "competitive", "barriers", "organic"),
       ["structural_growth", "competitive_position"]),
      (("margin", "cost", "pricing", "input", "opex", "scale", "leverage"),
       ["margin_decomposition", "capital_allocation"]),
      (("governance", "board", "insider", "compensation", "related party",
        "disclosure", "transparency", "options", "turnover", "executive"),
       ["governance_flags", "disclosure_quality"]),
      (("thesis", "assumption", "valuation", "catalyst", "event", "trigger",
        "risk", "variant", "management claims"),
       ["variant_perception", "key_assumptions", "catalyst_timeline"]),
      (("cash flow", "fcf", "working capital", "capex", "free cash",
        "add-back", "adjusted", "underlying", "statutory"),
       ["cash_flow_reconciliation", "capital_allocation"]),
      (("m&a", "acquisition", "goodwill", "intangible", "synergy"),
       ["structural_growth", "capital_allocation"]),
  ]


  def select_dimensions(question: str) -> list[str]:
      """Select relevant corpus dimensions for a user question.

      Returns a deduplicated list of dimension keys. If no route matches,
      returns all dimension keys (Claude's attention will find the answer).
      """
      question_lower = question.lower()
      matched: list[str] = []

      for keywords, dimensions in _DIMENSION_ROUTES:
          if any(kw in question_lower for kw in keywords):
              for d in dimensions:
                  if d not in matched:
                      matched.append(d)

      if not matched:
          # Fallback: return all known dimension keys
          return [dim for dim, _ in DEEP_EXTRACTION_QUERIES]

      return matched
  ```

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Commit**

  ```bash
  git add api/notebook_context.py api/tests/test_notebook_context.py
  git commit -m "feat: add dimension_selector for Strategist Chat routing"
  ```

---

## Agent B: Persister (refresh.py)

### Task B1: Update Track 6 to use deep extraction with freshness skip

**Files:**
- Modify: `api/refresh.py`

- [ ] **Step 1: Read current Track 6 implementation**

  Read `api/refresh.py` lines 476-512 (batch Track 6) and lines 1325-1346 (single refresh Track 6).

- [ ] **Step 2: Update batch pipeline Track 6**

  Replace `_batch_notebook_corpus()` (approx line 476) with:

  ```python
        async def _batch_notebook_corpus():
            """Track 6: Deep extraction with freshness skip (parallel)."""
            try:
                # Check if persisted corpus is fresh (< 24h)
                existing_corpus = research.get("notebookCorpus", {})
                extracted_at = existing_corpus.get("_extractedAt", "")
                if extracted_at and not gathered.get("force_corpus"):
                    from datetime import datetime, timezone
                    try:
                        ts = datetime.fromisoformat(extracted_at)
                        age_hours = (datetime.now(timezone.utc) - ts).total_seconds() / 3600
                        if age_hours < 24:
                            gathered["notebook_corpus"] = existing_corpus
                            logger.info(f"[BATCH][{ticker}] Track 6: Using persisted corpus ({age_hours:.1f}h old, {existing_corpus.get('_dimensionsPopulated', '?')} dims)")
                            return
                    except (ValueError, TypeError):
                        pass  # Parse failed, re-extract

                corpus = await notebook_context.run_deep_extraction(ticker)
                if corpus:
                    gathered["notebook_corpus"] = corpus
                    logger.info(f"[BATCH][{ticker}] Track 6: Deep extraction complete ({corpus.get('_dimensionsPopulated', '?')} dimensions)")
            except Exception as e:
                logger.warning(f"[BATCH][{ticker}] Track 6 deep extraction failed (non-fatal): {e}")
  ```

- [ ] **Step 3: Update single refresh Track 6**

  Apply the same pattern to `_track_notebook_corpus()` in `run_refresh()` (approx line 1325).

- [ ] **Step 4: Add notebookCorpus persistence in _merge_updates()**

  In `_merge_updates()` (line 2309+), before the `return updated` statement, add:

  ```python
      # -- NotebookLM corpus persistence --
      corpus = gathered.get("notebook_corpus")
      if corpus and isinstance(corpus, dict) and corpus.get("_extractedAt"):
          updated["notebookCorpus"] = corpus
  ```

- [ ] **Step 5: Add same persistence in _merge_initiation()**

  Find `_merge_initiation()` and add the same block before its `return updated`.

- [ ] **Step 6: Add force_corpus parameter to run_refresh()**

  Update `run_refresh()` signature:

  ```python
  async def run_refresh(ticker: str, regime_context: dict | None = None, force_corpus: bool = False) -> dict:
  ```

  At the start of the function, after `gathered = {}` is initialised, add:

  ```python
      if force_corpus:
          gathered["force_corpus"] = True
  ```

- [ ] **Step 7: Wire force_corpus through the refresh API endpoint**

  In `api/main.py`, find the refresh endpoint (POST /api/refresh/{ticker}). Add `force_corpus` query parameter:

  ```python
  @app.post("/api/refresh/{ticker}")
  async def refresh_ticker(ticker: str, force_corpus: bool = False, ...):
      ...
      result = await run_refresh(ticker, force_corpus=force_corpus)
  ```

- [ ] **Step 8: Verify syntax and existing tests**

  Run: `cd api && python -c "import ast; ast.parse(open('refresh.py').read()); print('refresh.py syntax ok')"`
  Run: `cd api && python -c "import ast; ast.parse(open('main.py').read()); print('main.py syntax ok')"`

- [ ] **Step 9: Commit**

  ```bash
  git add api/refresh.py api/main.py
  git commit -m "feat: Track 6 deep extraction with freshness skip and notebookCorpus persistence"
  ```

---

## Agent C: Router (main.py -- Strategist Chat)

### Task C1: Replace live NLM query with persisted corpus reader

**Files:**
- Modify: `api/main.py`

- [ ] **Step 1: Read current NLM integration in research-chat**

  Read `api/main.py` lines 496-544 (the NLM query and injection block).

- [ ] **Step 2: Replace live query with persisted corpus lookup**

  Replace the line:
  ```python
  nlm_context = await notebook_context.query_notebook(ticker, body.question)
  ```

  With:

  ```python
    # Load persisted corpus (fast, reliable) with live query fallback
    nlm_context = None
    try:
        import json
        from pathlib import Path
        research_path = Path(__file__).parent.parent / "data" / "research" / f"{ticker}.json"
        if research_path.exists():
            with open(research_path) as f:
                research_data = json.load(f)
            persisted_corpus = research_data.get("notebookCorpus", {})
            if persisted_corpus and persisted_corpus.get("_extractedAt"):
                # Select relevant dimensions for the user's question
                relevant_dims = notebook_context.select_dimensions(body.question)
                filtered = {k: v for k, v in persisted_corpus.items()
                            if k in relevant_dims and isinstance(v, str)}
                if filtered:
                    nlm_context = notebook_context.build_corpus_section(ticker, filtered)
    except Exception as exc:
        logger.debug("Persisted corpus load failed for %s: %s", ticker, exc)

    # Fallback to live NLM query if no persisted corpus
    if not nlm_context:
        nlm_context = await notebook_context.query_notebook(ticker, body.question)
  ```

- [ ] **Step 3: Verify syntax**

  Run: `cd api && python -c "import ast; ast.parse(open('main.py').read()); print('main.py syntax ok')"`

- [ ] **Step 4: Commit**

  ```bash
  git add api/main.py
  git commit -m "feat: Strategist Chat reads persisted corpus with live NLM fallback"
  ```

---

## Agent D: Backfiller (migration script)

### Task D1: Create bulk backfill script

**Files:**
- Create: `scripts/backfill_notebook_corpus.py`

- [ ] **Step 1: Write the script**

  ```python
  #!/usr/bin/env python3
  """One-off bulk backfill: run deep extraction for all registered notebooks.

  Populates notebookCorpus in each ticker's research JSON.
  Sequential execution with 30s sleep between tickers to avoid NLM rate limits.

  Usage:
      cd api && python ../scripts/backfill_notebook_corpus.py
  """

  import asyncio
  import json
  import logging
  import sys
  import time
  from pathlib import Path

  # Add api/ to path for imports
  sys.path.insert(0, str(Path(__file__).parent.parent / "api"))

  import config
  import notebook_context

  logging.basicConfig(
      level=logging.INFO,
      format="%(asctime)s %(levelname)s %(message)s",
  )
  logger = logging.getLogger(__name__)

  SLEEP_BETWEEN_TICKERS = 30
  DATA_DIR = Path(__file__).parent.parent / "data" / "research"


  async def backfill_one(ticker: str) -> bool:
      """Run deep extraction for a single ticker and persist to JSON."""
      research_path = DATA_DIR / f"{ticker}.json"
      if not research_path.exists():
          logger.warning(f"[{ticker}] No research JSON found, skipping")
          return False

      with open(research_path) as f:
          research = json.load(f)

      # Check if already populated
      existing = research.get("notebookCorpus", {})
      if existing.get("_dimensionsPopulated", 0) >= 6:
          logger.info(f"[{ticker}] Already has {existing['_dimensionsPopulated']} dimensions, skipping")
          return True

      logger.info(f"[{ticker}] Starting deep extraction...")
      corpus = await notebook_context.run_deep_extraction(ticker)

      if not corpus or not corpus.get("_extractedAt"):
          logger.warning(f"[{ticker}] Extraction returned empty result")
          return False

      research["notebookCorpus"] = corpus
      with open(research_path, "w") as f:
          json.dump(research, f, indent=2, ensure_ascii=False)

      logger.info(
          f"[{ticker}] Persisted {corpus.get('_dimensionsPopulated', 0)} dimensions "
          f"to {research_path.name}"
      )
      return True


  async def main():
      # Load notebook registry
      registry = config.NOTEBOOKLM_TICKER_NOTEBOOKS
      tickers = sorted([k for k in registry if not k.startswith("_")])
      logger.info(f"Backfilling {len(tickers)} tickers: {', '.join(tickers)}")

      success = 0
      failed = 0

      for i, ticker in enumerate(tickers):
          try:
              ok = await backfill_one(ticker)
              if ok:
                  success += 1
              else:
                  failed += 1
          except Exception as exc:
              logger.error(f"[{ticker}] Backfill failed: {exc}")
              failed += 1

          # Sleep between tickers (except after the last one)
          if i < len(tickers) - 1:
              logger.info(f"Sleeping {SLEEP_BETWEEN_TICKERS}s before next ticker...")
              time.sleep(SLEEP_BETWEEN_TICKERS)

      logger.info(f"Backfill complete: {success} succeeded, {failed} failed out of {len(tickers)}")


  if __name__ == "__main__":
      asyncio.run(main())
  ```

- [ ] **Step 2: Verify syntax**

  Run: `python -c "import ast; ast.parse(open('scripts/backfill_notebook_corpus.py').read()); print('ok')"`

- [ ] **Step 3: Commit**

  ```bash
  git add scripts/backfill_notebook_corpus.py
  git commit -m "feat: add one-off backfill script for notebook corpus migration"
  ```

---

## Agent E: Integrator (post Agents A-D)

### Task E1: Add new config constants

**Files:**
- Modify: `api/config.py`

- [ ] **Step 1: Add NOTEBOOKLM_CORPUS_MAX_CHARS config**

  In `api/config.py`, near the existing NLM config vars, add:

  ```python
  # [O] Max chars for full corpus section in generation prompts (default 48000, ~12k tokens)
  NOTEBOOKLM_CORPUS_MAX_CHARS_TOTAL = int(os.getenv("NOTEBOOKLM_CORPUS_MAX_CHARS_TOTAL", "48000"))
  ```

- [ ] **Step 2: Run config drift check**

  Run: `bash scripts/check-config-drift.sh`
  Expected: CLEAN

- [ ] **Step 3: Commit**

  ```bash
  git add api/config.py
  git commit -m "feat: add NOTEBOOKLM_CORPUS_MAX_CHARS_TOTAL config"
  ```

### Task E2: Full verification suite

- [ ] **Step 1: Run all Python tests**

  Run: `cd api && python -m pytest tests/test_notebook_context.py -v`
  Expected: ALL PASS (original + ~16 new tests)

- [ ] **Step 2: Run Vitest**

  Run: `npm run test:unit`
  Expected: 402+ PASS (count must not decrease)

- [ ] **Step 3: Run build**

  Run: `npm run build`
  Expected: Clean build

- [ ] **Step 4: Run enforcement gates**

  Run: `bash scripts/check-encoding.sh`
  Expected: CLEAN

  Run: `bash scripts/check-config-drift.sh`
  Expected: CLEAN

- [ ] **Step 5: Syntax check all modified Python files**

  Run: `cd api && python -c "import ast; ast.parse(open('notebook_context.py').read()); ast.parse(open('refresh.py').read()); ast.parse(open('main.py').read()); ast.parse(open('config.py').read()); print('all syntax ok')"`
  Expected: `all syntax ok`

- [ ] **Step 6: Verify module loads with new API**

  Run: `cd api && python -c "
  import notebook_context
  print(f'{len(notebook_context.DEEP_EXTRACTION_QUERIES)} queries')
  print(f'run_deep_extraction: {hasattr(notebook_context, \"run_deep_extraction\")}')
  print(f'select_dimensions: {hasattr(notebook_context, \"select_dimensions\")}')
  print(f'NO_DATA_SENTINEL: {notebook_context.NO_DATA_SENTINEL}')
  print(f'backward compat GENERATION_QUERIES: {len(notebook_context.GENERATION_QUERIES)} queries')
  "`
  Expected: 12 queries, True, True, NO_DATA_AVAILABLE, 12 queries

- [ ] **Step 7: Commit final verification**

  ```bash
  git add -A
  git commit -m "feat: NotebookLM deep extraction v2 -- integration verification"
  ```

---

## Plan Self-Review

### Spec coverage

| Acceptance Criterion | Task |
|---------------------|------|
| 1. notebookCorpus in JSON with 12 dims | A1 (queries) + A2 (extraction) + B1 (persistence) |
| 2. Freshness skip < 24h | B1 |
| 3. force_corpus parameter | B1 |
| 4. Semaphore limits to 3 concurrent | A2 |
| 5. NO_DATA_AVAILABLE filtered | A2 |
| 6. Chat reads persisted corpus | C1 |
| 7. Chat falls back to live query | C1 |
| 8. Dimension selection routes questions | A4 + C1 |
| 9. Fallback injects full corpus | A4 |
| 10. Narrative gets 12 dimensions | A3 (formatter) + B1 (Track 6) |
| 11. Auth expiry retains stale corpus | B1 (freshness uses existing) |
| 12. Partial extraction persisted | A2 (_dimensionsPopulated) |
| 13. Backfill script for 22 tickers | D1 |
| 14. All tests pass + new tests | E2 |
| 15. Batch refresh completes | B1 (semaphore prevents overload) |

### Placeholder scan

No instances of: TBD, TODO, implement later, add appropriate, similar to Task N.

### Type consistency

- `run_deep_extraction(ticker: str) -> dict` -- consistent across module, tests, backfill script, refresh.py
- `select_dimensions(question: str) -> list[str]` -- consistent across module, tests, main.py
- `build_corpus_section(ticker, corpus, max_chars)` -- backward compatible, v1 callers unaffected
- `DEEP_EXTRACTION_QUERIES` aliased as `GENERATION_QUERIES` for v1 compatibility

### Agent parallelism safety

Agents A, B, C, D touch different files with no overlap:
- A: `api/notebook_context.py`, `api/tests/test_notebook_context.py`
- B: `api/refresh.py` (+ minor touch to `api/main.py` for force_corpus endpoint)
- C: `api/main.py` (research-chat function only)
- D: `scripts/backfill_notebook_corpus.py` (new file)

**Conflict risk:** B and C both touch `api/main.py`. B adds the `force_corpus` parameter to the refresh endpoint. C modifies the research-chat endpoint. These are in different functions with no overlap. However, to be safe, **Agent C should run after Agent B** or the merge should be manual.

Revised parallelism: A, B, D run in parallel. C runs after B. E runs after all.
