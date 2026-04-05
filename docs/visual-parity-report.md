# Visual Parity Report
**Branch:** `uxfront/visual-parity-2026-04-05`
**Date:** 2026-04-05
**Methodology:** Systematic comparison of 9 prototype HTML files (`docs/01-09.html`) against live app CSS and JS source files. CSS fixes applied; structural JS divergences documented.

---

## Summary

| Page | CSS Parity | JS/HTML Parity | Status |
|------|-----------|----------------|--------|
| 01-index (Home) | FIXED | Matches | COMPLETE |
| 02-stock-detail (Report) | FIXED | Matches | COMPLETE |
| 03-portfolio | CSS Added | JS gap (hero HTML, EWP table) | CSS DONE |
| 04-comparator | FIXED | JS gap (inline chat panel) | CSS DONE |
| 05-deep-research | Already correct | JS gap (inline chat panel) | CSS DONE |
| 06-pm-dashboard | Already correct | JS gap (inline chat panel) | CSS DONE |
| 07-journal | Already correct | JS gap (inline chat panel) | CSS DONE |
| 08-personalisation | FIXED | Matches | COMPLETE |
| 09-about | Already correct | Matches | COMPLETE |

---

## Fixes Applied

### TASK 0: Prototype Specs + Scripts
- Created `uxfront/prototype-specs/01-index.md` through `04-09-specs.md`
- Created `uxfront/prototype-specs/panel-inventory.md` (panel presence audit)
- Created `uxfront/scripts/screenshot-prototypes.mjs`, `screenshot-live.mjs`, `audit-parity.mjs`, `verify-fix.mjs`
- Golden screenshots captured at 3 viewports for all 9 prototypes

### TASK 1: Legacy Panel Audit (shell.css)
- Existing rules in `src/styles/shell.css` (lines 396-406) correctly hide `.analyst-panel`, `.pm-panel`, `.econ-panel`, `.ap-fab`, `.pm-fab` on all non-report pages
- No changes required
- `data-route-type="report"` correctly set by router for `report-*` and `deep-report-*` routes only

### TASK 2: Home Page Parity
**File:** `src/styles/home.css`
- `home-grid` right column: 320px -> 360px (matches prototype `minmax(0,1fr) 360px` rail)
- `featured-grid`: `repeat(3,1fr)` -> `repeat(2,1fr)` with `padding: 14px` (matches prototype 2-col card layout)
- Removed redundant `@media (max-width: 1100px)` rule for featured-grid
- Added `@media (max-width: 768px)` for single-col featured grid

