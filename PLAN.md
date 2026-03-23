# PLAN.md

<!-- Living document. Update before every feature and before every merge. -->

## Current plan — BEAD-001: PM Monitoring Dashboard (D6-4)

### Goal

Build a backend aggregation endpoint and a lightweight frontend ops page that answers five operational questions about PM workflow health. This is the remaining blocker to full PM rollout per RELEASE_SIGNOFF.md.

### User workflow

1. Operator opens `/ops` page (or curls `GET /api/ops/pm-dashboard?days=7`)
2. Dashboard shows PM request volume, handoff volume, decision/insight activity, and health status for the selected period
3. Operator assesses whether PM traffic is flowing normally and decides rollout readiness

### Scope

**In scope:**
- One backend aggregation endpoint querying existing DB tables (`pm_conversations`, `pm_messages`, `handoffs`, `pm_decisions`, `pm_insights`)
- One frontend ops page rendering the aggregated data
- Documentation in `docs/process/runbook.md`

**Out of scope:**
- Auth changes, product workflow changes, new PM features
- Alerting infrastructure, external monitoring integrations
- Schema changes or new DB tables
- Major event taxonomy redesign

### Architecture direction

**Backend — `api/pm_ops.py` (new file, ~150 lines):**
- `GET /api/ops/pm-dashboard?days=7` -- single endpoint, gated by `X-Ops-Secret` header (`OPS_SECRET` env var)
- Returns 401 if header missing/invalid; returns 503 if DB unavailable
- Queries 5 existing tables with date-bounded `COUNT` / `GROUP BY` aggregations
- Returns structured JSON per approved contract (see JSON contract below)
- Registered via `pm_ops_router` in `api/main.py` (inside `ENABLE_PM` guard)

**Frontend — `src/pages/ops.js` (new file, ~220 lines):**
- URL-only route (`/ops`); no visible nav link in v1
- 4 explicit UI states: loading, zero-data, data-present, error
- Period selector (1d / 7d / 30d), 4-5 metric cards, latest events table
- Registered as `ops` route in `src/lib/state.js` (`VALID_STATIC_PAGES`) and `src/lib/router.js`
- Uses CSS custom properties from existing `tokens.css`; new styles in `src/styles/ops.css`

**Approved JSON response contract:**
```json
{
  "window_days": 7,
  "generated_at": "ISO_TIMESTAMP",
  "summary": {
    "pm_requests": 0,
    "handoffs": 0,
    "decisions": 0,
    "insights": 0,
    "active_portfolios": 0,
    "active_tickers": 0
  },
  "timeseries": {
    "requests_by_day": [{"date": "2026-03-23", "count": 0}],
    "handoffs_by_day": [{"date": "2026-03-23", "count": 0}]
  },
  "breakdowns": {
    "handoffs_by_route": [{"source": "analyst", "destination": "pm", "count": 0}],
    "decisions_by_action": [{"action_type": "trim", "count": 0}],
    "insights_by_type": [{"insight_type": "portfolio_risk", "count": 0}],
    "context_modes": [{"mode": "full", "count": 0}],
    "top_portfolios": [{"portfolio_id": "...", "request_count": 0}],
    "top_tickers": [{"ticker": "BHP", "mention_count": 0}]
  },
  "latest_events": [
    {"type": "pm_request", "timestamp": "...", "detail": "..."}
  ],
  "status": {
    "has_data": false,
    "last_activity_at": null,
    "minutes_since_last_activity": null,
    "traffic_status": "inactive",
    "zero_state_reason": "No PM activity in selected window"
  }
}
```

**Data flow:**
```
pm_conversations ─┐
pm_messages ──────┤
handoffs ─────────┤── pm_ops.py ──> GET /api/ops/pm-dashboard ──> ops.js renders
pm_decisions ─────┤
pm_insights ──────┘
```

**Files touched:**
| File | Change |
|---|---|
| `api/pm_ops.py` | NEW — aggregation endpoint |
| `api/main.py` | ADD import + router registration inside ENABLE_PM block |
| `src/pages/ops.js` | NEW — ops page renderer |
| `src/styles/ops.css` | NEW — ops page styles |
| `src/lib/state.js` | ADD `'ops'` to `VALID_STATIC_PAGES` |
| `src/lib/router.js` | ADD lazy render for ops page |
| `src/main.js` | ADD import for `initOpsPage` |
| `index.html` | ADD page container div only (no nav link in v1) |
| `docs/process/runbook.md` | ADD ops dashboard usage section |
| `api/tests/test_pm_ops.py` | NEW — aggregation logic tests |
| `src/pages/ops.test.js` | NEW — Vitest render tests (optional, depends on complexity) |

### Failure modes

- **DB pool unavailable:** Endpoint returns `{"error": "database unavailable"}` with 503. Frontend shows "Data unavailable" state.
- **Empty data (no PM activity yet):** All counts return 0. Frontend shows zeros, not errors. Traffic status shows "inactive".
- **Slow query on large data:** Date-bounded queries with indexes on `created_at` columns. All existing tables have identity + recency indexes.
- **ENABLE_PM=false:** Endpoint not registered; ops page shows "PM disabled" message if API returns 404.

### Acceptance criteria

1. `GET /api/ops/pm-dashboard?days=7` returns JSON answering all 5 required operational questions
2. `/ops` page renders the data in a scannable layout with period selector (1d / 7d / 30d)
3. Dashboard uses real DB data, not mocked values
4. No existing user-facing PM behaviour changes
5. No regressions in pytest / vitest / build
6. Runbook section added explaining signal sources and usage
7. Endpoint is gated by `X-Ops-Secret` header and rejects unauthorised access with 401
8. Page distinguishes zero-state from error-state (4 explicit UI states)
9. Route is URL-only in v1; no visible nav exposure
10. JSON response contract matches the approved schema documented in this plan
11. All queries are date-bounded; no unbounded scans
12. `days` parameter validates to positive integer, defaults to 7, max 90

### Tests required

- **Unit (pytest):** 15-20 tests in `api/tests/test_pm_ops.py` covering aggregation logic, empty-data handling, date boundary, pool-None guard
- **Smoke:** `npm run validate` passes; `cd api && python -m pytest` passes; build clean
- **Manual smoke:** Load `/ops` page, verify data matches what `curl /api/ops/pm-dashboard` returns

### Rollback

- Remove `pm_ops_router` import from `main.py` and delete `api/pm_ops.py`
- Remove `'ops'` from `VALID_STATIC_PAGES` and delete `src/pages/ops.js` + `src/styles/ops.css`
- Remove page container div from `index.html`
- All changes are additive; no existing behaviour is modified

---

## Plan template

When starting a new feature or bugfix, copy this template into the "Current plan" section above:

```markdown
## Goal
What this feature / bugfix must achieve.

## User workflow
1.
2.
3.

## Scope
In scope:
Out of scope:

## Architecture direction
- Files / modules expected to change
- Data flow
- API contracts
- State transitions
- Logging / observability requirements

## Failure modes
- Invalid input
- Partial success
- Timeout
- Duplicate actions
- Silent data corruption
- Permissions / role mismatch
- Race conditions
- Idempotency failures

## Acceptance criteria
1.
2.
3.

## Tests required
- Unit:
- Integration:
- E2E:
- Manual smoke:
- Monitoring / logs:

## Rollback
How to disable, revert, or isolate if shipped and broken.
```

---

## Completed plans

<!-- Move completed plans here with date and outcome. -->
