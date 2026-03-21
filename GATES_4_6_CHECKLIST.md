# Go-Live Verification: Gates 4-6 Operator Checklist

Run each item in staging with a real portfolio loaded. Mark pass/fail inline.
Gates 4 and 5 require a running instance (frontend + backend + DB). Gate 6 is operational review.

---

## Gate 4: UX Walkthrough

### 4.1 Navigation and routing

- [ ] All nav links resolve: `#home`, `#deep-research`, `#comparator`, `#portfolio`, `#personalisation`, `#memory`, `#pm`, `#about`
- [ ] Direct URL entry works for each hash route (paste URL, hit enter, correct page renders)
- [ ] Browser back/forward navigates between visited pages without blank screens
- [ ] Page title updates on route change

### 4.2 Right-rail mode switching (desktop, >=1024px)

- [ ] On page load, Analyst panel is visible by default (unless `ci_rail_mode === 'pm'` in localStorage)
- [ ] Mode switch widget appears in both Analyst and PM panel headers
- [ ] Clicking "PM" in mode switch hides Analyst panel, shows PM panel
- [ ] Clicking "Analyst" switches back; conversation state preserved in both panels
- [ ] Mode switch buttons have correct ARIA tablist semantics (arrow keys, Home/End cycle)
- [ ] All mode switches sync state (clicking in one header updates the other)
- [ ] `ci_rail_mode` localStorage value updates on switch

### 4.3 Right-rail mode switching (mobile, <1024px)

- [ ] Analyst FAB (`#apFab`) visible below 1024px viewport
- [ ] PM FAB (`#pmFab`) visible below 1024px when PM mode is active
- [ ] Tapping Analyst FAB slides panel up from bottom
- [ ] Tapping PM FAB slides PM panel up from bottom
- [ ] Only one panel open at a time on mobile
- [ ] Closing a panel returns FABs to visible state
- [ ] Panel does not overflow viewport on small screens (375px width)

### 4.4 Analyst panel basics

- [ ] Type a question, receive a streamed response
- [ ] Conversation history persists within session (scroll up to see prior turns)
- [ ] Ticker context badge visible when a stock is active
- [ ] "Assess portfolio fit in PM" button appears on Analyst responses when a ticker is active
- [ ] Clicking "Assess portfolio fit in PM" triggers handoff (see 4.6)

### 4.5 PM panel basics

- [ ] PM panel shows portfolio context summary (alignment score pill, breach count, uncovered count)
- [ ] Type a portfolio question, receive a streamed response
- [ ] Response metadata rendered: mandate breach pills (colour by severity), alignment score pill (green/gold/red), uncovered count
- [ ] Send button has 2-second cooldown (rapid double-click does not send twice)
- [ ] Empty input does not send
- [ ] Conversation clears on explicit "New conversation" action
- [ ] `pm_conversation_id` persists across turns (check network tab: same ID in request body)

### 4.6 Analyst-to-PM handoff flow

- [ ] Click "Assess portfolio fit in PM" on an Analyst response
- [ ] Rail switches from Analyst to PM
- [ ] PM input auto-populates with a contextualised question referencing ticker, conviction, valuation
- [ ] Question auto-sends without manual intervention
- [ ] PM response references the Analyst's coverage state and conviction
- [ ] "View Analyst Summary" button appears on PM response for the handed-off ticker
- [ ] Clicking "View Analyst Summary" renders inline card with: coverage badge, conviction, valuation, key risks, tripwires, summary version

### 4.7 PM dashboard page (`#pm`)

- [ ] PM page renders without errors when no portfolio is loaded
- [ ] PM page renders analytics dashboard when a portfolio with a snapshot exists
- [ ] Summary metrics visible: total value, cash value, position count
- [ ] Concentration grid: max single weight, top 5, top 10, HHI
- [ ] Top positions list: ticker, weight, value, sector
- [ ] Sector exposure bars render with correct proportions
- [ ] Risk flags section shows active flags with severity icons and human-readable messages

### 4.8 Journal page (`#memory`)

- [ ] Analyst | PM source toggle visible at top of Journal page
- [ ] Analyst tab shows Analyst insights grouped by stock (default)
- [ ] Switching to PM tab shows PM decisions and insights
- [ ] PM decisions render with: action badge, ticker, rationale, sizing band, source of funds, breach tags
- [ ] PM insights render with: type badge, content, ticker tags, confidence
- [ ] Archive action works on individual insights (card disappears from active list)
- [ ] Archived section shows archived insights with restore option
- [ ] Restore action moves insight back to active list
- [ ] Filtering by ticker works in both Analyst and PM views

