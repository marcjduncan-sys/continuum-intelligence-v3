# BEAD-001 -- PM Monitoring Dashboard (D6-4)

## Why

D6-4 is the remaining operational blocker to full PM rollout. Without a monitoring surface, there is no way to confirm PM traffic is flowing normally during the 48-hour canary window required by RELEASE_SIGNOFF.md. This is also the first Flywheel pilot bead -- chosen for bounded scope and low regression risk.

## Scope

Files / modules allowed to change:

| File | Change type |
|---|---|
| `api/pm_ops.py` | NEW -- aggregation endpoint with ops-secret gate |
| `api/main.py` | ADD 2 lines (import + router registration inside ENABLE_PM block) |
| `src/pages/ops.js` | NEW -- ops page with 4 UI states |
| `src/styles/ops.css` | NEW -- ops page styles |
| `src/lib/state.js` | ADD `'ops'` to `VALID_STATIC_PAGES` Set |
| `src/lib/router.js` | ADD lazy render case for `'ops'` |
| `src/main.js` | ADD import for `initOpsPage` |
| `index.html` | ADD 1 page container div only (no nav link in v1) |
| `docs/process/runbook.md` | ADD ops dashboard usage + JSON contract |
| `api/tests/test_pm_ops.py` | NEW -- aggregation + auth tests |

Files explicitly out of scope:
- `api/pm_chat.py` -- no changes to request handling or logging
- `api/handoff.py` -- no changes to handoff logging
- `api/pm_db.py` -- no changes to CRUD helpers
- `public/js/personalisation.js` -- never touch without explicit instruction
- Any migration file -- no schema changes

## Dependencies

- Must exist before start: PostgreSQL tables `pm_conversations`, `pm_messages`, `handoffs`, `pm_decisions`, `pm_insights` (all exist via migrations 013-016)
- Beads that block this: none (first bead)
- Assumptions carried from PLAN.md: existing DB indexes on identity + recency columns are sufficient for date-bounded aggregation queries

## Acceptance criteria

1. `GET /api/ops/pm-dashboard?days=7` returns structured JSON matching the approved contract in PLAN.md
2. Response includes sections: `summary`, `timeseries`, `breakdowns`, `latest_events`, `status`
3. `summary` shows pm_requests, handoffs, decisions, insights, active_portfolios, active_tickers
4. `timeseries` shows requests_by_day and handoffs_by_day arrays
5. `breakdowns` shows handoffs_by_route, decisions_by_action, insights_by_type, context_modes, top_portfolios, top_tickers
6. `status` section shows has_data boolean, last_activity_at, minutes_since_last_activity, traffic_status (normal/quiet/inactive), zero_state_reason (null if has_data is true)
7. Endpoint is gated by `X-Ops-Secret` header; returns 401 without valid secret
8. `OPS_SECRET` env var is the source; not hardcoded
9. `/ops` page renders all sections with period selector (1d / 7d / 30d)
10. Page has 4 explicit UI states: loading, zero-data, data-present, error
11. Route is URL-only in v1; no visible nav link
12. `days` parameter validates to positive integer, defaults to 7, max 90
13. All existing tests pass (`npm run validate` + `cd api && python -m pytest`)
14. Runbook section documents signal sources, JSON contract, and usage

## Edge cases

- **No PM activity in selected period:** All counts 0, `has_data: false`, `zero_state_reason` populated, traffic status "inactive"
- **DB pool unavailable:** Endpoint returns 503 with `{"error": "database unavailable"}`; frontend shows error state
- **Very large dataset:** All queries date-bounded with `WHERE created_at >= $cutoff`; existing indexes cover this
- **ENABLE_PM=false:** Router not registered; ops page handles 404 gracefully
- **Concurrent requests:** Read-only queries; no state mutation; safe for concurrent access
- **Invalid `days` parameter:** Non-integer, negative, or >90 returns 422 validation error
- **One table populated while others empty:** Each section independently queries its table; partial data renders correctly
- **Unauthorised request:** Missing or invalid `X-Ops-Secret` returns 401 with structured error
- **Malformed timestamp in DB row:** Guarded by try/except; row skipped with null timestamp

## Tests

- **Unit (pytest):** `api/tests/test_pm_ops.py`
  - Endpoint returns 401 without valid `X-Ops-Secret` header
  - Endpoint returns valid empty-state payload on zero data (`has_data: false`)
  - Endpoint returns stable schema even when some sections are empty
  - `days` parameter correctly bounds the date range
  - Pool-None guard returns 503
  - Traffic status classification: inactive (>24h), quiet (>4h), normal (<4h)
  - By-route aggregation groups correctly
  - By-action-type aggregation groups correctly
  - Insights by-type aggregation groups correctly
  - Top-tickers aggregation counts correctly
  - Invalid `days` rejected
  - Timeseries fills all dates in window (no gaps)
- **Frontend:** Route renders zero-state correctly; route renders API error correctly
- **Smoke:**
  - `npm run validate` passes
  - `cd api && python -m pytest` passes
  - `npm run build` clean
  - Existing PM features still run unchanged

## Logging / observability

- No new logging needed; the endpoint is read-only
- The endpoint itself provides the observability surface

## Completion evidence

- Tests run: pytest count, vitest count, build result
- Screens / artefacts: screenshot of `/ops` page with real data (or zeros if no PM activity yet)
- Reviewer: fresh-context review using `docs/templates/REVIEW_TEMPLATE.md`
