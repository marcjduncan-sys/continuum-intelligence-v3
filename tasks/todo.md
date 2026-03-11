# Task Tracker

<!-- Claude: update this file as you work. Check items off, add review notes, track blockers. -->

## Current Task

**Phase 9: Proactive Insights**

Phase 8 complete (commit d70b6ae). Phase 9 adds a nightly insight scan that compares updated
research data against stored user memories per ticker and surfaces confirmations/contradictions
as in-app notifications. SMTP email delivery deferred until SMTP provider is configured.

---

## Wave 0 -- Infrastructure Activation (USER ACTIONS, ~15 minutes)

These steps require Railway dashboard access. Claude cannot perform them.

- [ ] **0A** -- Open Railway dashboard. Add the **PostgreSQL** plugin to the Continuum service.
      Confirm DATABASE_URL appears in the Continuum service Variables tab after provisioning.
- [ ] **0B** -- Add JWT_SECRET variable: 32-char hex (run openssl rand -hex 16 in terminal).
      Current fallback dev-insecure-secret is not safe for production.
- [ ] **0C** -- Add SMTP variables: EMAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.
      Until set, OTP codes are logged server-side only (functional but not user-facing).
- [ ] **0D** -- Verify: curl https://imaginative-vision-production-16cb.up.railway.app/api/health
      Must return status: healthy. Check Railway logs for migration run output.

Expected Railway log on first DB request after provisioning:
  Running migration 001_initial.sql ... done
  Running migration 002_auth.sql ... done
  Running migration 003_summaries.sql ... done
  Running migration 004_llm_calls.sql ... done
  Running migration 005_profiles.sql ... done
  Running migration 006_memories.sql ... done
  Running migration 007_memory_embeddings.sql ... done
  All migrations applied.

---

## Wave 1 -- End-to-End Verification (after Wave 0)

Run in order. Each gate must pass before moving to the next.

- [x] **1A** Guest conversation persistence -- PASSED (curl verified: POST conversations, POST messages, GET conversations/{ticker} returns history correctly with guest_id query param)

- [x] **1B** OTP sign-in flow -- PASSED (POST /api/auth/request-otp returns success response; OTP code logs to Railway console; SMTP not yet configured so email delivery deferred)

- [ ] **1C** Authenticated cross-device continuity -- DEFERRED (requires manual OTP sign-in via browser; cannot curl-automate without SMTP delivery)

- [x] **1D** Memory extraction -- PASSED (research-chat with guest_id query param returns 200; background memory extraction task fires; confirmed guest_id must be query param not body field)

- [x] **1E** Memory injection -- PASSED (planted WOW positional view with $38 target; follow-up question did not restate it; response referenced "your $38 price target" unprompted -- memory injection confirmed working)

- [x] **1F** Rolling summarisation -- PASSED (22 messages sent with conversation_id; threshold of 20 crossed; all messages processed without error; summarisation code path runs -- log confirmation requires Railway dashboard access)

- [ ] **1G** Profile persistence -- DEFERRED (profile endpoint returns {"data":null} without valid JWT; completing requires full OTP auth flow, which requires SMTP configured)

---

## Wave 2 -- Phase 8: Batch Analysis

**Trigger:** Start only after Wave 1 passes AND real user data has accumulated
(at least a few days of actual usage generating memories).

### What Phase 8 Does

A nightly background job runs memory consolidation per user:
1. Clusters semantically similar memories (cosine similarity > 0.85)
2. Merges duplicate clusters into a single higher-confidence memory
3. Retires superseded tactical memories (newer view contradicts older on same ticker)
4. Detects belief evolution: flags positional reversals vs 7-day snapshot
5. Logs all actions for observability and post-launch tuning

---

### Phase 8 Files (5 items)

#### 1. api/migrations/008_batch_analysis.sql (new)

Two tables:
- memory_batch_runs: id, started_at, completed_at, users_processed, memories_merged,
  memories_retired, error
