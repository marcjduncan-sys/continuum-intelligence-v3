# Task Tracker

<!-- Claude: update this file as you work. Check items off, add review notes, track blockers. -->

## Current Task

**Gold Agent Integration -- Section 09: Gold Discovery**

Integrate the gold agent's specialised analysis (scorecard, asset-level metrics, valuation,
sensitivities, risks, evidence) into the report page for gold stocks. Presented within the
existing section framework as Section 09, conditionally rendered only for tickers with
`goldAgent` data.

Target tickers: EVN, NST, WAF, HRZ.

---

## Architecture Decision

**Data storage:** Store gold agent output in the research JSON under a `goldAgent` key.
This avoids a live API call (60-120s latency) on every page load. The data is fetched once
via the gold agent API and baked into the research file.

**Rendering:** Conditional Section 09 in `report-sections.js`. Only renders when
`data.goldAgent` exists. Nav link added dynamically. No changes to non-gold stocks.

**Subsections within Section 09 (derived from gold agent output):**

1. **Scorecard** -- 6 dimension scores (geology, engineering, financial, management,
   jurisdiction, composite) + skew. Rendered as a horizontal bar/card strip.
2. **Investment View** -- bull/base/bear cases, what-must-be-true list, monitoring trigger.
3. **Assets** -- per-asset cards with resources, reserves, grade, recovery, AISC, mine life.
   Expandable detail for study schedules where available.
4. **Valuation** -- NAV variants (screening, IC, downside, upside), P/NAV, EV per oz metrics.
5. **Sensitivities** -- gold price, FX, recovery, capex, delay impact on NAV.
6. **Risks** -- top failure modes, technical red flags, hard risk flags, information gaps.
7. **Evidence** -- sourced findings with quality scores (table format).

---

## Wave 1 -- Data Population (populate goldAgent field for 4 tickers)

- [ ] **1A** -- Write `scripts/populate-gold-agent.js` (or Python): for each of EVN, NST,
  WAF, HRZ, call `GET /api/agents/gold/{ticker}` on Railway, merge result into
  `data/research/{ticker}.json` under `goldAgent` key, save.
- [ ] **1B** -- Run the script. Verify each file has `goldAgent` with scorecard, assets,
  valuation, evidence populated.
- [ ] **1C** -- Re-ingest is not needed for this (frontend reads research JSON directly).

**Risk:** Gold agent needs valid `NOTEBOOKLM_AUTH_JSON` creds. If expired, must rotate
first (Get NotebookLM Auth.bat from Desktop). Check Railway health + gold endpoint before
running.

**Alternative if creds expired:** Manually populate from previous gold agent runs if
available, or defer until creds are refreshed.

---

## Wave 2 -- Frontend Rendering (Section 09)

- [ ] **2A** -- Add `renderGoldDiscovery(data)` to `src/pages/report-sections.js`.
  Returns empty string if `!data.goldAgent`. Otherwise renders all 7 subsections.
  Pattern: RS_HDR('Section 09', 'Gold Agent Discovery') + rs-body content.

- [ ] **2B** -- Add CSS classes for gold section to `index.html`:
  - `.ga-scorecard` -- horizontal score strip
  - `.ga-score-card` -- individual score card with dimension label + score
  - `.ga-score-bar` -- visual bar (width = score%)
  - `.ga-view-grid` -- bull/base/bear column layout
  - `.ga-asset-card` -- per-asset expandable card
  - `.ga-metric-row` -- key-value metric row (reuse `.ta-metric-row` pattern where sensible)
  - `.ga-sensitivity-table` -- sensitivity table
  - `.ga-risk-item` -- risk/gap item with severity indicator
  - `.ga-evidence-table` -- evidence findings table
  - Score colour: green >= 70, amber 40-69, red < 40

- [ ] **2C** -- Edit `report.js`: import `renderGoldDiscovery`, add it after
  `renderTechnicalAnalysis(data)` in the mainContent chain.

- [ ] **2D** -- Edit `renderSectionNav()` in `report-sections.js`: conditionally add
  `['gold-discovery', 'Gold Discovery']` to the sections array when `data.goldAgent` exists.

---

## Wave 3 -- Validation & Deploy

- [ ] **3A** -- `npm run test:unit` must pass (157+ tests)
- [ ] **3B** -- `npm run build` must succeed
- [ ] **3C** -- Local preview: verify gold section renders for NST, does NOT render for WOW
- [ ] **3D** -- `/ci:push-safe` to deploy
- [ ] **3E** -- Verify on live site: open NST report page, Section 09 visible with real data

---

## Design Notes

### Scorecard rendering
Six cards in a row, each showing:
- Dimension label (Geology, Engineering, Financial, Management, Jurisdiction, Composite)
- Score (0-100 integer)
- Colour-coded bar: green >= 70, amber 40-69, red < 40
- Skew score shown separately with directional indicator

### Asset cards
Each asset is a collapsible card showing:
- Header: asset name, stage, country, ownership %
- Key metrics grid: resources, reserves, grade, recovery, AISC, mine life
- Red flags and info gaps as tagged chips
- Study schedule as a small table if data exists

### Investment view
Three-column layout: Bull | Base | Bear
Below: what-must-be-true as a checklist, monitoring trigger as a callout box

### Sensitivities
Compact table: scenario in left column, NAV impact in right column.
Colour: green for upside scenarios, red for downside.

### Evidence table
Columns: Finding | Source | Type | Quality (star rating 1-5)

---

## Backlog (unchanged)

- [ ] Mandatory login enforcement
- [ ] Technical analysis agent
- [ ] Rates/property/banks agent
- [ ] OHLCV Railway proxy
