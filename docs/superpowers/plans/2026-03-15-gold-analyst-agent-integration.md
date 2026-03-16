# Gold Analyst Agent Integration -- Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the Gold Analyst Agent for OBM, WIA, and SNX, and expand the research page Gold Analysis section with six sub-panels.

**Architecture:** Approach A -- expand the existing `renderGoldDiscovery` in `report-sections.js` with six conditional sub-panel renderers. Promote the section in render order (after Hypotheses) for gold stocks. Stock onboarding and gold agent execution are prerequisites.

**Tech Stack:** JavaScript (classic `var` style in report-sections.js), FastAPI/Python backend, Railway deployment, NotebookLM corpus

**Spec:** `docs/superpowers/specs/2026-03-15-gold-analyst-agent-integration-design.md`

---

## Chunk 1: Stock Onboarding

### Task 1: Scaffold SNX via Railway

**Files:**
- Modify: `data/reference.json` (add SNX entry)
- Modify: `data/research/_index.json` (add SNX entry)
- Create: `data/research/SNX.json` (via scaffold endpoint)

- [ ] **Step 1: Verify Railway is healthy**

Run: `curl https://imaginative-vision-production-16cb.up.railway.app/api/health`
Expected: `{"status": "healthy", ...}`

- [ ] **Step 2: Scaffold SNX**

Run: `curl -X POST "https://imaginative-vision-production-16cb.up.railway.app/api/stocks/add" -H "Content-Type: application/json" -d '{"ticker": "SNX", "name": "Sierra Nevada Gold", "exchange": "ASX"}'`
Expected: 200 response with scaffold JSON including `ticker: "SNX"`

- [ ] **Step 3: Pull scaffold data**

Run: `cd C:/Users/User/continuum-intelligence-v3 && git pull origin main`
Expected: Research JSON and index entries created by the scaffold endpoint. If scaffold writes to Railway only, manually save the response JSON to `data/research/SNX.json`.

- [ ] **Step 4: Verify SNX entries exist**

Check these three files have SNX entries:
- `data/reference.json` -- must have SNX with `sharesOutstanding`, `reportingCurrency`
- `data/research/_index.json` -- must have SNX entry with `ticker`, `company`, `sector`
- `data/research/SNX.json` -- must exist with scaffold structure

If any are missing, add them manually following the OBM/WIA pattern.

- [ ] **Step 5: Populate reference.json for SNX**

Add market data to the SNX entry in `data/reference.json`:
```json
{
  "ticker": "SNX",
  "name": "Sierra Nevada Gold",
  "exchange": "ASX",
  "sector": "Gold",
  "sharesOutstanding": <lookup>,
  "reportingCurrency": "AUD",
  "EPS": <lookup>,
  "divPerShare": 0,
  "_anchors": { "price": <lookup>, "marketCap": <lookup> }
}
```
Values must be looked up from ASX or broker data at the time of implementation.

- [ ] **Step 6: Verify OBM and WIA scaffolds are complete**

Check `data/research/OBM.json` and `data/research/WIA.json` both exist and have the standard scaffold structure (ticker, company, hypotheses, evidence, narrative sections). Check `data/reference.json` has entries for both.

- [ ] **Step 7: Commit**

```bash
cd C:/Users/User/continuum-intelligence-v3
git add data/reference.json data/research/_index.json data/research/SNX.json
git commit -m "scaffold: add SNX (Sierra Nevada Gold)"
```

---

### Task 2: Run Gold Agent for all six gold stocks

**Files:**
- Modify: `data/research/OBM.json` (merge goldAgent output)
- Modify: `data/research/WIA.json` (merge goldAgent output)
- Modify: `data/research/SNX.json` (merge goldAgent output)
- Modify: `data/research/NST.json` (re-run to populate `assets`, `valuation`, `peer_frame`, `sensitivities`)
- Modify: `data/research/EVN.json` (re-run to populate full schema)
- Modify: `data/research/WAF.json` (re-run to populate full schema)

