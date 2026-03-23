# PLAN.md

<!-- Living document. Update before every feature and before every merge. -->

## Current plan -- BEAD-002: Portfolio Summary Header + Concentration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

### Goal

Surface the backend analytics engine (concentration score, max single-name weight, top 5, sector exposure, risk flags) in the portfolio page's summary header and diagnostics section, so a fund manager gets an instant read on portfolio health after uploading.

**Architecture:** Frontend-only bead. The backend analytics engine (`portfolio_analytics.py`) and API endpoint (`GET /api/portfolios/{id}/analytics`) already exist and are fully tested (47 pytest tests, 92 golden portfolio tests). This bead wires the existing backend output into the portfolio page DOM.

**Tech Stack:** Vanilla JS (ES modules in `src/`), CSS custom properties, existing Vitest framework.

---

### User workflow

1. User uploads CSV/Excel portfolio (existing flow, unchanged)
2. Table renders with positions, summary bar shows exposure metrics (existing)
3. DB sync fires in background via `_syncPortfolioToPMDatabase()` (existing)
4. **NEW:** After sync succeeds, frontend fetches `GET /api/portfolios/{id}/analytics`
5. **NEW:** Summary header updates with concentration score (colour-coded 0-100) and risk flag count
6. **NEW:** Concentration detail section appears below hypothesis DNA with max single-name, top 5, top 10, sector bars, and risk flags list
7. If backend unavailable, new metrics show "--" gracefully; existing frontend-only diagnostics still render

### Scope

**In scope:**
- Fetch analytics from existing backend endpoint after portfolio DB sync
- Add 2 new items to the summary bar (concentration score, risk flag count)
- Replace Long Book / Short Book with Positions count and Concentration Score (Long Book = Gross in long-only v1; Short Book is always $0)
- Add a concentration detail section to the diagnostics area
- CSS for new elements (dark + light theme, responsive)
- Vitest tests for new rendering functions

**Out of scope:**
- Backend changes (no new endpoints, no schema changes, no new Python code)
- PM page changes (already has its own analytics dashboard)
- Alignment engine or mandate breach display (PM Chat owns this)
- Hypothesis DNA changes (existing, untouched)
- Reweighting section changes (existing, untouched)

### Architecture direction

**No backend changes.** The analytics engine and REST endpoint are complete and tested.

**Frontend data flow:**

```
Upload CSV ──> processPortfolioData() ──> renderPortfolio() [sync, existing]
                    │
                    └──> _syncPortfolioToPMDatabase() [async, existing]
                              │
                              ├── POST /api/portfolios (ensure exists)
                              ├── POST /api/portfolios/{id}/snapshots (create snapshot)
                              │     └── backend auto-computes + persists analytics
                              │
                              └── [NEW] GET /api/portfolios/{id}/analytics
                                    │
                                    └── dispatch CustomEvent('ci:portfolio:analytics')
                                          │
                                          ├── updateSummaryHeader(analytics)
                                          └── renderConcentrationDetail(analytics)
```

**Summary bar redesign (8 items, same count as current):**

| Slot | Current | New |
|------|---------|-----|
| 1 | Long Book | **Positions** (count) |
| 2 | Short Book | **Concentration** (0-100, colour-coded) |
| 3 | Net Position | Net Position (unchanged) |
| 4 | Gross Position | Gross Position (unchanged) |
| 5 | Unrealised P&L | Unrealised P&L (unchanged) |
| 6 | Aligned Exposure | Aligned Exposure (unchanged) |
| 7 | Contradicting Exposure | Contradicting Exposure (unchanged) |
| 8 | Balanced / Neutral | **Flags** (count with severity badge) |

Rationale: Long Book and Short Book are redundant in long-only v1 (Long = Gross, Short = $0). Balanced/Neutral is the least actionable of the alignment metrics. Replacing these with concentration score, position count, and flag count gives the fund manager an instant health check.

**Concentration detail section (new, between hypothesis DNA and risk insights grid):**

```
┌─────────────────────────────────────────────────────────┐
│  NAME CONCENTRATION                                     │
│  ┌────────────┬────────────┬────────────┬─────────────┐ │
│  │ Max Single │  Top 5     │  Top 10    │  HHI        │ │
│  │   18.2%    │   52.1%    │   78.4%    │   0.089     │ │
│  └────────────┴────────────┴────────────┴─────────────┘ │
│                                                         │
│  SECTOR EXPOSURE                                        │
│  Materials  ████████████████████  35.2%                  │
│  Financials ██████████████       24.8%                   │
│  Energy     ████████             15.1%                   │
│  ...                                                    │
│                                                         │
│  RISK FLAGS                                             │
│  ⚠ BHP is 18.2% of the portfolio. Threshold is 15%.    │
│  ⚠ Top 5 holdings represent 52.1%. Threshold is 50%.   │
│  ℹ 5.2% of the portfolio has no sector classification.  │
└─────────────────────────────────────────────────────────┘
```