### 4.9 Personalisation wizard (`#personalisation`)

- [ ] Wizard loads and renders all sections (firm context, fund context, mandate settings, cognitive assessment)
- [ ] Mandate sliders clamp to safety caps (e.g., max position size cannot exceed 50%)
- [ ] Cash range min cannot exceed cash range max (auto-corrects)
- [ ] Saving personalisation persists to `pnGetPersonalisationContext()` output
- [ ] PM Chat picks up personalisation context (check network tab: `personalisation_context` in request body)

### 4.10 Portfolio management (`#portfolio`)

- [ ] Can create a new portfolio (name, currency)
- [ ] Can create a snapshot with holdings (manual entry or paste)
- [ ] Validation rejects: negative values, duplicate tickers, market_value mismatch > 1%
- [ ] Portfolio state loads correctly after page refresh
- [ ] Analytics auto-compute on snapshot creation (check `GET /api/portfolios/{id}/analytics`)

---

## Gate 5: Memory and Journal Audit

Run a 50-turn PM conversation covering diverse scenarios. After each turn, inspect extracted decisions and insights via the Journal API.

### 5.1 Decision extraction quality

- [ ] Explicit "trim BHP to 8%" extracts as `action_type: trim`, `ticker: BHP`, `sizing_band: ~8%`
- [ ] Explicit "add CSL at 3-4%" extracts as `action_type: add`, `ticker: CSL`, `sizing_band: 3-4%`
- [ ] Explicit "exit WOW entirely" extracts as `action_type: exit`, `ticker: WOW`
- [ ] "Hold current positions" extracts as `action_type: hold`
- [ ] "No changes needed" extracts as `action_type: no_action`
- [ ] "Rebalance toward equal weight" extracts as `action_type: rebalance`
- [ ] "Watch FMG for the next earnings" extracts as `action_type: watch`, `ticker: FMG`
- [ ] Max 3 decisions per turn enforced (send a response with 5 recommendations; only 3 stored)
- [ ] `decision_basis` object populated: snapshot_id, alignment_score, breach_codes, uncovered_count, mandate_hash, version=F.1

### 5.2 Insight extraction quality

- [ ] Portfolio risk observation extracts as `insight_type: portfolio_risk`
- [ ] Mandate breach discussion extracts as `insight_type: mandate_breach`
- [ ] Sizing principle extracts as `insight_type: sizing_principle`
- [ ] Rebalance suggestion extracts as `insight_type: rebalance_suggestion`
- [ ] Uncovered exposure warning extracts as `insight_type: uncovered_exposure`
- [ ] Change alert extracts as `insight_type: change_alert`
- [ ] Max 5 insights per turn enforced
- [ ] Confidence scores calibrated: explicit recommendations >= 0.8, implied observations 0.5-0.7
- [ ] Tags assigned from expected set: `concentration`, `sector-exposure`, `mandate`, `source-of-funds`, `alignment`, `coverage-gap`, `turnover`
- [ ] Tickers array populated when insight references specific names

### 5.3 Extraction edge cases

- [ ] Conversational turn with no actionable content produces zero decisions and zero/minimal insights
- [ ] Turn with both a decision and related insight produces both (not deduplicated incorrectly)
- [ ] Invalid action types not invented (only the 7 valid types appear)
- [ ] Invalid insight types not invented (only the 7 valid types appear)

### 5.4 Journal persistence and display

- [ ] `GET /api/pm-journal` returns combined feed sorted chronologically (newest first)
- [ ] `GET /api/pm-journal/decisions` returns decisions only
- [ ] `GET /api/pm-journal/insights` returns insights only
- [ ] Ticker filter works: `GET /api/pm-journal/insights?ticker=BHP` returns only BHP-related
- [ ] Type filter works: `GET /api/pm-journal/insights?type=mandate_breach`
- [ ] Archive persists across page reload (archived insight stays archived)
- [ ] Restore persists across page reload

### 5.5 Handoff memory integrity