**Prerequisite:** Task 1 complete. NotebookLM auth must be fresh (check Railway `NOTEBOOKLM_AUTH_JSON` env var; if expired, re-run `Get NotebookLM Auth.bat` from Desktop).

**Why re-run NST/EVN/WAF:** The existing `goldAgent` objects in these files contain only the flattened format (`skew_score`, `verdict`, `hypothesis`, `key_metrics`, `evidence`). They lack `assets`, `valuation`, `peer_frame`, and `sensitivities`, which the new sub-panels need. Re-running produces the full schema.

NotebookLM notebook IDs (new stocks):
- OBM: `3551536b-a14e-4eab-9b6f-68be4d697e37`
- WIA: `83e83b7b-8cf0-4238-a1af-8c5c6a6a0bff`
- SNX: `72e4ccf0-e062-4e01-ba0f-0ce935358ff1`

NotebookLM notebook IDs (existing stocks -- check Railway env or existing corpus):
- NST, EVN, WAF: use their existing corpus notebooks

- [ ] **Step 1: Run gold agent for OBM**

Run: `curl https://imaginative-vision-production-16cb.up.railway.app/api/agents/gold/OBM`
Expected: 200 response with full gold agent JSON (~90 seconds). Save response to a temp file.
If 503: NotebookLM auth expired. Re-run auth batch, update Railway env var, retry.

- [ ] **Step 2: Merge OBM gold agent output into research JSON**

Open `data/research/OBM.json`. Add the gold agent response as a `"goldAgent"` key at the top level of the JSON, alongside the existing `hypotheses`, `evidence`, `narrative` fields. This matches the pattern in `data/research/NST.json` (line 633+).

Also update `featuredMetrics` in the research JSON to include AISC as one of the four displayed metrics if `goldAgent.key_metrics.aisc_per_oz_usd` is present.

- [ ] **Step 3: Validate OBM output**

Check the merged `goldAgent` object has:
- `skew_score` (number 5-80)
- `verdict` or `executive_summary` (non-empty string)
- `hypothesis.bull` and `hypothesis.bear` (non-empty strings)
- `key_metrics.aisc_per_oz` or `key_metrics.aisc_per_oz_usd` (number)
- `evidence` (array with >= 5 items)
- `monitoring_trigger` (non-empty string)
- `assets` (array, may be empty for single-asset companies)
- `valuation` (object with `screening_nav_usd_m`, `p_nav`, etc.)
- `sensitivities` (object with `gold_price_up_15_nav_usd_m`, etc.)
- `peer_frame` (object with `peer_group`, `peer_median_p_nav`, etc.)

- [ ] **Step 4: Repeat for WIA**

Run gold agent, merge, validate (same as Steps 1-3).

- [ ] **Step 5: Repeat for SNX**

Run gold agent, merge, validate (same as Steps 1-3).

- [ ] **Step 6: Re-run gold agent for NST**

Run: `curl https://imaginative-vision-production-16cb.up.railway.app/api/agents/gold/NST`
Replace the existing `goldAgent` object in `data/research/NST.json` with the new full-schema output.

- [ ] **Step 7: Re-run gold agent for EVN**

Same as Step 6 for EVN.

- [ ] **Step 8: Re-run gold agent for WAF**

Same as Step 6 for WAF.

- [ ] **Step 9: Commit**

```bash
cd C:/Users/User/continuum-intelligence-v3
git add data/research/OBM.json data/research/WIA.json data/research/SNX.json data/research/NST.json data/research/EVN.json data/research/WAF.json
git commit -m "gold-agent: full-schema analysis for OBM, WIA, SNX; re-run NST, EVN, WAF"
```

---

## Chunk 2: Research Page Enhancement

### Task 3: Reorder sections for gold stocks in report.js

**Files:**
- Modify: `src/pages/report.js:35-47`

- [ ] **Step 1: Read current report.js**

Read `src/pages/report.js` to confirm the current render order.

- [ ] **Step 2: Modify renderReport to insert Gold Analysis after Hypotheses**