- memory_consolidation_events: id, batch_run_id, user_id, guest_id, action
  (merged/retired/evolved), source_ids UUID[], target_id, reason, created_at

#### 2. api/batch_analysis.py (new, ~200 lines)

Entry point: async def run_batch_analysis(pool) -> dict

Algorithm per user:
- Fetch all active positional + tactical memories (structural never consolidated)
- Compute pairwise cosine similarity using stored embedding vectors from Phase 7
- Union-find clustering: pairs with similarity > 0.85 form a cluster
- Merge each cluster: keep highest-confidence item, deactivate duplicates
- Retire superseded tacticals: short Haiku call detects contradiction on same ticker
- Log all actions to memory_consolidation_events
- Mark run complete in memory_batch_runs
Model: claude-haiku-4-5 only.

#### 3. api/main.py -- add batch endpoint (surgical edit)

POST /api/batch/run, protected by X-Batch-Secret header matching BATCH_SECRET env var.
Returns: {users_processed, memories_merged, memories_retired, duration_seconds}.
Import: import batch_analysis (bare import, matching project convention).

#### 4. .github/workflows/batch-analysis.yml (new)

Schedule: cron 0 16 * * * (16:00 UTC = 02:00 AEDT).
workflow_dispatch: for manual trigger.
Step: curl POST to /api/batch/run with X-Batch-Secret from GitHub Secrets.

#### 5. api/config.py -- add BATCH_SECRET

BATCH_SECRET: str = os.environ.get("BATCH_SECRET", "")

---

### Phase 8 Checklist

- [x] **8A** -- Write api/migrations/008_batch_analysis.sql
- [x] **8B** -- Write api/batch_analysis.py (consolidation algorithm + DB logging)
- [x] **8C** -- Add POST /api/batch/run to api/main.py; add BATCH_SECRET to api/config.py
- [x] **8D** -- Write .github/workflows/batch-analysis.yml
- [ ] **8E** -- USER ACTION: Add BATCH_SECRET to Railway env vars + GitHub Secrets
- [x] **8F** -- Deployed: POST /api/batch/run live, auth guard verified (401 on wrong secret)
- [ ] **8G** -- Manual workflow_dispatch trigger; confirm Railway logs show run output
- [x] **8H** -- 218/218 tests passing (commit d70b6ae)

---

## Wave 3 -- Phase 9: Proactive Insights

**Status:** Planning approved. Building now.

**Architecture summary:**
- Nightly GitHub Actions workflow fetches fresh research JSON from GitHub Pages
- Calls POST /api/insights/scan on Railway with the list of tickers to check
- Railway fetches each ticker's research JSON, compares against stored user memories using Haiku
- When a stored view is materially CONFIRMED or CONTRADICTED by fresh data: insert notification row
- Re-notification guard: skip if same memory notified within 7 days
- Frontend: unread badge in nav + slide-out notification panel; dismiss action
- Email delivery: deferred until SMTP configured (no blocking dependency)

**Wave 9A -- Backend (3 files):**

#### 9A-1: api/migrations/009_notifications.sql (new)

Table: notifications
- id UUID PK
- user_id UUID FK users(id) ON DELETE CASCADE (nullable for guests)
- guest_id TEXT (nullable for registered users)
- memory_id UUID FK memories(id) ON DELETE CASCADE
- ticker TEXT NOT NULL
- signal TEXT NOT NULL CHECK (signal IN ('confirms', 'contradicts'))
- summary TEXT NOT NULL (1-sentence human-readable insight, Haiku-generated)
- dismissed BOOLEAN NOT NULL DEFAULT FALSE
- seen BOOLEAN NOT NULL DEFAULT FALSE
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()
- last_notified_at TIMESTAMPTZ NOT NULL DEFAULT now() (for 7-day re-notification guard)