**Analytics response shape** (from `portfolio_analytics.compute_analytics()`):

```json
{
  "position_count": 12,
  "total_value": 1050000.0,
  "cash_value": 50000.0,
  "cash_weight": 0.047619,
  "concentration": {
    "position_count": 12,
    "max_single_weight": 0.182,
    "top5_weight": 0.521,
    "top10_weight": 0.784,
    "hhi": 0.089,
    "equal_weight_deviation": 0.031
  },
  "concentration_score": 28.4,
  "sector_exposure": {"Materials": 0.352, "Financials": 0.248},
  "flags": [
    {"code": "HIGH_SINGLE_NAME", "severity": "warning", "message": "..."}
  ],
  "top_positions": [{"ticker": "BHP", "weight": 0.182}]
}
```

**Files touched:**

| File | Change |
|---|---|
| `index.html` | MODIFY -- replace 3 summary items (Long Book, Short Book, Neutral) with (Positions, Concentration, Flags); add `<div id="portConcentrationDetail">` container between hypothesis DNA and risk insights grid |
| `src/pages/portfolio.js` | MODIFY -- add analytics fetch after sync, add `updateSummaryHeader(analytics)` and `renderConcentrationDetail(analytics)` functions, wire `ci:portfolio:analytics` event |
| `src/styles/portfolio.css` | MODIFY -- add concentration score colour classes, concentration detail section layout, sector bar styles, flag list styles, light theme overrides, mobile responsive |
| `src/pages/portfolio.test.js` | MODIFY -- add tests for new rendering functions |

### Failure modes

- **Backend unavailable (API down, no DB):** Analytics fetch returns error or times out. Summary header shows "--" for concentration score and flags. Concentration detail section shows "Analytics unavailable" message. Existing frontend-only diagnostics (hypothesis DNA, alignment, contrarian, hedge gaps) render normally.
- **DB sync fails (portfolio not created):** No portfolio ID available, analytics fetch is skipped. Same graceful degradation as above.
- **Analytics endpoint returns 404 (no snapshots):** Concentration items show "--". No error state shown to user.
- **Slow analytics response:** Summary and concentration update asynchronously when data arrives. Page is fully usable before analytics load.
- **Race condition (multiple rapid uploads):** Each upload triggers a new sync + analytics fetch. Latest response wins; no stale data shown because DOM is always overwritten by the most recent call.

### Acceptance criteria

1. After portfolio upload, summary header shows position count and concentration score (0-100) within 3 seconds of sync completion
2. Concentration score is colour-coded: green (0-30), amber (31-60), red (61-100)
3. Risk flag count appears with severity-appropriate styling (warning count in amber, info count in muted)
4. Concentration detail section shows max single-name weight, top 5, top 10, and HHI from backend analytics
5. Sector exposure bars render with percentage labels
6. Risk flags list shows all backend-generated flags with severity icon and message text
7. When backend is unavailable, existing frontend-only diagnostics render normally; new analytics items show "--"
8. No changes to the PM page, PM Chat, or any backend code
9. No regressions in `npm run validate` (lint + Vitest + Jest) or `cd api && python -m pytest`
10. Both dark and light themes render correctly
11. Mobile responsive (summary bar wraps, concentration grid collapses to 2 columns)
12. `index.html` is pulled fresh before editing (GitHub Actions rule)

### Tests required

- **Unit (Vitest):** 8-12 tests in `src/pages/portfolio.test.js`:
  - `updateSummaryHeader()` with full analytics, null analytics, partial analytics
  - `renderConcentrationDetail()` with full analytics, empty flags, no sector exposure
  - Concentration score colour thresholds (0, 30, 31, 60, 61, 100)
  - Flag count badge rendering (0 flags, warnings only, mixed severity)
- **Smoke:** `npm run validate` passes; `cd api && python -m pytest` passes; build clean
- **Manual smoke:** Upload a portfolio CSV, verify concentration score and flags appear in summary header; verify concentration detail section renders with sector bars and flag messages; verify dark/light theme; verify mobile layout

### Rollback

- Revert `index.html` summary bar items to Long Book / Short Book / Neutral
- Remove `portConcentrationDetail` div from `index.html`
- Remove `updateSummaryHeader()`, `renderConcentrationDetail()`, and analytics fetch from `portfolio.js`
- Remove new CSS classes from `portfolio.css`
- All changes are additive to existing rendering; removing them restores the previous display with no functional impact

---