Change the `mainContent` concatenation so that `renderGoldDiscovery(data)` appears after `renderHypotheses(data)` instead of at the end:

```javascript
  var mainContent =
    renderPriceDriversPlaceholder(data.ticker) +
    renderOvercorrectionBanner(data) +
    renderIdentity(data) +
    renderHypotheses(data) +
    renderGoldDiscovery(data) +
    renderNarrativeTimeline(data) +
    renderNarrative(data) +
    renderEvidence(data) +
    renderDiscriminators(data) +
    renderTripwires(data) +
    renderGaps(data) +
    renderTechnicalAnalysis(data);
```

This is safe because `renderGoldDiscovery` returns empty string when `data.goldAgent` is absent.

- [ ] **Step 3: Run tests**

Run: `cd C:/Users/User/continuum-intelligence-v3 && npm run test:unit`
Expected: 157 tests pass (no test covers render order)

- [ ] **Step 4: Commit**

```bash
git add src/pages/report.js
git commit -m "report: promote Gold Analysis section after Hypotheses"
```

---

### Task 4: Update renderSectionNav for gold stocks

**Files:**
- Modify: `src/pages/report-sections.js:203-224`

- [ ] **Step 1: Read current renderSectionNav**

Read `src/pages/report-sections.js` lines 203-235.

- [ ] **Step 2: Update nav ordering and label**

Replace the static sections array and filtering logic. When `data.goldAgent` is present, insert `gold-analysis` after `hypotheses`. Rename label from "Gold Discovery" to "Gold Analysis". Update the section ID prefix from `gold-discovery` to `gold-analysis`.

```javascript
export function renderSectionNav(data) {
  var t = data.ticker.toLowerCase();
  var sections = [
    ['identity', 'Identity'],
    ['hypotheses', 'Hypotheses']
  ];

  if (data.goldAgent) {
    sections.push(['gold-analysis', 'Gold Analysis']);
  }

  sections.push(
    ['narrative-timeline', 'Timeline'],
    ['narrative', 'Narrative'],
    ['evidence', 'Evidence'],
    ['discriminates', 'Discriminates'],
    ['tripwires', 'Tripwires'],
    ['gaps', 'Gaps']
  );

  if (data.technicalAnalysis) {
    sections.push(['technical', 'Technical']);
  }

  sections.push(['chat', 'Research Chat']);

  var linksHtml = '';
  for (var i = 0; i < sections.length; i++) {
    var activeClass = i === 0 ? ' class="active"' : '';
    linksHtml += '<a href="#' + t + '-' + sections[i][0] + '"' + activeClass + '>' + sections[i][1] + '</a>';
  }

  return '<div class="section-nav">' +
    '<div class="section-nav-inner">' + linksHtml + '</div>' +
  '</div>';
}
```

- [ ] **Step 3: Update renderGoldDiscovery section ID, header, and add company_stage badge**

In `_renderGoldDiscoveryInner` (line 1829), change the section ID from `gold-discovery` to `gold-analysis` and the header label from "Gold Agent Discovery" to "Gold Analysis":

```javascript
  return '<div class="report-section" id="' + t + '-gold-analysis">' +
    RS_HDR('Section 09', 'Gold Analysis') +
```

Also add a company stage badge to the scorecard section (after the skew score card, around line 1749):

```javascript
  var stageBadge = ga.company_stage
    ? '<div class="ga-score-card"><div class="ga-score-label">Stage</div>' +
        '<div class="ga-score-value" style="font-size:13px">' + ga.company_stage.replace(/_/g, ' ') + '</div></div>'
    : '';

  var scorecardHtml =
    '<div class="ga-scorecard">' +
      '<div class="ga-score-card ga-score-skew" style="border-color:' + skewColor + '">' +
        '<div class="ga-score-label">Skew</div>' +
        '<div class="ga-score-value" style="color:' + skewColor + '">' + skew + '</div>' +
      '</div>' +
      stageBadge +
    '</div>';
```

- [ ] **Step 4: Run tests**

