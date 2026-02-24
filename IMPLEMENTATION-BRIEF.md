# Implementation Brief: 5 UI Changes for Continuum Intelligence v2

**Date:** 23 February 2026
**Prepared for:** Coding LLM implementation
**Project context:** Read `CLAUDE.md` first for architecture overview

This brief describes 5 changes to be made to `index.html` (the single-page app, ~16,000 lines), plus related files where noted. Changes are ordered by complexity (simplest first).

---

## Change 1: Increase Ticker Strip Font Size

**Objective:** Increase the scrolling price ticker strip font by one step (currently too small to read comfortably).

**File:** `index.html`

**What to change:**

Line 7370 in the `.price-ticker-strip` CSS rule:
```css
/* BEFORE */
font-size: 0.6rem;

/* AFTER */
font-size: 0.7rem;
```

That is the only change required. The ticker strip is a flex container with `white-space: nowrap` and `overflow: hidden`, so a small font bump will not break layout.

**Verification:** Load the page, confirm the scrolling ticker below the nav bar is visibly larger.

---

## Change 2: Extend Price Charts to 2-Year Daily

**Objective:** Charts currently display 1-year data for static fallback (non-live) stocks, which is insufficient for a 200-day moving average. Extend to 2-year daily data where available.

**File:** `index.html`

### 2a. Chart title logic (line 11597)

The chart title currently labels static data as "12-Month". Change it to reflect the actual data length:

```javascript
// BEFORE (line 11597):
var chartTitle = useLive ? (n > 500 ? '3' : n > 250 ? '2' : '1') + '-Year Daily Price & Moving Averages' : '12-Month Daily Price & Moving Averages';

// AFTER:
var chartTitle = useLive
  ? (n > 500 ? '3' : n > 250 ? '2' : '1') + '-Year Daily Price &amp; Moving Averages'
  : (n > 400 ? '2' : '1') + '-Year Daily Price &amp; Moving Averages';
```

### 2b. Static priceHistory data length

The static `priceHistory` arrays in `data/research/*.json` files currently contain 252 data points (1 year of trading days). These need to be extended to ~504 data points (2 years).

**Approach options (choose one):**

**Option A (recommended): Backfill via Yahoo Finance API.** Write a Node.js script that:
1. Reads each `data/research/*.json` file
2. Fetches 2-year daily close data from Yahoo Finance (`https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}.AX?range=2y&interval=1d`)
3. Extracts the `close` array from the response
4. Replaces the `priceHistory` field in the JSON
5. Writes back

**Option B (minimal): Leave data as-is.** The chart will still render with whatever data exists; it just won't show 2 years for stocks that only have 252 points. The title fix in 2a will at least label it correctly.

### 2c. Minimum data threshold (line 11585)

Currently the chart requires `live.bars.length > 100` to use live data. No change needed here, but note that static priceHistory with fewer than 20 points is already rejected (line 11591: `if (!closes || closes.length < 20) return '';`).

**Note:** The Yahoo Finance API URL in the live data module already requests `range=3y&interval=1d`, so live charts already support 2-3 year display. This change primarily affects the static fallback for stocks that do not have live data available.

---

## Change 3: Rename "Competing Hypotheses" to "Stock Drivers" and T1-T4 to D1-D4

**Objective:** The term "Competing Hypotheses" is unclear to non-technical users. Rename throughout the entire platform.

**This is the highest-impact change.** It touches multiple files and data structures. Execute carefully.

### 3a. Display text changes in `index.html`

Replace all user-facing text. These are the exact locations:

| Line | Current Text | New Text |
|------|-------------|----------|
| 9 | `Analysis of Competing Hypotheses framework` | `Stock Drivers framework` |
| 9196 | `Analysis of Competing Hypotheses (ACH) methodology` | `Stock Drivers methodology` |
| 9455 | `Analysis of Competing Hypotheses (ACH) methodology` | `Stock Drivers methodology` |
| 9479 | `<h2 class="about-subtitle">Analysis of Competing Hypotheses</h2>` | `<h2 class="about-subtitle">Stock Drivers</h2>` |
| 9481 | `Analysis of Competing Hypotheses (ACH)` | `Stock Drivers` |
| 9524 | `Analysis of Competing Hypotheses methodology` | `Stock Drivers methodology` |
| 11283 | `'<div class="rs-title">Competing Hypotheses</div>'` | `'<div class="rs-title">Stock Drivers</div>'` |
| 16229 | `'Hypothesis Tracker'` (sidebar title) | `'Driver Tracker'` |
| 18072 | `Section 02: Competing Hypotheses` (PDF comment) | `Section 02: Stock Drivers` |
| 18323 | `sectionTitle('02', 'Competing Hypotheses')` | `sectionTitle('02', 'Stock Drivers')` |
| 18555 | `Analysis of Competing Hypotheses (ACH) framework` | `Stock Drivers framework` |
| 18743 | `pageHeader('Competing Hypotheses')` | `pageHeader('Stock Drivers')` |
| 18974 | `Analysis of Competing Hypotheses (ACH) framework` | `Stock Drivers framework` |

