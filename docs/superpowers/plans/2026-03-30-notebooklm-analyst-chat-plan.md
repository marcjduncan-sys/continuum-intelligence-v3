# NotebookLM Analyst Chat Integration -- Implementation Plan

> **For agentic workers:** REQUIRED: Use subagent-driven-development to implement task-by-task.

**Goal:** Inject NotebookLM corpus context into the Analyst Chat pipeline for tickers with registered notebooks, with graceful degradation and silent failure.
**Architecture:** New module `api/notebook_context.py` queried inline between passage retrieval and user message construction in `api/main.py`. Independent auth state, configurable limits.
**Tech Stack:** Python 3.11+, FastAPI, notebooklm-py >=0.3.4, pytest

---

## Task 1: Add config variables

**Files:**
- Modify: `api/config.py`

- [ ] **Step 1: Add NOTEBOOKLM_CONTEXT_MAX_CHARS and NOTEBOOKLM_QUERY_TIMEOUT_SECONDS**

  In `api/config.py`, after the `NOTEBOOKLM_TICKER_NOTEBOOKS` block (after line 102), add:

  ```python
  # NotebookLM query limits for Analyst Chat integration
  NOTEBOOKLM_CONTEXT_MAX_CHARS = int(os.getenv("NOTEBOOKLM_CONTEXT_MAX_CHARS", "2000"))
  NOTEBOOKLM_QUERY_TIMEOUT_SECONDS = int(os.getenv("NOTEBOOKLM_QUERY_TIMEOUT_SECONDS", "10"))
  ```

- [ ] **Step 2: Verify config loads**

  Run: `cd "C:/Users/User/continuum-intelligence-v3/api" && python -c "import config; print(config.NOTEBOOKLM_CONTEXT_MAX_CHARS, config.NOTEBOOKLM_QUERY_TIMEOUT_SECONDS)"`
  Expected: `2000 10`

- [ ] **Step 3: Commit**

  ```bash
  cd "C:/Users/User/continuum-intelligence-v3"
  git add api/config.py
  git commit -m "Add NotebookLM context config vars for analyst chat integration"
  ```

---

## Task 2: Add reset_auth() to gold_agent.py

**Files:**
- Modify: `api/gold_agent.py`

- [ ] **Step 1: Add reset_auth function**

  In `api/gold_agent.py`, after the `_nlm_last_error` declaration (after line 78), add:

  ```python
  def reset_auth() -> None:
      """Reset NotebookLM auth state. Called by the unified reset-auth endpoint."""
      global _nlm_auth_ok, _nlm_last_error
      _nlm_auth_ok = True
      _nlm_last_error = None
  ```

- [ ] **Step 2: Verify import works**

  Run: `cd "C:/Users/User/continuum-intelligence-v3/api" && python -c "import gold_agent; gold_agent.reset_auth(); print('ok')"`
  Expected: `ok`

- [ ] **Step 3: Commit**

  ```bash
  cd "C:/Users/User/continuum-intelligence-v3"
  git add api/gold_agent.py
  git commit -m "Add reset_auth() to gold_agent for unified reset endpoint"
  ```

---

## Task 3: Create notebook_context.py with tests (TDD)

**Files:**
- Create: `api/notebook_context.py`
- Create: `api/tests/test_notebook_context.py`

