# NotebookLM Generation Pipeline Integration -- Implementation Plan

> **For agentic workers:** REQUIRED: Use subagent-driven-development to implement task-by-task.

**Goal:** Inject NotebookLM corpus context into narrative/thesis generation during coverage initiation and refresh.
**Architecture:** Batch query as parallel Track 3 in refresh pipeline. Corpus section injected into Stage 3 prompts.
**Tech Stack:** Python 3.11+, asyncio, notebooklm-py, pytest

---

## Task 1: Add GENERATION_QUERIES, query_notebook_batch(), and build_corpus_section() to notebook_context.py (TDD)

**Files:**
- Modify: `api/notebook_context.py`
- Modify: `api/tests/test_notebook_context.py`

- [ ] **Step 1: Write failing tests**

  Append to `api/tests/test_notebook_context.py`:

  ```python
  # ---------------------------------------------------------------------------
  # Test: query_notebook_batch
  # ---------------------------------------------------------------------------

  class TestQueryNotebookBatch:
      def test_returns_empty_dict_when_no_notebook(self):
          """Tickers without a notebook should return empty dict."""
          import notebook_context

          with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {}, clear=True):
              result = asyncio.run(notebook_context.query_notebook_batch("ZZZ"))
          assert result == {}

      def test_returns_dict_with_dimension_keys(self):
          """Batch query should return a dict keyed by dimension name."""
          import notebook_context
          notebook_context._nlm_auth_ok = True

          mock_response = MagicMock()
          mock_response.text = "Substantive response text for this dimension query."

          mock_client = AsyncMock()
          mock_client.chat.ask = AsyncMock(return_value=mock_response)
          mock_client.__aenter__ = AsyncMock(return_value=mock_client)
          mock_client.__aexit__ = AsyncMock(return_value=False)

          with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
              with patch("notebook_context._HAS_NOTEBOOKLM", True):
                  with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth-json"):
                      with patch("notebook_context.NotebookLMClient") as MockNLM:
                          MockNLM.from_storage = AsyncMock(return_value=mock_client)
                          result = asyncio.run(notebook_context.query_notebook_batch("OBM"))

          assert "operations" in result
          assert "financials" in result
          assert "risks" in result
          assert "catalysts" in result
          assert all(v == "Substantive response text for this dimension query." for v in result.values())

      def test_partial_failure_returns_partial_dict(self):
          """If some queries fail, those dimensions are None, others succeed."""
          import notebook_context
          notebook_context._nlm_auth_ok = True

          call_count = 0

          async def _side_effect(**kwargs):
              nonlocal call_count
              call_count += 1
              if call_count == 2:
                  raise Exception("Connection timed out")
              resp = MagicMock()
              resp.text = "Good response for this dimension query."
              return resp

          mock_client = AsyncMock()
          mock_client.chat.ask = _side_effect
          mock_client.__aenter__ = AsyncMock(return_value=mock_client)
          mock_client.__aexit__ = AsyncMock(return_value=False)

          with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
              with patch("notebook_context._HAS_NOTEBOOKLM", True):
                  with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth-json"):
                      with patch("notebook_context.NotebookLMClient") as MockNLM:
                          MockNLM.from_storage = AsyncMock(return_value=mock_client)
                          result = asyncio.run(notebook_context.query_notebook_batch("OBM"))

          # 3 should succeed, 1 should be None
          none_count = sum(1 for v in result.values() if v is None)
          text_count = sum(1 for v in result.values() if v is not None)
          assert none_count == 1
          assert text_count == 3

      def test_auth_failure_returns_empty_dict(self):
          """Auth failure should return empty dict and flip the flag."""
          import notebook_context
          notebook_context._nlm_auth_ok = True

          mock_client = AsyncMock()
          mock_client.chat.ask = AsyncMock(side_effect=Exception("401 Unauthorized"))
          mock_client.__aenter__ = AsyncMock(return_value=mock_client)
          mock_client.__aexit__ = AsyncMock(return_value=False)

          with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
              with patch("notebook_context._HAS_NOTEBOOKLM", True):
                  with patch.object(config, "NOTEBOOKLM_AUTH_JSON", "fake-auth-json"):
                      with patch("notebook_context.NotebookLMClient") as MockNLM:
                          MockNLM.from_storage = AsyncMock(return_value=mock_client)
                          result = asyncio.run(notebook_context.query_notebook_batch("OBM"))

          assert result == {} or all(v is None for v in result.values())
          assert notebook_context._nlm_auth_ok is False

      def test_skips_when_auth_flag_false(self):
          """When _nlm_auth_ok is False, batch should return empty dict immediately."""
          import notebook_context
          notebook_context._nlm_auth_ok = False

          with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
              with patch("notebook_context._HAS_NOTEBOOKLM", True):
                  result = asyncio.run(notebook_context.query_notebook_batch("OBM"))

          assert result == {}


  # ---------------------------------------------------------------------------
  # Test: build_corpus_section
  # ---------------------------------------------------------------------------

  class TestBuildCorpusSection:
      def test_full_corpus_formats_all_dimensions(self):
          """All four dimensions present should produce a formatted section."""
          import notebook_context

          corpus = {
              "operations": "Mining gold at Davyhurst with two underground mines.",
              "financials": "FY26 revenue of A$180M, AISC A$2,800/oz.",
              "risks": "Single-asset concentration, cost overruns at depth.",
              "catalysts": "Expansion of Sand King decline, H2 2026 DFS.",
          }
          result = notebook_context.build_corpus_section("OBM", corpus)

          assert "## Source Document Context for OBM" in result
          assert "### Operations & Assets" in result
          assert "### Financials & Guidance" in result
          assert "### Risks & Controversies" in result
          assert "### Catalysts & Strategy" in result
          assert "Mining gold at Davyhurst" in result
          assert "Do not reproduce verbatim" in result

      def test_empty_corpus_returns_empty_string(self):
          """Empty dict should return empty string."""
          import notebook_context

          result = notebook_context.build_corpus_section("OBM", {})
          assert result == ""

      def test_all_none_returns_empty_string(self):
          """All None values should return empty string."""
          import notebook_context

          corpus = {"operations": None, "financials": None, "risks": None, "catalysts": None}
          result = notebook_context.build_corpus_section("OBM", corpus)
          assert result == ""

      def test_partial_corpus_includes_only_present_dimensions(self):
          """Only dimensions with content should appear in the output."""
          import notebook_context

          corpus = {
              "operations": "Active mining operations at two sites.",
              "financials": None,
              "risks": "Geotechnical concerns in the eastern decline.",
              "catalysts": None,
          }
          result = notebook_context.build_corpus_section("OBM", corpus)

          assert "### Operations & Assets" in result
          assert "### Risks & Controversies" in result
          assert "### Financials & Guidance" not in result
          assert "### Catalysts & Strategy" not in result
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run: `cd "C:/Users/User/continuum-intelligence-v3" && python -m pytest api/tests/test_notebook_context.py -v -k "Batch or CorpusSection" 2>&1 | head -20`
  Expected: FAIL (AttributeError: module 'notebook_context' has no attribute 'query_notebook_batch')

- [ ] **Step 3: Write the implementation**

  Read `api/notebook_context.py` first, then append after the existing `_ask_notebook` function:

  ```python
  # ---------------------------------------------------------------------------
  # Generation pipeline: batch query + corpus formatter
  # ---------------------------------------------------------------------------

  GENERATION_QUERIES: list[tuple[str, str]] = [
      ("operations", "What are the core business operations, key assets, production metrics, and operational performance?"),
      ("financials", "What are the key financial metrics, recent results, earnings guidance, and balance sheet position?"),
      ("risks", "What are the main risks, regulatory issues, controversies, or operational challenges?"),
      ("catalysts", "What are the upcoming catalysts, strategic initiatives, expansion plans, or corporate actions?"),
  ]


  async def query_notebook_batch(ticker: str) -> dict[str, str | None]:
      """Query the ticker's NotebookLM notebook with the generation battery.

      Runs all GENERATION_QUERIES in parallel within a single client session.
      Returns a dict keyed by dimension name. Dimensions that fail or return
      minimal content are None. Returns empty dict if no notebook, auth expired,
      or library not installed.
      """
      global _nlm_auth_ok, _nlm_last_error

      notebook_id = config.NOTEBOOKLM_TICKER_NOTEBOOKS.get(ticker.upper(), "")
      if not notebook_id:
          return {}

      if not _HAS_NOTEBOOKLM:
          return {}

      if not _nlm_auth_ok:
          return {}

      if not config.NOTEBOOKLM_AUTH_JSON:
          return {}

      results: dict[str, str | None] = {}

      try:
          async with await NotebookLMClient.from_storage() as client:

              async def _query_one(dimension: str, question: str) -> tuple[str, str | None]:
                  query = f"Regarding {ticker}: {question}"
                  try:
                      response = await asyncio.wait_for(
                          client.chat.ask(notebook_id=notebook_id, message=query),
                          timeout=config.NOTEBOOKLM_QUERY_TIMEOUT_SECONDS,
                      )
                      text = response.text if hasattr(response, "text") else str(response)
                      if not text or len(text) < 20:
                          logger.info("NotebookLM batch: empty response for %s/%s", ticker, dimension)
                          return dimension, None
                      if len(text) > config.NOTEBOOKLM_CONTEXT_MAX_CHARS:
                          text = text[:config.NOTEBOOKLM_CONTEXT_MAX_CHARS]
                      return dimension, text
                  except asyncio.TimeoutError:
                      logger.warning("NotebookLM batch timeout for %s/%s", ticker, dimension)
                      return dimension, None
                  except Exception as exc:
                      err_str = str(exc).lower()
                      if any(marker in err_str for marker in _AUTH_ERROR_MARKERS):
                          _nlm_auth_ok = False
                          _nlm_last_error = f"NotebookLM auth expired: {exc}"
                          logger.warning("NotebookLM auth expired during batch for %s: %s", ticker, exc)
                      else:
                          logger.warning("NotebookLM batch query failed for %s/%s: %s", ticker, dimension, exc)
                      return dimension, None

              pairs = await asyncio.gather(
                  *[_query_one(dim, q) for dim, q in GENERATION_QUERIES]
              )
              results = dict(pairs)

      except Exception as exc:
          err_str = str(exc).lower()
          if any(marker in err_str for marker in _AUTH_ERROR_MARKERS):
              _nlm_auth_ok = False
              _nlm_last_error = f"NotebookLM auth expired: {exc}"
              logger.warning("NotebookLM auth expired during batch session for %s: %s", ticker, exc)
          else:
              logger.warning("NotebookLM batch session failed for %s: %s", ticker, exc)
          return {}

      return results


  def build_corpus_section(ticker: str, corpus: dict[str, str | None]) -> str:
      """Format notebook corpus responses into a prompt section.

      Returns empty string if no dimension has content.
      """
      _LABELS = {
          "operations": "Operations & Assets",
          "financials": "Financials & Guidance",
          "risks": "Risks & Controversies",
          "catalysts": "Catalysts & Strategy",
      }
      parts = [
          f"\n## Source Document Context for {ticker}",
          "The following is grounded in curated research documents (annual reports, "
          "filings, presentations). Use it to anchor your analysis with specific "
          "facts, figures, and operational detail. Do not reproduce verbatim.",
      ]
      has_content = False
      for key, label in _LABELS.items():
          text = corpus.get(key)
          if text:
              parts.append(f"\n### {label}")
              parts.append(text)
              has_content = True
      if not has_content:
          return ""
      return "\n".join(parts)
  ```

- [ ] **Step 4: Run tests to verify they pass**

  Run: `cd "C:/Users/User/continuum-intelligence-v3" && python -m pytest api/tests/test_notebook_context.py -v`
  Expected: All 20 tests PASS (11 existing + 9 new)

- [ ] **Step 5: Commit**

  ```bash
  cd "C:/Users/User/continuum-intelligence-v3"
  git add api/notebook_context.py api/tests/test_notebook_context.py
  git commit -m "Add query_notebook_batch() and build_corpus_section() to notebook_context"
  ```

---

## Task 2: Add Track 3 and corpus injection to run_refresh()

**Files:**
- Modify: `api/refresh.py`

- [ ] **Step 1: Read the target areas**

  Read `api/refresh.py` lines 60-70 (imports), lines 1295-1320 (parallel tracks in run_refresh), lines 1720-1745 (coverage initiation user prompt tail), lines 1985-2055 (hypothesis synthesis user prompt tail).

  IMPORTANT: Read the full context of each area before editing. Do not rely on line numbers from the plan; they may have shifted. Use the code landmarks below.

- [ ] **Step 2: Add import**

  At the top of `api/refresh.py`, in the imports section, add:

  ```python
  import notebook_context
  ```

  Landmark: place it near the existing `from gold_agent import run_gold_analysis` line.

- [ ] **Step 3: Add _track_notebook_corpus() and include in asyncio.gather() for run_refresh()**

  Landmark: after `_track_gold_overlay()` definition (which ends with `return None`), before the `# ---- Run all tracks in parallel ----` comment.

  Add the track function:

  ```python
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
  ```

  Then modify the `asyncio.gather()` call to include Track 6. Current code:

  ```python
  (ev_hyp_result, structure_result, price_driver_result, gold_result) = (
      await asyncio.gather(
          _track_evidence_and_synthesis(),
          _run_structure_update(ticker, research, gathered),
          _track_price_drivers(),
          _track_gold_overlay(),
          return_exceptions=True,
      )
  )
  ```

  Change to:

  ```python
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
  ```

  And add the exception handler after the existing ones:

  ```python
  if isinstance(_nlm_result, Exception):
      logger.warning(f"[{ticker}] Track 6 notebook corpus exception (non-fatal): {_nlm_result}")
  ```