Also update the section nav (line 11123):
```javascript
// BEFORE:
['hypotheses', '02 Hypotheses'],

// AFTER:
['hypotheses', '02 Stock Drivers'],
```

And the CSS comment (line 3466):
```css
/* BEFORE: T1 prominence — dominant hypothesis visually highlighted */
/* AFTER: D1 prominence — dominant driver visually highlighted */
```

### 3b. T1-T4 to D1-D4 in display labels

The T1/T2/T3/T4 labels appear in hypothesis card titles from research JSON data. The research JSON files in `data/research/*.json` contain hypothesis arrays with titles like:
```json
{"tier": "t1", "title": "T1: Copper Supercycle", ...}
```

**Two approaches (choose one):**

**Option A (data layer rename):** Update all `data/research/*.json` files:
- Change `"tier": "t1"` to `"tier": "d1"` (and t2->d2, t3->d3, t4->d4)
- Change `"title": "T1: ..."` to `"title": "D1: ..."` (and T2->D2, etc.)

Then update all `data/stocks/*.json` files:
- Change hypothesis keys from `"T1"`, `"T2"`, `"T3"`, `"T4"` to `"D1"`, `"D2"`, `"D3"`, `"D4"`
- Change `"dominant": "T3"` to `"dominant": "D3"` (etc.)

**Option B (display layer rename):** Add a mapping function that converts T->D at render time. Less invasive but creates a permanent translation layer. Not recommended.

**Recommendation:** Option A. Do a full find-and-replace across all JSON files. The keys are used programmatically so they must be consistent.

### 3c. TC_DATA structure (line 16269+)

The Thesis Comparator data structure uses `t1`, `t2`, `t3`, `t4` keys:

```javascript
// BEFORE (example, line 16270-16278):
WOW: {
  name: 'Woolworths Group', primary: 't2',
  t1: { name: 'Managed Turnaround', prob: 36, desc: '...' },
  t2: { name: 'Structural Margin Erosion', prob: 25, desc: '...' },
  t3: { name: 'Regulatory Squeeze', prob: 21, desc: '...' },
  t4: { name: 'Competitive Disruption', prob: 18, desc: '...' },
  analysis: "Your thesis supports T2 and T3 ..."
}

// AFTER:
WOW: {
  name: 'Woolworths Group', primary: 'd2',
  d1: { name: 'Managed Turnaround', prob: 36, desc: '...' },
  d2: { name: 'Structural Margin Erosion', prob: 25, desc: '...' },
  d3: { name: 'Regulatory Squeeze', prob: 21, desc: '...' },
  d4: { name: 'Competitive Disruption', prob: 18, desc: '...' },
  analysis: "Your thesis supports D2 and D3 ..."
}
```

This pattern repeats for every ticker in TC_DATA (approximately 20 entries, lines 16269-16480). Each entry has `primary`, `t1`, `t2`, `t3`, `t4` keys plus `analysis` text that references T1-T4.

### 3d. TC_KEYWORDS (line 16483+)

Same structure with `t1`-`t4` keys. Rename to `d1`-`d4`.

### 3e. Thesis Comparator engine functions

The following functions reference `t1`-`t4` strings and need updating:

- **Line 16626:** Comment says `// tier must be lowercase: 't1', 't2', 't3', 't4'` — change to `'d1', 'd2', 'd3', 'd4'`
- **Line 16632:** `var tKeys = ['T1', 'T2', 'T3', 'T4'];` — change to `['D1', 'D2', 'D3', 'D4']`
- **Line 16687:** `['t1', 't2', 't3', 't4'].forEach(tier => {` — change to `['d1', 'd2', 'd3', 'd4']`
- **Line 16689:** `if (tier === 't1') {` — change to `if (tier === 'd1') {`
- **Line 16746:** `['t1', 't2', 't3', 't4'].map(tier => {` — change to `['d1', 'd2', 'd3', 'd4']`
- **Line 16767:** `primaryTier === 't1'` and `continuumBase !== 't1'` — change all `'t1'` to `'d1'`, `'t2'` to `'d2'`, `'t3'` to `'d3'`, `'t4'` to `'d4'`
- **Line 16769:** Same pattern as above