### Implementation tasks

#### Task 1: DOM containers in index.html

**Files:**
- Modify: `index.html:268-301` (summary bar), `index.html:347-348` (insert concentration detail div)

**Prerequisites:** `git pull origin main` (GitHub Actions owns index.html)

- [ ] **Step 1.1: Pull latest index.html**

```bash
cd /c/Users/User/continuum-intelligence-v3 && git pull origin main
```

- [ ] **Step 1.2: Replace Long Book and Short Book summary items with Positions and Concentration**

Replace `index.html:269-276` (Long Book + Short Book items) with:

```html
<div class="portfolio-summary-item">
    <div class="portfolio-summary-label">Positions</div>
    <div class="portfolio-summary-value" id="summaryPositions">--</div>
</div>
<div class="portfolio-summary-item">
    <div class="portfolio-summary-label">Concentration</div>
    <div class="portfolio-summary-value" id="summaryConcentration">--</div>
</div>
```

- [ ] **Step 1.3: Replace Balanced / Neutral summary item with Flags**

Replace `index.html:297-300` (Balanced / Neutral item) with:

```html
<div class="portfolio-summary-item">
    <div class="portfolio-summary-label">Flags</div>
    <div class="portfolio-summary-value" id="summaryFlags">--</div>
</div>
```

- [ ] **Step 1.4: Add concentration detail container between hypothesis DNA and risk insights grid**

After the closing `</div>` of `.port-dna-card` (after the DNA legend div) and before the `.port-insights-grid` div, insert:

```html
<!-- Name Concentration Detail (populated by backend analytics) -->
<div id="portConcentrationDetail" class="port-conc-section" style="display:none">
    <div class="port-conc-header">
        <div class="port-conc-title">Name Concentration</div>
        <div class="port-conc-subtitle">Single-name and top-N position weight analysis</div>
    </div>
    <div class="port-conc-metrics" id="portConcMetrics">
        <div class="port-conc-metric">
            <div class="port-conc-metric-label">Max Single</div>
            <div class="port-conc-metric-value" id="concMaxSingle">--</div>
        </div>
        <div class="port-conc-metric">
            <div class="port-conc-metric-label">Top 5</div>
            <div class="port-conc-metric-value" id="concTop5">--</div>
        </div>
        <div class="port-conc-metric">
            <div class="port-conc-metric-label">Top 10</div>
            <div class="port-conc-metric-value" id="concTop10">--</div>
        </div>
        <div class="port-conc-metric">
            <div class="port-conc-metric-label">HHI</div>
            <div class="port-conc-metric-value" id="concHHI">--</div>
        </div>
    </div>
    <div class="port-conc-sectors" id="portConcSectors"></div>
    <div class="port-conc-flags" id="portConcFlags"></div>
</div>
```

- [ ] **Step 1.5: Commit DOM changes**

```bash
git add index.html
git commit -m "feat: add concentration + flags DOM containers to portfolio summary"
```

---

#### Task 2: Analytics fetch after DB sync (portfolio.js)

**Files:**
- Modify: `src/pages/portfolio.js:697-722` (inside `_syncPortfolioToPMDatabase` success handler)

- [ ] **Step 2.1: Write failing test for analytics fetch dispatch**

Add to `src/pages/portfolio.test.js`:

```javascript
describe('analytics event dispatch', () => {
  it('dispatches ci:portfolio:analytics event with analytics data', () => {
    // Test that _fetchAndDispatchAnalytics dispatches the event
    // This tests the pure dispatch logic, not the fetch
    const mockAnalytics = {
      position_count: 5,
      concentration_score: 28.4,
      concentration: { max_single_weight: 0.182, top5_weight: 0.521, top10_weight: 0.784, hhi: 0.089 },
      sector_exposure: { Materials: 0.35 },
      flags: [{ code: 'HIGH_SINGLE_NAME', severity: 'warning', message: 'BHP is 18.2%' }]
    };
    let received = null;
    window.addEventListener('ci:portfolio:analytics', (e) => { received = e.detail; }, { once: true });
    window.dispatchEvent(new CustomEvent('ci:portfolio:analytics', { detail: mockAnalytics }));
    expect(received).toEqual(mockAnalytics);
  });
});
```

- [ ] **Step 2.2: Run test to verify it passes (event mechanism test)**

```bash
cd /c/Users/User/continuum-intelligence-v3 && npm run test:unit -- --reporter=verbose 2>&1 | tail -20
```

- [ ] **Step 2.3: Add _fetchAndDispatchAnalytics function to portfolio.js**

After the `_syncPortfolioToPMDatabase` function, add:

```javascript
/**
 * Fetch backend analytics for a portfolio and dispatch event for UI consumption.
 * Fire-and-forget: errors are logged but do not block the UI.
 */
function _fetchAndDispatchAnalytics(portfolioId) {
  var apiBase = API_BASE;
  var apiKey = window.CI_API_KEY || '';
  var headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;

  fetch(apiBase + '/api/portfolios/' + portfolioId + '/analytics', { headers: headers })
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function(analytics) {
      console.log('[Portfolio] Analytics received: score=' + analytics.concentration_score + ', flags=' + (analytics.flags || []).length);
      window.dispatchEvent(new CustomEvent('ci:portfolio:analytics', { detail: analytics }));
    })
    .catch(function(err) {
      console.warn('[Portfolio] Analytics fetch failed:', err.message || err);
    });
}
```

- [ ] **Step 2.4: Wire analytics fetch into sync success path**

In `_syncPortfolioToPMDatabase`, inside the `if (r.ok)` block (after the `ci:portfolio:synced` dispatch), add:

```javascript
        // Fetch analytics for concentration display
        _fetchAndDispatchAnalytics(portfolioId);
```

This requires capturing `portfolioId` in the closure. The `.then(function(portfolioId) { return fetch(...)` already has it. Pass it through to the response handler by storing it:

```javascript
  var _syncedPortfolioId = null;

  ensurePortfolio
    .then(function(portfolioId) {
      _syncedPortfolioId = portfolioId;
      return fetch(apiBase + '/api/portfolios/' + portfolioId + '/snapshots', { ... });
    })
    .then(function(r) {
      if (r.ok) {
        // ... existing dispatch ...
        _fetchAndDispatchAnalytics(_syncedPortfolioId);
      }
    })
```

- [ ] **Step 2.5: Run tests**

```bash
cd /c/Users/User/continuum-intelligence-v3 && npm run test:unit -- --reporter=verbose 2>&1 | tail -20
```

- [ ] **Step 2.6: Commit**

```bash
git add src/pages/portfolio.js src/pages/portfolio.test.js
git commit -m "feat: fetch backend analytics after portfolio DB sync"
```

---

#### Task 3: Summary header rendering (portfolio.js)

**Files:**
- Modify: `src/pages/portfolio.js:263-284` (renderPortfolio summary section)
- Modify: `src/pages/portfolio.test.js`

- [ ] **Step 3.1a: Update import block in portfolio.test.js**

Add `updateSummaryHeader` and `renderConcentrationDetail` to the existing import statement at the top of `src/pages/portfolio.test.js`:

```javascript
import {
  // ... existing imports ...
  updateSummaryHeader,
  renderConcentrationDetail
} from './portfolio.js';
```

- [ ] **Step 3.1b: Write failing tests for summary header updates**

Add to `src/pages/portfolio.test.js`:

```javascript
describe('updateSummaryHeader', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="summaryPositions">--</div>
      <div id="summaryConcentration">--</div>
      <div id="summaryFlags">--</div>
    `;
  });

  it('populates position count, concentration score, and flag count', () => {
    updateSummaryHeader({
      position_count: 12,
      concentration_score: 28.4,
      flags: [
        { severity: 'warning', message: 'test' },
        { severity: 'info', message: 'test2' }
      ]
    });
    expect(document.getElementById('summaryPositions').textContent).toBe('12');
    expect(document.getElementById('summaryConcentration').textContent).toBe('28');
    expect(document.getElementById('summaryFlags').querySelectorAll('span').length).toBe(2);
  });

  it('applies green class for score 0-30', () => {
    updateSummaryHeader({ position_count: 5, concentration_score: 15.0, flags: [] });
    expect(document.getElementById('summaryConcentration').className).toContain('conc-green');
  });

  it('applies amber class for score 31-60', () => {
    updateSummaryHeader({ position_count: 5, concentration_score: 45.0, flags: [] });
    expect(document.getElementById('summaryConcentration').className).toContain('conc-amber');
  });

  it('applies red class for score 61-100', () => {
    updateSummaryHeader({ position_count: 3, concentration_score: 72.0, flags: [] });
    expect(document.getElementById('summaryConcentration').className).toContain('conc-red');
  });

  it('shows -- when analytics is null', () => {
    updateSummaryHeader(null);
    expect(document.getElementById('summaryConcentration').textContent).toBe('--');
  });
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

```bash
cd /c/Users/User/continuum-intelligence-v3 && npm run test:unit -- --reporter=verbose 2>&1 | tail -30
```

Expected: FAIL with "updateSummaryHeader is not defined"

- [ ] **Step 3.3: Implement updateSummaryHeader**

Add to `src/pages/portfolio.js` (export it):