- [ ] **Step 4: Add same track to batch pipeline's asyncio.gather()**

  Landmark: the batch pipeline's `asyncio.gather()` at `await asyncio.gather(_batch_evidence_and_synthesis(), _run_structure_update(...), _batch_price_drivers(), _batch_gold_overlay(), ...)`.

  Add `_track_notebook_corpus()` definition inside the batch function (same code as Step 3's track function), and add it to the gather call. Update the unpacking to include `_nlm_result`.

  Note: the `_track_notebook_corpus()` function can be defined once before the parallel tracks section, since it uses the same `gathered` dict and `ticker` from the enclosing scope. In the batch pipeline, define it after `_batch_gold_overlay()`.

- [ ] **Step 5: Inject corpus section into _run_coverage_initiation()**

  Landmark: in `_run_coverage_initiation()`, the user prompt is built as an f-string assigned to `user_prompt`. Find the line:
  ```python
  {_build_regime_section(gathered)}
  ```
  After it (and before the closing instruction "This is INITIAL COVERAGE..."), add:
  ```python
  {notebook_context.build_corpus_section(ticker, gathered.get("notebook_corpus", {}))}
  ```

- [ ] **Step 6: Inject corpus section into _run_hypothesis_synthesis()**

  Landmark: in `_run_hypothesis_synthesis()`, same pattern. Find the line:
  ```python
  {_build_regime_section(gathered)}
  ```
  After it (and before the closing instruction "IMPORTANT: Any event with a date BEFORE..."), add:
  ```python
  {notebook_context.build_corpus_section(ticker, gathered.get("notebook_corpus", {}))}
  ```

- [ ] **Step 7: Verify existing tests still pass**

  Run: `cd "C:/Users/User/continuum-intelligence-v3" && npm run test:unit 2>&1 | tail -5`
  Expected: 272+ PASS

  Run: `cd "C:/Users/User/continuum-intelligence-v3" && python -m pytest api/tests/test_notebook_context.py -v`
  Expected: 20 PASS

- [ ] **Step 8: Commit**

  ```bash
  cd "C:/Users/User/continuum-intelligence-v3"
  git add api/refresh.py
  git commit -m "Inject NotebookLM corpus context into narrative and thesis generation"
  ```

---

## Task 3: Full verification

- [ ] **Step 1: Run all tests**

  Run: `cd "C:/Users/User/continuum-intelligence-v3" && npm run test:unit`
  Expected: 272+ PASS

  Run: `cd "C:/Users/User/continuum-intelligence-v3" && python -m pytest api/tests/test_notebook_context.py -v`
  Expected: 20 PASS (11 existing + 9 new)

- [ ] **Step 2: Run build**

  Run: `cd "C:/Users/User/continuum-intelligence-v3" && npm run build`
  Expected: Clean build

- [ ] **Step 3: Syntax check on refresh.py**

  Run: `cd "C:/Users/User/continuum-intelligence-v3" && python -c "import ast; ast.parse(open('api/refresh.py').read()); print('syntax ok')"`
  Expected: `syntax ok`

- [ ] **Step 4: Verify notebook_context module loads cleanly**

  Run: `cd "C:/Users/User/continuum-intelligence-v3/api" && python -c "import notebook_context; print(len(notebook_context.GENERATION_QUERIES), 'queries defined'); print('batch:', hasattr(notebook_context, 'query_notebook_batch')); print('section:', hasattr(notebook_context, 'build_corpus_section'))"`
  Expected: `4 queries defined`, `batch: True`, `section: True`

---

## Plan Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| GENERATION_QUERIES constant | Task 1 |
| query_notebook_batch() | Task 1 |
| build_corpus_section() | Task 1 |
| Track 3 in run_refresh() | Task 2 (step 3) |
| Track in batch pipeline | Task 2 (step 4) |
| Corpus injection in coverage initiation | Task 2 (step 5) |
| Corpus injection in hypothesis synthesis | Task 2 (step 6) |
| Tests for batch query | Task 1 |
| Tests for corpus formatter | Task 1 |
| Full verification | Task 3 |

### Placeholder scan

No instances of: TBD, TODO, implement later, add appropriate, similar to Task N.

### Type consistency

- `query_notebook_batch(ticker: str) -> dict[str, str | None]` -- consistent across module, tests, and refresh.py usage
- `build_corpus_section(ticker: str, corpus: dict[str, str | None]) -> str` -- consistent across module, tests, and refresh.py usage
- `GENERATION_QUERIES: list[tuple[str, str]]` -- iterated correctly in batch function