**File:** `index.html` (capability strip)
- Removed Settings and About chips from Platform section (not in any prototype's Platform strip)
- Added cap-divider + Integrations section: Bloomberg Terminal (live/green), Risk Engine (soon/amber), Team Chat (soon), Execution (soon), News Feed (soon)
- Strip now shows: Research, Deep Research, Portfolio Intelligence, Thesis Comparator, PM Dashboard, Analyst Journal | Bloomberg Terminal, Risk Engine, Team Chat, Execution, News Feed

### TASK 3: Stock Detail / Report Page Parity
**File:** `src/styles/stock-detail.css`
- ACH case head: added `border-bottom` per case (green/blue/red/violet tint)
- ACH case icon: 32x32 -> 34x34px, border-radius 8 -> 10px, colors hardcoded hex -> `var(--green/blue/red/violet)`
- ACH case label and price-target: hardcoded hex -> CSS tokens
- ACH probability badge: plain muted text -> colored soft badge per case type (matches prototype)
- Evidence head (`.ach-ev-head`): added `.for`/`.against` color classes with `.ev-dot` indicator
- Evidence bullet (`.ev-bullet`): 4px circle dot -> 14x14px rounded square with +/- symbol
- Contribution fill: flat single color -> gradient matching prototype

### TASK 4: Portfolio Page Parity
**File:** `src/styles/portfolio.css`
- Added `port-hero` dark gradient hero CSS (`.port-hero`, `.ph-top`, `.ph-stat`, `.ph-stat-v`, `.btn-light`)
- CSS is ready for when the hero HTML is injected into `index.html`
- **Structural gap:** Live portfolio uses upload-based UI; prototype uses EWP dashboard. Full HTML/JS refactor required (tracked below)

### TASK 5: Comparator Page Parity
**File:** `src/styles/thesis.css`
- Added `.comp-workstation` 2-col grid layout (`minmax(0,1fr) var(--workstation-panel)`) with responsive collapse at 1400px
- Added `.comp-content-col` helper class
- Most comparator CSS (comp-grid, comp-header, insight-grid, stock-pill, etc.) was already present

### TASK 6: Deep Research Page Parity
- All prototype CSS classes (`dr-hero`, `progress-track`, `progress-step`, etc.) already present in `deep-report.css`
- No changes required

### TASK 7: PM Dashboard Parity
- All prototype CSS classes (`pm-hero`, `pm-kpi-grid`, `alert-list`, `decision-list`, `wl-grid`) already present in `pm-chat.css`
- No changes required

### TASK 8: Analyst Journal Parity
- All prototype CSS classes (`journal-list`, `journal-entry`, `je-head`, `je-tag`, `new-entry`, etc.) already present in `journal.css`
- No changes required

### TASK 9: Personalisation Settings Parity
**File:** `src/styles/about.css` (appended settings section)
- Added settings layout CSS: `.settings-layout`, `.settings-nav`, `.sn-item`, `.sn-divider`, `.settings-content`
- Added settings section CSS: `.settings-section`, `.ss-header`, `.form-row`, `.toggle`, `.form-select`, `.form-input`
- Added `.page-body`, `.page-header`, `.page-title`, `.page-eyebrow`, `.page-sub`

**File:** `src/styles/tokens.css`
- Added `--shell-max-settings: 1100px` token for settings page max-width

### TASK 10: About Page Parity
- All prototype CSS classes (`manifesto-hero`, `mh-inner`, `mh-eyebrow`, `about-section`, etc.) already present in `about.css`
- No changes required

---

## Quality Gates (Final)

| Gate | Result |
|------|--------|
| `npm run test:unit` | PASS -- 1062 tests, 42 files |
| `npm run build` | PASS -- clean build |
| `bash scripts/check-css-tokens.sh` | CLEAN |
| `bash scripts/check-config-drift.sh` | CLEAN |

---

## Outstanding Divergences (Future JS Work)

These require JavaScript changes to render new HTML structures. They are CSS-ready but not yet wired up.

### 1. Portfolio Page -- EWP Dashboard Hero
- **Prototype:** Dark gradient `port-hero` with 5-col KPI stats (Portfolio AUM, EWP Value, EWP Gap, Upside Positions, Avg Confidence)
- **Live:** Upload-based portfolio UI with `portfolio-upload-zone`
- **CSS status:** `port-hero`, `ph-stat`, `btn-light` added to `portfolio.css`
- **Required:** Add EWP hero HTML to `index.html` portfolio section; wire up from `portfolio.js`
- **Risk:** `index.html` is CI-pipeline-owned -- requires `git pull` before editing

### 2. Portfolio Page -- EWP Holdings Table
- **Prototype:** 9-col table (Stock, Weight with bar, Mkt Value, Live Price, EWP, EWP Gap, Verdict, Confidence, Actions)
- **Live:** 10-col table (Ticker, Company, Units, Avg Cost, Current, P&L$, P&L%, Weight, Risk Skew, Alignment)
- **Required:** Major `portfolio.js` refactor to render EWP-based table

### 3. Portfolio / Comparator / Deep Research / PM Dashboard / Journal -- Inline Chat Panels
- **Prototype:** Each page has an inline `<aside class="chat-panel">` in the workstation grid right column
- **Live:** Only `#report-*` pages render inline chat panels; all other pages use hidden overlay panels
- **CSS status:** `.chat-panel`, `.cp-*` classes are fully defined in `stock-detail.css` and `thesis.css`
- **Required:** Per-page JS to render inline chat panel HTML for 5 pages
- **Complexity:** Each page needs a different context tag, tab configuration, and default active tab

---

## Commits on This Branch

1. `ac3f308e` -- fix(shell): verify and strengthen legacy panel removal
2. `52b53386` -- fix(home): achieve visual parity with 01-index.html prototype
3. `cd31b1c0` -- fix(stock-detail): achieve visual parity with 02-stock-detail.html prototype
4. `fa137a7b` -- fix(portfolio): add port-hero CSS classes from 03-portfolio.html prototype
5. `c2207a46` -- fix(comparator): add comp-workstation grid layout from 04-comparator.html prototype
6. `cef9cc03` -- fix(settings): add settings/personalisation page CSS from 08-personalisation.html