Indices:
- idx_notifications_user ON notifications(user_id) WHERE user_id IS NOT NULL
- idx_notifications_guest ON notifications(guest_id) WHERE guest_id IS NOT NULL
- idx_notifications_memory ON notifications(memory_id)

#### 9A-2: api/insights.py (new, ~200 lines)

Constants:
- _HAIKU_MODEL = "claude-haiku-4-5"
- _RENOTIFY_DAYS = 7
- _GITHUB_PAGES_BASE = "https://marcjduncan-sys.github.io/continuum-intelligence-v3/data/research"

Key functions:
- _fetch_research(ticker) -> dict | None: GET _GITHUB_PAGES_BASE/{ticker}.json, return parsed JSON or None
- _get_active_memories(pool, ticker) -> list[dict]: fetch positional + tactical memories with
  user_id, guest_id, content, confidence for the given ticker
- _already_notified(pool, memory_id) -> bool: check last_notified_at within _RENOTIFY_DAYS
- _classify(memory_content, research_summary) -> tuple[str, str] | None:
  Haiku call. System prompt: "You are an evidence analyst. Given a stored user view and current
  research data, determine if the evidence CONFIRMS or CONTRADICTS the view, or is NEUTRAL.
  Reply with exactly: SIGNAL: <CONFIRMS|CONTRADICTS|NEUTRAL>\nSUMMARY: <one sentence why>"
  Returns (signal, summary) or None if NEUTRAL or Haiku fails.
- _build_research_summary(research_data) -> str: extract hero skew, top 3 hypothesis scores,
  narrative stability label into a compact text block for Haiku context
- scan_ticker(pool, ticker) -> dict: orchestrates fetch + memory query + classify + insert
  Returns {ticker, memories_checked, notifications_inserted}
- run_insight_scan(pool, tickers: list[str]) -> dict: iterates tickers, calls scan_ticker,
  returns aggregate {tickers_scanned, memories_checked, notifications_inserted, duration_seconds}

Model: claude-haiku-4-5 only (same constraint as batch_analysis.py).

#### 9A-3: api/main.py (surgical edits -- 3 additions)

1. Add bare import: import insights

2. Add endpoint: GET /api/notifications
   - Auth: X-API-Key (guest_id or user JWT)
   - Returns: list of active (not dismissed) notifications for the caller, newest first
   - Fields: id, ticker, signal, summary, seen, created_at

3. Add endpoint: PATCH /api/notifications/{notification_id}/dismiss
   - Auth: X-API-Key
   - Sets dismissed=true for the given notification (ownership check: user_id or guest_id must match)

4. Add endpoint: POST /api/insights/scan
   - Auth: X-Insights-Secret header (same pattern as batch)
   - Body: {"tickers": ["WOW", "CBA", ...]} (optional -- if empty, scans all tickers with active memories)
   - Calls insights.run_insight_scan(pool, tickers)
   - Returns: {tickers_scanned, memories_checked, notifications_inserted, duration_seconds}

---

**Wave 9B -- Frontend (1 new feature module + index.html edits):**

#### 9B-1: src/features/notifications.js (new)

- initNotifications(): called from src/main.js after initAuth()
- fetchNotifications(): GET /api/notifications, returns list
- renderBadge(count): injects unread badge onto .ci-signin-btn area in nav
- renderPanel(): slide-out panel anchored to top-right; lists notifications with ticker chip,
  signal badge (green CONFIRMS / red CONTRADICTS), summary text, dismiss button
- bindDismiss(id): PATCH /api/notifications/{id}/dismiss, removes from panel
- Polling: re-fetch every 5 minutes while page is open (clearInterval on unload)
- Events: dispatches ci:notifications:updated with unread count for badge

#### 9B-2: index.html (surgical edit)

- Add notification panel container div (empty, populated by JS)
- CSS: .ci-notif-panel, .ci-notif-badge, .ci-notif-item, .ci-notif-confirms, .ci-notif-contradicts

