# Release Sign-Off Sheet: PM Chat Go-Live

**Date:** 21 March 2026
**Release candidate:** All PM features (Phases A through F), uncommitted working tree
**Rollback baseline:** `12a1a1a` (pre-PM; all PM work is uncommitted)
**Automated suite:** 394 pytest + 206 Vitest = 600 total, all passing. Vite production build clean.

---

## Gate Results

### Gate 1: Build and Regression

**Result: PASS**

- Vitest: 206/206 passing
- Pytest: 394/394 passing
- Vite build: clean (387 KB JS, 174 KB CSS)
- PM code confirmed present in production bundle

### Gate 2: Golden Portfolio Test Suite

**Result: PASS**

- 92 tests across 15 fixed portfolios with hand-computed expected outputs
- All assertions within 0.05% tolerance
- Covers: balanced, concentrated, single-stock, all-cash, cash-heavy, cash-light, exact-threshold, mixed alignment, multi-breach, tight/relaxed mandates, restricted names, change detection, HHI, determinism, input non-mutation

### Gate 3: PM Decision Quality Scoring Harness

**Result: PASS**

- 43 tests validating the 24-scenario eval pack structurally
- 5-dimension rubric (Decision Clarity, Constitution Fidelity, Evidence Grounding, Role Discipline, Trade-off Disclosure) at 20 points each
- All structural guarantees verified: dimension coverage, scenario diversity, anti-behaviour separation, coverage state representation

### Gate 4: UX Walkthrough

**Result: CONDITIONAL PASS (1 low-severity defect)**

**Verification method:** Code-level inspection of DOM structure, routing, ARIA attributes, mode switching, handoff flow, Journal rendering, and responsive behaviour. All verification performed against source files with line-number evidence.

| Section | Items | Pass | Fail |
|---------|-------|------|------|
| 4.1 Navigation and routing | 4 | 4 | 0 |
| 4.2 Desktop mode switching | 6 | 6 | 0 |
| 4.3 Mobile mode switching | 4 | 4 | 0 |
| 4.4 Analyst panel basics | 4 | 4 | 0 |
| 4.5 PM panel basics | 6 | 6 | 0 |
| 4.6 Analyst-to-PM handoff | 7 | 7 | 0 |
| 4.7 PM dashboard | 3 | 3 | 0 |
| 4.8 Journal page | 9 | 8 | 1 |
| 4.9 Personalisation wizard | 3 | 3 | 0 |
| 4.10 Portfolio management | 4 | 4 | 0 |
| **Total** | **50** | **49** | **1** |

**Defect D4-1 (Low):** PM insight confidence score not displayed in Journal. `_renderPMInsightCard` in `src/pages/memory.js` renders type badge, content, tickers, and tags but omits the confidence field. Data is stored correctly and returned by the API. Display-only gap.

**Caveat:** Gate 4 was verified via code inspection, not live browser interaction. A live UX walkthrough in staging with a connected backend remains recommended before full production launch.

### Gate 5: Memory and Journal Audit

**Result: CONDITIONAL PASS (1 low-severity defect)**

**Verification method:** Code-level inspection of extraction logic, taxonomy enforcement, cap limits, confidence calibration, Journal API structure, and handoff integrity. Line-number evidence for all findings.

| Section | Items | Pass | Fail |
|---------|-------|------|------|
| 5.1 Decision extraction quality | 14 | 14 | 0 |
| 5.2 Insight extraction quality | 9 | 9 | 0 |
| 5.3 Extraction edge cases | 5 | 4 | 1 |
| 5.4 Journal API | 7 | 7 | 0 |
| 5.5 Handoff integrity | 5 | 5 | 0 |
| **Total** | **40** | **39** | **1** |

**Defect D5-1 (Low):** No deduplication between decisions and insights. A PM response that produces both an explicit decision and a `pm_decision` insight for the same action may store both. The extraction prompt discourages this but there is no code-level guard. The max caps (3 decisions, 5 insights) limit the blast radius.

**Caveat:** Gate 5 was verified at code level. A 50-turn live conversation audit with Journal inspection remains recommended before full production launch to verify extraction quality in practice.

### Gate 6: Production Readiness

**Result: CONDITIONAL PASS (3 defects: 1 medium, 2 low)**