### 3f. Portfolio module (line ~15802-15897)

- **Line 15802:** `data.primary === 'uphill' ? 't2' : data.primary;` — if primary values change to d1-d4, this needs updating
- **Line 15806:** `const tiers = ['t1', 't2', 't3', 't4'];` — change to `['d1', 'd2', 'd3', 'd4']`
- **Line 15897:** `tcGetProb(p.ticker, 't1')` etc. — change all four to `'d1'` through `'d4'`

### 3g. PDF generator (line 18778+)

- **Line 18778:** `var TIERS = ['T1', 'T2', 'T3', 'T4'];` — change to `['D1', 'D2', 'D3', 'D4']`
- **Line 18794:** `var domTier = stock.dominant || 'T1';` — change to `stock.dominant || 'D1'`

### 3h. Sidebar hypothesis extraction (line 16109-16113)

The sidebar reads from the DOM `.verdict-scores .vs-item` elements, which get their labels from the research data. If the data is updated (3b), the sidebar will automatically pick up the new D1-D4 labels. No code change needed here beyond the title rename in 3a.

### 3i. External files

**`scripts/refresh-content.js`:**
Search for all occurrences of "T1", "T2", "T3", "T4", "hypothesis", "hypotheses", "Competing Hypotheses" in this file and update:
- System prompts that mention "T1-T4 framework" should say "D1-D4 framework"
- The `hypothesis_review` system prompt (~line 407) references the T1-T4 naming convention
- Output parsing that expects T1/T2/T3/T4 keys needs to expect D1/D2/D3/D4

**`scripts/generate-investor-briefing.py`:**
Search for "hypothesis", "hypotheses", "T1", "T2", "T3", "T4" and update. At minimum:
- "Competing Hypotheses" section title
- Any T1-T4 references in template text

**`data/stocks/*.json`:**
Each stock JSON has hypothesis keys `T1`, `T2`, `T3`, `T4` and a `dominant` field referencing them. Update all to `D1`, `D2`, `D3`, `D4`.

Example from `data/stocks/BHP.json`:
```json
// BEFORE:
"hypotheses": {
  "T1": { "label": "Copper Supercycle", ... },
  "T2": { "label": "Iron Ore Cash Machine", ... },
  ...
},
"dominant": "T1",

// AFTER:
"hypotheses": {
  "D1": { "label": "Copper Supercycle", ... },
  "D2": { "label": "Iron Ore Cash Machine", ... },
  ...
},
"dominant": "D1",
```

Also update within `three_layer_signal.idio_detail`:
```json
// BEFORE:
"T1": "T1", "T1_score": 34, "T1_sentiment": "BULLISH",
"T2": "T2", "T2_score": 30,

// AFTER:
"D1": "D1", "D1_score": 34, "D1_sentiment": "BULLISH",
"D2": "D2", "D2_score": 30,
```

### 3j. Verification checklist

After all changes:
1. Load the dashboard — ticker cards should show D1/D2/D3/D4 labels
2. Click into any stock detail — Section 02 should say "Stock Drivers"
3. Sidebar should say "Driver Tracker" with D1-D4 labels
4. Thesis Comparator should use D1-D4 throughout
5. Portfolio module should display D1-D4 in thesis alignment columns
6. About section should reference "Stock Drivers" not "Competing Hypotheses"
7. No JavaScript console errors (broken key lookups would throw here)

---

## Change 4: Align Hypothesis Card Badges

**Objective:** The DOMINANT badge and the status badge (ACTIVE/PRICED/ACCUMULATING/MINIMAL) on hypothesis cards are misaligned. They need consistent vertical positioning.

**File:** `index.html`

### Current structure (line 11271-11272):

```javascript
cardsHtml += '<div class="hyp-card ' + h.dirClass + dominantCls + '">' +
  '<div class="hc-header"><div class="hc-title">' + h.title + sentimentTagHtml + '</div><div class="hc-status ' + h.statusClass + '">' + h.statusText + '</div></div>' +
```