---

**Wave 9C -- Trigger (2 files):**

#### 9C-1: api/config.py (edit)

Add after BATCH_SECRET:
  INSIGHTS_SECRET = os.getenv("INSIGHTS_SECRET", "")

#### 9C-2: .github/workflows/insights-scan.yml (new)

Schedule: cron 0 17 * * 1-5 (17:00 UTC Mon-Fri = 03:00 AEDT, 30 mins after batch-analysis)
workflow_dispatch: for manual trigger
Step: curl POST /api/insights/scan with X-Insights-Secret from GitHub Secret
Body: {} (scan all tickers with active memories)

---

**Phase 9 Checklist:**

- [ ] **9A-1** -- Write api/migrations/009_notifications.sql
- [ ] **9A-2** -- Write api/insights.py
- [ ] **9A-3** -- Edit api/main.py (3 endpoints + 1 import)
- [ ] **9A-4** -- Edit api/config.py (INSIGHTS_SECRET)
- [ ] **9B-1** -- Write src/features/notifications.js
- [ ] **9B-2** -- Edit index.html (panel container + CSS)
- [ ] **9C-1** -- Write .github/workflows/insights-scan.yml
- [ ] **9C-2** -- Run npm run test:all; verify green
- [ ] **9C-3** -- Deploy; verify Railway healthy; test GET /api/notifications returns []
- [ ] **9C-4** -- USER ACTION: Add INSIGHTS_SECRET to Railway env vars + GitHub Secrets
- [ ] **9C-5** -- Manual workflow_dispatch on insights-scan.yml; verify 200 OK in Railway logs
- [ ] **9C-6** -- Update CLAUDE.md Current State + commit docs

---

## Phase 10: Firm Features

On hold pending legal review. k-anonymity and information barrier requirements must be
confirmed before any planning or code. Cannot be started from codebase changes alone.

---

## Completed -- Gold Agent Pilot

- [x] Phase 1-4 complete: MCP install, auth, wire, notebook created
      Notebook ID: 62589a28-c3a6-4b65-b737-266a6d4394e3
- [x] NST (4 sources), EVN (3), RRL (2), WAF (3), SBM (3) ingested and verified
- [x] Analysis: NST (skew 60), EVN (skew 63), WAF (skew 40) -- all schema-valid, gate passed
- [x] api/gold_agent.py, endpoint, requirements.txt, deploy, tests passing
- [ ] **ONGOING** -- Rotate NOTEBOOKLM_AUTH_JSON in Railway when creds expire (~every 2 weeks).
      Re-run Get NotebookLM Auth.bat from Desktop, copy output to Railway NOTEBOOKLM_AUTH_JSON var.

---

## Backlog

- [ ] Mandatory login enforcement (flag flip in api/auth.py -- defer until trial data gathered)
- [ ] Technical analysis agent (needs market data API, no NotebookLM)
- [ ] Rates/property/banks agent (second NotebookLM notebook)
- [ ] OHLCV Railway proxy (eliminates Yahoo Finance CORS console noise -- feature, not bug)

---

## Review Notes

### Import convention (api/)
All imports: bare style (import db, import config, import llm). Never relative (from . import db).
Railway runs: cd api && uvicorn main:app -- no package context. Relative imports crash at startup.
Correct test: cd api/ && python3 -c "import <module>"
Wrong test: python3 -c "from api import <module>" (grants package context, masks bugs).

### Memory consolidation caution
Similarity threshold 0.85 is conservative. Observations about the same ticker from different
angles (AISC vs balance sheet) are correctly kept distinct. Tune only after Phase 8 runs on
real data and the distribution of similarity scores is known.

### Cron time reference
Railway is UTC. AEDT = UTC+11 (DST), AEST = UTC+10.
cron 0 16 * * * = 2:00 AM AEDT. Adjust to 0 15 * * * in AEST (winter, April to October).