- [ ] Handoff log records source_role=analyst, destination_role=pm
- [ ] Handoff does not create duplicate Analyst insights in PM memory
- [ ] `analyst_summary_version` in PM decision_basis matches the version hash from the handoff payload
- [ ] `analyst_coverage_state` in PM decision_basis matches the coverage state at time of handoff
- [ ] Stale coverage state correctly detected when most recent Analyst memory > 30 days old

---

## Gate 6: Production Readiness

### 6.1 Authentication and identity

- [ ] JWT auth works for all PM endpoints (conversations, journal, chat)
- [ ] Guest ID fallback works when no JWT present
- [ ] Missing both JWT and guest_id returns 401 or graceful degradation (not 500)
- [ ] Identity isolation confirmed: User A cannot see User B's PM conversations, decisions, or insights

### 6.2 Error handling

- [ ] PM Chat with invalid portfolio_id returns clear error message (not stack trace)
- [ ] PM Chat with no API key configured returns 401/403 with explanation
- [ ] Handoff for a ticker with no Analyst memories returns `coverage_state: not_covered` (not error)
- [ ] Journal endpoints with no data return empty arrays (not errors)
- [ ] Malformed personalisation_context in request body falls back to defaults (not 500)
- [ ] Frontend handles API errors gracefully: shows error message in chat, does not break panel state

### 6.3 Performance

- [ ] PM Chat response time < 10s for typical portfolio question (excluding LLM latency)
- [ ] Analytics computation < 500ms for 50-holding portfolio
- [ ] Alignment computation < 500ms for 50-holding portfolio with research
- [ ] Journal fetch < 1s for 100+ entries
- [ ] Background memory extraction does not block the PM Chat response (fire-and-forget confirmed)

### 6.4 Data integrity

- [ ] Mandate safety caps enforced server-side (send max_position_size: 0.99 via API; confirm clamped to 0.50)
- [ ] Portfolio weights derived server-side match frontend display (no rounding drift > 0.01%)
- [ ] Concentration score deterministic: same portfolio produces identical score on repeated computation
- [ ] Analytics flags consistent with threshold config (change threshold, re-run, flags update)

### 6.5 Logging and observability

- [ ] PM Chat requests logged with: identity, portfolio_id, context_mode, timestamp
- [ ] Handoff events logged with: ticker, source_role, destination_role, timestamp
- [ ] Memory extraction failures logged (not silently swallowed)
- [ ] API errors include request_id or correlation ID for tracing

### 6.6 Deployment configuration

- [ ] Environment variables documented: `ANTHROPIC_API_KEY`, `DATABASE_URL`, `PM_MODEL` (if configurable)
- [ ] Database migrations idempotent (re-running 013-016 on existing DB produces no errors)
- [ ] Frontend build output (`dist/`) includes all PM assets (pm-chat.js, pm-chat.css, pm.js)
- [ ] Cloudflare Pages routing handles all hash routes (no 404 on direct URL entry)
- [ ] CORS configured for frontend domain on all PM API endpoints

### 6.7 Rollback plan

- [x] Identify the last known-good commit hash before PM features: **`12a1a1a`** (pre-PM baseline; all PM work is uncommitted)
- [ ] Confirm `git revert` of PM commits does not break Analyst functionality (N/A if launched from a single PM commit; if uncommitted work is discarded via `git checkout .` + removal of untracked files, Analyst functionality is restored)
- [ ] Database rollback path: document which tables are safe to DROP (pm_conversations, pm_messages, pm_decisions, pm_insights, handoffs, portfolio_analytics) without affecting Analyst data
- [x] Feature flag option: `ENABLE_PM` env var added to `main.py`. Defaults to `true`. Set `ENABLE_PM=false` to disable all PM routers.

### 6.8 Monitoring (post-deploy)

- [ ] Set up alert for PM Chat error rate > 5% in 5-minute window
- [ ] Set up alert for memory extraction failure rate > 10%
- [ ] Set up alert for API response time p95 > 15s
- [ ] Dashboard: PM conversations per day, decisions per day, handoffs per day
- [ ] Canary check: after deploy, run one Analyst-to-PM handoff and verify Journal entry appears

---

## Sign-off

| Gate | Status | Operator | Date |
|------|--------|----------|------|
| Gate 4: UX Walkthrough | | | |
| Gate 5: Memory/Journal Audit | | | |
| Gate 6: Production Readiness | | | |

All three gates must pass before merging to main and deploying to production.