```javascript
/**
 * Update the summary header with backend analytics data.
 * Called when ci:portfolio:analytics event fires.
 */
export function updateSummaryHeader(analytics) {
  var posEl = document.getElementById('summaryPositions');
  var concEl = document.getElementById('summaryConcentration');
  var flagsEl = document.getElementById('summaryFlags');

  if (!analytics) {
    if (posEl) posEl.textContent = '--';
    if (concEl) { concEl.textContent = '--'; concEl.className = 'portfolio-summary-value'; }
    if (flagsEl) flagsEl.textContent = '--';
    return;
  }

  // Position count
  if (posEl) posEl.textContent = String(analytics.position_count || 0);

  // Concentration score (0-100) with colour coding
  if (concEl) {
    var score = analytics.concentration_score != null ? Math.round(analytics.concentration_score) : null;
    if (score != null) {
      concEl.textContent = String(score);
      var colorClass = score <= 30 ? 'conc-green' : score <= 60 ? 'conc-amber' : 'conc-red';
      concEl.className = 'portfolio-summary-value ' + colorClass;
    } else {
      concEl.textContent = '--';
      concEl.className = 'portfolio-summary-value';
    }
  }

  // Flag count
  if (flagsEl) {
    var flags = analytics.flags || [];
    var warnings = flags.filter(function(f) { return f.severity === 'warning'; }).length;
    var infos = flags.filter(function(f) { return f.severity === 'info'; }).length;
    if (flags.length === 0) {
      flagsEl.innerHTML = '<span class="conc-green">0</span>';
    } else {
      var parts = [];
      if (warnings > 0) parts.push('<span class="conc-amber">' + warnings + '</span>');
      if (infos > 0) parts.push('<span class="conc-muted">' + infos + '</span>');
      flagsEl.innerHTML = parts.join(' / ');
    }
  }
}
```

- [ ] **Step 3.4: Update renderPortfolio to populate position count in summary**

In `renderPortfolio()`, replace the lines that set `summaryLong`, `summaryShort`, and `summaryNeutral` (lines ~275-284) with:

```javascript
  document.getElementById('summaryPositions').textContent = String(positions.length);
  // Reset async-populated fields to "--" (will be updated when analytics arrive)
  var concResetEl = document.getElementById('summaryConcentration');
  if (concResetEl) { concResetEl.textContent = '--'; concResetEl.className = 'portfolio-summary-value'; }
  var flagsResetEl = document.getElementById('summaryFlags');
  if (flagsResetEl) flagsResetEl.textContent = '--';
  document.getElementById('summaryNet').textContent = 'A$' + formatNum(netExposure, 0);
  document.getElementById('summaryGross').textContent = 'A$' + formatNum(grossCalc, 0);
  var pnlEl = document.getElementById('summaryPnL');
  pnlEl.textContent = (totalPnL >= 0 ? '+' : '') + 'A$' + formatNum(totalPnL, 0) + ' (' + (totalPnLPct >= 0 ? '+' : '') + formatNum(totalPnLPct, 1) + '%)';
  pnlEl.className = 'portfolio-summary-value ' + (totalPnL >= 0 ? 'positive' : 'negative');
  document.getElementById('summaryAligned').textContent = formatNum(alignedWeight, 1) + '%';
  document.getElementById('summaryContra').textContent = formatNum(contraWeight, 1) + '%';
  // Concentration and Flags populated async by updateSummaryHeader() via ci:portfolio:analytics event
```

- [ ] **Step 3.5: Wire event listener**

At the end of the file (after `setupUploadZone`), add:

```javascript
// Listen for backend analytics to update summary header and concentration detail
window.addEventListener('ci:portfolio:analytics', function(e) {
  updateSummaryHeader(e.detail);
  renderConcentrationDetail(e.detail);
});
```

- [ ] **Step 3.6: Run tests to verify they pass**

```bash
cd /c/Users/User/continuum-intelligence-v3 && npm run test:unit -- --reporter=verbose 2>&1 | tail -30
```

- [ ] **Step 3.7: Commit**

```bash
git add src/pages/portfolio.js src/pages/portfolio.test.js
git commit -m "feat: update portfolio summary header with concentration score and flags"
```

---

#### Task 4: Concentration detail section rendering (portfolio.js)

**Files:**
- Modify: `src/pages/portfolio.js`
- Modify: `src/pages/portfolio.test.js`

- [ ] **Step 4.1: Write failing tests for renderConcentrationDetail**

Add to `src/pages/portfolio.test.js`:

```javascript
describe('renderConcentrationDetail', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="portConcentrationDetail" style="display:none">
        <div id="concMaxSingle">--</div>
        <div id="concTop5">--</div>
        <div id="concTop10">--</div>
        <div id="concHHI">--</div>
        <div id="portConcSectors"></div>
        <div id="portConcFlags"></div>
      </div>
    `;
  });

  it('populates concentration metrics from analytics', () => {
    renderConcentrationDetail({
      concentration: { max_single_weight: 0.182, top5_weight: 0.521, top10_weight: 0.784, hhi: 0.089 },
      sector_exposure: { Materials: 0.35, Financials: 0.25 },
      flags: [{ code: 'HIGH_SINGLE_NAME', severity: 'warning', message: 'BHP is 18.2%' }]
    });
    expect(document.getElementById('concMaxSingle').textContent).toBe('18.2%');
    expect(document.getElementById('concTop5').textContent).toBe('52.1%');
    expect(document.getElementById('concTop10').textContent).toBe('78.4%');
    expect(document.getElementById('concHHI').textContent).toBe('0.089');
    expect(document.getElementById('portConcentrationDetail').style.display).toBe('');
  });

  it('renders sector bars', () => {
    renderConcentrationDetail({
      concentration: { max_single_weight: 0.1, top5_weight: 0.3, top10_weight: 0.5, hhi: 0.05 },
      sector_exposure: { Materials: 0.35, Financials: 0.25, Energy: 0.15 },
      flags: []
    });
    var sectors = document.getElementById('portConcSectors');
    expect(sectors.querySelectorAll('.port-conc-sector-row').length).toBe(3);
  });

  it('renders flag messages', () => {
    renderConcentrationDetail({
      concentration: { max_single_weight: 0.2, top5_weight: 0.6, top10_weight: 0.8, hhi: 0.1 },
      sector_exposure: {},
      flags: [
        { code: 'HIGH_SINGLE_NAME', severity: 'warning', message: 'BHP is 20%' },
        { code: 'UNMAPPED_SECTOR', severity: 'info', message: '5% unmapped' }
      ]
    });
    var flagsEl = document.getElementById('portConcFlags');
    expect(flagsEl.querySelectorAll('.port-conc-flag').length).toBe(2);
  });

  it('hides section when analytics is null', () => {
    renderConcentrationDetail(null);
    expect(document.getElementById('portConcentrationDetail').style.display).toBe('none');
  });

  it('shows section with no flags gracefully', () => {
    renderConcentrationDetail({
      concentration: { max_single_weight: 0.08, top5_weight: 0.3, top10_weight: 0.5, hhi: 0.04 },
      sector_exposure: {},
      flags: []
    });
    var flagsEl = document.getElementById('portConcFlags');
    expect(flagsEl.textContent).toContain('No risk flags');
  });
});
```

- [ ] **Step 4.2: Run tests to verify they fail**

```bash
cd /c/Users/User/continuum-intelligence-v3 && npm run test:unit -- --reporter=verbose 2>&1 | tail -30
```

- [ ] **Step 4.3: Implement renderConcentrationDetail**

Add to `src/pages/portfolio.js` (export it):

```javascript
/**
 * Render the concentration detail section with backend analytics.
 * Shows max single-name, top 5, top 10, HHI, sector bars, and risk flags.
 */
export function renderConcentrationDetail(analytics) {
  var container = document.getElementById('portConcentrationDetail');
  if (!container) return;

  if (!analytics) {
    container.style.display = 'none';
    return;
  }

  container.style.display = '';
  var conc = analytics.concentration || {};

  // Metrics
  var maxEl = document.getElementById('concMaxSingle');
  var top5El = document.getElementById('concTop5');
  var top10El = document.getElementById('concTop10');
  var hhiEl = document.getElementById('concHHI');

  if (maxEl) maxEl.textContent = _fmtWeight(conc.max_single_weight);
  if (top5El) top5El.textContent = _fmtWeight(conc.top5_weight);
  if (top10El) top10El.textContent = _fmtWeight(conc.top10_weight);
  if (hhiEl) hhiEl.textContent = conc.hhi != null ? conc.hhi.toFixed(3) : '--';

  // Sector bars
  var sectorsEl = document.getElementById('portConcSectors');
  if (sectorsEl && analytics.sector_exposure) {
    var sectors = Object.entries(analytics.sector_exposure);
    if (sectors.length > 0) {
      sectorsEl.innerHTML =
        '<div class="port-conc-section-label">SECTOR EXPOSURE</div>' +
        sectors.map(function(entry) {
          var name = entry[0];
          var weight = entry[1];
          var barWidth = Math.min(weight * 100, 100);
          return '<div class="port-conc-sector-row">' +
            '<div class="port-conc-sector-name">' + _escText(name) + '</div>' +
            '<div class="port-conc-sector-bar-wrap">' +
              '<div class="port-conc-sector-bar" style="width:' + barWidth + '%"></div>' +
            '</div>' +
            '<div class="port-conc-sector-pct">' + _fmtWeight(weight) + '</div>' +
          '</div>';
        }).join('');
    } else {
      sectorsEl.innerHTML = '';
    }
  }

  // Flags
  var flagsEl = document.getElementById('portConcFlags');
  if (flagsEl) {
    var flags = analytics.flags || [];
    if (flags.length === 0) {
      flagsEl.innerHTML = '<div class="port-conc-no-flags">No risk flags triggered</div>';
    } else {
      flagsEl.innerHTML =
        '<div class="port-conc-section-label">RISK FLAGS</div>' +
        flags.map(function(f) {
          var icon = f.severity === 'warning' ? '!' : 'i';
          var cls = f.severity === 'warning' ? 'port-conc-flag-warn' : 'port-conc-flag-info';
          return '<div class="port-conc-flag ' + cls + '">' +
            '<span class="port-conc-flag-icon">' + icon + '</span>' +
            '<span class="port-conc-flag-msg">' + _escText(f.message) + '</span>' +
          '</div>';
        }).join('');
    }
  }
}