Run: `cd C:/Users/User/continuum-intelligence-v3 && npm run test:unit`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/pages/report-sections.js
git commit -m "report-sections: rename Gold Discovery to Gold Analysis, reorder nav"
```

---

### Task 5: Add Asset Portfolio sub-panel

**Files:**
- Modify: `src/pages/report-sections.js` (inside `_renderGoldDiscoveryInner`)

- [ ] **Step 1: Read current _renderGoldDiscoveryInner**

Read `src/pages/report-sections.js` lines 1728-1841.

- [ ] **Step 2: Add renderGoldAssets helper function**

Add before `_renderGoldDiscoveryInner`:

```javascript
function _renderGoldAssets(ga) {
  var assets = ga.assets;
  if (!assets || !assets.length) return '';

  var rows = '';
  for (var i = 0; i < assets.length; i++) {
    var a = assets[i];
    rows += '<tr>' +
      '<td>' + (a.name || 'N/A') + '</td>' +
      '<td>' + (a.country || 'N/A') + '</td>' +
      '<td>' + (a.ownership_pct != null ? a.ownership_pct + '%' : '100%') + '</td>' +
      '<td>' + (a.stage || 'N/A') + '</td>' +
      '<td>' + (a.deposit_type || 'N/A') + '</td>' +
      '<td>' + (a.mining_method || 'N/A') + '</td>' +
      '<td>' + (a.annual_production_koz != null ? a.annual_production_koz + ' koz' : 'N/A') + '</td>' +
      '<td>' + (a.reserve_grade_gt != null ? a.reserve_grade_gt + ' g/t' : 'N/A') + '</td>' +
      '<td>' + (a.mine_life_years != null ? a.mine_life_years + ' yr' : 'N/A') + '</td>' +
      '<td>' + (a.aisc_per_oz_usd != null ? 'US$' + a.aisc_per_oz_usd.toLocaleString() : 'N/A') + '</td>' +
    '</tr>';
  }

  return '<div class="ga-sub-panel">' +
    '<div class="rs-subtitle">Asset Portfolio</div>' +
    '<div class="ga-evidence-scroll">' +
    '<table class="ga-metrics-table ga-assets-table"><thead><tr>' +
      '<th>Asset</th><th>Country</th><th>Own%</th><th>Stage</th>' +
      '<th>Deposit</th><th>Method</th>' +
      '<th>Production</th><th>Grade</th><th>Mine Life</th><th>AISC</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>' +
    '</div></div>';
}
```

Note: Per-asset production field is `annual_production_koz` (not `production_koz_annual`, which is the company-level field in `key_metrics`).

- [ ] **Step 3: Wire into _renderGoldDiscoveryInner**

In the return statement of `_renderGoldDiscoveryInner`, add `_renderGoldAssets(ga)` after the investment view HTML:

```javascript
      scorecardHtml +
      verdictHtml +
      viewHtml +
      _renderGoldAssets(ga) +
      metricsHtml +