### Current CSS:

The `.hc-header` is a flex row (line 3488-3493):
```css
.hc-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;  /* Problem: flex-start causes misalignment */
  margin-bottom: var(--space-md);
}
```

The DOMINANT badge is a `::after` pseudo-element on `.hyp-card.dominant` (line 3474-3486), positioned absolutely at `top: var(--space-sm); right: var(--space-sm)`.

The `.hc-status` badge sits inside `.hc-header` (line 3502-3510).

### The fix:

**Step 1:** Change `.hc-header` alignment:
```css
/* BEFORE */
.hc-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-md);
}

/* AFTER */
.hc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}
```

**Step 2:** Give the DOMINANT badge more right offset so it does not overlap with `.hc-status`:
```css
/* BEFORE */
.hyp-card.dominant::after {
  content: 'DOMINANT';
  position: absolute;
  top: var(--space-sm);
  right: var(--space-sm);
  font-size: 0.55rem;
  ...
}

/* AFTER */
.hyp-card.dominant::after {
  content: 'DOMINANT';
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 0.55rem;
  ...
}
```

**Step 3:** Add right padding to `.hc-header` inside dominant cards so the status badge does not collide with the DOMINANT pseudo-element:
```css
/* ADD NEW RULE */
.hyp-card.dominant .hc-header {
  padding-right: 80px;  /* Space for the DOMINANT badge */
}
```

**Step 4:** Consider converting the DOMINANT badge from a pseudo-element to a real element inside `.hc-header` for better flex alignment. This is optional but cleaner. If doing this:

In the JS (line 11271), when `dominantCls` is non-empty, add a badge span inside `.hc-header`:
```javascript
var dominantBadge = (i === domIdx) ? '<span class="hc-dominant-badge">DOMINANT</span>' : '';
cardsHtml += '<div class="hyp-card ' + h.dirClass + dominantCls + '">' +
  '<div class="hc-header"><div class="hc-title">' + h.title + sentimentTagHtml + '</div>' + dominantBadge + '<div class="hc-status ' + h.statusClass + '">' + h.statusText + '</div></div>' +
```

Then style `.hc-dominant-badge` as an inline badge and remove the `::after` rule.

**Verification:** Load any stock detail page. Confirm the DOMINANT badge and status badges (ACTIVE, PRICED, etc.) are horizontally aligned and do not overlap.

---

## Change 5: Move D1-D4 Probability Boxes into Company Research Bar

**Objective:** The D1-D4 probability score boxes currently sit inside the verdict section (the gold bar below the composite sentiment bar). Move them up into the Company Research row of the composite bar, and let the verdict commentary text use the full horizontal width.

**File:** `index.html`

### Current layout (simplified):

```
┌──────────────────────────────────────────────┐
│ Composite Bar                                 │
│  Row 1: Overall Sentiment  [score] [label]   │
│  Row 2: External Env.      [bar]             │
│  Row 3: Company Research   [bar]             │
│         Dominant: T1 name (BULLISH, 34%)     │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ Verdict (gold bar)                           │
│  [commentary text]    [D1][D2][D3][D4]       │  ← boxes here
└──────────────────────────────────────────────┘
```

### Target layout:

```
┌──────────────────────────────────────────────┐
│ Composite Bar                                 │
│  Row 1: Overall Sentiment  [score] [label]   │
│  Row 2: External Env.      [bar]             │
│  Row 3: Company Research   [bar]             │
│         Dominant: D1 name  [D1][D2][D3][D4]  │  ← boxes move here
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ Verdict (gold bar) — full width              │
│  [commentary text spans entire width]        │
└──────────────────────────────────────────────┘
```

### Implementation:

**Step 1: Move score boxes from `renderVerdict()` to `renderCompositeBar()`**

In `renderVerdict()` (line 11088-11117), the `.verdict-scores` div contains the D1-D4 boxes. Remove the scores HTML from this function and return only the commentary text:

```javascript
// BEFORE (line 11111-11116):
return '<div class="verdict-section">' +
  '<div class="verdict-inner"' + borderStyle + '>' +
  '<div class="verdict-text">' + v.text + '</div>' +
  '<div class="verdict-scores">' + scoresHtml + '</div>' +
  '</div>' +
  '</div>';

// AFTER:
return '<div class="verdict-section">' +
  '<div class="verdict-inner"' + borderStyle + '>' +
  '<div class="verdict-text">' + v.text + '</div>' +
  '</div>' +
  '</div>';
```