- [ ] **Step 1: Write the failing tests**

  Create `api/tests/test_notebook_context.py`:

  ```python
  """Tests for notebook_context.py -- NotebookLM analyst chat integration."""

  import asyncio
  import sys
  from pathlib import Path
  from unittest.mock import AsyncMock, MagicMock, patch

  import pytest

  sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

  import config


  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  def _run(coro):
      """Run an async coroutine synchronously."""
      return asyncio.get_event_loop().run_until_complete(coro)


  # ---------------------------------------------------------------------------
  # Test: no notebook for ticker returns None immediately
  # ---------------------------------------------------------------------------

  class TestNoNotebook:
      def test_returns_none_when_ticker_not_in_registry(self):
          """Tickers without a notebook entry should return None with no NLM call."""
          import notebook_context

          with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {}, clear=True):
              result = _run(notebook_context.query_notebook("ZZZ", "test question"))
          assert result is None


  # ---------------------------------------------------------------------------
  # Test: successful NLM query returns text
  # ---------------------------------------------------------------------------

  class TestSuccessfulQuery:
      def test_returns_text_when_notebook_exists(self):
          """A ticker with a notebook should query NLM and return response text."""
          import notebook_context
          notebook_context._nlm_auth_ok = True

          mock_response = MagicMock()
          mock_response.text = "Gold production increased 15% year over year."

          mock_client = AsyncMock()
          mock_client.chat.ask = AsyncMock(return_value=mock_response)
          mock_client.__aenter__ = AsyncMock(return_value=mock_client)
          mock_client.__aexit__ = AsyncMock(return_value=False)

          with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
              with patch("notebook_context._HAS_NOTEBOOKLM", True):
                  with patch("notebook_context.NotebookLMClient") as MockNLM:
                      MockNLM.from_storage = AsyncMock(return_value=mock_client)
                      result = _run(notebook_context.query_notebook("OBM", "What is OBM production?"))

          assert result == "Gold production increased 15% year over year."

      def test_caps_response_at_max_chars(self):
          """Response text exceeding NOTEBOOKLM_CONTEXT_MAX_CHARS should be truncated."""
          import notebook_context
          notebook_context._nlm_auth_ok = True

          long_text = "A" * 5000
          mock_response = MagicMock()
          mock_response.text = long_text

          mock_client = AsyncMock()
          mock_client.chat.ask = AsyncMock(return_value=mock_response)
          mock_client.__aenter__ = AsyncMock(return_value=mock_client)
          mock_client.__aexit__ = AsyncMock(return_value=False)

          with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
              with patch("notebook_context._HAS_NOTEBOOKLM", True):
                  with patch("notebook_context.NotebookLMClient") as MockNLM:
                      MockNLM.from_storage = AsyncMock(return_value=mock_client)
                      result = _run(notebook_context.query_notebook("OBM", "question"))

          assert result is not None
          assert len(result) <= config.NOTEBOOKLM_CONTEXT_MAX_CHARS


  # ---------------------------------------------------------------------------
  # Test: auth failure flips flag and returns None
  # ---------------------------------------------------------------------------

  class TestAuthFailure:
      def test_auth_error_flips_flag_and_returns_none(self):
          """Auth-related exceptions should flip _nlm_auth_ok and return None."""
          import notebook_context
          notebook_context._nlm_auth_ok = True

          mock_client = AsyncMock()
          mock_client.chat.ask = AsyncMock(side_effect=Exception("401 Unauthorized"))
          mock_client.__aenter__ = AsyncMock(return_value=mock_client)
          mock_client.__aexit__ = AsyncMock(return_value=False)

          with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
              with patch("notebook_context._HAS_NOTEBOOKLM", True):
                  with patch("notebook_context.NotebookLMClient") as MockNLM:
                      MockNLM.from_storage = AsyncMock(return_value=mock_client)
                      result = _run(notebook_context.query_notebook("OBM", "question"))

          assert result is None
          assert notebook_context._nlm_auth_ok is False

      def test_skips_query_when_auth_flag_is_false(self):
          """When _nlm_auth_ok is False, should return None without attempting query."""
          import notebook_context
          notebook_context._nlm_auth_ok = False

          with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
              with patch("notebook_context._HAS_NOTEBOOKLM", True):
                  with patch("notebook_context.NotebookLMClient") as MockNLM:
                      result = _run(notebook_context.query_notebook("OBM", "question"))
                      MockNLM.from_storage.assert_not_called()

          assert result is None


  # ---------------------------------------------------------------------------
  # Test: transient errors do not flip auth flag
  # ---------------------------------------------------------------------------

  class TestTransientError:
      def test_timeout_returns_none_without_flipping_auth(self):
          """Timeout errors should return None but leave _nlm_auth_ok True."""
          import notebook_context
          notebook_context._nlm_auth_ok = True

          mock_client = AsyncMock()
          mock_client.chat.ask = AsyncMock(side_effect=Exception("Connection timed out"))
          mock_client.__aenter__ = AsyncMock(return_value=mock_client)
          mock_client.__aexit__ = AsyncMock(return_value=False)

          with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
              with patch("notebook_context._HAS_NOTEBOOKLM", True):
                  with patch("notebook_context.NotebookLMClient") as MockNLM:
                      MockNLM.from_storage = AsyncMock(return_value=mock_client)
                      result = _run(notebook_context.query_notebook("OBM", "question"))

          assert result is None
          assert notebook_context._nlm_auth_ok is True


  # ---------------------------------------------------------------------------
  # Test: empty response returns None
  # ---------------------------------------------------------------------------

  class TestEmptyResponse:
      def test_short_response_returns_none(self):
          """Responses under 20 characters should be treated as empty."""
          import notebook_context
          notebook_context._nlm_auth_ok = True

          mock_response = MagicMock()
          mock_response.text = "N/A"

          mock_client = AsyncMock()
          mock_client.chat.ask = AsyncMock(return_value=mock_response)
          mock_client.__aenter__ = AsyncMock(return_value=mock_client)
          mock_client.__aexit__ = AsyncMock(return_value=False)

          with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
              with patch("notebook_context._HAS_NOTEBOOKLM", True):
                  with patch("notebook_context.NotebookLMClient") as MockNLM:
                      MockNLM.from_storage = AsyncMock(return_value=mock_client)
                      result = _run(notebook_context.query_notebook("OBM", "question"))

          assert result is None


  # ---------------------------------------------------------------------------
  # Test: reset_auth resets state
  # ---------------------------------------------------------------------------

  class TestResetAuth:
      def test_reset_auth_restores_flag(self):
          """reset_auth() should set _nlm_auth_ok to True and clear error."""
          import notebook_context
          notebook_context._nlm_auth_ok = False
          notebook_context._nlm_last_error = "some error"

          notebook_context.reset_auth()

          assert notebook_context._nlm_auth_ok is True
          assert notebook_context._nlm_last_error is None


  # ---------------------------------------------------------------------------
  # Test: notebooklm-py not installed
  # ---------------------------------------------------------------------------

  class TestNlmNotInstalled:
      def test_returns_none_when_library_not_installed(self):
          """When notebooklm-py is not installed, should return None gracefully."""
          import notebook_context
          notebook_context._nlm_auth_ok = True

          with patch.dict(config.NOTEBOOKLM_TICKER_NOTEBOOKS, {"OBM": "fake-uuid"}, clear=True):
              with patch("notebook_context._HAS_NOTEBOOKLM", False):
                  result = _run(notebook_context.query_notebook("OBM", "question"))

          assert result is None
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run: `cd "C:/Users/User/continuum-intelligence-v3" && python -m pytest api/tests/test_notebook_context.py -v 2>&1 | head -40`
  Expected: FAIL (ModuleNotFoundError: No module named 'notebook_context')

- [ ] **Step 3: Write the implementation**

  Create `api/notebook_context.py`:

  ```python
  """
  NotebookLM context provider for Analyst Chat.

  Queries a ticker's NotebookLM notebook (if registered) and returns corpus
  context for injection into the research-chat pipeline. Silent failure on
  all error paths: the Analyst Chat must work identically for tickers without
  notebooks or when NotebookLM is unavailable.

  Auth state is independent of gold_agent.py. Both modules are reset via
  POST /api/notebooklm/reset-auth.
  """

  from __future__ import annotations

  import asyncio
  import logging
  from typing import Optional

  import config

  logger = logging.getLogger(__name__)

  try:
      from notebooklm import NotebookLMClient
      _HAS_NOTEBOOKLM = True
  except ImportError:
      _HAS_NOTEBOOKLM = False

  # ---------------------------------------------------------------------------
  # Auth state -- independent of gold_agent
  # ---------------------------------------------------------------------------

  _nlm_auth_ok: bool = True
  _nlm_last_error: Optional[str] = None

  _AUTH_ERROR_MARKERS = ("auth", "401", "cookie", "login", "forbidden", "403")


  def reset_auth() -> None:
      """Reset NotebookLM auth state. Called by the unified reset-auth endpoint."""
      global _nlm_auth_ok, _nlm_last_error
      _nlm_auth_ok = True
      _nlm_last_error = None


  # ---------------------------------------------------------------------------
  # Public API
  # ---------------------------------------------------------------------------

  async def query_notebook(ticker: str, question: str) -> Optional[str]:
      """Query the ticker's NotebookLM notebook with the user's question.

      Returns corpus context text, or None if:
      - No notebook registered for this ticker
      - notebooklm-py not installed
      - Auth expired (flips _nlm_auth_ok to False)
      - Query timeout or network error
      - Empty/minimal response
      """
      global _nlm_auth_ok, _nlm_last_error

      notebook_id = config.NOTEBOOKLM_TICKER_NOTEBOOKS.get(ticker.upper(), "")
      if not notebook_id:
          return None

      if not _HAS_NOTEBOOKLM:
          return None

      if not _nlm_auth_ok:
          return None

      if not config.NOTEBOOKLM_AUTH_JSON:
          return None

      query = f"Regarding {ticker}: {question}"

      try:
          text = await asyncio.wait_for(
              _ask_notebook(notebook_id, query),
              timeout=config.NOTEBOOKLM_QUERY_TIMEOUT_SECONDS,
          )
      except asyncio.TimeoutError:
          logger.warning("NotebookLM query timeout for %s (>%ds)", ticker, config.NOTEBOOKLM_QUERY_TIMEOUT_SECONDS)
          return None
      except Exception as exc:
          err_str = str(exc).lower()
          if any(marker in err_str for marker in _AUTH_ERROR_MARKERS):
              _nlm_auth_ok = False
              _nlm_last_error = f"NotebookLM auth expired: {exc}"
              logger.warning("NotebookLM auth expired for analyst chat: %s", exc)
          else:
              logger.warning("NotebookLM query failed for %s: %s", ticker, exc)
          return None

      if not text or len(text) < 20:
          logger.info("NotebookLM returned empty/minimal response for %s", ticker)
          return None

      if len(text) > config.NOTEBOOKLM_CONTEXT_MAX_CHARS:
          text = text[:config.NOTEBOOKLM_CONTEXT_MAX_CHARS]

      return text


  async def _ask_notebook(notebook_id: str, query: str) -> str:
      """Raw NotebookLM API call. Separated for timeout wrapping."""
      async with await NotebookLMClient.from_storage() as client:
          response = await client.chat.ask(
              notebook_id=notebook_id,
              message=query,
          )
          return response.text if hasattr(response, "text") else str(response)
  ```

- [ ] **Step 4: Run tests to verify they pass**

  Run: `cd "C:/Users/User/continuum-intelligence-v3" && python -m pytest api/tests/test_notebook_context.py -v`
  Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

  ```bash
  cd "C:/Users/User/continuum-intelligence-v3"
  git add api/notebook_context.py api/tests/test_notebook_context.py
  git commit -m "Add notebook_context module with tests for analyst chat NLM integration"
  ```

---

## Task 4: Integrate into research-chat endpoint

**Files:**
- Modify: `api/main.py`

- [ ] **Step 1: Add import**

  In `api/main.py`, after the `from gold_agent import ...` line (line 62), add:

  ```python
  import notebook_context
  ```

- [ ] **Step 2: Add NLM query after passage retrieval**

  In the `research_chat()` function, after line 466 (`context = _build_context(passages, ticker)`), add:

  ```python
      # Query NotebookLM corpus (supplementary context, silent failure)
      nlm_context = await notebook_context.query_notebook(ticker, body.question)
  ```

- [ ] **Step 3: Inject notebook_context block into user message**

  In the user message assembly block (around lines 498-513), modify to inject the NLM context. Replace the block starting at line 498:

  ```python
      # Add the current question with structured research + passage context
      structured_ctx = prompt_builder.build_structured_research_context(ticker)
      if structured_ctx or context or nlm_context:
          user_message = ""
          if structured_ctx:
              user_message += structured_ctx + "\n\n"
          if context:
              user_message += f"<research_context>\n{context}\n</research_context>\n\n"
          if nlm_context:
              user_message += (
                  f"<notebook_context>\n"
                  f"## Supplementary Corpus Context for {ticker}\n"
                  f"Source: NotebookLM corpus (curated research documents)\n\n"
                  f"{nlm_context}\n"
                  f"</notebook_context>\n\n"
              )
          user_message += f"**Stock:** {ticker}\n"
      else:
          user_message = f"**Stock:** {ticker}\n"
  ```

- [ ] **Step 4: Add unified reset-auth endpoint**

  After the existing gold reset-auth endpoint (after line 714), add:

  ```python
  @app.post("/api/notebooklm/reset-auth", dependencies=[Depends(verify_api_key)])
  async def notebooklm_reset_auth():
      """Reset NotebookLM auth flags in both notebook_context and gold_agent modules.

      Call this after refreshing cookies and updating NOTEBOOKLM_AUTH_JSON in Fly.io
      to avoid needing a full redeploy.
      """
      notebook_context.reset_auth()
      gold_agent.reset_auth()
      return {"status": "ok", "notebook_context_auth_ok": True, "gold_agent_auth_ok": True}
  ```

- [ ] **Step 5: Update existing gold reset endpoint to use reset_auth()**

  Replace lines 711-713 in the existing `gold_agent_reset_auth()` function:

  ```python
      gold_agent.reset_auth()
      return {"status": "ok", "nlm_auth_ok": True}
  ```

- [ ] **Step 6: Add gold_agent import reference for reset**

  Ensure `gold_agent` is available as a module reference for the reset endpoint. It is already imported at line 62 via `from gold_agent import run_gold_analysis, check_gold_health, get_cached_result`. Add a direct import:

  ```python
  import gold_agent
  ```

  Place this after the existing `from gold_agent import ...` line.

- [ ] **Step 7: Verify existing tests still pass**

  Run: `cd "C:/Users/User/continuum-intelligence-v3" && npm run test:unit`
  Expected: 234+ tests PASS

  Run: `cd "C:/Users/User/continuum-intelligence-v3" && python -m pytest api/tests/ -v --timeout=30 2>&1 | tail -20`
  Expected: All existing tests PASS

- [ ] **Step 8: Commit**

  ```bash
  cd "C:/Users/User/continuum-intelligence-v3"
  git add api/main.py
  git commit -m "Integrate NotebookLM context into analyst chat pipeline"
  ```

---

## Task 5: Upgrade notebooklm-py

**Files:**
- Modify: `api/requirements.txt`

- [ ] **Step 1: Update version pin**

  In `api/requirements.txt`, change:
  ```
  notebooklm-py>=0.3.3
  ```
  to:
  ```
  notebooklm-py>=0.3.4
  ```

- [ ] **Step 2: Verify resolution**

  Run: `cd "C:/Users/User/continuum-intelligence-v3/api" && pip install "notebooklm-py>=0.3.4" --dry-run 2>&1 | head -10`
  Expected: Shows notebooklm-py 0.3.4 would be installed

- [ ] **Step 3: Commit**

  ```bash
  cd "C:/Users/User/continuum-intelligence-v3"
  git add api/requirements.txt
  git commit -m "Bump notebooklm-py to >=0.3.4"
  ```

---

## Task 6: Full verification

- [ ] **Step 1: Run all tests**

  Run: `cd "C:/Users/User/continuum-intelligence-v3" && npm run test:unit`
  Expected: 234+ PASS

  Run: `cd "C:/Users/User/continuum-intelligence-v3" && python -m pytest api/tests/ -v --timeout=30`
  Expected: All PASS including new test_notebook_context.py (8 tests)

- [ ] **Step 2: Run build**

  Run: `cd "C:/Users/User/continuum-intelligence-v3" && npm run build`
  Expected: Clean build

- [ ] **Step 3: Verify no regressions in lint**

  Run: `cd "C:/Users/User/continuum-intelligence-v3" && npm run lint`
  Expected: Clean or same warnings as before

---

## Plan Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| New module notebook_context.py | Task 3 |
| Config vars | Task 1 |
| NLM query in chat pipeline | Task 4 (steps 2-3) |
| Independent auth state | Task 3 |
| Unified reset-auth endpoint | Task 4 (step 4) |
| gold_agent.reset_auth() | Task 2 |
| Existing gold endpoint uses reset_auth() | Task 4 (step 5) |
| notebooklm-py upgrade | Task 5 |
| Unit tests | Task 3 |
| Full verification | Task 6 |

### Placeholder scan

No instances of: TBD, TODO, implement later, add appropriate, similar to Task N, fill in details.

### Type consistency

- `query_notebook(ticker: str, question: str) -> Optional[str]` -- consistent across module, tests, and main.py integration
- `reset_auth() -> None` -- consistent in both notebook_context and gold_agent
- `config.NOTEBOOKLM_CONTEXT_MAX_CHARS: int` and `config.NOTEBOOKLM_QUERY_TIMEOUT_SECONDS: int` -- used correctly in notebook_context.py