```

- [ ] **Step 4: Run tests**

Run: `cd C:/Users/User/continuum-intelligence-v3 && npm run test:unit`
Expected: All pass

- [ ] **Step 5: Verify on dev server**

Run: `cd C:/Users/User/continuum-intelligence-v3 && npm run dev`
Open a gold stock report (NST, EVN, or WAF). If `assets` array is present in the goldAgent data, the Asset Portfolio table should render. If absent, sub-panel is omitted silently.

- [ ] **Step 6: Commit**

```bash
git add src/pages/report-sections.js
git commit -m "gold-analysis: add Asset Portfolio sub-panel"
```

---

### Task 6: Expand Cost Structure sub-panel (refine existing Key Metrics)

**Files:**
- Modify: `src/pages/report-sections.js` (inside `_renderGoldDiscoveryInner`)

- [ ] **Step 1: Read current key metrics section**

Read `src/pages/report-sections.js` lines 1770-1783.

- [ ] **Step 2: Replace metrics table with 3x2 grid including margin**

Replace the existing `metricsList` and table with a grid layout:

```javascript
  // ---- Cost Structure (3x2 grid) ----
  var goldPrice = (km.gold_price_assumption_usd_per_oz || 2900);
  var aiscUsd = km.aisc_per_oz_usd || aisc;
  var margin = (aiscUsd && goldPrice) ? Math.round((goldPrice - aiscUsd) / goldPrice * 100) : null;

  var costItems = [
    ['AISC (per oz)', aisc != null ? ('A$' + aisc.toLocaleString()) : 'N/A'],
    ['Cash Cost (per oz)', km.cash_cost_per_oz_usd != null ? ('US$' + km.cash_cost_per_oz_usd.toLocaleString()) : 'N/A'],
    ['Production', km.production_koz_annual ? (km.production_koz_annual.toLocaleString() + ' koz/yr') : 'N/A'],
    ['Mine Life', km.mine_life_years ? (km.mine_life_years + ' years') : 'N/A'],
    ['Reserve Grade', km.reserve_grade_gt ? (km.reserve_grade_gt + ' g/t') : 'N/A'],
    ['Net Cash / (Debt)', netCash != null ? ('A$' + netCash.toLocaleString() + 'm') : 'N/A']
  ];

  var costGrid = '';
  for (var c = 0; c < costItems.length; c++) {
    costGrid += '<div class="ga-cost-cell">' +
      '<div class="ga-cost-label">' + costItems[c][0] + '</div>' +
      '<div class="ga-cost-value">' + costItems[c][1] + '</div>' +
    '</div>';
  }

  var marginHtml = margin != null
    ? '<div class="ga-margin-bar">' +
        '<span class="ga-margin-label">Margin at spot:</span> ' +
        '<span class="ga-margin-value" style="color:' + (margin > 30 ? 'var(--signal-green)' : margin > 15 ? 'var(--signal-amber)' : 'var(--signal-red)') + '">' + margin + '%</span>' +
      '</div>'
    : '';

  var metricsHtml = '<div class="ga-sub-panel">' +
    '<div class="rs-subtitle">Cost Structure</div>' +
    marginHtml +
    '<div class="ga-cost-grid">' + costGrid + '</div>' +
  '</div>';