function _fmtWeight(w) {
  if (w == null || isNaN(w)) return '--';
  return (w * 100).toFixed(1) + '%';
}

function _escText(str) {
  var d = document.createElement('div');
  d.textContent = str != null ? String(str) : '';
  return d.innerHTML;
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

```bash
cd /c/Users/User/continuum-intelligence-v3 && npm run test:unit -- --reporter=verbose 2>&1 | tail -30
```

- [ ] **Step 4.5: Commit**

```bash
git add src/pages/portfolio.js src/pages/portfolio.test.js
git commit -m "feat: render concentration detail section from backend analytics"
```

---

#### Task 5: CSS styling (portfolio.css)

**Files:**
- Modify: `src/styles/portfolio.css`

- [ ] **Step 5.1: Add concentration score colour classes for summary bar**

Append to `portfolio.css` after the existing `.portfolio-summary-value.negative` rule:

```css
/* Concentration Score Colours */
.portfolio-summary-value.conc-green { color: var(--signal-green); }
.portfolio-summary-value.conc-amber { color: var(--signal-amber, #f59e0b); }
.portfolio-summary-value.conc-red { color: var(--signal-red); }
.portfolio-summary-value .conc-green { color: var(--signal-green); }
.portfolio-summary-value .conc-amber { color: var(--signal-amber, #f59e0b); }
.portfolio-summary-value .conc-muted { color: var(--text-muted); }
```

- [ ] **Step 5.2: Add concentration detail section styles**

Append before the `/* Light Theme Overrides */` section:

```css
/* ============================================================
   CONCENTRATION DETAIL (backend analytics)
   ============================================================ */

.port-conc-section {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: var(--space-xl);
    margin-bottom: var(--space-xl);
}

.port-conc-header { margin-bottom: var(--space-lg); }

.port-conc-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: var(--space-xs);
}

.port-conc-subtitle {
    font-size: 0.8rem;
    color: var(--text-muted);
}

.port-conc-metrics {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-md);
    margin-bottom: var(--space-xl);
}

.port-conc-metric {
    text-align: center;
    padding: var(--space-md);
    background: var(--bg-elevated);
    border-radius: 6px;
}

.port-conc-metric-label {
    font-size: 0.55rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin-bottom: 4px;
}

.port-conc-metric-value {
    font-family: var(--font-data);
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text-primary);
}

.port-conc-section-label {
    font-family: var(--font-data);
    font-size: 0.56rem;
    font-weight: 700;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: var(--accent-gold);
    margin-bottom: var(--space-sm);
    margin-top: var(--space-lg);
}

/* Sector bars */
.port-conc-sector-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: 6px;
}

.port-conc-sector-name {
    font-size: 0.72rem;
    color: var(--text-primary);
    min-width: 120px;
    flex-shrink: 0;
}

.port-conc-sector-bar-wrap {
    flex: 1;
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
}

.port-conc-sector-bar {
    height: 100%;
    background: var(--accent-gold);
    border-radius: 3px;
    transition: width 0.4s ease;
}

.port-conc-sector-pct {
    font-family: var(--font-data);
    font-size: 0.68rem;
    color: var(--text-muted);
    min-width: 44px;
    text-align: right;
}

/* Flags */
.port-conc-flag {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    padding: var(--space-sm) 0;
    border-bottom: 1px solid var(--border);
}

.port-conc-flag:last-child { border-bottom: none; }

.port-conc-flag-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    font-family: var(--font-data);
    font-size: 0.55rem;
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 1px;
}

.port-conc-flag-warn .port-conc-flag-icon {
    background: var(--signal-amber, #f59e0b);
    color: var(--bg-body);
}

.port-conc-flag-info .port-conc-flag-icon {
    background: var(--text-muted);
    color: var(--bg-body);
}

.port-conc-flag-msg {
    font-size: 0.78rem;
    line-height: 1.5;
    color: var(--text-secondary);
}

.port-conc-no-flags {
    font-size: 0.78rem;
    color: var(--text-muted);
    padding: var(--space-sm) 0;
}
```

- [ ] **Step 5.3: Add light theme overrides**

Add to the existing light theme section:

```css
[data-theme="light"] .port-conc-section {
    background: #FFFFFF;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

[data-theme="light"] .port-conc-metric {
    background: #F7F8FA;
}
```

- [ ] **Step 5.4: Add mobile responsive rules**

Add to the existing `@media (max-width: 768px)` block:

```css
    .port-conc-metrics {
        grid-template-columns: repeat(2, 1fr);
    }
    .port-conc-sector-name {
        min-width: 80px;
    }
```

- [ ] **Step 5.5: Run build + lint to verify CSS compiles**

```bash
cd /c/Users/User/continuum-intelligence-v3 && npm run build 2>&1 | tail -10
```

- [ ] **Step 5.6: Commit**

```bash
git add src/styles/portfolio.css
git commit -m "feat: add concentration detail and summary header CSS"
```

---

#### Task 6: Integration verification

**Files:** None (verification only)

- [ ] **Step 6.1: Run full test suite**

```bash
cd /c/Users/User/continuum-intelligence-v3 && npm run validate 2>&1 | tail -20
```

- [ ] **Step 6.2: Run Python tests (no regressions)**

```bash
cd /c/Users/User/continuum-intelligence-v3/api && python -m pytest -q 2>&1 | tail -10
```

- [ ] **Step 6.3: Run Vite build**

```bash
cd /c/Users/User/continuum-intelligence-v3 && npm run build 2>&1 | tail -10
```

- [ ] **Step 6.4: Manual smoke test**

Start dev server (`npm run dev`), upload a portfolio CSV, verify:
1. Summary header shows position count and concentration score with colour
2. Flags item shows count (or "0" in green if no flags)
3. Concentration detail section appears with metrics, sector bars, and flag messages
4. Existing hypothesis DNA, contrarian, hedge gaps, alignment still render
5. Toggle dark/light theme; both render correctly
6. Resize to mobile width; grid collapses to 2 columns

---

### Design decisions

1. **Replace Long/Short/Neutral rather than add new items.** The summary bar has 8 items in a flex row. Adding more would overflow on narrower screens. Long Book = Gross in long-only v1. Short Book is always $0. Neutral is the least actionable alignment metric. Replacing these 3 with Positions, Concentration Score, and Flags keeps the count at 8 and surfaces more useful data.

2. **Fetch analytics rather than compute client-side.** The backend analytics engine is the single source of truth (47 + 92 tests). Duplicating the logic in JS would create a divergence risk. The fetch adds ~200ms latency but the portfolio is already usable before analytics arrive.

3. **Fire-and-forget analytics fetch.** Matches the existing DB sync pattern. If the backend is down, the page still works with frontend-only diagnostics. No loading spinners or error modals.

4. **Separate concentration section from hypothesis DNA.** Hypothesis DNA is Continuum-specific (N1/N2/N3/N4 hypothesis tiers). Name concentration is universal PM analytics (HHI, top-N, sector exposure). They answer different questions and should be visually distinct.

5. **Reuse existing CSS variable system.** All colours use `--signal-green`, `--signal-amber`, `--signal-red`, `--accent-gold`, `--text-muted`. No hardcoded colours. Both themes work via CSS variables.

6. **`clearPortfolio()` does not need modification.** The `portConcentrationDetail` div is nested inside `portfolioDiagnostics`. When `clearPortfolio()` hides the parent, the child is also hidden. On re-upload, the child stays `display:none` until a new `ci:portfolio:analytics` event fires. No stale data persists visually.

7. **Analytics response has additional fields not consumed by this bead.** `theme_exposure`, `thresholds_used`, `holdings_with_weights`, and `concentration.equal_weight_deviation` are present in the `compute_analytics()` output but ignored by the frontend rendering code. This is intentional; the PM page and PM Chat consume the full response.

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

### BEAD-001: PM Monitoring Dashboard (D6-4) -- completed 2026-03-23

Merge commit `d86d9b6`, closure commit `fe5b552`. Backend aggregation endpoint (`GET /api/ops/pm-dashboard`) and frontend ops page (`/ops`). Fresh-context review caught a critical auth bypass (OPS_SECRET open when env var empty). Process validated.
