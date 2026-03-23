# Flywheel Core Operating Runbook

## Single change lifecycle

1. Open the issue or product request.
2. Decide whether the work is a new plan item, a new bead, or an extension to an existing bead.
3. Update PLAN.md first.
4. Create or refine the bead packet.
5. Estimate blast radius: files, states, tests, user flows affected.
6. Code only after the bead is approved.
7. Run all required tests and record outputs.
8. Request fresh-eyes review (separate context from the builder).
9. Merge only after approval and green tests.
10. Update DECISIONS.md and this runbook if a new lesson was learned.

## Cadence rules

- Planner check-in at start of every feature and whenever architecture changes.
- Builder must pause if scope expands materially; this is a new bead, not a hidden extension.
- Reviewer must be cold. No reviewing from the same session that built the change.
- Retrospective after every merge for the first 10 beads.

## Anti-patterns (banned)

- Coding directly from chat without updating the plan.
- One giant vague task such as "fix auth" or "clean up dashboard".
- Merging with green unit tests but no workflow-level smoke check.
- Letting the builder also sign off the review.
- Sneaking architecture changes through a bugfix bead.
- Using direct-to-main or dangerous permission bypasses.
- Creating first-draft beads and treating them as final.

---

## PM Operations Dashboard (BEAD-001)

### Purpose

Provides a read-only aggregation of PM workflow telemetry for assessing rollout readiness. Answers five operational questions:

1. How many PM chat requests occurred over the selected period?
2. How many handoffs occurred, by source role and destination role?
3. What were the most recent failures, warnings, or stalled workflow states?
4. Which portfolio/ticker/context combinations are active most often?
5. Is PM traffic flowing normally or degrading?

### Access

- **URL:** `#ops` (URL-only, no nav link)
- **API:** `GET /api/ops/pm-dashboard?days=7`
- **Auth:** `X-Ops-Secret` header required (env var: `OPS_SECRET` on Fly.io)
- **Frontend secret:** stored in `localStorage` key `ci_ops_secret`

To set the secret in the browser console:
```js
localStorage.setItem('ci_ops_secret', 'your-secret-here');
```

### Signal sources

| Section | DB table(s) | What it shows |
|---|---|---|
| Summary metrics | `pm_messages`, `handoffs`, `pm_decisions`, `pm_insights`, `pm_conversations` | Total counts for selected period |
| Timeseries | `pm_messages`, `handoffs` | Daily request and handoff volume |
| Breakdowns | `handoffs`, `pm_decisions`, `pm_insights`, `pm_messages` | By route, action type, insight type, context mode, top tickers/portfolios |
| Latest events | `pm_messages`, `handoffs`, `pm_decisions` | Most recent 20 events across all types |
| Status | Derived from latest events | Traffic classification (normal/quiet/inactive), last activity timestamp |

### Traffic status classification

| Status | Condition | Meaning |
|---|---|---|
| normal | Last activity <4 hours ago | PM is actively used |
| quiet | Last activity 4-24 hours ago | Low activity, may be off-hours |
| inactive | Last activity >24 hours ago or no data | No PM usage in window |

### JSON response contract

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
    "requests_by_day": [{"date": "YYYY-MM-DD", "count": 0}],
    "handoffs_by_day": [{"date": "YYYY-MM-DD", "count": 0}]
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
    {"type": "pm_request|handoff|decision", "timestamp": "ISO", "detail": "..."}
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

### Env var setup

Add `OPS_SECRET` to Fly.io dashboard before using in production. The endpoint allows all requests when `OPS_SECRET` is empty (dev mode).