```

- [ ] **Step 3: Add CSS for cost grid**

Add to `src/styles/report.css` (where all existing `.ga-` styles live, around line 1792+):

```css
/* Gold Analysis: Cost Structure */
.ga-cost-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px; }
.ga-cost-cell { padding: 8px 12px; background: var(--bg-card, #1a1a2e); border-radius: 6px; }
.ga-cost-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.ga-cost-value { font-size: 16px; font-weight: 600; margin-top: 2px; }
.ga-margin-bar { padding: 8px 12px; margin-bottom: 8px; font-size: 13px; }
.ga-margin-label { color: var(--text-muted); }
.ga-margin-value { font-weight: 600; }
.ga-sub-panel { margin-top: 20px; }
```

- [ ] **Step 4: Run tests**

Run: `cd C:/Users/User/continuum-intelligence-v3 && npm run test:unit`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/pages/report-sections.js
git commit -m "gold-analysis: replace Key Metrics with Cost Structure grid"
```

---

### Task 7: Add Valuation Scenarios sub-panel

**Files:**
- Modify: `src/pages/report-sections.js` (add helper, wire into inner renderer)

- [ ] **Step 1: Add renderGoldValuation helper**

```javascript
function _renderGoldValuation(ga) {
  var v = ga.valuation;
  if (!v) return '';
  var base = v.screening_nav_usd_m;
  var up = v.upside_nav_usd_m;
  var down = v.downside_nav_usd_m;
  if (base == null && up == null && down == null) return '';

  var fmt = function(n) { return n != null ? 'US$' + n.toLocaleString() + 'm' : 'N/A'; };

  var navCards =
    '<div class="ga-val-grid">' +
      '<div class="ga-val-card ga-val-down"><div class="ga-val-label">Downside NAV</div><div class="ga-val-num">' + fmt(down) + '</div></div>' +
      '<div class="ga-val-card ga-val-base"><div class="ga-val-label">Base NAV</div><div class="ga-val-num">' + fmt(base) + '</div></div>' +
      '<div class="ga-val-card ga-val-up"><div class="ga-val-label">Upside NAV</div><div class="ga-val-num">' + fmt(up) + '</div></div>' +
    '</div>';

  var multiples = [];
  if (v.p_nav != null) multiples.push(['P/NAV', v.p_nav + 'x']);
  if (v.ev_per_reserve_oz_usd != null) multiples.push(['EV/Reserve oz', 'US$' + v.ev_per_reserve_oz_usd.toLocaleString()]);
  if (v.ev_per_resource_oz_usd != null) multiples.push(['EV/Resource oz', 'US$' + v.ev_per_resource_oz_usd.toLocaleString()]);
  if (v.ev_per_production_oz_usd != null) multiples.push(['EV/Production oz', 'US$' + v.ev_per_production_oz_usd.toLocaleString()]);
  if (v.fcf_yield_spot_pct != null) multiples.push(['FCF Yield (spot)', v.fcf_yield_spot_pct + '%']);

  var multiplesHtml = '';
  if (multiples.length > 0) {
    var mRows = '';
    for (var i = 0; i < multiples.length; i++) {
      mRows += '<tr><td class="ga-metric-name">' + multiples[i][0] + '</td><td class="ga-metric-val">' + multiples[i][1] + '</td></tr>';
    }
    multiplesHtml = '<table class="ga-metrics-table"><tbody>' + mRows + '</tbody></table>';
  }

  return '<div class="ga-sub-panel">' +
    '<div class="rs-subtitle">Valuation Scenarios</div>' +
    navCards + multiplesHtml +
  '</div>';
}
```

- [ ] **Step 2: Wire into _renderGoldDiscoveryInner return**

Add `_renderGoldValuation(ga)` after the cost structure HTML in the return statement.

- [ ] **Step 3: Add CSS for valuation cards**

Add to `src/styles/report.css` (after the cost structure styles):

```css
/* Gold Analysis: Valuation Scenarios */
.ga-val-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 8px 0; }
.ga-val-card { padding: 12px; text-align: center; border-radius: 6px; background: var(--bg-card, #1a1a2e); }
.ga-val-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; }
.ga-val-num { font-size: 18px; font-weight: 700; margin-top: 4px; }
.ga-val-down { border-left: 3px solid var(--signal-red); }
.ga-val-base { border-left: 3px solid var(--signal-amber); }
.ga-val-up { border-left: 3px solid var(--signal-green); }
```

- [ ] **Step 4: Run tests**

Run: `cd C:/Users/User/continuum-intelligence-v3 && npm run test:unit`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/pages/report-sections.js
git commit -m "gold-analysis: add Valuation Scenarios sub-panel"
```

---

### Task 8: Add Peer Comparison sub-panel

**Files:**
- Modify: `src/pages/report-sections.js`

- [ ] **Step 1: Add renderGoldPeers helper**

The `peer_frame` object is a summary (not per-peer rows). Render as a summary card:

```javascript
function _renderGoldPeers(ga) {
  var pf = ga.peer_frame;
  if (!pf) return '';

  var v = ga.valuation || {};
  var pNav = v.p_nav;
  var medianPNav = pf.peer_median_p_nav;
  var discount = pf.p_nav_discount_premium_pct;
  var comment = pf.relative_valuation_comment || '';
  var peers = pf.peer_group || [];

  if (!medianPNav && !comment) return '';

  var discountColor = discount != null
    ? (discount < 0 ? 'var(--signal-green)' : discount > 0 ? 'var(--signal-red)' : 'var(--text-primary)')
    : '';
  var discountText = discount != null
    ? (discount > 0 ? '+' : '') + discount + '% vs peers'
    : '';

  var metricsHtml = '<div class="ga-peer-metrics">';
  if (pNav != null) metricsHtml += '<div class="ga-cost-cell"><div class="ga-cost-label">Company P/NAV</div><div class="ga-cost-value">' + pNav + 'x</div></div>';
  if (medianPNav != null) metricsHtml += '<div class="ga-cost-cell"><div class="ga-cost-label">Peer Median P/NAV</div><div class="ga-cost-value">' + medianPNav + 'x</div></div>';
  if (discount != null) metricsHtml += '<div class="ga-cost-cell"><div class="ga-cost-label">Discount / Premium</div><div class="ga-cost-value" style="color:' + discountColor + '">' + discountText + '</div></div>';
  metricsHtml += '</div>';

  var peersHtml = peers.length > 0
    ? '<div class="ga-peer-group"><span class="ga-cost-label">Peer group:</span> ' + peers.join(', ') + '</div>'
    : '';

  var commentHtml = comment
    ? '<div class="rs-text" style="margin-top:8px">' + comment + '</div>'
    : '';

  return '<div class="ga-sub-panel">' +
    '<div class="rs-subtitle">Peer Comparison</div>' +
    metricsHtml + peersHtml + commentHtml +
  '</div>';
}
```

- [ ] **Step 2: Wire into _renderGoldDiscoveryInner return**

Add `_renderGoldPeers(ga)` after the valuation HTML.

- [ ] **Step 3: Add CSS**

Add to `src/styles/report.css` (after the valuation styles):

```css
/* Gold Analysis: Peer Comparison */
.ga-peer-metrics { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 8px 0; }
.ga-peer-group { font-size: 13px; color: var(--text-muted); margin-top: 8px; }
```

- [ ] **Step 4: Run tests**

Run: `cd C:/Users/User/continuum-intelligence-v3 && npm run test:unit`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/pages/report-sections.js
git commit -m "gold-analysis: add Peer Comparison sub-panel"
```

---

### Task 9: Add Sensitivity Matrix sub-panel

**Files:**
- Modify: `src/pages/report-sections.js`

- [ ] **Step 1: Add renderGoldSensitivities helper**

The `sensitivities` object is a flat dict with fixed keys. Compute % change from base NAV at render time:

```javascript
function _renderGoldSensitivities(ga) {
  var sens = ga.sensitivities;
  if (!sens) return '';

  var v = ga.valuation || {};
  var baseNav = v.ic_nav_usd_m || v.screening_nav_usd_m;
  if (!baseNav) return '';

  var scenarios = [
    ['Gold price +15%', sens.gold_price_up_15_nav_usd_m],
    ['Gold price -15%', sens.gold_price_down_15_nav_usd_m],
    ['FX +5%', sens.fx_plus_5pct_nav_usd_m],
    ['Recovery -2pt', sens.recovery_minus_2pt_nav_usd_m],
    ['Capex +15%', sens.capex_plus_15pct_nav_usd_m],
    ['6-month delay', sens.delay_6m_nav_usd_m]
  ];

  var hasAny = false;
  var rows = '';
  for (var i = 0; i < scenarios.length; i++) {
    var nav = scenarios[i][1];
    if (nav == null) continue;
    hasAny = true;
    var pctChange = Math.round((nav - baseNav) / baseNav * 100);
    var color = pctChange >= 0 ? 'var(--signal-green)' : 'var(--signal-red)';
    var sign = pctChange >= 0 ? '+' : '';
    rows += '<tr>' +
      '<td>' + scenarios[i][0] + '</td>' +
      '<td>US$' + nav.toLocaleString() + 'm</td>' +
      '<td style="color:' + color + '">' + sign + pctChange + '%</td>' +
    '</tr>';
  }

  if (!hasAny) return '';

  return '<div class="ga-sub-panel">' +
    '<div class="rs-subtitle">Sensitivity Analysis</div>' +
    '<table class="ga-metrics-table"><thead><tr>' +
      '<th>Scenario</th><th>NAV</th><th>Change</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>' +
  '</div>';
}
```

- [ ] **Step 2: Wire into _renderGoldDiscoveryInner return**

Add `_renderGoldSensitivities(ga)` after the peer comparison HTML and before the evidence HTML.

- [ ] **Step 3: Run tests**

Run: `cd C:/Users/User/continuum-intelligence-v3 && npm run test:unit`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/pages/report-sections.js
git commit -m "gold-analysis: add Sensitivity Matrix sub-panel"
```

---

### Task 10: Assemble final render order and verify CSS

**Files:**
- Modify: `src/pages/report-sections.js`
- Modify: `src/styles/report.css` (verify all new `.ga-` styles are present)

- [ ] **Step 1: Update _renderGoldDiscoveryInner return statement**

The final assembly order within the Gold Analysis section:

```javascript
  return '<div class="report-section" id="' + t + '-gold-analysis">' +
    RS_HDR('Section 09', 'Gold Analysis') +
    '<div class="rs-body">' +
      scorecardHtml +
      verdictHtml +
      viewHtml +
      _renderGoldAssets(ga) +
      metricsHtml +
      _renderGoldValuation(ga) +
      _renderGoldPeers(ga) +
      _renderGoldSensitivities(ga) +
      evidenceHtml +
      triggerHtml +
      gapsHtml +
      dateHtml +
    '</div></div>';
```

- [ ] **Step 2: Verify all new CSS is in report.css**

Open `src/styles/report.css` and confirm all new `.ga-` classes from Tasks 6-8 are present: `.ga-cost-grid`, `.ga-cost-cell`, `.ga-cost-label`, `.ga-cost-value`, `.ga-margin-bar`, `.ga-margin-label`, `.ga-margin-value`, `.ga-sub-panel`, `.ga-val-grid`, `.ga-val-card`, `.ga-val-label`, `.ga-val-num`, `.ga-val-down`, `.ga-val-base`, `.ga-val-up`, `.ga-peer-metrics`, `.ga-peer-group`. If any were deferred during earlier tasks, add them now.

- [ ] **Step 3: Run tests**

Run: `cd C:/Users/User/continuum-intelligence-v3 && npm run test:unit`
Expected: All pass

- [ ] **Step 4: Build**

Run: `cd C:/Users/User/continuum-intelligence-v3 && npm run build`
Expected: Build succeeds, no errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/report-sections.js src/styles/report.css
git commit -m "gold-analysis: assemble sub-panels and consolidate CSS"
```

---

## Chunk 3: Verification

### Task 11: End-to-end verification

**Files:** None (read-only verification)

- [ ] **Step 1: Start dev server**

Run: `cd C:/Users/User/continuum-intelligence-v3 && npm run dev`
Expected: Dev server on port 5000

- [ ] **Step 2: Verify gold stock report (NST)**

Open NST report page. Confirm:
- Gold Analysis section appears after Hypotheses
- Scorecard + Verdict renders
- Cost Structure grid shows AISC, production, mine life, grade, net cash, cash cost
- Margin at spot shows percentage
- Evidence table renders
- Monitoring trigger renders
- Information gaps render
- Nav link says "Gold Analysis" and scrolls to correct section

- [ ] **Step 3: Verify gold stock report (OBM, WIA, SNX)**

Same checks as Step 2 for each new gold stock. Additionally verify:
- Asset Portfolio table renders if `assets[]` present
- Valuation Scenarios card renders if `valuation` present
- Peer Comparison card renders if `peer_frame` present
- Sensitivity Matrix table renders if `sensitivities` present
- Sub-panels omitted gracefully when data is absent

- [ ] **Step 4: Verify standard stock (BHP)**

Open BHP report page. Confirm:
- No Gold Analysis section appears
- No "Gold Analysis" link in section nav
- All standard sections render normally
- Section ordering unchanged

- [ ] **Step 5: Run full test suite**

Run: `cd C:/Users/User/continuum-intelligence-v3 && npm run test:unit`
Expected: All 157+ tests pass

- [ ] **Step 6: Build**

Run: `cd C:/Users/User/continuum-intelligence-v3 && npm run build`
Expected: Clean build, no warnings

- [ ] **Step 7: Push**

```bash
cd C:/Users/User/continuum-intelligence-v3
git push origin main
```
Verify GitHub Actions deploy succeeds.