**But** the scoresHtml generation (lines 11093-11109) still needs to happen. Move it to `renderCompositeBar()` or compute it separately and pass it.

**Step 2: Generate the scores HTML in a shared location**

The scores are computed from `data.verdict.scores` and `data.hypotheses`. Extract the score generation into a helper or compute it in the main render function and pass to both.

The simplest approach: compute `scoresHtml` in the main render flow (where both `renderCompositeBar` and `renderVerdict` are called), and inject it into the composite bar.

Look at where these functions are called (search for `renderCompositeBar` and `renderVerdict` invocations). They are likely called sequentially in the stock detail page builder. Compute `scoresHtml` before both calls and pass it to `renderCompositeBar`.

**Step 3: Add scores to the Company Research row**

In the composite bar HTML (line 11072-11080), the Company Research row currently ends with `t1Html` (the dominant hypothesis summary). Add the scores after it:

```javascript
// BEFORE (line 11072-11080):
'<div class="tls-row">' +
'<div class="tls-row-header">' +
'<span class="tls-row-label">Company Research</span>' +
'<span class="tls-row-value ...">' + ... + '</span>' +
'<div class="tls-bar-track">...</div>' +
'</div>' +
t1Html +
'</div>' +

// AFTER:
'<div class="tls-row">' +
'<div class="tls-row-header">' +
'<span class="tls-row-label">Company Research</span>' +
'<span class="tls-row-value ...">' + ... + '</span>' +
'<div class="tls-bar-track">...</div>' +
'</div>' +
'<div class="tls-company-detail">' +
t1Html +
'<div class="verdict-scores verdict-scores-inline">' + scoresHtml + '</div>' +
'</div>' +
'</div>' +
```

**Step 4: CSS adjustments**

Add a new CSS class for the inline scores:
```css
.tls-company-detail {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.verdict-scores-inline {
  display: flex;
  gap: var(--space-sm);
  flex-shrink: 0;
}

.verdict-scores-inline .vs-item {
  min-width: 50px;
}

.verdict-scores-inline .vs-score {
  font-size: 0.95rem;
}
```

Update `.verdict-inner` to allow full-width text now that scores are removed:
```css
.verdict-inner {
  /* Remove the flex space-between since only text remains */
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 0 var(--space-lg);
}
```

**Step 5: Sidebar impact**

The sidebar `populateSidebar()` (line 16109-16113) reads D1-D4 data from the DOM `.verdict-scores` element. After moving the scores, the DOM query selector needs updating:

```javascript
// BEFORE (line 16110):
var verdictScores = page.querySelector('.verdict-scores');

// AFTER:
var verdictScores = page.querySelector('.verdict-scores-inline') || page.querySelector('.verdict-scores');
```

**Step 6: PDF generator impact**

The PDF print function (line 18194-18216) also reads `.verdict-scores` from the DOM. Update the selector there too:

```javascript
// Line 18198:
var verdictScoresEl = verdictEl.querySelector('.verdict-scores');
// Change to check both locations:
var verdictScoresEl = reportPage.querySelector('.verdict-scores-inline') || (verdictEl ? verdictEl.querySelector('.verdict-scores') : null);
```

**Verification:**
1. Load any stock detail page
2. Confirm D1-D4 boxes appear in the Company Research row of the composite bar
3. Confirm the gold verdict bar shows only commentary text at full width
4. Confirm the sidebar still shows correct D1-D4 scores
5. Test the PDF print function if available

---

## Execution Order

Recommended implementation sequence:

1. **Change 1** (ticker font) — 1 line, zero risk
2. **Change 4** (badge alignment) — CSS only, low risk
3. **Change 2** (chart titles) — small JS change, low risk
4. **Change 3** (T->D rename) — highest scope, do this before Change 5
5. **Change 5** (move boxes) — depends on Change 3 being complete (references D1-D4)

Changes 1, 2, and 4 are independent and can be done in parallel. Change 3 must precede Change 5.

---

## Files Affected Summary

| File | Changes |
|------|---------|
| `index.html` | All 5 changes |
| `data/stocks/*.json` | Change 3 (T->D keys) |
| `data/research/*.json` | Changes 2 (priceHistory) and 3 (tier/title fields) |
| `scripts/refresh-content.js` | Change 3 (T->D in prompts and parsing) |
| `scripts/generate-investor-briefing.py` | Change 3 (T->D references) |