| Section | Items | Pass | Fail |
|---------|-------|------|------|
| 6.1 Authentication and identity | 4 | 4 | 0 |
| 6.2 Error handling | 4 | 4 | 0 |
| 6.3 Performance (code-level) | 2 | 2 | 0 |
| 6.4 Data integrity | 5 | 5 | 0 |
| 6.5 Logging and observability | 3 | 1 | 2 |
| 6.6 Deployment configuration | 5 | 5 | 0 |
| 6.7 Rollback plan | 3 | 2 | 1 |
| 6.8 Monitoring (post-deploy) | 3 | 2 | 1 |
| **Total** | **29** | **25** | **4** |

**Defect D6-1 (Medium):** ~~No feature flag to disable PM endpoints.~~ **FIXED.** `ENABLE_PM` environment variable gate added to `main.py`. Defaults to `true`. Set `ENABLE_PM=false` to disable all 5 PM routers without code changes.

**Defect D6-2 (Low):** ~~PM Chat requests not logged on entry.~~ **FIXED.** `logger.info()` added to PM Chat endpoint logging identity, portfolio_id, and context_mode on every request.

**Defect D6-3 (Low):** ~~Handoff events not logged.~~ **FIXED.** `logger.info()` added to `log_handoff()` in `handoff.py` logging source_role, destination_role, ticker, coverage_state, and handoff_id.

**Defect D6-4 (Low -- operational):** PM-specific monitoring metrics not yet instrumented. Health endpoint exists (`/api/health`) and structured JSON logging is configured. PM request rates, handoff counts, and extraction failure rates need dashboard setup post-deploy. **Blocks full rollout, not canary.**

---

## Open Defects Summary

| ID | Severity | Gate | Description | Status |
|----|----------|------|-------------|--------|
| D4-1 | Low | 4 | Confidence not displayed in Journal | **FIXED** |
| D5-1 | Low | 5 | No decision/insight deduplication | Open (accepted risk; caps limit blast radius) |
| D6-1 | Medium | 6 | No feature flag for PM endpoints | **FIXED** |
| D6-2 | Low | 6 | PM Chat happy-path not logged | **FIXED** |
| D6-3 | Low | 6 | Handoff events not logged | **FIXED** |
| D6-4 | Low | 6 | PM monitoring dashboards not set up | Open (blocks full rollout) |

---

## Launch Decision

**GO FOR CANARY. FULL ROLLOUT AFTER D6-4 AND 48-HOUR CLEAN MONITORING WINDOW.**

The automated test suite is comprehensive and clean (600 tests, zero failures). Code-level verification of all 6 gates found 5 defects. Four have been fixed (D4-1, D6-1, D6-2, D6-3). One low-severity item (D5-1) is accepted risk. One operational item (D6-4) blocks full rollout but not canary.

**Canary requirements (all met):**

1. ~~Fix D6-1: feature flag~~ Done
2. ~~Fix D6-2, D6-3: request and handoff logging~~ Done
3. ~~Fix D4-1: confidence display~~ Done
4. Regression suite clean: 600/600 passing, build clean

**Full rollout requirements (not yet met):**

1. Set up PM monitoring dashboards (D6-4): PM request volume, error rate, handoff count, extraction failure rate, p95 latency
2. Run live staging walkthrough (Gate 4 caveat)
3. Run 25-turn live PM conversation and inspect Journal (Gate 5 caveat)
4. Manually review first 25 PM decisions and all handoffs during canary
5. 48-hour clean canary window

**Deployment sequence:**

1. Commit all PM work to a feature branch
2. Deploy with `ENABLE_PM=false` initially
3. Run staging verification with `ENABLE_PM=true`
4. Canary release to small cohort
5. Manually review first 25 PM decisions and all handoffs
6. Monitor for 48 hours
7. Set up D6-4 monitoring dashboards
8. Full rollout only after clean canary + monitoring in place

---

## Sign-Off

| Gate | Result | Notes |
|------|--------|-------|
| Gate 1: Build and Regression | **PASS** | 600 tests, build clean |
| Gate 2: Golden Portfolios | **PASS** | 92 tests, 15 portfolios |
| Gate 3: PM Eval Scoring | **PASS** | 43 tests, 24 scenarios |
| Gate 4: UX Walkthrough | **PASS** | D4-1 fixed; code-verified, live walkthrough recommended before full rollout |
| Gate 5: Memory/Journal Audit | **CONDITIONAL PASS** | D5-1 accepted risk; live audit recommended before full rollout |
| Gate 6: Production Readiness | **PASS FOR CANARY** | D6-1/2/3 fixed; D6-4 blocks full rollout |

**Overall: GO FOR CANARY. FULL ROLLOUT AFTER D6-4 AND 48-HOUR CLEAN MONITORING WINDOW.**
